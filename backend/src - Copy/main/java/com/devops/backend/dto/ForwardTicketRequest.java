package com.devops.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for forwarding a ticket to another DevOps engineer
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ForwardTicketRequest {
    
    @NotBlank(message = "New assignee name is required")
    private String newAssigneeName;
    
    @NotBlank(message = "New assignee email is required")
    @Email(message = "Invalid email format")
    private String newAssigneeEmail;
    
    private String notes; // Optional forwarding note
}
