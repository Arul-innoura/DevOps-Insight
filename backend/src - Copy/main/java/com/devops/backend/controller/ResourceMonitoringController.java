package com.devops.backend.controller;

import com.devops.backend.dto.monitoring.FluctuationPoint;
import com.devops.backend.dto.monitoring.ResourceHierarchyNode;
import com.devops.backend.service.ResourceMonitoringService;
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

@RestController
@RequestMapping("/api/resource-monitoring")
@RequiredArgsConstructor
public class ResourceMonitoringController {

    private final ResourceMonitoringService service;

    /** Environment → Cluster → Project → Microservice tree. Users + DevOps + Admin. */
    @GetMapping("/hierarchy")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<ResourceHierarchyNode> hierarchy(@RequestParam(required = false) String environment) {
        if (environment != null && !environment.isBlank()) {
            return service.getEnvironmentSubtree(environment);
        }
        return service.getHierarchy();
    }

    @GetMapping("/fluctuation/cluster")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<FluctuationPoint> clusterFluctuation(
            @RequestParam String environment,
            @RequestParam(required = false) String clusterName,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        Range r = parseRange(from, to, 3650);
        return service.getClusterFluctuation(environment, clusterName, r.from, r.to);
    }

    @GetMapping("/fluctuation/project")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<FluctuationPoint> projectFluctuation(
            @RequestParam String projectId,
            @RequestParam String environment,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        Range r = parseRange(from, to, 3650);
        return service.getProjectFluctuation(projectId, environment, r.from, r.to);
    }

    @GetMapping("/fluctuation/microservice")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<FluctuationPoint> microserviceFluctuation(
            @RequestParam String microserviceId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        Range r = parseRange(from, to, 3650);
        return service.getMicroserviceFluctuation(microserviceId, r.from, r.to);
    }

    /** DevOps: manually snapshot the current config of a project. */
    @PostMapping("/snapshot")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public Map<String, Object> snapshot(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String actor = jwt != null ? jwt.getClaimAsString("name") : "devops";
        String projectId = body.get("projectId");
        String environment = body.get("environment");
        int written = service.snapshotProject(projectId, environment, actor);
        return Map.of("written", written);
    }

    private record Range(Instant from, Instant to) {}

    private Range parseRange(String from, String to, int defaultDays) {
        LocalDate today = LocalDate.now();
        Instant f = (from != null && !from.isBlank())
                ? parseInstant(from)
                : today.minusDays(defaultDays).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant t = (to != null && !to.isBlank())
                ? parseInstant(to)
                : today.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return new Range(f, t);
    }

    /** Accepts both full ISO-8601 instants ("2026-02-03T11:20:18.170Z") and date-only ("2026-02-03"). */
    private static Instant parseInstant(String s) {
        try {
            return Instant.parse(s);
        } catch (Exception e) {
            return LocalDate.parse(s).atStartOfDay().toInstant(ZoneOffset.UTC);
        }
    }
}
