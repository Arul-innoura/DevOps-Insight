package com.devops.backend.dto;

import com.devops.backend.model.DevOpsAvailabilityStatus;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AvailabilityUpdateRequest {

    @NotNull(message = "Availability is required")
    private DevOpsAvailabilityStatus availability;
}
