package com.devops.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for assigning a ticket to a team member.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignTicketRequest {
    
    @NotBlank(message = "Assignee name is required")
    private String assigneeName;
    
    private String assigneeEmail;
}
