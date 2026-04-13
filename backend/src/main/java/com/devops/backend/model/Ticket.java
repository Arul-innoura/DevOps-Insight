package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Main Ticket entity representing a DevOps request ticket.
 * Stored in MongoDB with comprehensive fields for all request types.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "tickets")
public class Ticket {
    
    @Id
    private String id;
    
    // Common fields for all request types
    @Indexed
    private RequestType requestType;
    
    @Indexed
    private String productName;

    /** Linked {@link Project} id when product name matched a project */
    private String projectId;

    /** Effective workflow JSON snapshot at ticket creation (routing, levels, cost rules) */
    private String workflowSnapshotJson;

    private Integer currentApprovalLevel;
    private Integer totalApprovalLevels;

    /** Denormalized email routing from workflow for threaded notifications */
    private java.util.List<String> workflowEmailTo;
    private java.util.List<String> workflowEmailCc;
    private java.util.List<String> workflowEmailBcc;

    /** Mandatory subsets — users cannot remove these email addresses from ticket routing */
    private java.util.List<String> workflowEmailToMandatory;
    private java.util.List<String> workflowEmailCcMandatory;
    private java.util.List<String> workflowEmailBccMandatory;

    @Indexed
    private Environment environment;
    
    private String description;
    
    // Requester information
    @Indexed
    private String requestedBy;
    
    @Indexed
    private String requesterEmail;
    
    private String managerName;
    private boolean managerApprovalRequired;
    private String ccEmail;
    /**
     * Human-friendly designation/role for the selected approver (e.g. Lead/Manager).
     * Derived from workflow approver role or the approval trigger notes.
     */
    private String managerDesignation;
    
    // Email threading fields for maintaining conversation threads
    private String emailMessageId;  // RFC 2822 Message-ID header for the initial email
    private String emailThreadId;   // Thread identifier for grouping emails
    
    // Manager approval tracking
    private String managerEmail;
    private String managerApprovalStatus;  // PENDING, APPROVED, REJECTED
    private String managerApprovalNote;
    private java.time.Instant managerApprovalDate;
    
    // Cost approval tracking
    private boolean costApprovalRequired;
    private Double estimatedCost;
    private String costCurrency;  // USD, INR, EUR, etc.
    private String costApprovalStatus;  // PENDING, APPROVED, REJECTED
    private String costApprovalNote;
    private java.time.Instant costApprovalDate;
    private String costSubmittedBy;
    private String costSubmittedByEmail;
    
    // Ticket status and assignment
    @Indexed
    private TicketStatus status;

    @Builder.Default
    private boolean active = true;
    
    private String assignedTo;
    private String assignedToEmail;
    
    // Timestamps
    @Indexed
    private Instant createdAt;
    private Instant updatedAt;
    
    // Timeline for tracking all changes
    @Builder.Default
    private List<TimelineEntry> timeline = new ArrayList<>();
    
    // ========== New Environment Request Fields ==========
    private String databaseType;
    private String purpose;
    
    // ========== Environment Up Request Fields ==========
    private Instant activationDate;
    private Integer duration; // Days
    
    // ========== Environment Down Request Fields ==========
    private Instant shutdownDate;
    private String shutdownReason;
    
    // ========== Release Deployment Request Fields ==========
    private String releaseVersion;
    private String deploymentStrategy;
    private String releaseNotes;
    
    // ========== Issue Fix Request Fields ==========
    private String issueType;
    private String issueDescription;
    private String errorLogs;
    
    // ========== Build Request Fields ==========
    private String branchName;
    private String commitId;
    
    // ========== Code Cut Request Fields ==========
    // Uses branchName, releaseVersion already defined above
    private String reason;

    // ========== Other Queries Request Fields ==========
    private String otherQueryDetails;
    
    // Attachments (store file references or URLs)
    @Builder.Default
    private List<String> attachments = new ArrayList<>();

    /**
     * Soft-delete (admin): hidden from normal queues; ticket cannot be modified until restored.
     */
    @Builder.Default
    @Indexed
    private boolean deleted = false;

    private Instant deletedAt;
    private String deletedBy;
    private String deletedByEmail;
    
    /**
     * Add a timeline entry for status change
     */
    public void addTimelineEntry(TicketStatus status, String user, String userEmail, String notes) {
        if (this.timeline == null) {
            this.timeline = new ArrayList<>();
        }
        this.timeline.add(TimelineEntry.builder()
                .status(status)
                .timestamp(Instant.now())
                .user(user)
                .userEmail(userEmail)
                .notes(notes)
                .isNote(false)
                .build());
    }
    
    /**
     * Add a note to the timeline without status change
     */
    public void addNote(String user, String userEmail, String notes) {
        addNote(user, userEmail, notes, null);
    }

    public void addNote(String user, String userEmail, String notes, List<String> attachments) {
        if (this.timeline == null) {
            this.timeline = new ArrayList<>();
        }
        List<String> normalizedAttachments = attachments == null ? null : attachments.stream()
                .filter(a -> a != null && !a.isBlank())
                .map(String::trim)
                .collect(Collectors.toList());
        this.timeline.add(TimelineEntry.builder()
                .status(this.status)
                .timestamp(Instant.now())
                .user(user)
                .userEmail(userEmail)
                .notes(notes)
                .attachments(normalizedAttachments == null || normalizedAttachments.isEmpty() ? null : normalizedAttachments)
                .isNote(true)
                .build());
    }
    
    /**
     * Add a timeline entry for ticket assignment
     */
    public void addAssignmentEntry(String assignedBy, String assignedByEmail, String assignedTo, String assignedToEmail) {
        if (this.timeline == null) {
            this.timeline = new ArrayList<>();
        }
        this.timeline.add(TimelineEntry.builder()
                .status(this.status)
                .timestamp(Instant.now())
                .user(assignedBy)
                .userEmail(assignedByEmail)
                .notes("Ticket assigned to " + assignedTo)
                .action("assigned")
                .newAssignee(assignedTo)
                .isNote(false)
                .build());
    }
    
    /**
     * Add a timeline entry for ticket forwarding
     */
    public void addForwardEntry(String forwardedBy, String forwardedByEmail, 
                               String previousAssignee, String newAssignee, String notes) {
        if (this.timeline == null) {
            this.timeline = new ArrayList<>();
        }
        this.timeline.add(TimelineEntry.builder()
                .status(this.status)
                .timestamp(Instant.now())
                .user(forwardedBy)
                .userEmail(forwardedByEmail)
                .notes(notes != null && !notes.isEmpty() ? notes : "Ticket forwarded")
                .action("forwarded")
                .previousAssignee(previousAssignee)
                .newAssignee(newAssignee)
                .isNote(false)
                .build());
    }
}
