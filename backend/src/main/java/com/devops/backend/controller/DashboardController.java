package com.devops.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class DashboardController {

    @GetMapping("/admin/dashboard")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Map<String, String>> getAdminData() {
        return ResponseEntity.ok(Map.of("message", "Welcome to the Admin Dashboard", "role", "Admin"));
    }

    @GetMapping("/devops/dashboard")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
    public ResponseEntity<Map<String, String>> getDevOpsData() {
        return ResponseEntity.ok(Map.of("message", "Welcome to the DevOps Dashboard", "role", "DevOps"));
    }

    @GetMapping("/user/dashboard")
    @PreAuthorize("hasAuthority('APPROLE_User')")
    public ResponseEntity<Map<String, String>> getUserData() {
        return ResponseEntity.ok(Map.of("message", "Welcome to the User Dashboard", "role", "User"));
    }

    @GetMapping("/public/status")
    public ResponseEntity<Map<String, String>> getPublicStatus() {
        return ResponseEntity.ok(Map.of("status", "System is up and running"));
    }
}
