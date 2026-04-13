package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Denormalized person/email from stored project workflows (any product), for UI autocomplete.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowDirectoryContactDto {
    private String email;
    private String name;
    /** Designation / role when known (approval levels, managers). */
    private String role;
}
