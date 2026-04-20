package com.devops.backend.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Logs how outbound email is configured so operators can see why mail might not send.
 */
@Component
@Slf4j
public class EmailDeliveryStartupLogger {

    @Value("${app.email.enabled:true}")
    private boolean emailEnabled;

    @Value("${app.email.send-via-queue:false}")
    private boolean sendViaQueue;

    @PostConstruct
    public void logEmailMode() {
        if (!emailEnabled) {
            log.warn("app.email.enabled=false — no notification emails will be sent.");
            return;
        }
        if (sendViaQueue) {
            log.info(
                    "Email mode: Azure Storage Queue (async). Requires AZURE_QUEUE_CONNECTION_STRING and the in-app "
                            + "queue poller; if you only see \"Email queued\" and never \"Email sent\", set "
                            + "EMAIL_SEND_VIA_QUEUE=false for direct SMTP.");
        } else {
            log.info(
                    "Email mode: direct SMTP from this JVM (send-via-queue=false). Uses spring.mail.* / MAIL_* env vars.");
        }
    }
}
