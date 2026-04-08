package com.devops.backend.controller;

import com.devops.backend.model.ActivityLog;
import com.devops.backend.service.ActivityLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/activity-logs")
@RequiredArgsConstructor
@Slf4j
public class ActivityLogController {

    private final ActivityLogService activityLogService;

    /**
     * Returns the 200 most-recent activity log entries.
     * Admin-only.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<List<ActivityLog>> getRecentLogs() {
        log.debug("Fetching recent activity logs");
        return ResponseEntity.ok(activityLogService.getRecentLogs(200));
    }

    /**
     * Returns activity logs for a specific ticket.
     * Accessible to DevOps and Admin roles.
     */
    @GetMapping("/ticket/{ticketId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin', 'APPROLE_DevOps')")
    public ResponseEntity<List<ActivityLog>> getTicketLogs(@PathVariable String ticketId) {
        log.debug("Fetching activity logs for ticket: {}", ticketId);
        return ResponseEntity.ok(activityLogService.getLogsByTicket(ticketId));
    }
}
