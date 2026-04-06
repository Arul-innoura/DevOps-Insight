package com.devops.backend.controller;

import com.devops.backend.model.UserNotificationPreferences;
import com.devops.backend.repository.UserNotificationPreferencesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/notification-preferences/me")
@RequiredArgsConstructor
public class UserNotificationPreferencesController {

    private final UserNotificationPreferencesRepository repository;

    @GetMapping
    public ResponseEntity<UserNotificationPreferences> getMine(@AuthenticationPrincipal Jwt jwt) {
        String email = extractEmail(jwt);
        return ResponseEntity.ok(repository.findByUserEmailIgnoreCase(email)
                .orElseGet(() -> defaults(email)));
    }

    @PutMapping
    public ResponseEntity<UserNotificationPreferences> saveMine(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody UserNotificationPreferences body) {
        String email = extractEmail(jwt);
        UserNotificationPreferences existing = repository.findByUserEmailIgnoreCase(email).orElse(null);
        if (existing != null) {
            body.setId(existing.getId());
        }
        body.setUserEmail(email);
        body.setUpdatedAt(Instant.now());
        return ResponseEntity.ok(repository.save(body));
    }

    private static String extractEmail(Jwt jwt) {
        if (jwt == null) {
            return "unknown@local";
        }
        String email = jwt.getClaimAsString("preferred_username");
        if (email == null || email.isBlank()) {
            email = jwt.getClaimAsString("email");
        }
        return email != null ? email.toLowerCase() : "unknown@local";
    }

    private static UserNotificationPreferences defaults(String email) {
        return UserNotificationPreferences.builder()
                .userEmail(email)
                .ticketStatusChanges(true)
                .approvalRequests(true)
                .approvalCompleted(true)
                .costApprovalUpdates(true)
                .commentsAndUpdates(true)
                .updatedAt(Instant.now())
                .build();
    }
}
