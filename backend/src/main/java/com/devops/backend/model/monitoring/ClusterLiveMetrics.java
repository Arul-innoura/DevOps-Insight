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

/**
 * Point-in-time snapshot of all live metrics collected from a real AKS cluster.
 * Captured every 60 s by ClusterMetricsScheduler.
 *
 * Contains 50+ distinct metric fields across cluster, node-pool, node and
 * namespace scopes — all derived from the Kubernetes API + Metrics Server.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cluster_live_metrics")
@CompoundIndexes({
    @CompoundIndex(name = "env_time", def = "{'environmentId': 1, 'capturedAt': -1}")
})
public class ClusterLiveMetrics {

    @Id
    private String id;

    @Indexed
    private String environmentId;
    private String environmentName;

    private Instant capturedAt;

    /** False when metrics-server is not installed — usage fields will be 0. */
    private boolean metricsServerAvailable;

    // ── Cluster-level aggregates ──────────────────────────────────────────────

    private int totalNodes;
    private int readyNodes;
    private int notReadyNodes;

    private int totalNamespaces;
    private int totalPods;
    private int runningPods;
    private int pendingPods;
    private int failedPods;

    /** Sum of all node CPU capacity in millicores (e.g. 4 cores = 4000 m). */
    private long totalCpuCapacityMillicores;
    /** Sum of CPU allocatable to pods (excludes OS/system reservations). */
    private long totalCpuAllocatableMillicores;
    /** Actual CPU consumed right now (from metrics-server). */
    private long totalCpuUsageMillicores;
    private double clusterCpuUtilizationPct;

    private long totalMemoryCapacityBytes;
    private long totalMemoryAllocatableBytes;
    private long totalMemoryUsageBytes;
    private double clusterMemoryUtilizationPct;

    private long totalEphemeralStorageBytes;

    // ── Per-node-pool summaries ───────────────────────────────────────────────

    private List<NodePoolSummary> nodePools;

    // ── Per-node detail ───────────────────────────────────────────────────────

    private List<NodeMetric> nodes;

    // ── Per-namespace metrics ─────────────────────────────────────────────────

    private List<NamespaceMetric> namespaces;

    // ── Per-namespace cost breakdown (based on actual usage share) ────────────

    private List<NamespaceCostBreakdown> namespaceCosts;

    // =========================================================================
    // Nested types
    // =========================================================================

    /** Aggregated view of one AKS node pool. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodePoolSummary {
        private String poolName;
        private String vmSize;
        private int nodeCount;
        private boolean spotPool;

        private long totalCpuAllocatableMillicores;
        private long totalCpuUsageMillicores;
        private double cpuUtilizationPct;

        private long totalMemoryAllocatableBytes;
        private long totalMemoryUsageBytes;
        private double memoryUtilizationPct;

        private int totalPodCount;
    }

    /** Metrics for a single cluster node. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodeMetric {

        // ── Identity ──────────────────────────────────────────────────────────
        private String nodeName;
        /** AKS label: kubernetes.azure.com/agentpool */
        private String nodePoolName;
        /** AKS label: node.kubernetes.io/instance-type  (e.g. Standard_D4s_v3) */
        private String vmSize;
        /** AKS label: topology.kubernetes.io/zone */
        private String availabilityZone;
        /** AKS label: topology.kubernetes.io/region */
        private String region;

        // ── OS / runtime info ─────────────────────────────────────────────────
        private String osImage;
        private String kernelVersion;
        /** e.g. "containerd://1.7.13" */
        private String containerRuntime;

        // ── Status flags ──────────────────────────────────────────────────────
        private boolean ready;
        /** AKS label: kubernetes.azure.com/scalesetpriority = "spot" */
        private boolean spotNode;

        private Instant nodeCreatedAt;

        // ── CPU (millicores) ──────────────────────────────────────────────────
        private long cpuCapacityMillicores;
        private long cpuAllocatableMillicores;
        /** Actual usage from metrics-server */
        private long cpuUsageMillicores;
        private double cpuUsagePct;
        /** Sum of all pod CPU requests scheduled on this node */
        private long cpuRequestedByPodsMillicores;

        // ── Memory (bytes) ────────────────────────────────────────────────────
        private long memoryCapacityBytes;
        private long memoryAllocatableBytes;
        private long memoryUsageBytes;
        private double memoryUsagePct;
        /** Sum of all pod memory requests scheduled on this node */
        private long memoryRequestedByPodsBytes;

        // ── Pods / storage ────────────────────────────────────────────────────
        private int podCount;
        private int maxPods;
        private long ephemeralStorageBytes;

        // ── Conditions & taints ───────────────────────────────────────────────
        /** Active problem conditions, e.g. ["MemoryPressure", "DiskPressure"] */
        private List<String> activeConditions;
        /** Taint keys, e.g. ["node.kubernetes.io/not-ready:NoExecute"] */
        private List<String> taints;
    }

    /** Aggregated metrics for one Kubernetes namespace (maps to a project). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceMetric {
        private String namespace;

        private int totalPods;
        private int runningPods;
        private int pendingPods;
        private int failedPods;

        // ── CPU ───────────────────────────────────────────────────────────────
        /** Sum of all container CPU requests in namespace */
        private long cpuRequestMillicores;
        /** Sum of all container CPU limits */
        private long cpuLimitMillicores;
        /** Actual CPU consumption (from metrics-server) */
        private long cpuUsageMillicores;
        /** cpuUsageMillicores / cpuRequestMillicores × 100 */
        private double cpuUsagePct;

        // ── Memory ────────────────────────────────────────────────────────────
        private long memoryRequestBytes;
        private long memoryLimitBytes;
        private long memoryUsageBytes;
        private double memoryUsagePct;

        // ── Workload counts ───────────────────────────────────────────────────
        private int deploymentCount;
        private int serviceCount;
    }

    /**
     * Cost breakdown for one application namespace.
     *
     * <p>Node pool cost is allocated proportionally by CPU/memory usage share.
     * Shared services (Redis, RabbitMQ, etc.) configured in CloudEnvironment
     * are split equally across all application namespaces.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceCostBreakdown {
        private String namespace;

        /** This namespace's CPU as a % of total app-namespace CPU. */
        private double cpuSharePct;
        /** This namespace's memory as a % of total app-namespace memory. */
        private double memSharePct;
        /** max(cpuSharePct, memSharePct) — the share used for node cost. */
        private double costSharePct;

        /** Node pool cost portion for this namespace (hourly USD). */
        private double nodePoolCostHourlyUsd;
        /**
         * Shared-service cost portion (Redis, RabbitMQ, API-Mgmt, etc.),
         * split equally across all application namespaces.
         */
        private double sharedServicesCostHourlyUsd;
        private double totalHourlyUsd;
        private double totalMonthlyUsd;

        /**
         * True  = costs based on actual metrics-server usage.
         * False = costs based on configured CPU/memory requests (metrics-server unavailable).
         */
        private boolean usingActualMetrics;
    }
}
