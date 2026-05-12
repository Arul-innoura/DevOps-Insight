package com.devops.backend.controller;

import com.devops.backend.dto.DependencyRequestResponse;
import com.devops.backend.dto.ProcessDependencyRequestDTO;
import com.devops.backend.dto.UserDependencyRequestDTO;
import com.devops.backend.model.DependencyRequestStatus;
import com.devops.backend.model.DependencyRequestType;
import com.devops.backend.model.DependencyType;
import com.devops.backend.service.DependencyRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller for dependency request management (DevOps & Admin).
 * Handles requests from Users to add or upgrade dependencies.
 */
@RestController
@RequestMapping("/api/dependency-requests")
@RequiredArgsConstructor
@Slf4j
public class DependencyRequestController {

    private final DependencyRequestService requestService;

    /**
     * Get all dependency requests.
     * Optionally filter by status and/or requestType.
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<DependencyRequestResponse>> getRequests(
            @RequestParam(required = false) DependencyRequestStatus status,
            @RequestParam(required = false) DependencyRequestType requestType) {

        List<DependencyRequestResponse> requests;

        if (status != null && requestType != null) {
            // Both filters provided — get all and filter manually since we don't have that combo method
            requests = requestService.getAllRequests().stream()
                    .filter(r -> r.getStatus() == status && r.getRequestType() == requestType)
                    .toList();
        } else if (status != null) {
            requests = requestService.getRequestsByStatus(status);
        } else if (requestType != null) {
            requests = requestService.getRequestsByType(requestType);
        } else {
            requests = requestService.getAllRequests();
        }

        return ResponseEntity.ok(requests);
    }

    /**
     * Search dependency requests by keyword.
     */
    @GetMapping("/search")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<DependencyRequestResponse>> searchRequests(@RequestParam String q) {
        return ResponseEntity.ok(requestService.searchRequests(q));
    }

    /**
     * Accept a dependency request.
     */
    @PutMapping("/{id}/accept")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<DependencyRequestResponse> acceptRequest(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        return ResponseEntity.ok(requestService.acceptRequest(id, userName, userEmail));
    }

    /**
     * Reject a dependency request.
     */
    @PutMapping("/{id}/reject")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<DependencyRequestResponse> rejectRequest(
            @PathVariable String id,
            @RequestBody ProcessDependencyRequestDTO dto,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        return ResponseEntity.ok(requestService.rejectRequest(id, dto, userName, userEmail));
    }

    /**
     * Create a dependency request from user action (Add Request / Update Version buttons).
     * Available to all authenticated users.
     */
    @PostMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<?> createUserRequest(
            @Valid @RequestBody UserDependencyRequestDTO dto,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        log.info("User {} creating {} request for {} v{}", userName, dto.getRequestType(), dto.getDependencyName(), dto.getVersion());

        try {
            DependencyRequestType requestType = DependencyRequestType.valueOf(dto.getRequestType());
            DependencyType depType = dto.getType();

            var created = requestService.createRequest(
                    dto.getDependencyName(), dto.getGroupId(), dto.getArtifactId(),
                    dto.getVersion(), depType, requestType,
                    dto.getVulnerabilitySeverity(), dto.getExistingVersion(),
                    userName, userEmail);

            if (created == null) {
                return ResponseEntity.ok(Map.of(
                        "message", "A request for this dependency and version already exists.",
                        "alreadyExists", true
                ));
            }

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", "Request created successfully.",
                    "requestId", created.getId(),
                    "alreadyExists", false
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid request type: " + dto.getRequestType()));
        }
    }
    private String extractUserName(Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) name = jwt.getClaimAsString("preferred_username");
        if (name == null || name.isEmpty()) name = jwt.getClaimAsString("given_name");
        return name != null ? name : "Unknown User";
    }

    private String extractUserEmail(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isEmpty()) email = jwt.getClaimAsString("preferred_username");
        if (email == null || email.isEmpty()) email = jwt.getClaimAsString("upn");
        return email != null ? email : "unknown@unknown.com";
    }
}
