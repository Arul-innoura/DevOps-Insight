package com.devops.backend.controller;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.autobuild.EnvironmentAutoBuildConfig;
import com.devops.backend.model.autobuild.JenkinsConnection;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.ProjectWorkflowService;
import com.devops.backend.service.autobuild.JenkinsClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Admin-only endpoints for managing per-project Jenkins connection +
 * per-environment auto-build configuration.
 */
@RestController
@RequestMapping("/api/projects/{projectId}/auto-build")
@RequiredArgsConstructor
@Slf4j
public class AutoBuildConfigController {

    private final ProjectWorkflowSettingsRepository workflowRepo;
    private final ProjectWorkflowService workflowService;
    private final JenkinsClient jenkinsClient;

    /** Read full auto-build settings (Jenkins conn + per-env config map). Admin/DevOps only. */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public ResponseEntity<Map<String, Object>> get(
            @PathVariable String projectId,
            @AuthenticationPrincipal Jwt jwt) {
        ProjectWorkflowSettings settings = workflowService.getOrCreate(projectId, extractName(jwt));
        Map<String, Object> body = new HashMap<>();
        body.put("jenkinsConnection", redact(settings.getJenkinsConnection()));
        body.put("autoBuildConfig", settings.getAutoBuildConfig() == null ? Map.of() : settings.getAutoBuildConfig());
        return ResponseEntity.ok(body);
    }

    /**
     * Lightweight read — returns only the per-environment enabled flag.
     * No Jenkins credentials exposed. Accessible to all authenticated roles so
     * regular users can check whether the Trigger Build button should be active.
     *
     * <p>Response shape: {@code { "QA": true, "PROD": false, … }}
     */
    @GetMapping("/status")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<Map<String, Boolean>> status(@PathVariable String projectId) {
        Map<String, Boolean> result = new HashMap<>();
        workflowRepo.findByProjectId(projectId).ifPresent(settings -> {
            if (settings.getAutoBuildConfig() != null) {
                settings.getAutoBuildConfig().forEach((env, cfg) ->
                        result.put(env, Boolean.TRUE.equals(cfg.getEnabled())));
            }
        });
        return ResponseEntity.ok(result);
    }

    /** Save the Jenkins connection block. */
    @PutMapping("/jenkins")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<JenkinsConnection> saveJenkins(
            @PathVariable String projectId,
            @RequestBody JenkinsConnection conn,
            @AuthenticationPrincipal Jwt jwt) {
        ProjectWorkflowSettings settings = workflowService.getOrCreate(projectId, extractName(jwt));
        // Preserve token if client sends back the redacted placeholder.
        JenkinsConnection existing = settings.getJenkinsConnection();
        if (existing != null && (conn.getJenkinsApiToken() == null
                || REDACTED.equals(conn.getJenkinsApiToken())
                || conn.getJenkinsApiToken().isBlank())) {
            conn.setJenkinsApiToken(existing.getJenkinsApiToken());
        }
        settings.setJenkinsConnection(conn);
        settings.setUpdatedAt(Instant.now());
        workflowRepo.save(settings);
        return ResponseEntity.ok(redact(conn));
    }

    /** Save (or upsert) a single environment's auto-build configuration. */
    @PutMapping("/environments/{environment}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<EnvironmentAutoBuildConfig> saveEnvConfig(
            @PathVariable String projectId,
            @PathVariable String environment,
            @RequestBody EnvironmentAutoBuildConfig body,
            @AuthenticationPrincipal Jwt jwt) {
        ProjectWorkflowSettings settings = workflowService.getOrCreate(projectId, extractName(jwt));
        if (settings.getAutoBuildConfig() == null) {
            settings.setAutoBuildConfig(new HashMap<>());
        }
        settings.getAutoBuildConfig().put(environment, body);
        settings.setUpdatedAt(Instant.now());
        workflowRepo.save(settings);
        return ResponseEntity.ok(body);
    }

    /** Delete an environment's auto-build configuration. */
    @DeleteMapping("/environments/{environment}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Void> deleteEnvConfig(
            @PathVariable String projectId,
            @PathVariable String environment,
            @AuthenticationPrincipal Jwt jwt) {
        ProjectWorkflowSettings settings = workflowService.getOrCreate(projectId, extractName(jwt));
        if (settings.getAutoBuildConfig() != null) {
            settings.getAutoBuildConfig().remove(environment);
        }
        settings.setUpdatedAt(Instant.now());
        workflowRepo.save(settings);
        return ResponseEntity.noContent().build();
    }

    /** Test Jenkins connection (admin "Test" button). */
    @PostMapping("/jenkins/test")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Map<String, Object>> testConnection(
            @PathVariable String projectId,
            @RequestBody(required = false) JenkinsConnection body,
            @AuthenticationPrincipal Jwt jwt) {
        ProjectWorkflowSettings settings = workflowService.getOrCreate(projectId, extractName(jwt));
        JenkinsConnection conn = (body != null && body.getJenkinsUrl() != null && !body.getJenkinsUrl().isBlank())
                ? body : settings.getJenkinsConnection();
        if (conn == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "No Jenkins connection configured"));
        }
        // If the client posted no token (just URL/user) reuse the saved one.
        if (conn.getJenkinsApiToken() == null || REDACTED.equals(conn.getJenkinsApiToken())
                || conn.getJenkinsApiToken().isBlank()) {
            JenkinsConnection saved = settings.getJenkinsConnection();
            if (saved != null) conn.setJenkinsApiToken(saved.getJenkinsApiToken());
        }
        JenkinsClient.ConnectionCheck check = jenkinsClient.testConnection(conn);
        Map<String, Object> resp = new HashMap<>();
        resp.put("ok", check.isOk());
        resp.put("version", check.getVersion());
        resp.put("message", check.getMessage());
        if (check.isOk()) {
            settings.getJenkinsConnection().setVerified(true);
            workflowRepo.save(settings);
        }
        return ResponseEntity.ok(resp);
    }

    private static final String REDACTED = "__REDACTED__";

    private static JenkinsConnection redact(JenkinsConnection in) {
        if (in == null) return null;
        return JenkinsConnection.builder()
                .jenkinsUrl(in.getJenkinsUrl())
                .jenkinsUser(in.getJenkinsUser())
                .jenkinsApiToken(in.getJenkinsApiToken() == null || in.getJenkinsApiToken().isBlank()
                        ? null : REDACTED)
                .crumbPath(in.getCrumbPath())
                .verified(in.getVerified())
                .build();
    }

    private static String extractName(Jwt jwt) {
        if (jwt == null) return "Admin";
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) name = jwt.getClaimAsString("preferred_username");
        return name != null ? name : "Admin";
    }
}
