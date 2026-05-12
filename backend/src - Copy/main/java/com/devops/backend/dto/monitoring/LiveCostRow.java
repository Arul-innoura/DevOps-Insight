package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import com.devops.backend.model.monitoring.ServiceRuntimeState;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LiveCostRow {
    private String projectId;
    private String projectName;
    private String environment;
    private String cloudServiceId;
    private String cloudServiceName;
    private String cloudCategory;
    private String cloudPlatform;
    private String meterId;
    private String unitOfMeasure;
    private String azureSkuName;
    private String azureProductName;
    private String azureArmRegionName;
    private Double azureRetailPriceUsd;
    private Double monthlyRateUsd;

    private boolean running;
    private boolean shared;
    private Double shareFraction;

    private Double hourlyRateUsd;
    private Double currentCycleUsd;
    private Double lifetimeUsd;

    private Instant cycleStartedAt;
    private Instant lastTickAt;

    /** Completed start→stop cycles for this service (most recent last). */
    private List<ServiceRuntimeState.CycleEntry> cycleHistory;
}
