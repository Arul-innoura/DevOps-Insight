package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Point-in-time cost record per (project, environment, cloud service).
 * Produced by {@link com.devops.backend.scheduler.CostAccumulationScheduler}
 * every tick while a service is running. Forms the real-time cost timeline
 * (e.g. "ingress 12.0 USD → 12.1 USD → 12.2 USD").
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cost_snapshots")
@CompoundIndexes({
        @CompoundIndex(name = "proj_env_time", def = "{'projectId': 1, 'environment': 1, 'capturedAt': -1}"),
        @CompoundIndex(name = "service_time", def = "{'cloudServiceId': 1, 'capturedAt': -1}")
})
public class CostSnapshot {

    @Id
    private String id;

    private String projectId;
    private String environment;

    /** Id from {@link com.devops.backend.model.workflow.CloudServiceItem}. */
    private String cloudServiceId;
    private String cloudServiceName;
    private String cloudCategory;

    /** Azure meterId driving this price. */
    private String meterId;

    /** Current hourly unit price in USD (looked up from Azure API). */
    private Double hourlyRateUsd;

    /** Accumulated cost since the service started running in this cycle. */
    private Double accumulatedUsd;

    /** Share of cost for this project if the service is shared. 1.0 = full cost. */
    private Double shareFraction;

    /** When the current running cycle began. */
    private Instant cycleStartedAt;
    private Instant capturedAt;
}
