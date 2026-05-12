package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Cluster-level infrastructure for an environment of a project:
 * control plane, node pools, ingress, and any platform-level resources.
 * Stored per-environment in {@link com.devops.backend.model.ProjectWorkflowSettings}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClusterInfrastructure {

    /** Human-readable cluster name — "qa-aks-eastus". */
    private String clusterName;

    /** Cloud region (arm region name) — "eastus". */
    private String region;

    /** Control plane SKU ("1 Free", "1 Paid"). */
    private String controlPlaneSku;

    @Builder.Default
    private List<NodePool> nodePools = new ArrayList<>();

    /** Ingress controller VM size / count. */
    private String ingressSku;
    private Integer ingressCount;

    /** Notes authored by admin (rich text). */
    private String notes;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodePool {
        /** "system" | "user" | "spot". */
        private String kind;
        private String poolName;
        /** Azure VM size: "Standard_D4s_v3". */
        private String vmSize;
        private Integer nodeCount;
        /** Azure meterId for this VM size/region (filled by admin via Azure SKU picker). */
        private String azureMeterId;
        private Double hourlyRateUsd;
    }
}
