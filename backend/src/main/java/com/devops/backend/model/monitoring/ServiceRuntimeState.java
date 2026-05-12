package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Real-time runtime state per cloud service cycle. A service is "running"
 * between manual start / stop events (or whenever the environment is up).
 * The scheduler multiplies elapsed seconds by the current hourly rate to
 * produce a live USD figure.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "service_runtime_states")
@CompoundIndex(name = "proj_env_svc", def = "{'projectId': 1, 'environment': 1, 'cloudServiceId': 1}", unique = true)
public class ServiceRuntimeState {

    @Id
    private String id;

    private String projectId;
    private String environment;
    private String cloudServiceId;
    private String cloudServiceName;
    private String meterId;

    private boolean running;

    /** Timestamp of current active cycle. Null when not running. */
    private Instant cycleStartedAt;
    private Instant lastTickAt;

    /** Latest USD/hour from Azure Retail API. */
    private Double hourlyRateUsd;

    /** Accumulated cost for current cycle. Resets when cycle stops. */
    private Double currentCycleUsd;

    /** Lifetime accumulated cost for this service on this project/env. */
    private Double lifetimeUsd;

    /** Completed cycle history — each entry is one start→stop run. */
    @Builder.Default
    private List<CycleEntry> cycleHistory = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CycleEntry {
        private Instant startedAt;
        private Instant endedAt;
        private long durationSeconds;
        private Double totalUsd;
        private Double hourlyRateUsd;
    }
}
