package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents an internal project service / microservice (e.g. Auth Service, Payment API).
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 * Admin-only — not exposed to end users.
 *
 * <p>The optional {@code environment} / {@code clusterName} fields let
 * Resource Monitoring place microservices under the correct cluster.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectServiceItem {

    /** Client-generated unique identifier (used for frontend keying). */
    private String id;

    private String serviceName;

    /** CPU range, e.g. "0.5 – 2 cores". */
    private String cpu;

    /** RAM range, e.g. "512 MB – 4 GB". */
    private String ram;

    /** Rich-text HTML notes authored by admin. */
    private String notes;

    // ---------- Resource monitoring extensions (optional) ----------

    /** Environment this microservice runs in (e.g. "QA"). Blank → applies to all. */
    private String environment;

    /** Cluster this microservice belongs to (e.g. "qa-aks-eastus"). Defaults to "default". */
    private String clusterName;

    /** Parsed current CPU cores used for monitoring (falls back to parsing {@link #cpu}). */
    private Double cpuCores;

    /** Parsed current memory MB used for monitoring (falls back to parsing {@link #ram}). */
    private Double memoryMb;

    // ---------- Capacity-based cost attribution ----------

    /**
     * Number of replicas (pods) for this microservice. Combined with CPU/memory
     * requests to compute the project's share of node-pool capacity.
     * Defaults to 1 when absent.
     */
    private Integer replicas;

    /** Lower bound for HPA — used by capacity planning. */
    private Integer minReplicas;

    /** Upper bound for HPA — used by capacity planning. */
    private Integer maxReplicas;

    /** Per-replica CPU request in millicores (e.g. 500 = 0.5 cores). Optional. */
    private Double cpuRequestMillicores;

    /** Per-replica memory request in MB. Optional. */
    private Double memoryRequestMb;

    /**
     * Kubernetes namespace this microservice runs in (e.g. "payments-qa").
     * Drives per-namespace cost attribution in the redesigned cost engine.
     * When blank, the engine falls back to the {@link #environment} value.
     */
    private String namespace;
}
