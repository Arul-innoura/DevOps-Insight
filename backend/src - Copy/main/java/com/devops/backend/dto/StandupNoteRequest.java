package com.devops.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StandupNoteRequest {

    @NotBlank(message = "Standup date is required")
    private String date;

    private String summary;
    private Map<String, String> updates;
}
