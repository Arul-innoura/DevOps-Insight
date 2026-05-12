package com.devops.backend.service.autobuild;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.autobuild.CodeCutRequest;
import com.devops.backend.model.autobuild.EnvironmentAutoBuildConfig;
import com.devops.backend.model.workflow.ApprovalLevelConfig;
import com.devops.backend.model.workflow.WorkflowApprover;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.CodeCutRequestRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.repository.TicketRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Lifecycle for a single code-cut request:
 * create → wait for lead+manager approvals → captcha verify → trigger build.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CodeCutRequestService {

    private final CodeCutRequestRepository repo;
    private final ProjectWorkflowSettingsRepository workflowRepo;
    private final TicketRepository ticketRepo;
    private final BuildEmailService emailService;
    private final BuildCaptchaService captchaService;
    private final BuildBroadcastService broadcaster;

    /**
     * Create a brand-new code-cut request. Validates that auto-build is enabled
     * for the project+environment and resolves the lead/manager approvers.
     */
    public CodeCutRequest createRequest(CreateRequest req) {
        ProjectWorkflowSettings settings = workflowRepo.findByProjectId(req.getProjectId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Project workflow settings not found: " + req.getProjectId()));
        EnvironmentAutoBuildConfig envCfg = Optional.ofNullable(settings.getAutoBuildConfig())
                .map(m -> m.get(req.getEnvironment()))
                .orElseThrow(() -> new IllegalStateException(
                        "Auto-build config not set for environment: " + req.getEnvironment()));
        if (Boolean.FALSE.equals(envCfg.getEnabled())) {
            throw new IllegalStateException("Auto-build is disabled for this environment");
        }
        if (req.getBranchName() == null || req.getBranchName().isBlank()) {
            throw new IllegalArgumentException("Branch name is required");
        }

        // Resolve lead + manager from the project's existing workflow approval levels
        // so admins don't have to configure them twice.
        WorkflowApprover lead    = resolveApprover(settings, req.getEnvironment(), "lead",    0);
        WorkflowApprover manager = resolveApprover(settings, req.getEnvironment(), "manager", 1);

        Instant now = Instant.now();
        String threadId = emailService.generateThreadId(java.util.UUID.randomUUID().toString());

        CodeCutRequest cc = CodeCutRequest.builder()
                .projectId(req.getProjectId())
                .projectName(req.getProjectName())
                .environment(req.getEnvironment())
                .branchName(req.getBranchName().trim())
                .commitId(req.getCommitId() == null ? null : req.getCommitId().trim())
                .requesterNote(req.getRequesterNote())
                .requestedByName(req.getRequestedByName())
                .requestedByEmail(req.getRequestedByEmail())
                .leadApproverName(lead != null ? lead.getName() : null)
                .leadApproverEmail(lead != null ? lead.getEmail() : null)
                .leadApprovalState(CodeCutRequest.ApprovalState.PENDING)
                .managerApproverName(manager != null ? manager.getName() : null)
                .managerApproverEmail(manager != null ? manager.getEmail() : null)
                .managerApprovalState(CodeCutRequest.ApprovalState.PENDING)
                .status(CodeCutRequest.CodeCutStatus.PENDING_APPROVALS)
                .createdAt(now)
                .updatedAt(now)
                .emailThreadMessageId(threadId)
                .build();
        cc = repo.save(cc);

        emailService.sendApprovalRequestEmail(cc);
        broadcaster.emitCodeCutUpdated(cc);
        return cc;
    }

    /** Lead or manager approval action. role = "Lead" or "Manager". */
    public CodeCutRequest applyApproval(String requestId, String role, boolean approve, String actorEmail, String note) {
        CodeCutRequest cc = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Code cut request not found: " + requestId));
        if (cc.getStatus() != CodeCutRequest.CodeCutStatus.PENDING_APPROVALS) {
            throw new IllegalStateException("Request is no longer pending approvals (" + cc.getStatus() + ")");
        }
        Instant now = Instant.now();
        if ("Lead".equalsIgnoreCase(role)) {
            if (cc.getLeadApproverEmail() != null && !cc.getLeadApproverEmail().equalsIgnoreCase(actorEmail)) {
                throw new IllegalStateException("You are not the assigned lead approver");
            }
            cc.setLeadApprovalState(approve
                    ? CodeCutRequest.ApprovalState.APPROVED
                    : CodeCutRequest.ApprovalState.REJECTED);
            cc.setLeadActionedAt(now);
            cc.setLeadNote(note);
        } else if ("Manager".equalsIgnoreCase(role)) {
            if (cc.getManagerApproverEmail() != null && !cc.getManagerApproverEmail().equalsIgnoreCase(actorEmail)) {
                throw new IllegalStateException("You are not the assigned manager approver");
            }
            cc.setManagerApprovalState(approve
                    ? CodeCutRequest.ApprovalState.APPROVED
                    : CodeCutRequest.ApprovalState.REJECTED);
            cc.setManagerActionedAt(now);
            cc.setManagerNote(note);
        } else {
            throw new IllegalArgumentException("Unknown approver role: " + role);
        }

        // Compute new aggregate status.
        if (cc.getLeadApprovalState() == CodeCutRequest.ApprovalState.REJECTED
                || cc.getManagerApprovalState() == CodeCutRequest.ApprovalState.REJECTED) {
            cc.setStatus(CodeCutRequest.CodeCutStatus.REJECTED);
        } else if (cc.getLeadApprovalState() == CodeCutRequest.ApprovalState.APPROVED
                && cc.getManagerApprovalState() == CodeCutRequest.ApprovalState.APPROVED) {
            cc.setStatus(CodeCutRequest.CodeCutStatus.READY_TO_BUILD);
        }
        cc.setUpdatedAt(now);
        cc = repo.save(cc);

        emailService.sendApprovalResponseEmail(cc, role, approve, note);
        broadcaster.emitCodeCutUpdated(cc);
        return cc;
    }

    /** Issue a fresh captcha challenge (before showing the trigger button). */
    public String issueCaptcha(String requestId) {
        CodeCutRequest cc = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Code cut request not found: " + requestId));
        if (cc.getStatus() != CodeCutRequest.CodeCutStatus.READY_TO_BUILD) {
            throw new IllegalStateException("Request is not ready to build (" + cc.getStatus() + ")");
        }
        String challenge = captchaService.generate();
        cc.setCaptchaChallenge(challenge);
        cc.setCaptchaIssuedAt(Instant.now());
        cc.setCaptchaVerifiedAt(null);
        repo.save(cc);
        return challenge;
    }

    /** Verify a captcha submission. Throws if invalid. */
    public CodeCutRequest verifyCaptcha(String requestId, String submitted, String actorEmail) {
        CodeCutRequest cc = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Code cut request not found: " + requestId));
        if (cc.getStatus() != CodeCutRequest.CodeCutStatus.READY_TO_BUILD) {
            throw new IllegalStateException("Request is not ready to build (" + cc.getStatus() + ")");
        }
        if (cc.getCaptchaChallenge() == null) {
            throw new IllegalStateException("No captcha challenge issued");
        }
        if (cc.getCaptchaIssuedAt() != null
                && Instant.now().isAfter(cc.getCaptchaIssuedAt().plusSeconds(300))) {
            throw new IllegalStateException("Captcha expired — please request a new one");
        }
        if (!captchaService.verify(cc.getCaptchaChallenge(), submitted)) {
            throw new IllegalArgumentException("Captcha did not match");
        }
        cc.setCaptchaVerifiedAt(Instant.now());
        cc.setCaptchaVerifiedBy(actorEmail);
        return repo.save(cc);
    }

    /**
     * Mark a code-cut request as cancelled before any build kicked off.
     * (Building executions are cancelled via {@link BuildOrchestratorService#cancel}.)
     */
    public CodeCutRequest cancelPending(String requestId, String actorEmail) {
        CodeCutRequest cc = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Code cut request not found: " + requestId));
        if (cc.getStatus() == CodeCutRequest.CodeCutStatus.BUILDING) {
            throw new IllegalStateException("Build already running — use the cancel-execution endpoint");
        }
        cc.setStatus(CodeCutRequest.CodeCutStatus.CANCELLED);
        cc.setUpdatedAt(Instant.now());
        cc = repo.save(cc);
        broadcaster.emitCodeCutUpdated(cc);
        return cc;
    }

    public CodeCutRequest get(String id) {
        return repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Code cut request not found: " + id));
    }

    /** Look up the CodeCutRequest linked to a ticket (may be empty). */
    public Optional<CodeCutRequest> findByTicketId(String ticketId) {
        return repo.findTopByTicketIdOrderByCreatedAtDesc(ticketId);
    }

    /**
     * Get or create the CodeCutRequest for a ticket whose approval workflow is
     * already complete (both ticket-level approvals done).  The request is
     * created directly in {@code READY_TO_BUILD} state, skipping the separate
     * lead/manager email approval flow (those approvals happened on the ticket).
     *
     * <p>Idempotent: if a request already exists for this ticket it is returned
     * as-is (unless it is still PENDING_APPROVALS, in which case it is promoted
     * to READY_TO_BUILD to match the ticket's current state).
     */
    public CodeCutRequest ensureForTicket(String ticketId, String actorEmail, String actorName) {
        Optional<CodeCutRequest> existing = repo.findTopByTicketIdOrderByCreatedAtDesc(ticketId);
        if (existing.isPresent()) {
            CodeCutRequest cc = existing.get();

            switch (cc.getStatus()) {
                case READY_TO_BUILD:
                    // Already ready — return as-is so the captcha flow can proceed.
                    return cc;

                case BUILDING:
                    // A build is actively running — return it so the UI can show the live view.
                    return cc;

                case PENDING_APPROVALS:
                    // Ticket approvals are now done — promote to READY_TO_BUILD.
                    Instant now = Instant.now();
                    cc.setLeadApprovalState(CodeCutRequest.ApprovalState.APPROVED);
                    cc.setLeadActionedAt(now);
                    cc.setManagerApprovalState(CodeCutRequest.ApprovalState.APPROVED);
                    cc.setManagerActionedAt(now);
                    cc.setStatus(CodeCutRequest.CodeCutStatus.READY_TO_BUILD);
                    cc.setUpdatedAt(now);
                    cc = repo.save(cc);
                    broadcaster.emitCodeCutUpdated(cc);
                    return cc;

                default:
                    // Terminal states: CANCELLED, FAILED, COMPLETED, PARTIAL, REJECTED.
                    // The user wants to re-trigger — create a fresh request below.
                    log.info("Previous CodeCutRequest {} for ticket {} is {} — creating new READY_TO_BUILD request",
                            cc.getId(), ticketId, cc.getStatus());
                    break;
            }
        }

        // Look up the ticket
        Ticket ticket = ticketRepo.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found: " + ticketId));

        String projectId = ticket.getProjectId();
        String envKey = (ticket.getEnvironmentLabel() != null && !ticket.getEnvironmentLabel().isBlank())
                ? ticket.getEnvironmentLabel()
                : (ticket.getEnvironment() != null ? ticket.getEnvironment().name() : "");

        // Validate auto-build is enabled
        ProjectWorkflowSettings settings = workflowRepo.findByProjectId(projectId)
                .orElseThrow(() -> new IllegalStateException(
                        "Project workflow settings not found for: " + projectId));
        EnvironmentAutoBuildConfig envCfg = Optional.ofNullable(settings.getAutoBuildConfig())
                .map(m -> m.get(envKey))
                .orElseThrow(() -> new IllegalStateException(
                        "Auto-build not configured for environment: " + envKey));
        if (Boolean.FALSE.equals(envCfg.getEnabled())) {
            throw new IllegalStateException("Auto-build is disabled for environment: " + envKey);
        }

        // Create a new request in READY_TO_BUILD (ticket approvals already done)
        Instant now = Instant.now();
        String branch = (ticket.getBranchName() != null && !ticket.getBranchName().isBlank())
                ? ticket.getBranchName().trim()
                : (envCfg.getDefaultBranch() != null ? envCfg.getDefaultBranch() : "main");

        CodeCutRequest cc = CodeCutRequest.builder()
                .ticketId(ticketId)
                .projectId(projectId)
                .projectName(ticket.getProductName())
                .environment(envKey)
                .branchName(branch)
                .commitId(ticket.getCommitId())
                .requestedByName(actorName)
                .requestedByEmail(actorEmail)
                .leadApprovalState(CodeCutRequest.ApprovalState.APPROVED)
                .leadActionedAt(now)
                .managerApprovalState(CodeCutRequest.ApprovalState.APPROVED)
                .managerActionedAt(now)
                .status(CodeCutRequest.CodeCutStatus.READY_TO_BUILD)
                .createdAt(now)
                .updatedAt(now)
                .emailThreadMessageId(emailService.generateThreadId(java.util.UUID.randomUUID().toString()))
                .build();
        cc = repo.save(cc);
        broadcaster.emitCodeCutUpdated(cc);
        log.info("Created CodeCutRequest {} (READY_TO_BUILD) from ticket {}", cc.getId(), ticketId);
        return cc;
    }

    public java.util.List<CodeCutRequest> listForProject(String projectId) {
        return repo.findByProjectIdOrderByCreatedAtDesc(projectId);
    }

    public java.util.List<CodeCutRequest> listForRequester(String email) {
        return repo.findByRequestedByEmailIgnoreCaseOrderByCreatedAtDesc(email);
    }

    public java.util.List<CodeCutRequest> listPendingForLead(String email) {
        return repo.findByLeadApproverEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
                email, CodeCutRequest.CodeCutStatus.PENDING_APPROVALS);
    }

    public java.util.List<CodeCutRequest> listPendingForManager(String email) {
        return repo.findByManagerApproverEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
                email, CodeCutRequest.CodeCutStatus.PENDING_APPROVALS);
    }

    /**
     * Find a WorkflowApprover from the project's configured approval levels.
     *
     * <p>Strategy:
     * <ol>
     *   <li>Check the environment-specific workflow configuration first.</li>
     *   <li>Fall back to the default workflow configuration.</li>
     *   <li>Within the approval levels, look for an approver whose {@code role}
     *       contains {@code roleKeyword} (case-insensitive); otherwise fall back
     *       to the first approver at {@code fallbackLevelIndex}.</li>
     * </ol>
     */
    private WorkflowApprover resolveApprover(ProjectWorkflowSettings settings,
                                              String environment,
                                              String roleKeyword,
                                              int fallbackLevelIndex) {
        WorkflowConfiguration cfg = null;
        if (settings.getEnvironmentConfigurations() != null) {
            cfg = settings.getEnvironmentConfigurations().get(environment);
        }
        if (cfg == null) {
            cfg = settings.getDefaultConfiguration();
        }
        if (cfg == null || cfg.getApprovalLevels() == null || cfg.getApprovalLevels().isEmpty()) {
            return null;
        }

        List<ApprovalLevelConfig> levels = cfg.getApprovalLevels();

        // Try to find by role keyword across all levels.
        for (ApprovalLevelConfig level : levels) {
            if (level.getApprovers() == null) continue;
            for (WorkflowApprover a : level.getApprovers()) {
                if (a.getRole() != null && a.getRole().toLowerCase().contains(roleKeyword)) {
                    return a;
                }
            }
        }

        // Fall back to first approver at the given level index.
        if (fallbackLevelIndex < levels.size()) {
            List<WorkflowApprover> approvers = levels.get(fallbackLevelIndex).getApprovers();
            if (approvers != null && !approvers.isEmpty()) {
                return approvers.get(0);
            }
        }
        return null;
    }

    @lombok.Data
    public static class CreateRequest {
        private String projectId;
        private String projectName;
        private String environment;
        private String branchName;
        private String commitId;
        private String requesterNote;
        private String requestedByName;
        private String requestedByEmail;
    }
}
