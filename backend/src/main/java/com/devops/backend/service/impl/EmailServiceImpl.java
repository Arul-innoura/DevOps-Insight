package com.devops.backend.service.impl;

import com.devops.backend.config.RabbitMQConfig;
import com.devops.backend.dto.EmailMessage;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.TicketStatus;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TimelineEntry;
import com.devops.backend.model.UserNotificationPreferences;
import com.devops.backend.model.workflow.NotificationPreferenceConfig;
import com.devops.backend.repository.UserNotificationPreferencesRepository;
import com.devops.backend.service.EmailService;
import com.devops.backend.service.EventPublisherService;
import com.devops.backend.service.WorkflowSnapshotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailServiceImpl implements EmailService {

    private final RabbitTemplate rabbitTemplate;
    private final EventPublisherService eventPublisher;
    private final UserNotificationPreferencesRepository userNotificationPreferencesRepository;
    private final WorkflowSnapshotService workflowSnapshotService;

    @Value("${app.email.from:noreply@encipherhealth.com}")
    private String fromEmail;

    @Value("${app.email.devops-to:devopsteam@encipherhealth.com}")
    private String devopsEmail;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    // Formal grayscale palette
    private static final String PRIMARY_BLUE = "#111111";
    private static final String DARK_BLUE = "#111111";
    private static final String LIGHT_BLUE = "#f2f2f2";
    private static final String GREEN = "#111111";
    private static final String YELLOW = "#333333";
    private static final String RED = "#111111";
    private static final String PURPLE = "#111111";
    private static final String GRAY = "#4b4b4b";
    private static final String LIGHT_GRAY = "#f7f7f7";
    private static final String BORDER_COLOR = "#d9d9d9";

    private static final DateTimeFormatter DATE_FORMATTER = 
            DateTimeFormatter.ofPattern("MMM dd, yyyy 'at' hh:mm a").withZone(ZoneId.systemDefault());

    @Override
    public void queueEmail(EmailMessage message) {
        publishToQueue(message);
    }

    private void publishToQueue(EmailMessage message) {
        if (!emailEnabled) {
            log.info("Email sending disabled. Would send to: {}, CC: {}, Subject: {}",
                    message.getTo(), message.getCc(), message.getSubject());
            return;
        }

        try {
            rabbitTemplate.convertAndSend(
                    RabbitMQConfig.EMAIL_EXCHANGE,
                    RabbitMQConfig.EMAIL_ROUTING_KEY,
                    message
            );
            log.info("Email queued - To: {}, Subject: {}", message.getTo(), message.getSubject());
            eventPublisher.publishEmailEvent("QUEUED", message);
        } catch (Exception e) {
            log.error("Failed to queue email: {}", e.getMessage(), e);
        }
    }

    private void queueTicketEmail(EmailMessage message, Ticket ticket) {
        EmailMessage filtered = applyNotificationFilters(message, ticket);
        if (filtered == null) {
            log.info("Skipping email for ticket {} type {} — no recipients after preference filters",
                    ticket.getId(), message.getType());
            return;
        }
        publishToQueue(filtered);
    }

    private NotificationPreferenceConfig notificationPrefs(Ticket ticket) {
        NotificationPreferenceConfig n = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson())
                .getNotificationPreferences();
        return n != null ? n : NotificationPreferenceConfig.builder().build();
    }

    private EmailMessage applyNotificationFilters(EmailMessage msg, Ticket ticket) {
        EmailMessage.EmailType type = msg.getType();
        if (type == EmailMessage.EmailType.MANAGER_APPROVAL_REQUEST
                || type == EmailMessage.EmailType.COST_APPROVAL_REQUEST) {
            return msg;
        }
        NotificationPreferenceConfig npc = notificationPrefs(ticket);
        if (type == EmailMessage.EmailType.TICKET_CREATED) {
            return applyCreatedCcBccFilters(msg, npc);
        }
        if (type == EmailMessage.EmailType.TICKET_ASSIGNED) {
            List<String> filteredCc = filterAddressList(msg.getCc(),
                    EmailMessage.EmailType.TICKET_STATUS_CHANGED, npc);
            return msg.toBuilder()
                    .cc(filteredCc.isEmpty() ? null : filteredCc)
                    .build();
        }
        return applyThreadRecipientFilters(msg, npc);
    }

    private EmailMessage applyCreatedCcBccFilters(EmailMessage msg, NotificationPreferenceConfig npc) {
        List<String> cc = filterAddressList(msg.getCc(), EmailMessage.EmailType.TICKET_CREATED, npc);
        List<String> bcc = filterAddressList(msg.getBcc(), EmailMessage.EmailType.TICKET_CREATED, npc);
        return msg.toBuilder()
                .cc(cc.isEmpty() ? null : cc)
                .bcc(bcc.isEmpty() ? null : bcc)
                .build();
    }

    private EmailMessage applyThreadRecipientFilters(EmailMessage msg, NotificationPreferenceConfig npc) {
        EmailMessage.EmailType type = msg.getType();
        String origTo = msg.getTo();
        List<String> origCc = msg.getCc() == null ? List.of() : msg.getCc();

        List<String> allowedCc = filterAddressList(origCc, type, npc);

        boolean toOk = origTo != null && wantsRecipient(origTo, type, npc);
        String newTo;
        List<String> newCc = new ArrayList<>(allowedCc);
        if (toOk) {
            newTo = origTo.trim();
            String toLower = newTo.toLowerCase();
            newCc.removeIf(x -> x.equalsIgnoreCase(toLower));
        } else if (!newCc.isEmpty()) {
            newTo = newCc.remove(0);
        } else {
            return null;
        }

        List<String> newBcc = filterAddressList(
                msg.getBcc() == null ? List.of() : msg.getBcc(), type, npc);

        return msg.toBuilder()
                .to(newTo)
                .cc(newCc.isEmpty() ? null : newCc)
                .bcc(newBcc.isEmpty() ? null : newBcc)
                .build();
    }

    private List<String> filterAddressList(List<String> addresses,
            EmailMessage.EmailType type, NotificationPreferenceConfig npc) {
        if (addresses == null || addresses.isEmpty()) {
            return new ArrayList<>();
        }
        List<String> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : addresses) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String e = raw.trim().toLowerCase();
            if (!seen.add(e)) {
                continue;
            }
            if (wantsRecipient(e, type, npc)) {
                out.add(e);
            }
        }
        return out;
    }

    private boolean wantsRecipient(String email, EmailMessage.EmailType type, NotificationPreferenceConfig npc) {
        String norm = normalizeEmail(email);
        if (norm == null) {
            return false;
        }
        UserNotificationPreferences p = userNotificationPreferencesRepository.findByUserEmailIgnoreCase(norm).orElse(null);

        return switch (type) {
            case TICKET_CREATED, TICKET_STATUS_CHANGED, TICKET_COMPLETED, TICKET_CLOSED ->
                    npc.isTicketStatusChangesMandatory() || (p == null || p.isTicketStatusChanges());
            case APPROVAL_STAGE_UPDATE ->
                    npc.isApprovalRequestsMandatory() || (p == null || p.isApprovalRequests());
            case TICKET_NOTE_ADDED ->
                    npc.isCommentsAndUpdatesMandatory() || (p == null || p.isCommentsAndUpdates());
            case MANAGER_APPROVAL_RESPONSE ->
                    npc.isApprovalCompletedMandatory() || (p == null || p.isApprovalCompleted());
            case COST_APPROVAL_RESPONSE ->
                    npc.isCostApprovalUpdatesMandatory() || (p == null || p.isCostApprovalUpdates());
            case TICKET_ASSIGNED -> true;
            default -> true;
        };
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        return email.trim().toLowerCase();
    }

    private static boolean isApprovalStageStatus(TicketStatus status) {
        return status == TicketStatus.MANAGER_APPROVAL_PENDING || status == TicketStatus.COST_APPROVAL_PENDING;
    }

    @Override
    public String generateMessageId(String ticketId) {
        return String.format("<%s.%d@devops.encipherhealth.com>", ticketId, System.currentTimeMillis());
    }

    /**
     * Build threading headers for follow-up emails in a ticket thread
     */
    private void addThreadingHeaders(EmailMessage.EmailMessageBuilder builder, Ticket ticket) {
        if (ticket.getEmailMessageId() != null) {
            // This email is part of an existing thread
            builder.inReplyTo(ticket.getEmailMessageId());
            builder.references(ticket.getEmailMessageId());
        }
    }

    @Override
    public String sendTicketCreatedEmail(Ticket ticket) {
        List<String> ccList = new ArrayList<>(buildCcList(ticket));
        String primaryTo = devopsEmail;
        if (ticket.getWorkflowEmailTo() != null && !ticket.getWorkflowEmailTo().isEmpty()) {
            primaryTo = ticket.getWorkflowEmailTo().get(0).trim();
            for (int i = 1; i < ticket.getWorkflowEmailTo().size(); i++) {
                String extra = ticket.getWorkflowEmailTo().get(i);
                if (extra != null && !extra.isBlank()) {
                    ccList.add(extra.trim().toLowerCase());
                }
            }
        }
        if (ticket.getWorkflowEmailCc() != null) {
            for (String c : ticket.getWorkflowEmailCc()) {
                if (c != null && !c.isBlank()) {
                    ccList.add(c.trim().toLowerCase());
                }
            }
        }
        List<String> bccList = new ArrayList<>();
        if (ticket.getWorkflowEmailBcc() != null) {
            for (String b : ticket.getWorkflowEmailBcc()) {
                if (b != null && !b.isBlank()) {
                    bccList.add(b.trim());
                }
            }
        }

        // Generate unique Message-ID for this ticket's email thread
        String messageId = generateMessageId(ticket.getId());

        EmailMessage message = EmailMessage.builder()
                .to(primaryTo)
                .cc(ccList.isEmpty() ? null : ccList)
                .bcc(bccList.isEmpty() ? null : bccList)
                .subject(buildSubject(ticket, "New Request Created"))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.CREATED, null))
                .type(EmailMessage.EmailType.TICKET_CREATED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(messageId)
                .build();

        queueTicketEmail(message, ticket);
        return messageId;
    }

    @Override
    public void sendTicketStatusEmail(Ticket ticket, TicketStatus previousStatus) {
        String statusMessage = getStatusChangeMessage(previousStatus, ticket.getStatus());
        EmailMessage.EmailType emailType = isApprovalStageStatus(ticket.getStatus())
                ? EmailMessage.EmailType.APPROVAL_STAGE_UPDATE
                : EmailMessage.EmailType.TICKET_STATUS_CHANGED;

        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, "Status Update: " + formatStatus(ticket.getStatus())))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.STATUS_CHANGED, statusMessage))
                .type(emailType)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));

        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);
    }

    @Override
    public void sendTicketCompletedEmail(Ticket ticket) {
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, "✓ Request Completed"))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.COMPLETED, 
                        "Great news! Your DevOps request has been completed successfully."))
                .type(EmailMessage.EmailType.TICKET_COMPLETED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        
        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);
    }

    @Override
    public void sendTicketClosedEmail(Ticket ticket) {
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, "Closed"))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.CLOSED, 
                        "This request has been closed. If you need further assistance, please create a new request."))
                .type(EmailMessage.EmailType.TICKET_CLOSED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        
        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);
    }

    /**
     * Send email when ticket is assigned
     */
    public void sendTicketAssignedEmail(Ticket ticket, String assignedBy) {
        // Email to assigned engineer
        EmailMessage.EmailMessageBuilder engineerBuilder = EmailMessage.builder()
                .to(ticket.getAssignedToEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, "Assigned to You"))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.ASSIGNED, 
                        "This request has been assigned to you by " + assignedBy + ". Please review and take action."))
                .type(EmailMessage.EmailType.TICKET_ASSIGNED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        addThreadingHeaders(engineerBuilder, ticket);
        queueTicketEmail(engineerBuilder.build(), ticket);

        // Notification to requester
        EmailMessage.EmailMessageBuilder requesterBuilder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .subject(buildSubject(ticket, "Assigned to " + ticket.getAssignedTo()))
                .htmlBody(buildProfessionalEmailBody(ticket, EmailAction.ASSIGNED_NOTIFY, 
                        "Your request has been assigned to " + ticket.getAssignedTo() + " and is now being processed."))
                .type(EmailMessage.EmailType.TICKET_STATUS_CHANGED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        addThreadingHeaders(requesterBuilder, ticket);
        queueTicketEmail(requesterBuilder.build(), ticket);
    }

    /**
     * Send email when note is added
     */
    public void sendNoteAddedEmail(Ticket ticket, String noteAuthor, String noteContent) {
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, "New Comment Added"))
                .htmlBody(buildNoteAddedEmailBody(ticket, noteAuthor, noteContent))
                .type(EmailMessage.EmailType.TICKET_NOTE_ADDED)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);
    }

    @Value("${app.frontend.url:http://localhost:3000}")
    private String frontendUrl;

    @Override
    public void sendManagerApprovalRequestEmail(Ticket ticket, String approvalToken) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isEmpty()) {
            log.warn("Cannot send manager approval email - no manager email for ticket {}", ticket.getId());
            return;
        }

        String approvalUrl = frontendUrl + "/manager-approval?token=" + approvalToken;
        
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getManagerEmail())
                .subject(buildSubject(ticket, "🔔 Approval Required"))
                .htmlBody(buildManagerApprovalEmailBody(ticket, approvalUrl))
                .type(EmailMessage.EmailType.MANAGER_APPROVAL_REQUEST)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        // Standalone message to configured approver only (not part of ticket Reply-All thread)
        queueTicketEmail(builder.build(), ticket);
        
        log.info("Manager approval email queued for ticket {} to {}", ticket.getId(), ticket.getManagerEmail());
    }

    @Override
    public void sendManagerApprovalResponseEmail(Ticket ticket, boolean approved, String note) {
        String action = approved ? "✅ Manager Approved" : "❌ Manager Rejected";
        String message = approved 
            ? "The manager has approved this request. It will now proceed to the next stage."
            : "The manager has rejected this request." + (note != null && !note.isEmpty() ? " Reason: " + note : "");
        
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcList(ticket))
                .subject(buildSubject(ticket, action))
                .htmlBody(buildProfessionalEmailBody(ticket, 
                        approved ? EmailAction.MANAGER_APPROVED : EmailAction.MANAGER_REJECTED, message))
                .type(EmailMessage.EmailType.MANAGER_APPROVAL_RESPONSE)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        
        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);

        log.info("Manager approval response email queued for ticket {} (approved={})", ticket.getId(), approved);
    }

    /**
     * Build manager approval email with Approve/Reject buttons
     */
    private String buildManagerApprovalEmailBody(Ticket ticket, String approvalUrl) {
        StringBuilder html = new StringBuilder();
        
        html.append("<!DOCTYPE html>");
        html.append("<html lang='en'><head>");
        html.append("<meta charset='UTF-8'>");
        html.append("<meta name='viewport' content='width=device-width, initial-scale=1.0'>");
        html.append("<title>Manager Approval Required</title>");
        html.append(getEmailStyles());
        html.append("</head><body>");
        
        html.append("<div class='email-wrapper'>");
        html.append("<div class='email-container'>");
        
        // Header
        html.append("<div class='email-header'>");
        html.append("<div class='header-brand'>");
        html.append("<div class='header-logo'>D</div>");
        html.append("<div class='header-title'>DevOps Portal</div>");
        html.append("</div>");
        html.append("<span class='ticket-id-badge'>").append(ticket.getId()).append("</span>");
        html.append("<h1 class='header-subject'>Approval Required</h1>");
        html.append("<p class='header-meta'>A team member has requested your approval</p>");
        html.append("</div>");
        
        // Alert banner
        html.append("<div class='alert-banner warning'>");
        html.append("<div class='alert-icon'>⏳</div>");
        html.append("<div class='alert-text'><strong>Action Required:</strong> Please review and approve or reject this request.</div>");
        html.append("</div>");
        
        // Main content
        html.append("<div class='email-body'>");
        html.append("<p style='margin-bottom:14px'>Dear ")
                .append(escapeHtml(ticket.getManagerName() != null && !ticket.getManagerName().isBlank()
                        ? ticket.getManagerName() : "Manager"))
                .append(",</p>");
        html.append("<p style='margin-bottom:14px'>Please review the following request and provide your approval decision.</p>");
        
        // Request info card
        html.append(buildTicketSummaryCard(ticket));
        
        // Requester info
        html.append("<div class='summary-card' style='margin-bottom: 24px;'>");
        html.append("<div class='summary-title'>Requester Information</div>");
        html.append("<div class='summary-row'><span>Requested By:</span><strong>").append(escapeHtml(ticket.getRequestedBy())).append("</strong></div>");
        html.append("<div class='summary-row'><span>Email:</span><strong>").append(escapeHtml(ticket.getRequesterEmail())).append("</strong></div>");
        html.append("<div class='summary-row'><span>Request Type:</span><strong>").append(ticket.getRequestType().name().replace("_", " ")).append("</strong></div>");
        html.append("<div class='summary-row'><span>Environment:</span><strong>").append(ticket.getEnvironment()).append("</strong></div>");
        if (ticket.getDescription() != null && !ticket.getDescription().isEmpty()) {
            html.append("<div class='summary-row' style='margin-top: 12px;'><span>Description:</span></div>");
            html.append("<p style='margin: 8px 0; padding: 12px; background: #f8fafc; border-radius: 6px;'>").append(escapeHtml(ticket.getDescription())).append("</p>");
        }
        html.append("</div>");
        
        // Approval buttons
        html.append("<div style='text-align: center; margin: 32px 0;'>");
        html.append("<p style='margin-bottom: 20px; color: #64748b;'>Click a button below to approve or reject this request:</p>");
        html.append("<a href='").append(approvalUrl).append("&action=approve' ");
        html.append("style='display: inline-block; padding: 14px 32px; margin: 0 10px; background: #111111; color: white; ");
        html.append("text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;'>✓ Approve</a>");
        html.append("<a href='").append(approvalUrl).append("&action=reject' ");
        html.append("style='display: inline-block; padding: 14px 32px; margin: 0 10px; background: #444444; color: white; ");
        html.append("text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;'>✗ Reject</a>");
        html.append("</div>");
        
        html.append("<p style='text-align: center; color: #94a3b8; font-size: 13px;'>");
        html.append("You will be asked to add a note before confirming your decision.</p>");
        
        html.append("</div>"); // email-body
        
        html.append(buildEmailFooter());
        
        html.append("</div></div>");
        html.append("</body></html>");
        
        return html.toString();
    }

    @Override
    public String buildSubject(Ticket ticket, String action) {
        return String.format("[%s] %s | %s - %s (%s)",
                ticket.getId(),
                action,
                ticket.getRequestType().name().replace("_", " "),
                ticket.getProductName(),
                ticket.getEnvironment());
    }

    @Override
    public void sendCostApprovalRequestEmail(Ticket ticket, String approvalToken) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isEmpty()) {
            log.warn("Cannot send cost approval email - no manager email for ticket {}", ticket.getId());
            return;
        }

        String approvalUrl = frontendUrl + "/manager-approval?token=" + approvalToken;
        
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getManagerEmail())
                .subject(buildSubject(ticket, "💰 Cost Approval Required"))
                .htmlBody(buildCostApprovalEmailBody(ticket, approvalUrl))
                .type(EmailMessage.EmailType.COST_APPROVAL_REQUEST)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        // Standalone cost approval request (thread continues on status / response emails)
        queueTicketEmail(builder.build(), ticket);
        
        log.info("Cost approval email queued for ticket {} to {}", ticket.getId(), ticket.getManagerEmail());
    }

    @Override
    public void sendCostApprovalResponseEmail(Ticket ticket, boolean approved, String note) {
        String action = approved ? "✅ Cost Approved" : "❌ Cost Rejected";
        String message = approved 
            ? "The manager has approved the cost estimation. Work can now begin."
            : "The manager has rejected the cost estimation." + (note != null && !note.isEmpty() ? " Reason: " + note : "");
        
        EmailMessage.EmailMessageBuilder builder = EmailMessage.builder()
                .to(ticket.getRequesterEmail())
                .cc(buildCcListWithDevOps(ticket))
                .subject(buildSubject(ticket, action))
                .htmlBody(buildProfessionalEmailBody(ticket, 
                        approved ? EmailAction.COST_APPROVED : EmailAction.COST_REJECTED, message))
                .type(EmailMessage.EmailType.COST_APPROVAL_RESPONSE)
                .ticketId(ticket.getId())
                .requesterEmail(ticket.getRequesterEmail())
                .messageId(generateMessageId(ticket.getId()));
        
        addThreadingHeaders(builder, ticket);
        queueTicketEmail(builder.build(), ticket);

        log.info("Cost approval response email queued for ticket {} (approved={})", ticket.getId(), approved);
    }

    /**
     * Build cost approval email with Approve/Reject buttons
     */
    private String buildCostApprovalEmailBody(Ticket ticket, String approvalUrl) {
        StringBuilder html = new StringBuilder();
        
        html.append("<!DOCTYPE html>");
        html.append("<html lang='en'><head>");
        html.append("<meta charset='UTF-8'>");
        html.append("<meta name='viewport' content='width=device-width, initial-scale=1.0'>");
        html.append("<title>Cost Approval Required</title>");
        html.append(getEmailStyles());
        html.append("</head><body>");
        
        html.append("<div class='email-wrapper'>");
        html.append("<div class='email-container'>");
        
        // Header
        html.append("<div class='email-header'>");
        html.append("<div class='header-brand'>");
        html.append("<div class='header-logo'>D</div>");
        html.append("<div class='header-title'>DevOps Portal</div>");
        html.append("</div>");
        html.append("<span class='ticket-id-badge'>").append(ticket.getId()).append("</span>");
        html.append("<h1 class='header-subject'>Cost Approval Required</h1>");
        html.append("<p class='header-meta'>DevOps has submitted a cost estimation for your approval</p>");
        html.append("</div>");
        
        // Alert banner
        html.append("<div class='alert-banner warning'>");
        html.append("<div class='alert-icon'>💵</div>");
        html.append("<div class='alert-text'><strong>Action Required:</strong> Please review and approve or reject the cost estimation.</div>");
        html.append("</div>");
        
        // Main content
        html.append("<div class='email-body'>");
        html.append("<p style='margin-bottom:14px'>Dear ")
                .append(escapeHtml(ticket.getManagerName() != null && !ticket.getManagerName().isBlank()
                        ? ticket.getManagerName() : "Manager"))
                .append(",</p>");
        html.append("<p style='margin-bottom:14px'>Please review the submitted cost estimation and confirm your decision.</p>");
        
        // Cost estimation card
        html.append("<div class='summary-card' style='margin-bottom: 24px; background: #f9f9f9; border: 2px solid #999;'>");
        html.append("<div class='summary-title' style='color: #111;'>Cost Estimation</div>");
        html.append("<div style='text-align: center; padding: 20px;'>");
        html.append("<div style='font-size: 42px; font-weight: 700; color: #111;'>");
        String currency = ticket.getCostCurrency() != null ? ticket.getCostCurrency() : "USD";
        String currencySymbol = getCurrencySymbol(currency);
        html.append(currencySymbol).append(String.format("%,.2f", ticket.getEstimatedCost()));
        html.append("</div>");
        html.append("<div style='font-size: 14px; color: #64748b; margin-top: 4px;'>").append(currency).append("</div>");
        html.append("</div>");
        if (ticket.getCostSubmittedBy() != null) {
            html.append("<div class='summary-row'><span>Submitted By:</span><strong>").append(escapeHtml(ticket.getCostSubmittedBy())).append("</strong></div>");
        }
        html.append("</div>");
        
        // Request info card
        html.append(buildTicketSummaryCard(ticket));
        
        // Requester info
        html.append("<div class='summary-card' style='margin-bottom: 24px;'>");
        html.append("<div class='summary-title'>Request Information</div>");
        html.append("<div class='summary-row'><span>Requested By:</span><strong>").append(escapeHtml(ticket.getRequestedBy())).append("</strong></div>");
        html.append("<div class='summary-row'><span>Request Type:</span><strong>").append(ticket.getRequestType().name().replace("_", " ")).append("</strong></div>");
        html.append("<div class='summary-row'><span>Environment:</span><strong>").append(ticket.getEnvironment()).append("</strong></div>");
        if (ticket.getDescription() != null && !ticket.getDescription().isEmpty()) {
            html.append("<div class='summary-row' style='margin-top: 12px;'><span>Description:</span></div>");
            html.append("<p style='margin: 8px 0; padding: 12px; background: #f8fafc; border-radius: 6px;'>").append(escapeHtml(ticket.getDescription())).append("</p>");
        }
        html.append("</div>");
        
        // Approval buttons
        html.append("<div style='text-align: center; margin: 32px 0;'>");
        html.append("<p style='margin-bottom: 20px; color: #64748b;'>Click a button below to approve or reject this cost estimation:</p>");
        html.append("<a href='").append(approvalUrl).append("&action=approve' ");
        html.append("style='display: inline-block; padding: 14px 32px; margin: 0 10px; background: #111111; color: white; ");
        html.append("text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;'>✓ Approve Cost</a>");
        html.append("<a href='").append(approvalUrl).append("&action=reject' ");
        html.append("style='display: inline-block; padding: 14px 32px; margin: 0 10px; background: #444444; color: white; ");
        html.append("text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;'>✗ Reject Cost</a>");
        html.append("</div>");
        
        html.append("<p style='text-align: center; color: #94a3b8; font-size: 13px;'>");
        html.append("You will be asked to add a note before confirming your decision.</p>");
        
        html.append("</div>"); // email-body
        
        html.append(buildEmailFooter());
        
        html.append("</div></div>");
        html.append("</body></html>");
        
        return html.toString();
    }

    /**
     * Get currency symbol from currency code
     */
    private String getCurrencySymbol(String currency) {
        if (currency == null) return "$";
        switch (currency.toUpperCase()) {
            case "USD": return "$";
            case "EUR": return "€";
            case "GBP": return "£";
            case "INR": return "₹";
            case "JPY": return "¥";
            case "CNY": return "¥";
            case "AUD": return "A$";
            case "CAD": return "C$";
            default: return currency + " ";
        }
    }

    /**
     * Build CC list including DevOps team
     */
    private List<String> buildCcListWithDevOps(Ticket ticket) {
        List<String> ccList = new ArrayList<>(buildCcList(ticket));
        if (ticket.getAssignedToEmail() != null && !ccList.contains(ticket.getAssignedToEmail())) {
            ccList.add(ticket.getAssignedToEmail());
        }
        return ccList;
    }

    /**
     * Cost approval request should go only to DevOps stakeholders (no requester).
     */
    private List<String> buildCostApprovalCcList(Ticket ticket) {
        List<String> cc = new ArrayList<>();
        if (ticket.getAssignedToEmail() != null && !ticket.getAssignedToEmail().isBlank()) {
            cc.add(ticket.getAssignedToEmail());
        }
        if (devopsEmail != null && !devopsEmail.isBlank() && !cc.contains(devopsEmail)) {
            cc.add(devopsEmail);
        }
        return cc;
    }

    @Override
    public String buildEmailBody(Ticket ticket, String action, String additionalInfo) {
        return buildProfessionalEmailBody(ticket, EmailAction.valueOf(action.toUpperCase().replace(" ", "_")), additionalInfo);
    }

    /**
     * Build professional Jira-like email body with all ticket details
     */
    private String buildProfessionalEmailBody(Ticket ticket, EmailAction action, String additionalInfo) {
        StringBuilder html = new StringBuilder();
        
        // HTML Start with comprehensive styles
        html.append("<!DOCTYPE html>");
        html.append("<html lang='en'><head>");
        html.append("<meta charset='UTF-8'>");
        html.append("<meta name='viewport' content='width=device-width, initial-scale=1.0'>");
        html.append("<title>DevOps Portal Notification</title>");
        html.append(getEmailStyles());
        html.append("</head><body>");
        
        // Main container
        html.append("<div class='email-wrapper'>");
        html.append("<div class='email-container'>");
        
        // Header with logo area
        html.append(buildEmailHeader(ticket, action));
        
        // Alert/Info banner
        if (additionalInfo != null && !additionalInfo.isEmpty()) {
            html.append(buildAlertBanner(action, additionalInfo));
        }
        
        // Main content
        html.append("<div class='email-body'>");
        html.append("<p style='margin-bottom:14px'>Dear ")
                .append(escapeHtml(ticket.getRequestedBy() != null && !ticket.getRequestedBy().isBlank()
                        ? ticket.getRequestedBy() : "Team"))
                .append(",</p>");
        html.append("<p style='margin-bottom:14px'>Please find the formal update for your request below.</p>");
        
        // Ticket summary card
        html.append(buildTicketSummaryCard(ticket));
        
        // Request details section based on request type
        html.append(buildRequestDetailsSection(ticket));
        
        // Assignment info
        if (ticket.getAssignedTo() != null) {
            html.append(buildAssignmentSection(ticket));
        }
        
        // Timeline/Activity section (last 5 entries)
        if (ticket.getTimeline() != null && !ticket.getTimeline().isEmpty()) {
            html.append(buildTimelineSection(ticket));
        }
        
        // Action button
        html.append(buildActionButton(ticket));
        
        html.append("</div>"); // email-body
        
        // Footer
        html.append(buildEmailFooter());
        
        html.append("</div>"); // email-container
        html.append("</div>"); // email-wrapper
        html.append("</body></html>");
        
        return html.toString();
    }

    /**
     * Build email for note added
     */
    private String buildNoteAddedEmailBody(Ticket ticket, String noteAuthor, String noteContent) {
        StringBuilder html = new StringBuilder();
        
        html.append("<!DOCTYPE html>");
        html.append("<html lang='en'><head>");
        html.append("<meta charset='UTF-8'>");
        html.append(getEmailStyles());
        html.append("</head><body>");
        
        html.append("<div class='email-wrapper'>");
        html.append("<div class='email-container'>");
        
        html.append(buildEmailHeader(ticket, EmailAction.NOTE_ADDED));
        
        // Comment card
        html.append("<div class='email-body'>");
        html.append("<div class='comment-card'>");
        html.append("<div class='comment-header'>");
        html.append("<div class='comment-avatar'>").append(getInitials(noteAuthor)).append("</div>");
        html.append("<div class='comment-meta'>");
        html.append("<strong>").append(escapeHtml(noteAuthor)).append("</strong>");
        html.append("<span class='comment-time'>added a comment</span>");
        html.append("</div></div>");
        html.append("<div class='comment-body'>");
        html.append("<p>").append(escapeHtml(noteContent)).append("</p>");
        html.append("</div></div>");
        
        // Ticket reference
        html.append(buildTicketSummaryCard(ticket));
        html.append(buildActionButton(ticket));
        
        html.append("</div>");
        html.append(buildEmailFooter());
        html.append("</div></div>");
        html.append("</body></html>");
        
        return html.toString();
    }

    /**
     * Email styles - Jira-inspired professional design
     */
    private String getEmailStyles() {
        return "<style>" +
                "* { margin: 0; padding: 0; box-sizing: border-box; }" +
                "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; " +
                "       line-height: 1.5; color: " + DARK_BLUE + "; background-color: #f4f5f7; }" +
                ".email-wrapper { padding: 40px 20px; background-color: #f4f5f7; }" +
                ".email-container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; " +
                "                   box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }" +
                
                // Header styles
                ".email-header { background: #ffffff; border-bottom: 2px solid " + BORDER_COLOR + "; " +
                "                padding: 24px 32px; color: " + DARK_BLUE + "; }" +
                ".header-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }" +
                ".header-logo { width: 40px; height: 40px; background: #f0f0f0; border-radius: 8px; " +
                "               display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; }" +
                ".header-title { font-size: 14px; font-weight: 500; opacity: 0.9; }" +
                ".ticket-id-badge { display: inline-block; background: #f2f2f2; padding: 6px 14px; " +
                "                   border-radius: 4px; font-family: monospace; font-size: 14px; font-weight: 600; }" +
                ".header-subject { font-size: 24px; font-weight: 600; margin: 16px 0 8px 0; }" +
                ".header-meta { font-size: 14px; opacity: 0.85; }" +
                
                // Alert banner
                ".alert-banner { padding: 16px 24px; display: flex; align-items: flex-start; gap: 12px; }" +
                ".alert-banner.success { background: #f8f8f8; border-left: 4px solid " + GREEN + "; }" +
                ".alert-banner.info { background: " + LIGHT_BLUE + "; border-left: 4px solid " + PRIMARY_BLUE + "; }" +
                ".alert-banner.warning { background: #f8f8f8; border-left: 4px solid " + YELLOW + "; }" +
                ".alert-banner.error { background: #f8f8f8; border-left: 4px solid " + RED + "; }" +
                ".alert-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; " +
                "              align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; }" +
                ".alert-banner.success .alert-icon { background: #222; color: white; }" +
                ".alert-banner.info .alert-icon { background: #222; color: white; }" +
                ".alert-text { flex: 1; font-size: 14px; color: " + DARK_BLUE + "; }" +
                
                // Body
                ".email-body { padding: 24px 32px; }" +
                
                // Summary card
                ".summary-card { background: " + LIGHT_GRAY + "; border-radius: 8px; padding: 20px; margin-bottom: 24px; }" +
                ".summary-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }" +
                ".summary-title { font-size: 16px; font-weight: 600; color: " + DARK_BLUE + "; }" +
                ".status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; " +
                "                border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }" +
                ".status-created { background: #DEEBFF; color: #0052CC; }" +
                ".status-accepted { background: #EAE6FF; color: #6554C0; }" +
                ".status-in-progress { background: #FFF0B3; color: #FF8B00; }" +
                ".status-completed { background: #E3FCEF; color: #006644; }" +
                ".status-closed { background: #DFE1E6; color: #42526E; }" +
                ".status-action-required { background: #FFEBE6; color: #BF2600; }" +
                ".status-on-hold { background: #FFFAE6; color: #FF8B00; }" +
                ".status-rejected { background: #FFEBE6; color: #DE350B; }" +
                
                // Detail rows
                ".detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }" +
                ".detail-item { }" +
                ".detail-label { font-size: 11px; font-weight: 600; color: " + GRAY + "; " +
                "                text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }" +
                ".detail-value { font-size: 14px; color: " + DARK_BLUE + "; }" +
                ".detail-value.highlight { font-weight: 600; }" +
                
                // Section styles
                ".section { margin-bottom: 24px; }" +
                ".section-title { font-size: 13px; font-weight: 600; color: " + GRAY + "; " +
                "                 text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; " +
                "                 padding-bottom: 8px; border-bottom: 1px solid " + BORDER_COLOR + "; }" +
                ".section-content { background: #ffffff; border: 1px solid " + BORDER_COLOR + "; " +
                "                   border-radius: 4px; padding: 16px; }" +
                
                // Description box
                ".description-box { background: #ffffff; border: 1px solid " + BORDER_COLOR + "; " +
                "                   border-radius: 4px; padding: 16px; margin-top: 12px; }" +
                ".description-box p { margin: 0; white-space: pre-wrap; font-size: 14px; }" +
                
                // Assignment section
                ".assignee-card { display: flex; align-items: center; gap: 12px; padding: 12px; " +
                "                 background: " + LIGHT_GRAY + "; border-radius: 6px; }" +
                ".assignee-avatar { width: 40px; height: 40px; border-radius: 50%; " +
                "                   background: linear-gradient(135deg, " + PRIMARY_BLUE + ", " + PURPLE + "); " +
                "                   color: white; display: flex; align-items: center; justify-content: center; " +
                "                   font-weight: 600; font-size: 14px; }" +
                ".assignee-info { flex: 1; }" +
                ".assignee-name { font-weight: 600; color: " + DARK_BLUE + "; }" +
                ".assignee-label { font-size: 12px; color: " + GRAY + "; }" +
                
                // Timeline
                ".timeline { }" +
                ".timeline-item { display: flex; gap: 12px; padding: 12px 0; " +
                "                 border-bottom: 1px solid " + BORDER_COLOR + "; }" +
                ".timeline-item:last-child { border-bottom: none; }" +
                ".timeline-dot { width: 8px; height: 8px; border-radius: 50%; background: " + PRIMARY_BLUE + "; " +
                "                margin-top: 6px; flex-shrink: 0; }" +
                ".timeline-content { flex: 1; }" +
                ".timeline-text { font-size: 14px; color: " + DARK_BLUE + "; }" +
                ".timeline-time { font-size: 12px; color: " + GRAY + "; margin-top: 2px; }" +
                
                // Comment card
                ".comment-card { background: " + LIGHT_GRAY + "; border-radius: 8px; padding: 16px; margin-bottom: 24px; }" +
                ".comment-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }" +
                ".comment-avatar { width: 36px; height: 36px; border-radius: 50%; " +
                "                  background: " + PURPLE + "; color: white; display: flex; " +
                "                  align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }" +
                ".comment-meta { flex: 1; }" +
                ".comment-time { font-size: 12px; color: " + GRAY + "; margin-left: 8px; }" +
                ".comment-body { background: white; border-radius: 6px; padding: 12px; " +
                "                border: 1px solid " + BORDER_COLOR + "; }" +
                ".comment-body p { margin: 0; font-size: 14px; }" +
                
                // Action button
                ".action-section { text-align: center; padding: 24px 0; }" +
                ".action-btn { display: inline-block; padding: 12px 32px; background: " + PRIMARY_BLUE + "; " +
                "              color: white; text-decoration: none; border-radius: 4px; font-weight: 600; " +
                "              font-size: 14px; transition: background 0.2s; }" +
                ".action-btn:hover { background: #0747A6; }" +
                
                // Footer
                ".email-footer { background: " + LIGHT_GRAY + "; padding: 24px 32px; text-align: center; " +
                "                border-top: 1px solid " + BORDER_COLOR + "; }" +
                ".footer-logo { font-size: 18px; font-weight: 700; color: " + PRIMARY_BLUE + "; margin-bottom: 8px; }" +
                ".footer-text { font-size: 12px; color: " + GRAY + "; margin-bottom: 4px; }" +
                ".footer-links { margin-top: 16px; }" +
                ".footer-links a { color: " + PRIMARY_BLUE + "; text-decoration: none; margin: 0 12px; font-size: 12px; }" +
                
                // Responsive
                "@media only screen and (max-width: 600px) {" +
                "  .email-wrapper { padding: 16px 12px; }" +
                "  .email-header { padding: 24px 20px; }" +
                "  .header-subject { font-size: 20px; }" +
                "  .email-body { padding: 20px; }" +
                "  .detail-grid { grid-template-columns: 1fr; }" +
                "}" +
                "</style>";
    }

    /**
     * Build email header
     */
    private String buildEmailHeader(Ticket ticket, EmailAction action) {
        StringBuilder header = new StringBuilder();
        header.append("<div class='email-header'>");
        
        // Brand
        header.append("<div class='header-brand'>");
        header.append("<div class='header-logo'>⚙️</div>");
        header.append("<span class='header-title'>DevOps Portal</span>");
        header.append("</div>");
        
        // Ticket ID badge
        header.append("<span class='ticket-id-badge'>").append(ticket.getId()).append("</span>");
        
        // Subject
        header.append("<h1 class='header-subject'>").append(getActionTitle(action)).append("</h1>");
        
        // Meta info
        header.append("<p class='header-meta'>");
        header.append(ticket.getRequestType().name().replace("_", " "));
        header.append(" • ").append(ticket.getProductName());
        header.append(" • ").append(ticket.getEnvironment());
        header.append("</p>");
        
        header.append("</div>");
        return header.toString();
    }

    /**
     * Build alert banner
     */
    private String buildAlertBanner(EmailAction action, String message) {
        String bannerClass = switch (action) {
            case COMPLETED, MANAGER_APPROVED, COST_APPROVED -> "success";
            case STATUS_CHANGED, NOTE_ADDED, ASSIGNED_NOTIFY, MANAGER_APPROVAL_REQUEST, COST_APPROVAL_REQUEST -> "info";
            case CLOSED, MANAGER_REJECTED, COST_REJECTED -> "warning";
            default -> "info";
        };
        
        String icon = switch (action) {
            case COMPLETED, MANAGER_APPROVED, COST_APPROVED -> "✓";
            case CLOSED, MANAGER_REJECTED, COST_REJECTED -> "✕";
            case ASSIGNED, ASSIGNED_NOTIFY -> "→";
            case MANAGER_APPROVAL_REQUEST, COST_APPROVAL_REQUEST -> "⏳";
            default -> "ℹ";
        };
        
        return "<div class='alert-banner " + bannerClass + "'>" +
                "<div class='alert-icon'>" + icon + "</div>" +
                "<div class='alert-text'>" + escapeHtml(message) + "</div>" +
                "</div>";
    }

    /**
     * Build ticket summary card
     */
    private String buildTicketSummaryCard(Ticket ticket) {
        StringBuilder card = new StringBuilder();
        card.append("<div class='summary-card'>");
        
        // Header with status
        card.append("<div class='summary-header'>");
        card.append("<span class='summary-title'>Request Details</span>");
        card.append("<span class='status-badge status-").append(getStatusClass(ticket.getStatus())).append("'>");
        card.append(formatStatus(ticket.getStatus()));
        card.append("</span>");
        card.append("</div>");
        
        // Detail grid
        card.append("<div class='detail-grid'>");
        
        card.append(buildDetailItem("Request Type", ticket.getRequestType().name().replace("_", " ")));
        card.append(buildDetailItem("Project", ticket.getProductName()));
        card.append(buildDetailItem("Environment", String.valueOf(ticket.getEnvironment())));
        card.append(buildDetailItem("Priority", ticket.isManagerApprovalRequired() ? "High (Approval Required)" : "Normal"));
        card.append(buildDetailItem("Requested By", ticket.getRequestedBy()));
        card.append(buildDetailItem("Email", ticket.getRequesterEmail()));
        card.append(buildDetailItem("Created", formatDate(ticket.getCreatedAt())));
        if (ticket.getUpdatedAt() != null) {
            card.append(buildDetailItem("Last Updated", formatDate(ticket.getUpdatedAt())));
        }
        
        card.append("</div>");
        
        // Description
        if (ticket.getDescription() != null && !ticket.getDescription().isEmpty()) {
            card.append("<div class='description-box'>");
            card.append("<div class='detail-label'>Description</div>");
            card.append("<p>").append(escapeHtml(ticket.getDescription())).append("</p>");
            card.append("</div>");
        }
        
        card.append("</div>");
        return card.toString();
    }

    /**
     * Build request-specific details section
     */
    private String buildRequestDetailsSection(Ticket ticket) {
        StringBuilder section = new StringBuilder();
        
        RequestType type = ticket.getRequestType();
        if (type == null) return "";
        
        section.append("<div class='section'>");
        section.append("<div class='section-title'>").append(type.name().replace("_", " ")).append(" Details</div>");
        section.append("<div class='section-content'>");
        section.append("<div class='detail-grid'>");
        
        switch (type) {
            case NEW_ENVIRONMENT:
                if (ticket.getDatabaseType() != null) {
                    section.append(buildDetailItem("Database Type", ticket.getDatabaseType()));
                }
                if (ticket.getPurpose() != null) {
                    section.append(buildDetailItem("Purpose", ticket.getPurpose()));
                }
                break;
                
            case ENVIRONMENT_UP:
                if (ticket.getActivationDate() != null) {
                    section.append(buildDetailItem("Activation Date", formatDate(ticket.getActivationDate())));
                }
                if (ticket.getDuration() != null) {
                    section.append(buildDetailItem("Duration", ticket.getDuration() + " days"));
                }
                break;
                
            case ENVIRONMENT_DOWN:
                if (ticket.getShutdownDate() != null) {
                    section.append(buildDetailItem("Shutdown Date", formatDate(ticket.getShutdownDate())));
                }
                if (ticket.getShutdownReason() != null) {
                    section.append(buildDetailItem("Reason", ticket.getShutdownReason()));
                }
                break;
                
            case RELEASE_DEPLOYMENT:
                if (ticket.getReleaseVersion() != null) {
                    section.append(buildDetailItem("Release Version", ticket.getReleaseVersion(), true));
                }
                if (ticket.getDeploymentStrategy() != null) {
                    section.append(buildDetailItem("Deployment Strategy", ticket.getDeploymentStrategy()));
                }
                if (ticket.getReleaseNotes() != null && !ticket.getReleaseNotes().isEmpty()) {
                    section.append("</div>"); // close detail-grid
                    section.append("<div class='description-box' style='margin-top:12px'>");
                    section.append("<div class='detail-label'>Release Notes</div>");
                    section.append("<p>").append(escapeHtml(ticket.getReleaseNotes())).append("</p>");
                    section.append("</div>");
                    section.append("<div class='detail-grid'>"); // reopen for consistency
                }
                break;
                
            case ISSUE_FIX:
                if (ticket.getIssueType() != null) {
                    section.append(buildDetailItem("Issue Type", ticket.getIssueType()));
                }
                if (ticket.getIssueDescription() != null) {
                    section.append("</div>");
                    section.append("<div class='description-box' style='margin-top:12px'>");
                    section.append("<div class='detail-label'>Issue Description</div>");
                    section.append("<p>").append(escapeHtml(ticket.getIssueDescription())).append("</p>");
                    section.append("</div>");
                    if (ticket.getErrorLogs() != null && !ticket.getErrorLogs().isEmpty()) {
                        section.append("<div class='description-box' style='margin-top:12px;background:#FFF4E5;border-color:#FF8B00'>");
                        section.append("<div class='detail-label'>Error Logs</div>");
                        section.append("<pre style='font-family:monospace;font-size:12px;white-space:pre-wrap;margin:0'>")
                               .append(escapeHtml(ticket.getErrorLogs())).append("</pre>");
                        section.append("</div>");
                    }
                    section.append("<div class='detail-grid'>");
                }
                break;
                
            case BUILD_REQUEST:
                if (ticket.getBranchName() != null) {
                    section.append(buildDetailItem("Branch Name", ticket.getBranchName(), true));
                }
                if (ticket.getCommitId() != null) {
                    section.append(buildDetailItem("Commit ID", ticket.getCommitId(), true));
                }
                break;
                
            case CODE_CUT:
                if (ticket.getBranchName() != null) {
                    section.append(buildDetailItem("Source Branch", ticket.getBranchName(), true));
                }
                if (ticket.getReleaseVersion() != null) {
                    section.append(buildDetailItem("Target Version", ticket.getReleaseVersion(), true));
                }
                if (ticket.getReason() != null) {
                    section.append(buildDetailItem("Reason", ticket.getReason()));
                }
                break;
                
            case OTHER_QUERIES:
                if (ticket.getOtherQueryDetails() != null) {
                    section.append("</div>");
                    section.append("<div class='description-box'>");
                    section.append("<div class='detail-label'>Query Details</div>");
                    section.append("<p>").append(escapeHtml(ticket.getOtherQueryDetails())).append("</p>");
                    section.append("</div>");
                    section.append("<div class='detail-grid'>");
                }
                break;
                
            default:
                break;
        }
        
        section.append("</div>"); // detail-grid
        section.append("</div>"); // section-content
        section.append("</div>"); // section
        
        return section.toString();
    }

    /**
     * Build assignment section
     */
    private String buildAssignmentSection(Ticket ticket) {
        StringBuilder section = new StringBuilder();
        section.append("<div class='section'>");
        section.append("<div class='section-title'>Assignment</div>");
        section.append("<div class='assignee-card'>");
        section.append("<div class='assignee-avatar'>").append(getInitials(ticket.getAssignedTo())).append("</div>");
        section.append("<div class='assignee-info'>");
        section.append("<div class='assignee-name'>").append(escapeHtml(ticket.getAssignedTo())).append("</div>");
        section.append("<div class='assignee-label'>Assigned Engineer");
        if (ticket.getAssignedToEmail() != null) {
            section.append(" • ").append(ticket.getAssignedToEmail());
        }
        section.append("</div>");
        section.append("</div>");
        section.append("</div>");
        section.append("</div>");
        return section.toString();
    }

    /**
     * Build timeline section (last 5 entries)
     */
    private String buildTimelineSection(Ticket ticket) {
        List<TimelineEntry> timeline = ticket.getTimeline();
        if (timeline == null || timeline.isEmpty()) return "";
        
        StringBuilder section = new StringBuilder();
        section.append("<div class='section'>");
        section.append("<div class='section-title'>Recent Activity</div>");
        section.append("<div class='timeline'>");
        
        // Show last 5 entries
        int start = Math.max(0, timeline.size() - 5);
        for (int i = timeline.size() - 1; i >= start; i--) {
            TimelineEntry entry = timeline.get(i);
            section.append("<div class='timeline-item'>");
            section.append("<div class='timeline-dot'></div>");
            section.append("<div class='timeline-content'>");
            section.append("<div class='timeline-text'>");
            
            if (entry.isNote()) {
                section.append("<strong>").append(escapeHtml(entry.getUser())).append("</strong> added a comment");
            } else if ("assigned".equals(entry.getAction())) {
                section.append("<strong>").append(escapeHtml(entry.getUser())).append("</strong>");
                section.append(" assigned to <strong>").append(escapeHtml(entry.getNewAssignee())).append("</strong>");
            } else if ("forwarded".equals(entry.getAction())) {
                section.append("<strong>").append(escapeHtml(entry.getUser())).append("</strong>");
                section.append(" forwarded from ").append(escapeHtml(entry.getPreviousAssignee()));
                section.append(" to <strong>").append(escapeHtml(entry.getNewAssignee())).append("</strong>");
            } else {
                section.append("<strong>").append(escapeHtml(entry.getUser())).append("</strong>");
                section.append(" changed status to <strong>").append(formatStatus(entry.getStatus())).append("</strong>");
            }
            
            if (entry.getNotes() != null && !entry.getNotes().isEmpty() && !entry.isNote()) {
                section.append("<br><span style='color:" + GRAY + ";font-size:13px'>")
                       .append(escapeHtml(entry.getNotes())).append("</span>");
            }
            
            section.append("</div>");
            section.append("<div class='timeline-time'>").append(formatDate(entry.getTimestamp())).append("</div>");
            section.append("</div>");
            section.append("</div>");
        }
        
        section.append("</div>");
        section.append("</div>");
        return section.toString();
    }

    /**
     * Build action button
     */
    private String buildActionButton(Ticket ticket) {
        return "<div class='action-section'>" +
                "<a href='#' class='action-btn'>View Request in Portal</a>" +
                "<p style='margin-top:12px;font-size:12px;color:" + GRAY + "'>" +
                "Ticket ID: " + ticket.getId() + "</p>" +
                "</div>";
    }

    /**
     * Build email footer
     */
    private String buildEmailFooter() {
        return "<div class='email-footer'>" +
                "<div class='footer-logo'>⚙️ DevOps Portal</div>" +
                "<p class='footer-text'>Encipher Health - DevOps Team</p>" +
                "<p class='footer-text'>This is an automated notification. Please do not reply to this email.</p>" +
                "<div class='footer-links'>" +
                "<a href='#'>Help Center</a>" +
                "<a href='#'>Contact Support</a>" +
                "<a href='#'>Unsubscribe</a>" +
                "</div>" +
                "</div>";
    }

    /**
     * Build a single detail item
     */
    private String buildDetailItem(String label, String value) {
        return buildDetailItem(label, value, false);
    }

    private String buildDetailItem(String label, String value, boolean highlight) {
        if (value == null || value.isEmpty()) return "";
        return "<div class='detail-item'>" +
                "<div class='detail-label'>" + escapeHtml(label) + "</div>" +
                "<div class='detail-value" + (highlight ? " highlight" : "") + "'>" + escapeHtml(value) + "</div>" +
                "</div>";
    }

    /**
     * Helper methods
     */
    private List<String> buildCcList(Ticket ticket) {
        List<String> cc = new ArrayList<>();
        
        // Add requester to CC for DevOps emails
        if (ticket.getRequesterEmail() != null && !ticket.getRequesterEmail().isEmpty()) {
            cc.add(ticket.getRequesterEmail());
        }
        
        // Add manager email if provided
        if (ticket.getCcEmail() != null && !ticket.getCcEmail().isEmpty()) {
            Stream.of(ticket.getCcEmail().split("[,;]"))
                    .map(String::trim)
                    .filter(e -> !e.isEmpty() && e.contains("@"))
                    .forEach(cc::add);
        }
        
        return cc;
    }

    private String getActionTitle(EmailAction action) {
        return switch (action) {
            case CREATED -> "New Request Created";
            case STATUS_CHANGED -> "Request Status Updated";
            case COMPLETED -> "Request Completed ✓";
            case CLOSED -> "Request Closed";
            case ASSIGNED -> "Request Assigned to You";
            case ASSIGNED_NOTIFY -> "Request Assigned";
            case NOTE_ADDED -> "New Comment Added";
            case MANAGER_APPROVAL_REQUEST -> "Approval Required";
            case MANAGER_APPROVED -> "Manager Approved ✓";
            case MANAGER_REJECTED -> "Manager Rejected";
            case COST_APPROVAL_REQUEST -> "Cost Approval Required";
            case COST_APPROVED -> "Cost Approved ✓";
            case COST_REJECTED -> "Cost Rejected";
        };
    }

    private String getStatusChangeMessage(TicketStatus from, TicketStatus to) {
        return "Status changed from " + formatStatus(from) + " → " + formatStatus(to);
    }

    private String formatStatus(TicketStatus status) {
        if (status == null) return "Unknown";
        return switch (status) {
            case CREATED -> "Ticket Raised";
            case ACCEPTED -> "DevOps Accepted";
            case MANAGER_APPROVAL_PENDING -> "Waiting for Manager Approval";
            case MANAGER_APPROVED -> "Manager Approved";
            case COST_APPROVAL_PENDING -> "Cost Approval Pending";
            case COST_APPROVED -> "Cost Approved";
            case IN_PROGRESS -> "Work In Progress";
            case ACTION_REQUIRED -> "Action Required";
            case ON_HOLD -> "On Hold";
            case COMPLETED -> "Completed";
            case CLOSED -> "Closed";
            case REJECTED -> "Rejected";
        };
    }

    private String getStatusClass(TicketStatus status) {
        if (status == null) return "created";
        return switch (status) {
            case CREATED -> "created";
            case ACCEPTED -> "accepted";
            case MANAGER_APPROVAL_PENDING -> "in-progress";
            case MANAGER_APPROVED -> "completed";
            case COST_APPROVAL_PENDING -> "in-progress";
            case COST_APPROVED -> "completed";
            case IN_PROGRESS -> "in-progress";
            case ACTION_REQUIRED -> "action-required";
            case ON_HOLD -> "on-hold";
            case COMPLETED -> "completed";
            case CLOSED -> "closed";
            case REJECTED -> "rejected";
        };
    }

    private String formatDate(Instant instant) {
        if (instant == null) return "N/A";
        return DATE_FORMATTER.format(instant);
    }

    private String getInitials(String name) {
        if (name == null || name.isEmpty()) return "?";
        String[] parts = name.trim().split("\\s+");
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + "" + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return name.substring(0, Math.min(2, name.length())).toUpperCase();
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&#39;");
    }

    /**
     * Email action types
     */
    private enum EmailAction {
        CREATED,
        STATUS_CHANGED,
        COMPLETED,
        CLOSED,
        ASSIGNED,
        ASSIGNED_NOTIFY,
        NOTE_ADDED,
        MANAGER_APPROVAL_REQUEST,
        MANAGER_APPROVED,
        MANAGER_REJECTED,
        COST_APPROVAL_REQUEST,
        COST_APPROVED,
        COST_REJECTED
    }
}
