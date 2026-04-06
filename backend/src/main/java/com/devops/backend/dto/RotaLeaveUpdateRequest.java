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
public class RotaLeaveUpdateRequest {

    @NotBlank(message = "Date is required")
    private String date;

    @NotBlank(message = "Email is required")
    private String email;

    private boolean leave;
}
