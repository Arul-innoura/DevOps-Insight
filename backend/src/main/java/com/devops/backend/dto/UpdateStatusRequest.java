package com.devops.backend.dto;

import com.devops.backend.model.TicketStatus;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for updating ticket status.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateStatusRequest {
    
    @NotNull(message = "New status is required")
    private TicketStatus newStatus;
    
    private String notes;

    /**
     * When moving to MANAGER_APPROVAL_PENDING, the approver who should receive the email (must match UI selection).
     */
    private String approvalTargetEmail;
}
