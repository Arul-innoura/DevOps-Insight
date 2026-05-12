package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectCostBreakdown {
    private String projectId;
    private String projectName;
    private String environment;

    private Double hourlyTotalUsd;
    private Double projectedMonthlyUsd;
    private Double currentCycleTotalUsd;
    private Double lifetimeTotalUsd;
    private Instant capturedAt;

    private List<LiveCostRow> services;
}
