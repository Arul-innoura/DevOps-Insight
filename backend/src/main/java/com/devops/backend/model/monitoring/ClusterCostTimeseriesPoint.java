package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Time-series point persisted at the end of every Prometheus cost tick.
 *
 * <p>Each document captures the cluster-wide cost rates plus the per-namespace
 * cost lines so that historical comparison charts (cost over time per project,
 * per namespace, per env) can reconstruct the bill at any past moment without
 * re-running the cost engine.
 *
 * <p>The collection is intentionally append-only — UI date/month/year filters
 * aggregate via {@code $group} in Mongo. Compound indexes on
 * {@code (env, capturedAt)} keep range queries fast even at millions of rows.
 *
 * <p>{@code capturedAt} is {@link Indexed} with TTL = 90 days so the
 * collection doesn't grow without bound. Long-range views (year, range)
 * pre-aggregate into hourly buckets via the API before TTL evicts.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cluster_cost_timeseries")
@CompoundIndexes({
        @CompoundIndex(name = "by_env_time", def = "{ 'env': 1, 'capturedAt': -1 }"),
})
public class ClusterCostTimeseriesPoint {

    @Id
    private String id;

    /** Lower-cased env key — matches keys in app.prometheus.endpoints. */
    private String env;

    /** TTL: 90 days so the collection self-trims. */
    @Indexed(expireAfter = "90d")
    private Instant capturedAt;

    /** Cluster-wide totals (live $/hr at this tick). */
    private Double totalHourlyUsd;
    private Double smoothedHourlyUsd;
    private Double monthToDateUsd;
    private Double cumulativeUsd;

    /** Cluster-level resource numbers. */
    private Double totalCpuCores;
    private Double usedCpuCores;
    private Double totalMemoryGb;
    private Double usedMemoryGb;

    /** Per-namespace cost line at this tick. Compact — only what charts need. */
    private List<NamespaceLine> namespaces;

    /** Per-component cost split (system/user/storage/network/registry/egress). */
    private Map<String, Double> componentHourlyUsd;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceLine {
        private String namespace;
        /** Project name resolved from Project repo (when one matched). */
        private String matchedProjectName;
        private Double hourlyUsd;
        private Double smoothedHourlyUsd;
        /** CPU/memory used vs requested (allocated). */
        private Double cpuUsedCores;
        private Double cpuRequestCores;
        private Double memoryUsedGb;
        private Double memoryRequestGb;
        private Integer podCount;
        /** Per-component cost breakdown for stacked charts. */
        private Double computeHourlyUsd;
        private Double memoryHourlyUsd;
        private Double storageHourlyUsd;
        private Double networkHourlyUsd;
    }
}
