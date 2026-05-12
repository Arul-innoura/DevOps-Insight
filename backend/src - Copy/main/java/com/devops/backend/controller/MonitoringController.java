package com.devops.backend.controller;

import com.devops.backend.dto.monitoring.CycleRecord;
import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;
import com.devops.backend.dto.monitoring.ManualControlRequest;
import com.devops.backend.dto.monitoring.UptimeSession;
import com.devops.backend.service.AnalyticsSettingsService;
import com.devops.backend.service.MonitoringService;
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
@RequestMapping("/api/monitoring")
@RequiredArgsConstructor
public class MonitoringController {
    private final MonitoringService monitoringService;
    private final AnalyticsSettingsService analyticsSettingsService;

    @GetMapping("/products")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<String> getProducts() {
        return monitoringService.getProductNames();
    }

    @GetMapping("/environment")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public EnvironmentMonitoringResponse getEnvironmentMonitoring(
            @RequestParam String productName,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month
    ) {
        LocalDate now = LocalDate.now();
        int y = year != null ? year : now.getYear();
        int m = month != null ? month : now.getMonthValue();
        return monitoringService.getEnvironmentMonitoring(productName, y, m);
    }

    /** Returns raw uptime intervals for a date range — used by the interactive uptime chart. */
    @GetMapping("/uptime-sessions")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<UptimeSession> getUptimeSessions(
            @RequestParam String productName,
            @RequestParam String from,
            @RequestParam String to
    ) {
        Instant fromInstant = LocalDate.parse(from).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant   = LocalDate.parse(to).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return monitoringService.getUptimeSessions(productName, fromInstant, toInstant);
    }

    /** DevOps: full cycle history (manual start/stop records) for a product. */
    @GetMapping("/cycle-history")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
    public List<CycleRecord> getCycleHistory(
            @RequestParam(required = false, defaultValue = "") String productName,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        LocalDate now = LocalDate.now();
        Instant fromInstant = (from != null && !from.isBlank())
                ? LocalDate.parse(from).atStartOfDay().toInstant(ZoneOffset.UTC)
                : now.minusDays(30).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = (to != null && !to.isBlank())
                ? LocalDate.parse(to).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)
                : now.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return monitoringService.getCycleHistory(productName, fromInstant, toInstant);
    }

    /** DevOps manual control: mark env as running, stopped, or back to auto (ticket-based). */
    @PostMapping("/manual-control")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
    public Map<String, Boolean> setManualControl(
            @RequestBody ManualControlRequest req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String actor = jwt != null ? jwt.getClaimAsString("name") : "devops";
        analyticsSettingsService.setManualControl(
                req.getProductName(), req.getEnvironment(), req.getAction(), actor);
        return Map.of("ok", true);
    }
}
