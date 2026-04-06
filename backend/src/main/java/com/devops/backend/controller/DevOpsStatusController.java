package com.devops.backend.controller;

import com.devops.backend.model.DevOpsMember;
import com.devops.backend.model.StatusChangeLog;
import com.devops.backend.service.DevOpsTeamService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/devops-status")
@RequiredArgsConstructor
public class DevOpsStatusController {

    private final DevOpsTeamService devOpsTeamService;

    /**
     * Heartbeat endpoint — called every 60s by the frontend to prove liveness.
     * Also used by sendBeacon on tab close to mark the user offline.
     */
    @PostMapping("/heartbeat")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<?> heartbeat(@AuthenticationPrincipal Jwt jwt,
                                        @RequestBody(required = false) Map<String, String> body) {
        String email = extractUserEmail(jwt);
        String action = body != null ? body.getOrDefault("action", "heartbeat") : "heartbeat";

        if ("going_offline".equals(action)) {
            // Session closed — mark as offline immediately
            var request = new com.devops.backend.dto.AvailabilityUpdateRequest();
            request.setAvailability(com.devops.backend.model.DevOpsAvailabilityStatus.OFFLINE);
            devOpsTeamService.updateAvailability(email, request, "SYSTEM", email);
            return ResponseEntity.ok(Map.of("status", "offline", "email", email));
        }

        DevOpsMember member = devOpsTeamService.heartbeat(email);
        if (member == null) {
            return ResponseEntity.ok(Map.of("status", "unknown", "email", email));
        }
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "email", email,
                "availability", member.getAvailability().name(),
                "lastHeartbeat", member.getLastHeartbeat().toString()
        ));
    }

    /**
     * Get status timeline for all members on a given date.
     * Used by Admin dashboard for the Jira-style day-wise timeline.
     */
    @GetMapping("/timeline")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public ResponseEntity<List<StatusChangeLog>> getTimeline(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false, defaultValue = "0") Integer tzOffsetMinutes) {
        ZoneOffset offset = ZoneOffset.ofTotalSeconds(-tzOffsetMinutes * 60);
        Instant startOfDay = date.atStartOfDay(offset).toInstant();
        Instant endOfDay = date.plusDays(1).atStartOfDay(offset).toInstant();
        return ResponseEntity.ok(devOpsTeamService.getStatusTimeline(startOfDay, endOfDay));
    }

    /**
     * Get status timeline for a specific member within a date range.
     */
    @GetMapping("/timeline/{email}")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public ResponseEntity<List<StatusChangeLog>> getMemberTimeline(
            @PathVariable String email,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false, defaultValue = "0") Integer tzOffsetMinutes) {
        ZoneOffset offset = ZoneOffset.ofTotalSeconds(-tzOffsetMinutes * 60);
        Instant startInstant = from.atStartOfDay(offset).toInstant();
        Instant endInstant = to.plusDays(1).atStartOfDay(offset).toInstant();
        return ResponseEntity.ok(devOpsTeamService.getMemberTimeline(email, startInstant, endInstant));
    }

    private String extractUserEmail(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("preferred_username");
        }
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("upn");
        }
        return email != null ? email.toLowerCase() : "unknown@unknown.com";
    }
}
