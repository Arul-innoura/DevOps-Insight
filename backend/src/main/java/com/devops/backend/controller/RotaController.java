package com.devops.backend.controller;

import com.devops.backend.dto.RotaLeaveUpdateRequest;
import com.devops.backend.dto.RotaManualAssignmentRequest;
import com.devops.backend.dto.RotaScheduleDayResponse;
import com.devops.backend.model.RotaState;
import com.devops.backend.service.RotaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rota")
@RequiredArgsConstructor
public class RotaController {

    private final RotaService rotaService;

    @GetMapping("/state")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<RotaState> getState() {
        return ResponseEntity.ok(rotaService.getRotaState());
    }

    @PutMapping("/leave")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<RotaState> setLeave(@Valid @RequestBody RotaLeaveUpdateRequest request,
                                              @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(rotaService.setLeaveForDate(request, extractUserName(jwt)));
    }

    @PutMapping("/manual")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<RotaState> setManualAssignment(@Valid @RequestBody RotaManualAssignmentRequest request,
                                                          @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(rotaService.setManualAssignment(request, extractUserName(jwt)));
    }

    @GetMapping("/schedule")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps','APPROLE_Admin')")
    public ResponseEntity<List<RotaScheduleDayResponse>> getSchedule(@RequestParam(defaultValue = "14") int days,
                                                                      @RequestParam(required = false) String startDate) {
        return ResponseEntity.ok(rotaService.getRotaSchedule(days, startDate));
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
