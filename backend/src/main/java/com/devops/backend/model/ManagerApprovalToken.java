package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Secure token for manager approval links.
 * Allows managers to approve/reject tickets without logging in.
 * Supports both manager approval and cost approval workflows.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "manager_approval_tokens")
public class ManagerApprovalToken {

    @Id
    private String id;

    @Indexed(unique = true)
    private String token;

    @Indexed
    private String ticketId;

    private String managerName;
    private String managerEmail;

    /** 1-based level for sequential manager approvals */
    private Integer approvalLevel;
    private Integer totalApprovalLevels;
    
    // Token type: MANAGER_APPROVAL or COST_APPROVAL
    @Builder.Default
    private String tokenType = "MANAGER_APPROVAL";
    
    // Cost approval specific fields
    private Double estimatedCost;
    private String costCurrency;
    private String costSubmittedBy;

    private Instant createdAt;
    
    @Indexed(expireAfterSeconds = 0)
    private Instant expiresAt;  // Token expiration (e.g., 7 days)

    private boolean used;
    private Instant usedAt;
    private String action;  // APPROVED or REJECTED
    private String note;
}
