package com.devops.backend.controller;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.ProjectWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/workflow")
@RequiredArgsConstructor
public class ProjectWorkflowController {

    private final ProjectWorkflowService projectWorkflowService;
    private final ProjectWorkflowSettingsRepository projectWorkflowSettingsRepository;

    @GetMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<ProjectWorkflowSettings> getWorkflow(
            @PathVariable String projectId,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(projectWorkflowService.getOrCreate(projectId, extractName(jwt)));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<ProjectWorkflowSettings> saveWorkflow(
            @PathVariable String projectId,
            @RequestBody ProjectWorkflowSettings body,
            @AuthenticationPrincipal Jwt jwt) {
        body.setProjectId(projectId);
        projectWorkflowSettingsRepository.findByProjectId(projectId).ifPresent(existing -> body.setId(existing.getId()));
        return ResponseEntity.ok(projectWorkflowService.save(body, extractName(jwt)));
    }

    @GetMapping("/effective")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<WorkflowConfiguration> effective(
            @PathVariable String projectId,
            @RequestParam("requestType") String requestType) {
        try {
            RequestType rt = RequestType.valueOf(requestType.trim().toUpperCase());
            return ResponseEntity.ok(projectWorkflowService.resolveEffective(projectId, rt));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    private static String extractName(Jwt jwt) {
        if (jwt == null) {
            return "Admin";
        }
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("preferred_username");
        }
        return name != null ? name : "Admin";
    }
}
