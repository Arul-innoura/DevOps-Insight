package com.devops.backend.controller;

import com.devops.backend.dto.ManagerRequest;
import com.devops.backend.model.Manager;
import com.devops.backend.service.ManagerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/managers")
@RequiredArgsConstructor
public class ManagerController {

    private final ManagerService managerService;

    @GetMapping
    public ResponseEntity<List<Manager>> getManagers(
            @RequestParam(required = false, defaultValue = "false") boolean activeOnly) {
        log.info("Fetching managers, activeOnly: {}", activeOnly);
        List<Manager> managers = activeOnly 
                ? managerService.getActiveManagers() 
                : managerService.getAllManagers();
        return ResponseEntity.ok(managers);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Manager> getManagerById(@PathVariable String id) {
        return managerService.getManagerById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Manager> createManager(
            @Valid @RequestBody ManagerRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String createdBy = jwt.getClaim("preferred_username");
        Manager manager = managerService.createManager(request, createdBy);
        return ResponseEntity.ok(manager);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Manager> updateManager(
            @PathVariable String id,
            @Valid @RequestBody ManagerRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String updatedBy = jwt.getClaim("preferred_username");
        Manager manager = managerService.updateManager(id, request, updatedBy);
        return ResponseEntity.ok(manager);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Void> deleteManager(@PathVariable String id) {
        managerService.deleteManager(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Void> toggleManagerStatus(
            @PathVariable String id,
            @RequestParam boolean active,
            @AuthenticationPrincipal Jwt jwt) {
        String updatedBy = jwt.getClaim("preferred_username");
        managerService.toggleManagerStatus(id, active, updatedBy);
        return ResponseEntity.noContent().build();
    }
}
