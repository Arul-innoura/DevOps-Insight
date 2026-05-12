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
 * Persistent cumulative cost record for one live "thing" being priced from
 * Prometheus metrics. The "thing" is identified by {@code (env, scope, scopeKey, dimension)}:
 *
 * <ul>
 *   <li>scope = {@code namespace} → cost accrued for an entire k8s namespace</li>
 *   <li>scope = {@code microservice} → cost accrued for a single pod / deployment within a namespace</li>
 *   <li>scope = {@code cloud-service} → cost accrued for a discovered Azure service (ACR, Key Vault, LB…)</li>
 * </ul>
 *
 * <p>The {@code cumulativeUsd} grows monotonically — it never resets on
 * pod restart, redeploy, or backend restart. Each tick of the cost engine
 * adds {@code lastRateUsd × elapsedHours} since {@code lastTickAt}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "prometheus_cost_accumulators")
@CompoundIndexes({
        @CompoundIndex(name = "uniq_env_scope_key_dim", def = "{ 'env': 1, 'scope': 1, 'scopeKey': 1, 'dimension': 1 }", unique = true),
        @CompoundIndex(name = "by_env_scope", def = "{ 'env': 1, 'scope': 1 }")
})
public class PrometheusCostAccumulator {

    @Id
    private String id;

    /** Lower-cased env key — matches keys in app.prometheus.endpoints. */
    private String env;

    /** namespace | microservice | cloud-service */
    private String scope;

    /** For namespace: namespace name. Microservice: "{namespace}/{deployment}". Cloud-service: a stable id. */
    private String scopeKey;

    /** Free-form sub-dimension (e.g. "compute", "storage", "registry"). May be blank. */
    private String dimension;

    /** For UI grouping. */
    private String namespace;
    private String microservice;
    private String cloudService;

    /** Optional Azure pricing context. */
    private String azureMeterId;
    private String azureSkuName;
    private Double azureUnitPriceUsd;
    private String azureUnitOfMeasure;

    /** Last-seen instantaneous rate in USD per hour. */
    private Double lastRateUsd;

    /**
     * Smoothed rate using exponential moving average — what the UI shows so
     * values don't jitter every 30 s. Updated as
     * {@code α × current + (1-α) × previousSmoothed}. We use α = 0.3 which
     * gives a half-life around 4-5 ticks (~2 min at 30 s cadence).
     */
    private Double smoothedRateUsd;

    /** Last-seen resource snapshot (CPU cores / memory GB / replicas) for the UI. */
    private Double cpuCores;
    private Double memoryGb;
    private Integer replicas;

    /** Cumulative running total — never resets. */
    private Double cumulativeUsd;

    /** Cost accumulated since the start of the current calendar month. */
    private Double monthToDateUsd;
    private String monthKey; // yyyy-MM, used to roll over MTD

    /** First time this accumulator was created. */
    private Instant createdAt;

    /** Most recent tick — used to compute {@code now - lastTickAt} for incremental cost. */
    private Instant lastTickAt;

    /** Cumulative observed uptime seconds (only counts when the resource was running). */
    private Long uptimeSeconds;
}
