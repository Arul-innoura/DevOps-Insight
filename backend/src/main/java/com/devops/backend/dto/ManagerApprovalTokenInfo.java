package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Response DTO for manager approval token validation
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManagerApprovalTokenInfo {
    
    private String ticketId;
    private String productName;
    private String requestType;
    private String environment;
    /** Raw ticket environment label when custom/project-specific (preferred for approval page display). */
    private String environmentLabel;
    /** Same string as approval emails (label first, then enum display). */
    private String environmentDisplay;
    /** Ticket purpose / business reason (shown on approval page and in approval email). */
    private String purpose;
    /** Note entered when approval was requested (shown on approval page). */
    private String requestContextNote;
    /** Same as trigger note on the token (plain requester context for approvers). */
    private String approvalRequestNote;
    private String description;
    private String requesterName;
    private String requesterEmail;
    private String managerName;
    private String managerEmail;
    private String status;
    private boolean valid;
    private boolean used;
    private String action;  // Pre-selected action from URL (approve/reject)
    private String errorMessage;
    
    // Token type: MANAGER_APPROVAL or COST_APPROVAL
    private String tokenType;
    
    // Cost approval specific fields
    private Double estimatedCost;
    private String costCurrency;
    private String costSubmittedBy;

    private Integer approvalLevel;
    private Integer totalApprovalLevels;
}
