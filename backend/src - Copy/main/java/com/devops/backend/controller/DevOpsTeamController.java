package com.devops.backend.controller;

import com.devops.backend.dto.AvailabilityUpdateRequest;
import com.devops.backend.dto.DevOpsMemberRequest;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.service.DevOpsTeamService;
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
@RequestMapping("/api/devops-team")
@RequiredArgsConstructor
public class DevOpsTeamController {

    private final DevOpsTeamService devOpsTeamService;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<DevOpsMember>> getMembers() {
        return ResponseEntity.ok(devOpsTeamService.getAllMembers());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<DevOpsMember> addMember(@Valid @RequestBody DevOpsMemberRequest request,
                                                   @AuthenticationPrincipal Jwt jwt) {
        DevOpsMember created = devOpsTeamService.addMember(request, extractUserName(jwt), extractUserEmail(jwt));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/upsert")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<DevOpsMember> upsertMember(@Valid @RequestBody DevOpsMemberRequest request,
                                                      @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(devOpsTeamService.upsertMember(request, extractUserName(jwt), extractUserEmail(jwt)));
    }

    @PutMapping("/{email}/availability")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<DevOpsMember> updateAvailability(@PathVariable String email,
                                                            @Valid @RequestBody AvailabilityUpdateRequest request,
                                                            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(devOpsTeamService.updateAvailability(email, request, extractUserName(jwt), extractUserEmail(jwt)));
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
