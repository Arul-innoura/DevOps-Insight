package com.devops.backend.controller;

import com.devops.backend.model.monitoring.ClusterConnection;
import com.devops.backend.model.monitoring.ClusterLiveMetrics;
import com.devops.backend.service.ClusterMetricsService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * REST API for real AKS cluster metrics.
 * All endpoints are open (no auth) for local testing.
 * Re-add @PreAuthorize before going to production.
 *
 * POST   /api/cluster-metrics/{envId}/connect    — save kubeconfig
 * DELETE /api/cluster-metrics/{envId}/connect    — remove connection
 * GET    /api/cluster-metrics/{envId}/connection — connection status
 * POST   /api/cluster-metrics/{envId}/test       — re-test connectivity
 * POST   /api/cluster-metrics/{envId}/refresh    — collect now + save
 * GET    /api/cluster-metrics/{envId}/latest     — latest snapshot (all fields)
 * GET    /api/cluster-metrics/{envId}/history    — snapshots over date range
 * GET    /api/cluster-metrics                    — summary for all environments
 */
@RestController
@RequestMapping("/api/cluster-metrics")
@RequiredArgsConstructor
public class ClusterMetricsController {

    private final ClusterMetricsService service;

    // ── Connection management ─────────────────────────────────────────────────

    /**
     * Save (or overwrite) kubeconfig for an environment and test connection.
     * Body: { "environmentName": "...", "kubeconfigContent": "<yaml>" }
     */
    @PostMapping("/{environmentId}/connect")
    public ClusterConnection connect(
            @PathVariable String environmentId,
            @RequestBody Map<String, String> body) {

        return service.saveConnection(
                environmentId,
                body.getOrDefault("environmentName", environmentId),
                body.get("kubeconfigContent"),
                null,   // jenkinsNodePool — handled separately later
                "test-user");
    }

    @DeleteMapping("/{environmentId}/connect")
    public Map<String, Object> disconnect(@PathVariable String environmentId) {
        service.deleteConnection(environmentId);
        return Map.of("ok", true, "environmentId", environmentId);
    }

    @GetMapping("/{environmentId}/connection")
    public ResponseEntity<ClusterConnection> getConnection(@PathVariable String environmentId) {
        return service.getConnection(environmentId)
                .map(c -> {
                    c.setKubeconfigContent(null); // never expose kubeconfig over API
                    return ResponseEntity.ok(c);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{environmentId}/test")
    public Map<String, Object> testConnection(@PathVariable String environmentId) {
        boolean ok = service.testConnection(environmentId);
        return Map.of("connected", ok, "environmentId", environmentId);
    }

    // ── Metrics collection ────────────────────────────────────────────────────

    /** Trigger a fresh collection immediately (returns the new snapshot). */
    @PostMapping("/{environmentId}/refresh")
    public ClusterLiveMetrics refresh(@PathVariable String environmentId) {
        return service.collectAndSave(environmentId);
    }

    // ── Metrics retrieval ─────────────────────────────────────────────────────

    /**
     * Latest snapshot — full detail: nodes, node-pools, namespaces + cost breakdown.
     */
    @GetMapping("/{environmentId}/latest")
    public ResponseEntity<ClusterLiveMetrics> latest(@PathVariable String environmentId) {
        return service.getLatest(environmentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Snapshots within a date range (ISO dates).
     * Defaults to last 24 hours when from/to are omitted.
     */
    @GetMapping("/{environmentId}/history")
    public List<ClusterLiveMetrics> history(
            @PathVariable String environmentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Instant f = (from != null ? from : today.minusDays(1)).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant t = (to != null ? to.plusDays(1) : today.plusDays(1)).atStartOfDay().toInstant(ZoneOffset.UTC);
        return service.getHistory(environmentId, f, t);
    }

    /** One summary card per environment that has a saved cluster connection. */
    @GetMapping
    public List<Map<String, Object>> allSummaries() {
        return service.getAllLatestSummaries();
    }
}
