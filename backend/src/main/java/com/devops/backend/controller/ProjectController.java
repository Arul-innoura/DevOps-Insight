package com.devops.backend.controller;

import com.devops.backend.dto.ProjectRequest;
import com.devops.backend.model.Project;
import com.devops.backend.service.ProjectService;
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
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<Project>> getProjects() {
        return ResponseEntity.ok(projectService.getProjects());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Project> addProject(@Valid @RequestBody ProjectRequest request,
                                              @AuthenticationPrincipal Jwt jwt) {
        String actor = extractUserName(jwt);
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.addProject(request, actor));
    }

    private String extractUserName(Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("preferred_username");
        }
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("given_name");
        }
        return name != null ? name : "Admin";
    }
}
