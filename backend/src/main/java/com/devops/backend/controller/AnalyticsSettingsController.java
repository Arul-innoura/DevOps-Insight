package com.devops.backend.controller;

import com.devops.backend.model.analytics.AnalyticsSettings;
import com.devops.backend.service.AnalyticsSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics-settings")
@RequiredArgsConstructor
public class AnalyticsSettingsController {

    private final AnalyticsSettingsService analyticsSettingsService;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<AnalyticsSettings> get() {
        return ResponseEntity.ok(analyticsSettingsService.getOrDefault());
    }

    @PutMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<AnalyticsSettings> put(
            @RequestBody AnalyticsSettings body,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(analyticsSettingsService.save(body, extractName(jwt)));
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
