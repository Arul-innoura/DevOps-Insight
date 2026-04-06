package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * Request DTO for DevOps to submit cost estimation for manager approval
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CostSubmissionRequest {
    
    @NotBlank(message = "Ticket ID is required")
    private String ticketId;
    
    @NotNull(message = "Estimated cost is required")
    @Positive(message = "Cost must be a positive number")
    private Double estimatedCost;
    
    @NotBlank(message = "Currency is required")
    private String currency;  // USD, INR, EUR, etc.
    
    private String notes;  // Optional notes about the cost breakdown
}
