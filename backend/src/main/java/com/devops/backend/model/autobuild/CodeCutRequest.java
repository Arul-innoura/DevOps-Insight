package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Code-cut request raised by a user. Drives the lead+manager approval flow
 * and gates the auto-build trigger.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "code_cut_requests")
public class CodeCutRequest {

    @Id
    private String id;

    @Indexed
    private String projectId;

    /** Project display name at request time (denormalized for convenience). */
    private String projectName;

    /**
     * The Ticket id that originated this code-cut request.
     * Populated when the request is created via the ticket full-view "Trigger Build"
     * button so the ticket modal can look it up by ticket id.
     */
    @Indexed
    private String ticketId;

    /** Environment name (e.g. "QA"). */
    @Indexed
    private String environment;

    private String branchName;

    /** Optional — blank = HEAD. */
    private String commitId;

    /** Free-form note from the requester. */
    private String requesterNote;

    private String requestedByName;
    private String requestedByEmail;

    private String leadApproverName;
    private String leadApproverEmail;
    private ApprovalState leadApprovalState;
    private Instant leadActionedAt;
    private String leadNote;

    private String managerApproverName;
    private String managerApproverEmail;
    private ApprovalState managerApprovalState;
    private Instant managerActionedAt;
    private String managerNote;

    /** Captcha challenge (server-generated 5-char text) bound to the trigger action. */
    private String captchaChallenge;
    private Instant captchaIssuedAt;
    private Instant captchaVerifiedAt;
    private String captchaVerifiedBy;

    /** Current build execution id (latest BuildExecution). */
    private String currentBuildExecutionId;

    /** Overall request status. */
    @Indexed
    private CodeCutStatus status;

    private Instant createdAt;
    private Instant updatedAt;

    /** Email Message-ID used so all related notifications thread together. */
    private String emailThreadMessageId;

    public enum ApprovalState { PENDING, APPROVED, REJECTED }

    public enum CodeCutStatus {
        PENDING_APPROVALS,
        REJECTED,
        READY_TO_BUILD,
        BUILDING,
        COMPLETED,
        FAILED,
        PARTIAL,
        CANCELLED
    }
}
