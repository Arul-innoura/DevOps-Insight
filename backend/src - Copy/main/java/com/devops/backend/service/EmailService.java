package com.devops.backend.service;

import com.devops.backend.dto.EmailMessage;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.TicketStatus;

import java.util.List;

public interface EmailService {
    
    /**
     * Queue an email for async sending via RabbitMQ.
     */
    void queueEmail(EmailMessage message);
    
    /**
     * Send ticket created notification to DevOps team and CC.
     * Returns the generated Message-ID for email threading.
     */
    String sendTicketCreatedEmail(Ticket ticket);
    
    /**
     * Send ticket status update to requester.
     */
    void sendTicketStatusEmail(Ticket ticket, TicketStatus previousStatus);
    
    /**
     * Send ticket completed notification to requester.
     */
    void sendTicketCompletedEmail(Ticket ticket);
    
    /**
     * Send ticket closed notification to requester.
     */
    void sendTicketClosedEmail(Ticket ticket);
    
    /**
     * Send ticket assigned notification to engineer and requester.
     */
    void sendTicketAssignedEmail(Ticket ticket, String assignedBy);
    
    /**
     * Send note added notification.
     */
    void sendNoteAddedEmail(Ticket ticket, String noteAuthor, String noteContent);
    
    /**
     * Send manager approval request email with Approve/Reject buttons.
     * @param ticket The ticket requiring approval
     * @param approvalToken Secure token for the approval link
     * @param requesterContextNote Optional note from the person triggering approval (shown in email body)
     */
    void sendManagerApprovalRequestEmail(Ticket ticket, String approvalToken, String requesterContextNote);
    
    /**
     * Send manager approval response notification (approved/rejected).
     * @param ticket The ticket that was approved/rejected
     * @param approved Whether the manager approved the request
     * @param note Manager's note
     */
    void sendManagerApprovalResponseEmail(Ticket ticket, boolean approved, String note);
    
    /**
     * Send cost approval request email with Approve/Reject buttons.
     * @param ticket The ticket with cost estimation
     * @param approvalToken Secure token for the approval link
     */
    void sendCostApprovalRequestEmail(Ticket ticket, String approvalToken);
    
    /**
     * Send cost approval response notification (approved/rejected).
     * @param ticket The ticket with cost decision
     * @param approved Whether the manager approved the cost
     * @param note Manager's note
     */
    void sendCostApprovalResponseEmail(Ticket ticket, boolean approved, String note);
    
    /**
     * Build email subject based on ticket details.
     */
    String buildSubject(Ticket ticket, String action);
    
    /**
     * Build email HTML body for ticket notification.
     */
    String buildEmailBody(Ticket ticket, String action, String additionalInfo);
    
    /**
     * Generate a unique Message-ID for email threading.
     */
    String generateMessageId(String ticketId);
}
