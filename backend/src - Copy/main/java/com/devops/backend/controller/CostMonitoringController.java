package com.devops.backend.controller;

import com.devops.backend.dto.monitoring.CostTimelinePoint;
import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown;
import com.devops.backend.dto.monitoring.LiveCostRow;
import com.devops.backend.dto.monitoring.ProjectCostBreakdown;
import com.devops.backend.service.CostMonitoringService;
import com.devops.backend.service.NodeCapacityCostService;
import org.springframework.http.ResponseEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Cost monitoring — DevOps-only, separate from the Resource Monitoring
 * section. Exposes live cost per project/service, manual cycle control,
 * and historical cost timelines.
 */
@RestController
@RequestMapping("/api/cost-monitoring")
@RequiredArgsConstructor
public class CostMonitoringController {

    private final CostMonitoringService service;
    private final NodeCapacityCostService capacityService;

    @GetMapping("/live")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public List<LiveCostRow> live() {
        return service.getLiveCosts();
    }

    @GetMapping("/project")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ProjectCostBreakdown project(
            @RequestParam String projectId,
            @RequestParam(required = false) String environment
    ) {
        return service.getProjectBreakdown(projectId, environment);
    }

    @GetMapping("/timeline")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public List<CostTimelinePoint> timeline(
            @RequestParam String projectId,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String cloudServiceId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        LocalDate today = LocalDate.now();
        Instant f = (from != null && !from.isBlank())
                ? LocalDate.parse(from).atStartOfDay().toInstant(ZoneOffset.UTC)
                : today.minusDays(7).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant t = (to != null && !to.isBlank())
                ? LocalDate.parse(to).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)
                : today.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return service.getCostTimeline(projectId, environment, cloudServiceId, f, t);
    }

    /** DevOps start/stop a cloud service cycle (for real-time accrual). */
    @PostMapping("/cycle")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
    public Map<String, Boolean> cycle(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String actor = jwt != null ? jwt.getClaimAsString("name") : "devops";
        String action = body.getOrDefault("action", "").toLowerCase();
        String projectId = body.get("projectId");
        String environment = body.getOrDefault("environment", "default");
        String cloudServiceId = body.get("cloudServiceId");
        if ("start".equals(action)) {
            service.startCycle(projectId, environment, cloudServiceId, actor);
        } else if ("stop".equals(action)) {
            service.stopCycle(projectId, environment, cloudServiceId, actor);
        } else {
            return Map.of("ok", false);
        }
        return Map.of("ok", true);
    }

    /** DevOps force a cost tick now. */
    @PostMapping("/tick")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
    public Map<String, Integer> tick() {
        return Map.of("processed", service.tickLiveCosts());
    }

    /**
     * Capacity-based cost breakdown per environment (node pools + shared infra
     * split proportionally by requested CPU/memory share). Feeds the DevOps
     * "Cost Management" dashboard.
     */
    @GetMapping("/capacity-breakdown")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public List<EnvironmentCapacityBreakdown> capacityBreakdown() {
        return capacityService.breakdownAll();
    }

    @GetMapping("/capacity-breakdown/{environmentId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<EnvironmentCapacityBreakdown> capacityBreakdownOne(@PathVariable String environmentId) {
        return capacityService.breakdownFor(environmentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
