package com.devops.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RotaManualAssignmentRequest {

    @NotBlank(message = "Date is required")
    private String date;

    private List<String> emails;
}
