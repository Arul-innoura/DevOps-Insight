package com.devops.backend.controller;

import com.devops.backend.model.autobuild.BuildExecution;
import com.devops.backend.model.autobuild.CodeCutRequest;
import com.devops.backend.repository.BuildExecutionRepository;
import com.devops.backend.service.autobuild.BuildOrchestratorService;
import com.devops.backend.service.autobuild.CodeCutRequestService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST surface for the code-cut / auto-build flow.
 *
 * <p>Endpoints:
 * <ul>
 *     <li>POST /api/code-cut — create a request</li>
 *     <li>GET  /api/code-cut/{id} — fetch one</li>
 *     <li>GET  /api/code-cut/project/{projectId} — list for project</li>
 *     <li>GET  /api/code-cut/inbox/lead — pending requests for the caller as lead</li>
 *     <li>GET  /api/code-cut/inbox/manager — pending requests for the caller as manager</li>
 *     <li>GET  /api/code-cut/mine — requests created by caller</li>
 *     <li>POST /api/code-cut/{id}/approve?role=Lead|Manager</li>
 *     <li>POST /api/code-cut/{id}/reject?role=Lead|Manager</li>
 *     <li>POST /api/code-cut/{id}/captcha — issue challenge</li>
 *     <li>POST /api/code-cut/{id}/trigger — verify captcha + start build</li>
 *     <li>POST /api/code-cut/{id}/cancel — cancel pending request (no build yet)</li>
 *     <li>POST /api/code-cut/executions/{executionId}/cancel — cancel running build</li>
 *     <li>GET  /api/code-cut/executions/{executionId} — execution snapshot</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/code-cut")
@RequiredArgsConstructor
@Slf4j
public class CodeCutController {

    private final CodeCutRequestService codeCutService;
    private final BuildOrchestratorService orchestrator;
    private final BuildExecutionRepository executionRepo;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> create(
            @RequestBody CreateBody body,
            @AuthenticationPrincipal Jwt jwt) {
        CodeCutRequestService.CreateRequest req = new CodeCutRequestService.CreateRequest();
        req.setProjectId(body.getProjectId());
        req.setProjectName(body.getProjectName());
        req.setEnvironment(body.getEnvironment());
        req.setBranchName(body.getBranchName());
        req.setCommitId(body.getCommitId());
        req.setRequesterNote(body.getNote());
        req.setRequestedByName(extractName(jwt));
        req.setRequestedByEmail(extractEmail(jwt));
        return ResponseEntity.ok(codeCutService.createRequest(req));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> get(@PathVariable String id) {
        return ResponseEntity.ok(codeCutService.get(id));
    }

    @GetMapping("/project/{projectId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<CodeCutRequest>> forProject(@PathVariable String projectId) {
        return ResponseEntity.ok(codeCutService.listForProject(projectId));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<CodeCutRequest>> mine(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.listForRequester(extractEmail(jwt)));
    }

    @GetMapping("/inbox/lead")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<CodeCutRequest>> leadInbox(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.listPendingForLead(extractEmail(jwt)));
    }

    @GetMapping("/inbox/manager")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<CodeCutRequest>> managerInbox(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.listPendingForManager(extractEmail(jwt)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> approve(
            @PathVariable String id,
            @RequestParam String role,
            @RequestBody(required = false) NoteBody body,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.applyApproval(id, role, true, extractEmail(jwt),
                body == null ? null : body.getNote()));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> reject(
            @PathVariable String id,
            @RequestParam String role,
            @RequestBody(required = false) NoteBody body,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.applyApproval(id, role, false, extractEmail(jwt),
                body == null ? null : body.getNote()));
    }

    @PostMapping("/{id}/captcha")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<Map<String, String>> issueCaptcha(@PathVariable String id) {
        String challenge = codeCutService.issueCaptcha(id);
        return ResponseEntity.ok(Map.of("challenge", challenge));
    }

    @PostMapping("/{id}/trigger")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<BuildExecution> trigger(
            @PathVariable String id,
            @RequestBody TriggerBody body,
            @AuthenticationPrincipal Jwt jwt) {
        CodeCutRequest verified = codeCutService.verifyCaptcha(id, body == null ? null : body.getCaptcha(), extractEmail(jwt));
        BuildExecution exec = orchestrator.startBuild(verified, extractName(jwt), extractEmail(jwt));
        return ResponseEntity.ok(exec);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> cancel(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.cancelPending(id, extractEmail(jwt)));
    }

    /** Reset a FAILED / PARTIAL / CANCELLED request back to READY_TO_BUILD so it can be re-triggered. */
    @PostMapping("/{id}/retry")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> retry(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(codeCutService.retry(id, extractEmail(jwt)));
    }

    @PostMapping("/executions/{executionId}/cancel")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<BuildExecution> cancelBuild(
            @PathVariable String executionId,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(orchestrator.cancel(executionId, extractName(jwt), extractEmail(jwt)));
    }

    @GetMapping("/executions/{executionId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<BuildExecution> getExecution(@PathVariable String executionId) {
        return executionRepo.findById(executionId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/executions/by-request/{requestId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<BuildExecution>> executionsForRequest(@PathVariable String requestId) {
        return ResponseEntity.ok(executionRepo.findByCodeCutRequestIdOrderByQueuedAtDesc(requestId));
    }

    /** Return the CodeCutRequest linked to a ticket, or 404 if none exists yet. */
    @GetMapping("/by-ticket/{ticketId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> byTicket(@PathVariable String ticketId) {
        return codeCutService.findByTicketId(ticketId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Idempotent: find or create a CodeCutRequest for a ticket whose approvals
     * are already complete.  The request is returned in READY_TO_BUILD state
     * so the caller can immediately proceed to captcha + trigger.
     */
    @PostMapping("/from-ticket/{ticketId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<CodeCutRequest> fromTicket(
            @PathVariable String ticketId,
            @AuthenticationPrincipal Jwt jwt) {
        CodeCutRequest cc = codeCutService.ensureForTicket(
                ticketId, extractEmail(jwt), extractName(jwt));
        return ResponseEntity.ok(cc);
    }

    private static String extractName(Jwt jwt) {
        if (jwt == null) return "User";
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) name = jwt.getClaimAsString("preferred_username");
        return name != null ? name : "User";
    }

    private static String extractEmail(Jwt jwt) {
        if (jwt == null) return "";
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isEmpty()) email = jwt.getClaimAsString("preferred_username");
        if (email == null || email.isEmpty()) email = jwt.getClaimAsString("upn");
        return email == null ? "" : email;
    }

    @Data
    public static class CreateBody {
        private String projectId;
        private String projectName;
        private String environment;
        private String branchName;
        private String commitId;
        private String note;
    }

    @Data
    public static class NoteBody {
        private String note;
    }

    @Data
    public static class TriggerBody {
        private String captcha;
    }
}
