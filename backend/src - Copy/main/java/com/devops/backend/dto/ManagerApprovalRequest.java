package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;

/**
 * Request DTO for manager approval action
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManagerApprovalRequest {
    
    @NotBlank(message = "Token is required")
    private String token;
    
    @NotBlank(message = "Action is required (approve/reject)")
    private String action;  // "approve" or "reject"
    
    private String note;
}
