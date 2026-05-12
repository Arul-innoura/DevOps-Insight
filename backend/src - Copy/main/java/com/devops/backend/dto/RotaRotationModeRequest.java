package com.devops.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RotaRotationModeRequest {

    @NotBlank(message = "rotationMode is required")
    private String rotationMode;
}
