package com.devops.backend.controller;

import com.devops.backend.dto.CreateDependencyRequest;
import com.devops.backend.dto.DependencyResponse;
import com.devops.backend.model.DependencyType;
import com.devops.backend.service.DependencyService;
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
 * REST Controller for dependency management (DevOps & Admin).
 * Manages the database of dependencies available in the local Nexus repository.
 */
@RestController
@RequestMapping("/api/dependencies")
@RequiredArgsConstructor
@Slf4j
public class DependencyController {

    private final DependencyService dependencyService;

    /**
     * Get all dependencies in the local repository.
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<DependencyResponse>> getAllDependencies() {
        return ResponseEntity.ok(dependencyService.getAllDependencies());
    }

    /**
     * Search dependencies by keyword.
     */
    @GetMapping("/search")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<DependencyResponse>> searchDependencies(@RequestParam String q) {
        return ResponseEntity.ok(dependencyService.searchDependencies(q));
    }

    /**
     * Get dependencies filtered by type.
     */
    @GetMapping("/type/{type}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<DependencyResponse>> getDependenciesByType(@PathVariable DependencyType type) {
        return ResponseEntity.ok(dependencyService.getDependenciesByType(type));
    }

    /**
     * Add a new dependency to the database.
     */
    @PostMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<DependencyResponse> addDependency(
            @Valid @RequestBody CreateDependencyRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        DependencyResponse response = dependencyService.addDependency(request, userName, userEmail);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Delete a dependency from the database.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<Map<String, String>> deleteDependency(@PathVariable String id) {
        dependencyService.deleteDependency(id);
        return ResponseEntity.ok(Map.of("message", "Dependency deleted successfully", "id", id));
    }

    /**
     * Check if a dependency exists in the local Nexus repository.
     * Used by the user search flow to show "Available in Nexus Repo" label.
     */
    @GetMapping("/check")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<Map<String, Object>> checkDependency(
            @RequestParam String name,
            @RequestParam(required = false) String version) {
        return ResponseEntity.ok(dependencyService.checkDependency(name, version));
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
