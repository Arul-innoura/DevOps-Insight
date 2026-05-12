package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Capacity-based cost breakdown for a single managed environment.
 * Computed by {@code NodeCapacityCostService} from:
 *   - environment node pools (VM size × count × Azure hourly rate)
 *   - per-project CPU + memory requests (replicas × requested CPU/MEM)
 *   - environment-level shared services & infra (split across attached projects)
 *
 * <p>Replaces the legacy per-service "shared" split with a single capacity-based
 * formula: each project pays the fraction of node capacity it reserves, plus
 * an equal share of shared infra.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnvironmentCapacityBreakdown {

    private String environmentId;
    private String environmentName;
    private String azureRegion;

    /** Totals for the environment. */
    private Double nodePoolHourlyUsd;
    private Double sharedInfraHourlyUsd;
    private Double sharedServicesHourlyUsd;
    private Double totalHourlyUsd;
    private Double projectedMonthlyUsd;

    /** Aggregate node capacity (vCPU, GB). */
    private Double totalVCpu;
    private Double totalMemoryGb;
    /** Capacity requested by every project in this env (used to compute unallocated %). */
    private Double requestedVCpu;
    private Double requestedMemoryGb;
    private Double utilizationPct;

    @Builder.Default
    private List<ProjectCapacityRow> projects = new ArrayList<>();

    @Builder.Default
    private List<SavingsSuggestion> suggestions = new ArrayList<>();

    private Instant capturedAt;

    /** One attached project's share of this environment. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProjectCapacityRow {
        private String projectId;
        private String projectName;
        private String namespace;
        private String subdomain;

        /** Sum of (replicas × cpu/mem request) across all microservices attached to this env. */
        private Double requestedVCpu;
        private Double requestedMemoryGb;

        /** Fraction of cluster capacity (0..1) — max of cpu share, mem share. */
        private Double capacityShare;

        /** Hourly cost from node pools, attributed via capacityShare. */
        private Double nodeCostHourlyUsd;
        /** Hourly cost share of env-shared infra (split equally across attached projects). */
        private Double sharedInfraHourlyUsd;
        /** Hourly cost share of env-shared services (split equally across attached projects). */
        private Double sharedServicesHourlyUsd;

        private Double totalHourlyUsd;
        private Double projectedMonthlyUsd;

        /**
         * True when no microservice had explicit CPU/memory requests configured —
         * cost was computed using a minimum-default fallback (100 mCPU / 128 MB per replica).
         * Admin should configure actual request values for accurate pricing.
         */
        private Boolean usingDefaultRequests;

        @Builder.Default
        private List<MicroserviceCostRow> microservices = new ArrayList<>();
    }

    /** Per-microservice attribution inside a project (equal split by replicas × cpu+mem). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MicroserviceCostRow {
        private String id;
        private String name;
        private Integer replicas;
        private Double cpuRequestMillicores;
        private Double memoryRequestMb;
        /** Share of the project's cost this microservice accounts for (0..1). */
        private Double projectShare;
        private Double hourlyUsd;
    }

    /** Actionable over-provisioning hint. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SavingsSuggestion {
        private String severity;      // "info" | "warn"
        private String scope;         // "environment" | "project"
        private String target;        // project name or env name
        private String message;
        private Double potentialMonthlyUsd;
    }
}
