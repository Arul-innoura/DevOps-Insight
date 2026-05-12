package com.devops.backend.service;

import com.azure.storage.queue.QueueClient;
import com.azure.storage.queue.models.QueueMessageItem;
import com.devops.backend.dto.EmailMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Azure Storage Queue consumer that polls for email messages and sends them.
 * Supports email threading via Message-ID, References, and In-Reply-To headers.
 *
 * <p>Includes a simple circuit-breaker: after {@value #MAX_AUTH_FAILURES} consecutive
 * SMTP authentication failures the sender backs off for {@value #AUTH_BACKOFF_MS} ms
 * to avoid hammering the SMTP server and flooding logs on every request.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailConsumerService {

    /** How many consecutive auth failures before opening the circuit. */
    private static final int MAX_AUTH_FAILURES = 3;
    /** How long (ms) to wait before retrying after the circuit opens — 5 minutes. */
    private static final long AUTH_BACKOFF_MS = 5 * 60 * 1000L;

    private final AtomicInteger consecutiveAuthFailures = new AtomicInteger(0);
    private final AtomicLong circuitOpenedAt = new AtomicLong(0);

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
        if (isCircuitOpen()) {
            return;
        }
        try {
            sendEmail(message);
            consecutiveAuthFailures.set(0); // reset on success
            log.info("Email sent successfully (direct SMTP) to: {}", message.getTo());
            eventPublisher.publishEmailEvent("SENT", message);
        } catch (MailAuthenticationException e) {
            handleAuthFailure(message.getTo(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
        } catch (Exception e) {
            log.error("Failed to send email (direct SMTP) to {}: {}", message.getTo(), e.getMessage(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
        }
    }

    /**
     * Returns true (and logs a concise WARN) when the auth circuit is still open.
     * Resets the circuit automatically after {@value #AUTH_BACKOFF_MS} ms.
     */
    private boolean isCircuitOpen() {
        if (consecutiveAuthFailures.get() < MAX_AUTH_FAILURES) {
            return false;
        }
        long elapsed = System.currentTimeMillis() - circuitOpenedAt.get();
        if (elapsed < AUTH_BACKOFF_MS) {
            long retryInSec = (AUTH_BACKOFF_MS - elapsed) / 1000;
            log.warn("[Email] SMTP auth circuit open — skipping delivery. Auto-retry in {}s. "
                    + "Fix: enable SMTP AUTH for the mailbox in Exchange Admin Center, "
                    + "or update MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD in application config.", retryInSec);
            return true;
        }
        // Backoff expired — reset and allow one retry attempt
        log.info("[Email] SMTP auth circuit reset after backoff — retrying delivery.");
        consecutiveAuthFailures.set(0);
        return false;
    }

    /**
     * Record an auth failure; open the circuit after {@value #MAX_AUTH_FAILURES} attempts.
     */
    private void handleAuthFailure(String recipient, MailAuthenticationException e) {
        int failures = consecutiveAuthFailures.incrementAndGet();
        if (failures == 1) {
            // Log full stack trace on the first failure so the root cause is visible.
            log.error("[Email] SMTP authentication failed sending to {} (attempt {}/{}): {}",
                    recipient, failures, MAX_AUTH_FAILURES, e.getMessage(), e);
        } else if (failures < MAX_AUTH_FAILURES) {
            log.warn("[Email] SMTP authentication failed sending to {} (attempt {}/{}) — {}",
                    recipient, failures, MAX_AUTH_FAILURES, e.getMessage());
        } else {
            circuitOpenedAt.set(System.currentTimeMillis());
            log.error("[Email] SMTP authentication failed {} times in a row. Circuit opened for {} min. "
                    + "Root cause: {} — "
                    + "To fix for Exchange Online: go to Exchange Admin Center → Users → mailbox → "
                    + "Mail flow settings → Authenticated SMTP → enable. "
                    + "Then restart the app or wait {} min for auto-retry.",
                    failures, AUTH_BACKOFF_MS / 60000, e.getMessage(), AUTH_BACKOFF_MS / 60000);
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

        if (isCircuitOpen()) {
            // Leave message in queue; it will become visible again after the visibility timeout.
            return;
        }

        try {
            sendEmail(message);
            consecutiveAuthFailures.set(0);
            log.info("Email sent successfully to: {}", message.getTo());
            eventPublisher.publishEmailEvent("SENT", message);
            deleteMessage(item);
        } catch (MailAuthenticationException e) {
            handleAuthFailure(message.getTo(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
            // Leave in queue for retry after circuit resets.
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", message.getTo(), e.getMessage(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
            // Do not delete: Azure Queue will make the message visible again after the visibility
            // timeout so SMTP can retry.
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
