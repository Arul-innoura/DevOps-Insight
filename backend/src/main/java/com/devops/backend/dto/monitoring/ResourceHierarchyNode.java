package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * A single node in the Environment → Cluster → Project → Microservice tree.
 * The same shape is reused at every level (recursive) to keep the frontend
 * rendering simple.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResourceHierarchyNode {

    /** ENVIRONMENT | CLUSTER | PROJECT | MICROSERVICE */
    private String level;

    /** Stable id — for PROJECT this is the projectId, otherwise a composite key. */
    private String id;

    /** Display name (e.g. "QA", "qa-aks-eastus", "Payments", "AuthService"). */
    private String name;

    /** Aggregated CPU cores allocated at this node. */
    private Double cpuCores;

    /** Aggregated memory MB allocated at this node. */
    private Double memoryMb;

    /** Running cost per hour in USD at this node (cloud services only). */
    private Double hourlyRateUsd;

    /** Projected monthly USD (730h × hourly). */
    private Double projectedMonthlyUsd;

    /** For microservices: detailed config shown on hover. */
    private ResourceDetail detail;

    @Builder.Default
    private List<ResourceHierarchyNode> children = new ArrayList<>();
}
