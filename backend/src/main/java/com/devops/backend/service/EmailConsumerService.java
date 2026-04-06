package com.devops.backend.service;

import com.devops.backend.config.RabbitMQConfig;
import com.devops.backend.dto.EmailMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.util.StringUtils;

/**
 * RabbitMQ consumer that processes email messages from the queue.
 * Supports email threading via Message-ID, References, and In-Reply-To headers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailConsumerService {

    private final JavaMailSender mailSender;
    private final EventPublisherService eventPublisher;

    @Value("${app.email.from:noreply@encipherhealth.com}")
    private String fromEmail;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @RabbitListener(queues = RabbitMQConfig.EMAIL_QUEUE)
    public void processEmailMessage(EmailMessage message) {
        if (!emailEnabled) {
            log.info("Email sending disabled. Skipping email to: {}", message.getTo());
            return;
        }

        try {
            sendEmail(message);
            log.info("Email sent successfully to: {}", message.getTo());
            eventPublisher.publishEmailEvent("SENT", message);
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", message.getTo(), e.getMessage(), e);
            eventPublisher.publishEmailEvent("FAILED", message);
        }
    }

    private void sendEmail(EmailMessage message) throws MessagingException {
        if (!StringUtils.hasText(message.getTo())) {
            throw new MessagingException("Email 'to' address is empty");
        }

        String from = StringUtils.hasText(fromEmail) ? fromEmail : "devopsteam@altermanager.encipherhealth.com";

        MimeMessage mimeMessage = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

        helper.setFrom(from);
        helper.setTo(message.getTo());
        
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
        // These headers allow email clients to group related emails into conversations
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
