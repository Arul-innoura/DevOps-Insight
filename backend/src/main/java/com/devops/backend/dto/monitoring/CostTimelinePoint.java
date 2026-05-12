package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CostTimelinePoint {
    private Instant capturedAt;
    private String cloudServiceId;
    private String cloudServiceName;
    private Double hourlyRateUsd;
    private Double accumulatedUsd;
}
