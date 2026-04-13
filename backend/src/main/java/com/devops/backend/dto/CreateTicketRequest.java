package com.devops.backend.dto;

import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * DTO for creating a new ticket.
 * Contains all possible fields for different request types.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateTicketRequest {
    
    // Common fields
    @NotNull(message = "Request type is required")
    private RequestType requestType;
    
    @NotBlank(message = "Product name is required")
    private String productName;
    
    @NotNull(message = "Environment is required")
    private Environment environment;
    
    private String description;
    
    private String managerName;
    private String managerEmail;  // Manager's email for approval workflow
    private boolean managerApprovalRequired;
    private String toEmail;
    private String ccEmail;
    private String bccEmail;
    
    // New Environment fields
    private String databaseType;
    private String purpose;
    
    // Environment Up fields
    private Instant activationDate;
    private Integer duration;
    
    // Environment Down fields
    private Instant shutdownDate;
    private String shutdownReason;
    
    // Release Deployment fields
    private String releaseVersion;
    private String deploymentStrategy;
    private String releaseNotes;
    
    // Issue Fix fields
    private String issueType;
    private String issueDescription;
    private String errorLogs;
    
    // Build Request fields
    private String branchName;
    private String commitId;
    
    // Code Cut fields
    private String reason;

    // Other Queries fields
    private String otherQueryDetails;
    
    // Attachments
    private List<String> attachments;
}
