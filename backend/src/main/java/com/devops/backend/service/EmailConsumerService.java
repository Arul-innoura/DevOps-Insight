package com.devops.backend.service;

import com.azure.storage.queue.QueueClient;
import com.azure.storage.queue.models.QueueMessageItem;
import com.devops.backend.dto.EmailMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.util.StringUtils;

import java.util.ArrayList;

/**
 * Azure Storage Queue consumer that polls for email messages and sends them.
 * Supports email threading via Message-ID, References, and In-Reply-To headers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailConsumerService {

    private final JavaMailSender mailSender;
    private final EventPublisherService eventPublisher;
    private final QueueClient queueClient;
    private final ObjectMapper objectMapper;

    @Value("${app.email.from:noreply@encipherhealth.com}")
    private String fromEmail;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @Scheduled(fixedDelay = 3000)
    public void pollEmailQueue() {
        try {
            ArrayList<QueueMessageItem> batch = new ArrayList<>();
            for (QueueMessageItem item : queueClient.receiveMessages(10)) {
                batch.add(item);
            }
            if (!batch.isEmpty()) {
                log.info("Email queue: received {} message(s) from Azure Queue", batch.size());
            }
            for (QueueMessageItem item : batch) {
                processQueueMessage(item);
            }
        } catch (Exception e) {
            log.error("Error polling Azure Storage Queue: {}", e.getMessage(), e);
        }
    }

    /**
     * Send immediately via SMTP (same as queue consumer). Use when {@code app.email.send-via-queue=false}
     * or as a fallback if the Azure Queue worker path is misconfigured in production.
     */
    public void deliverSynchronously(EmailMessage message) {
        if (!emailEnabled) {
            log.info("Email sending disabled. Skipping direct send to: {}", message.getTo());
            return;
        }
        try {
            sendEmail(message);
            log.info("Email sent successfully (direct SMTP) to: {}", message.getTo());
            eventPublisher.publishEmailEvent("SENT", message);
        } catch (Exception e) {
            log.error("Failed to send email (direct SMTP) to {}: {}", message.getTo(), e.getMessage(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
        }
    }

    private void processQueueMessage(QueueMessageItem item) {
        EmailMessage message = null;
        try {
            String body = item.getBody().toString();
            message = objectMapper.readValue(body, EmailMessage.class);
        } catch (Exception e) {
            log.error("Failed to deserialize queue message id={}: {}", item.getMessageId(), e.getMessage(), e);
            deleteMessage(item);
            return;
        }

        if (!emailEnabled) {
            log.info("Email sending disabled. Skipping email to: {}", message.getTo());
            deleteMessage(item);
            return;
        }

        try {
            sendEmail(message);
            log.info("Email sent successfully to: {}", message.getTo());
            eventPublisher.publishEmailEvent("SENT", message);
            deleteMessage(item);
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", message.getTo(), e.getMessage(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
            // Do not delete: Azure Queue will make the message visible again after the visibility
            // timeout so SMTP can retry. Previously we deleted here and dropped the mail silently.
        }
    }

    private void deleteMessage(QueueMessageItem item) {
        try {
            queueClient.deleteMessage(item.getMessageId(), item.getPopReceipt());
        } catch (Exception e) {
            log.warn("Failed to delete queue message id={}: {}", item.getMessageId(), e.getMessage());
        }
    }

    private void sendEmail(EmailMessage message) throws MessagingException {
        String primaryTo = StringUtils.hasText(message.getTo()) ? message.getTo().trim() : null;
        if (!StringUtils.hasText(primaryTo) && message.getToList() != null && !message.getToList().isEmpty()) {
            primaryTo = message.getToList().stream()
                    .filter(StringUtils::hasText)
                    .findFirst()
                    .map(String::trim)
                    .orElse(null);
        }
        if (!StringUtils.hasText(primaryTo)) {
            throw new MessagingException("Email 'to' address is empty");
        }

        String from = StringUtils.hasText(fromEmail) ? fromEmail : "devopsteam@altermanager.encipherhealth.com";

        MimeMessage mimeMessage = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

        helper.setFrom(from);
        if (message.getToList() != null && !message.getToList().isEmpty()) {
            String[] toArr = message.getToList().stream()
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .distinct()
                    .toArray(String[]::new);
            if (toArr.length > 0) {
                helper.setTo(toArr);
            } else {
                helper.setTo(primaryTo);
            }
        } else {
            helper.setTo(primaryTo);
        }

        if (message.getCc() != null && !message.getCc().isEmpty()) {
            helper.setCc(message.getCc().toArray(new String[0]));
        }

        if (message.getBcc() != null && !message.getBcc().isEmpty()) {
            helper.setBcc(message.getBcc().toArray(new String[0]));
        }

        helper.setSubject(message.getSubject());

        if (message.getHtmlBody() != null && !message.getHtmlBody().isEmpty()) {
            helper.setText(message.getHtmlBody(), true);
        } else if (message.getBody() != null) {
            helper.setText(message.getBody(), false);
        }

        // Set email threading headers (RFC 2822)
        if (StringUtils.hasText(message.getMessageId())) {
            mimeMessage.setHeader("Message-ID", message.getMessageId());
        }
        if (StringUtils.hasText(message.getInReplyTo())) {
            mimeMessage.setHeader("In-Reply-To", message.getInReplyTo());
        }
        if (StringUtils.hasText(message.getReferences())) {
            mimeMessage.setHeader("References", message.getReferences());
        }

        mailSender.send(mimeMessage);
    }
}
