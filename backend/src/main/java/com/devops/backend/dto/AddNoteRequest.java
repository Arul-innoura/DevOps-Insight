package com.devops.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * DTO for adding a note to a ticket.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddNoteRequest {
    
    @NotBlank(message = "Note content is required")
    private String notes;

    /** Optional attachment URLs/base64 blobs for this note entry. */
    private List<String> attachments;
}
