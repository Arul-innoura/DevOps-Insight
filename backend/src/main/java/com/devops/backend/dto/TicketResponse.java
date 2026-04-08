package com.devops.backend.dto;

import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TicketStatus;
import com.devops.backend.model.TimelineEntry;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * DTO for ticket response - contains all ticket information.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TicketResponse {
    
    private String id;
    private RequestType requestType;
    private String productName;
    private String projectId;
    private Environment environment;

    private WorkflowConfiguration workflowConfiguration;
    private java.util.List<WorkflowStageView> workflowStages;
    private Integer currentApprovalLevel;
    private Integer totalApprovalLevels;
    private String description;
    
    // Requester info
    private String requestedBy;
    private String requesterEmail;
    private String managerName;
    private String managerEmail;
    private boolean managerApprovalRequired;
    private String ccEmail;
    private String managerDesignation;
    
    // Manager approval tracking
    private String managerApprovalStatus;
    private String managerApprovalNote;
    private Instant managerApprovalDate;
    
    // Cost approval tracking
    private boolean costApprovalRequired;
    private Double estimatedCost;
    private String costCurrency;
    private String costApprovalStatus;
    private String costApprovalNote;
    private Instant costApprovalDate;
    private String costSubmittedBy;
    private String costSubmittedByEmail;
    
    // Status and assignment
    private TicketStatus status;
    private boolean active;
    private String assignedTo;
    private String assignedToEmail;
    
    // Timestamps
    private Instant createdAt;
    private Instant updatedAt;
    
    // Timeline
    private List<TimelineEntry> timeline;
    
    // All type-specific fields
    private String databaseType;
    private String purpose;
    private Instant activationDate;
    private Integer duration;
    private Instant shutdownDate;
    private String shutdownReason;
    private String releaseVersion;
    private String deploymentStrategy;
    private String releaseNotes;
    private String issueType;
    private String issueDescription;
    private String errorLogs;
    private String branchName;
    private String commitId;
    private String reason;
    private String otherQueryDetails;
    private List<String> attachments;
}
