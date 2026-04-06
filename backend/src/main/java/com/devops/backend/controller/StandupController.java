package com.devops.backend.controller;

import com.devops.backend.dto.StandupNoteRequest;
import com.devops.backend.model.StandupNote;
import com.devops.backend.service.StandupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/standups")
@RequiredArgsConstructor
public class StandupController {

    private final StandupService standupService;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<StandupNote>> getStandups(@RequestParam(required = false) String date) {
        return ResponseEntity.ok(standupService.getStandupNotes(date));
    }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<StandupNote> addStandup(@Valid @RequestBody StandupNoteRequest request,
                                                   @AuthenticationPrincipal Jwt jwt) {
        StandupNote created = standupService.addStandupNote(request, extractUserName(jwt), extractUserEmail(jwt));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    private String extractUserName(Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("preferred_username");
        }
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("given_name");
        }
        return name != null ? name : "Unknown User";
    }

    private String extractUserEmail(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("preferred_username");
        }
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("upn");
        }
        return email != null ? email : "unknown@unknown.com";
    }
}
