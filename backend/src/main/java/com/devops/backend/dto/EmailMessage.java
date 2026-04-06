package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class EmailMessage implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    private String to;
    private List<String> cc;
    private List<String> bcc;
    private String subject;
    private String body;
    private String htmlBody;
    private EmailType type;
    private String ticketId;
    private String requesterEmail;
    
    // Email threading headers (RFC 2822)
    private String messageId;       // Message-ID header for this email
    private String inReplyTo;       // In-Reply-To header (references parent message)
    private String references;      // References header (full thread chain)
    
    public enum EmailType {
        TICKET_CREATED,
        TICKET_COMPLETED,
        TICKET_CLOSED,
        TICKET_STATUS_CHANGED,
        /** Status update specifically for approval / cost-approval stages (user "approval request" preference). */
        APPROVAL_STAGE_UPDATE,
        TICKET_ASSIGNED,
        TICKET_NOTE_ADDED,
        MANAGER_APPROVAL_REQUEST,
        MANAGER_APPROVAL_RESPONSE,
        COST_APPROVAL_REQUEST,
        COST_APPROVAL_RESPONSE
    }
}
