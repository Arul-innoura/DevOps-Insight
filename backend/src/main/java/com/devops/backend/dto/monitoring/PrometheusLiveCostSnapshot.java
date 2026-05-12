package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * One-shot snapshot returned to the live cost UI. Contains everything the
 * panel needs to render — namespaces with cumulative + live rates, drilldown
 * to microservices, and the discovered cloud services this env is using.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrometheusLiveCostSnapshot {

    private String env;
    private Instant capturedAt;
    private boolean prometheusReachable;

    /** Total live $/hr for everything in this env (instantaneous, may flicker). */
    private Double totalHourlyUsd;
    /** Smoothed $/hr — EMA of recent ticks. Use this for display so values don't jitter. */
    private Double smoothedHourlyUsd;
    /** Daily / monthly figures derived from {@code smoothedHourlyUsd}. */
    private Double dailyEstUsd;
    private Double monthlyEstUsd;
    /** Cost accrued so far in the current calendar month. */
    private Double monthToDateUsd;
    /** Lifetime cost since the engine first observed this env. */
    private Double cumulativeUsd;

    /** Cluster-wide totals discovered from Prom. */
    private ClusterTotals cluster;

    private List<NamespaceCost> namespaces;
    private List<CloudServiceCost> cloudServices;

    /** Per-node detail (SKU, hourly $, allocation breakdown). */
    private List<NodeDetail> nodes;

    /** Idle / unallocated node cost — what you're paying that nothing has claimed. */
    private Double idleHourlyUsd;
    private Double idleMonthlyEstUsd;
    private Double idleMonthToDateUsd;

    /**
     * Pricing & topology diagnostics — surface what was discovered, what was
     * matched, and what fell back so silent zeros never happen again.
     */
    private Diagnostics diagnostics;

    /**
     * Fixed / inventory view — categorised list of every provisioned piece of
     * infrastructure with its per-day price. Independent of workload
     * allocation — it's what Azure will bill you regardless of pod activity.
     * Drives the "Fixed cost" toggle in the UI.
     */
    private InventoryView inventory;

    /**
     * Product cost view — only present when the env has namespaces whose names
     * start with the env key (e.g., "qa-frontend", "qa-api" in env "qa").
     * Supportive namespace overhead (kube-system, monitoring…) is redistributed
     * proportionally so the sum of all product totals equals the full cluster bill.
     */
    private List<ProductCost> products;

    /**
     * Auto-verification: accounting invariant checks computed every tick.
     * Every check has an expected value, actual value, and pass/fail flag.
     * allPass=true means the cost engine is internally consistent.
     */
    private CostReconciliation reconciliation;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductCost {
        /** Normalised product name (e.g. "FRONTEND" from "qa-frontend"). */
        private String namespace;
        /** Human-readable project name from DB, or same as namespace if unmatched. */
        private String projectName;
        /** All Kubernetes namespaces that belong to this product group. */
        private List<String> namespaceNames;
        /** Total pods across all namespaces in this group. */
        private int podCount;
        /** Pods in Running phase. 0 means product is fully DOWN. */
        private int runningPodCount;
        /** true when at least one pod is running. */
        private boolean running;
        /** "UP" or "DOWN" */
        private String status;
        /** This product's share of the total cluster bill (0-100). */
        private Double percentOfTotal;
        /** Direct compute cost (CPU + memory dimensions combined). */
        private Double computeHourlyUsd;
        private Double storageHourlyUsd;
        private Double networkHourlyUsd;
        /** System pool + registry + egress share already inside this namespace's bill. */
        private Double infraShareHourlyUsd;
        /** Redistributed share of supportive namespace costs (kube-system, monitoring, etc.). */
        private Double supportShareHourlyUsd;
        private Double totalHourlyUsd;
        private Double dailyUsd;
        private Double monthlyUsd;
        private Double monthToDateUsd;
        private List<ProductCostLine> lines;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductCostLine {
        private String category;
        private String label;
        private Double hourlyUsd;
        private Double dailyUsd;
        private Double monthlyUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InventoryView {
        private List<InventoryGroup> groups;
        private Double totalDailyUsd;
        private Double totalMonthlyUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InventoryGroup {
        /** Compute · Storage · Network · Registry · Database · Other. */
        private String category;
        private String label;
        private List<InventoryLine> items;
        private Double subtotalDailyUsd;
        private Double subtotalMonthlyUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InventoryLine {
        private String name;
        private String sku;
        private Integer count;
        private String unit;
        private Double unitDailyUsd;
        private Double dailyUsd;
        private Double monthlyUsd;
        private String detail;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClusterTotals {
        private Integer nodeCount;
        private Double totalCpuCores;
        private Double totalMemoryGb;
        private Double usedCpuCores;
        private Double usedMemoryGb;
        private Double cpuUtilPct;
        private Double memoryUtilPct;
        private Double nodeHourlyUsd;
        private Map<String, Double> vmSkuToHourly;
        /**
         * Full bill broken down into named components — every line item that
         * contributes to {@link PrometheusLiveCostSnapshot#totalHourlyUsd}.
         * {@code percentOfTotal} sums to 100% so the UI can render a stacked bar.
         */
        private List<ComponentLine> componentBreakdown;
        /** User-pool wastage (idle / unrequested capacity) as % of user pool. */
        private Double userPoolWastagePct;
        private Double userPoolWastageUsd;
        private Double userPoolAllocatedUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ComponentLine {
        /** system | user-allocated | user-wastage | storage | network | registry | egress */
        private String category;
        private String label;
        private Double hourlyUsd;
        private Double dailyUsd;
        private Double monthlyUsd;
        private Double percentOfTotal;
        private String detail;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodeNamespaceShare {
        private String namespace;
        private Double cpuRequestCores;
        private Double memoryRequestGb;
        private Double sharePct;
        private Double hourlyUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceCost {
        private String namespace;
        private String matchedProjectId;
        private String matchedProjectName;
        private Double cpuCores;
        private Double memoryGb;
        private Double cpuRequestCores;
        private Double memoryRequestGb;
        private Integer podCount;
        private Integer microserviceCount;
        private Double hourlyRateUsd;
        /** Smoothed (EMA) hourly rate used for stable display. */
        private Double smoothedHourlyUsd;
        /** Compute portion of hourly rate (CPU dimension). */
        private Double computeHourlyUsd;
        /** Memory portion of hourly rate. */
        private Double memoryHourlyUsd;
        /** Storage portion of hourly rate (PVCs in this namespace). */
        private Double storageHourlyUsd;
        /** Network portion of hourly rate (LoadBalancers in this namespace). */
        private Double networkHourlyUsd;
        /** Daily / monthly rolling cost based on the smoothed hourly rate. */
        private Double dailyEstUsd;
        private Double monthlyEstUsd;
        private Double monthToDateUsd;
        private Double cumulativeUsd;
        private Long uptimeSeconds;
        /** Average share of cluster capacity claimed by this namespace (0-1). */
        private Double allocationShare;
        /** This namespace's % of the entire cluster bill (0-100). */
        private Double percentOfClusterTotal;
        /** Per-PVC storage detail for this namespace. */
        private List<NamespaceStorage> storage;
        /**
         * Itemised cost breakdown by service category — what this namespace
         * spends on each cloud service (compute, memory, storage, network,
         * registry, etc.). Drives the per-namespace expandable detail view.
         */
        private List<NamespaceServiceLine> serviceLines;
        private List<MicroserviceCost> microservices;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceServiceLine {
        /** Compute · Memory · Storage · Network · Registry · Database · Other. */
        private String category;
        private String name;
        private Double quantity;
        private String unit;
        private Double hourlyUsd;
        private Double dailyUsd;
        private Double monthlyUsd;
        private String detail;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NamespaceStorage {
        private String pvcName;
        private String storageClass;
        private Double sizeGb;
        private Double monthlyUsd;
        private Double hourlyUsd;
        private String azureSkuName;
        private String azureMeterId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MicroserviceCost {
        private String name;
        private String namespace;
        private Integer replicas;
        private Double cpuCores;
        private Double memoryGb;
        private Double cpuRequestCores;
        private Double memoryRequestGb;
        private Double hourlyRateUsd;
        private Double smoothedHourlyUsd;
        private Double computeHourlyUsd;
        private Double memoryHourlyUsd;
        private Double dailyEstUsd;
        private Double monthlyEstUsd;
        private Double monthToDateUsd;
        private Double cumulativeUsd;
        private Long uptimeSeconds;
        private Integer restarts;
        private String image;
        /** Average share of node capacity claimed (0-1). */
        private Double allocationShare;
        /** HPA min/max/current replicas if an HPA targets this workload. */
        private Integer hpaMinReplicas;
        private Integer hpaMaxReplicas;
        private Integer hpaCurrentReplicas;
        /** Node this workload runs on (or "N nodes" when replicas span multiple nodes). */
        private String nodeName;
        /** VM size of the primary node (e.g. "Standard_D8s_v3"). */
        private String nodeVmSize;
        /** True when any replica is running on a Spot node. */
        private Boolean nodeIsSpot;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodeDetail {
        private String name;
        private String vmSize;
        private String region;
        private String agentPool;
        private String role;
        private String zone;
        private Double cpuCores;
        private Double memoryGb;
        private Double cpuUsedCores;
        private Double memoryUsedGb;
        private Double cpuRequestedCores;
        private Double memoryRequestedGb;
        private Double cpuRequestedPct;
        private Double memoryRequestedPct;
        private Double hourlyUsd;
        private Double cpuPerCoreHourlyUsd;
        private Double memoryPerGbHourlyUsd;
        private String azureMeterId;
        private String azureSkuName;
        private String azureProductName;
        /** {@code exact} | {@code fuzzy-cores-mem} | {@code none} */
        private String pricingMatch;
        private String osDiskTierSku;       // P10, E10, Ephemeral, etc.
        private Integer osDiskSizeGb;
        private Double osDiskHourlyUsd;
        private Double osDiskMonthlyUsd;
        /** Which namespaces are using this node, with each one's share of node cost. */
        private List<NodeNamespaceShare> namespaceShares;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Diagnostics {
        private Integer nodesTotal;
        private Integer nodesWithVmSize;
        private Integer nodesPriced;
        /** Distinct VM SKUs we tried to price. */
        private List<String> vmSkusObserved;
        /** SKUs that did NOT find a live Azure price (UI shows them in red). */
        private List<String> vmSkusUnmatched;
        /** SKUs whose price came from a fuzzy core+RAM match instead of exact SKU. */
        private List<String> vmSkusFuzzyMatched;
        private Integer podsTotal;
        private Integer podsWithRequests;
        private Integer pvcsTotal;
        private Integer acrHostsObserved;
        private Integer loadBalancersObserved;
        private String allocationModel;
        private List<String> warnings;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CloudServiceCost {
        private String key;
        private String name;
        private String category;
        private String azureMeterId;
        private String azureSkuName;
        private Double azureUnitPriceUsd;
        private String unitOfMeasure;
        private Double quantity;
        private Double hourlyRateUsd;
        private Double monthlyEstUsd;
        private Double monthToDateUsd;
        private Double cumulativeUsd;
        /** Free-form lookup hints discovered from Prom (image registry, PVC class, ingress count, …). */
        private Map<String, String> evidence;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReconciliationCheck {
        private String name;
        private String description;
        /** Expected value ($/hr) */
        private double expected;
        /** Actual computed value ($/hr) */
        private double actual;
        /** actual - expected; 0.0 is perfect */
        private double delta;
        /** true when |delta| < $0.001/hr (sub-tenth-of-a-cent tolerance) */
        private boolean pass;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CostReconciliation {
        private List<ReconciliationCheck> checks;
        private boolean allPass;
        private int passCount;
        private int totalChecks;
        /** Human-readable summary */
        private String summary;
    }
}
