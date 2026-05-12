package com.devops.backend.model.environment;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Managed Azure environment (cloud cluster setup) — the top level of the
 * Environment → Project → Microservice hierarchy.
 *
 * <p>Admin creates these separately; project configuration then selects one.
 * Cost is computed from VM sizes on the node pools and the cluster-level
 * shared infrastructure configured here.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cloud_environments")
public class CloudEnvironment {

    @Id
    private String id;

    /** Unique human-readable name, e.g. "prod-eastus", "dev-westus2". */
    @Indexed(unique = true)
    private String name;

    /** Optional descriptive label shown in UI, e.g. "Production East US". */
    private String displayName;

    /**
     * Cloud provider — "AZURE" (default), "AWS", or "GCP".
     * Drives the provider tab grouping in the admin "Cloud Services" UI.
     * Only AZURE is fully populated today; AWS/GCP appear as empty placeholders.
     */
    private String provider;

    /**
     * When true, this record holds cross-environment "Shared" services
     * (mostly AI services) that are common to every dev/qa/stage/etc.
     * environment of the same provider. Sits as a sibling tab to the
     * regular environments under the provider.
     */
    private Boolean sharedScope;

    /** Azure ARM region, e.g. "eastus", "westus2". */
    private String azureRegion;

    /** Optional free-form description. */
    private String description;

    // ---------- New structured category catalog ----------
    // Compute / AI / Storage / Security / AKS / Network / etc.
    // Source of truth for the redesigned admin UI; legacy fields below
    // remain populated for backward-compat with cost cycles & schedulers.

    /**
     * Structured service catalog grouped by category. Each category groups
     * a set of services (Virtual Machine, Key Vault, AKS, …). Service
     * uniqueness is enforced per (environment, category) at the service layer.
     */
    @Builder.Default
    private List<CategoryGroup> categoryGroups = new ArrayList<>();

    // ---------- Node pools (Azure VM-backed) ----------

    @Builder.Default
    private NodePoolConfig systemNodePool = new NodePoolConfig();

    @Builder.Default
    private NodePoolConfig userNodePool = new NodePoolConfig();

    /**
     * Any additional node pools beyond the standard system/user pair — e.g. a second
     * user pool with a larger VM, a Windows pool, or a spot/preemptible pool.
     */
    @Builder.Default
    private List<NodePoolConfig> additionalNodePools = new ArrayList<>();

    // ---------- Shared environment infrastructure ----------

    /** Ingress controller (VM size + count). */
    @Builder.Default
    private InfraResource ingress = new InfraResource();

    /** Load balancer SKU / tier (e.g. "Standard"). */
    @Builder.Default
    private InfraResource loadBalancer = new InfraResource();

    /**
     * Azure Container Registry. {@link InfraResource#scope} controls whether
     * this ACR is exclusive to this environment ("env") or shared globally ("global").
     */
    @Builder.Default
    private InfraResource containerRegistry = new InfraResource();

    /** DNS domain / zone associated with the environment. */
    @Builder.Default
    private InfraResource domain = new InfraResource();

    /** Azure Key Vault. */
    @Builder.Default
    private InfraResource keyVault = new InfraResource();

    /** Azure Storage account. */
    @Builder.Default
    private InfraResource storage = new InfraResource();

    // ---------- Environment-level shared services (Redis, queues, API gateways, …) ----------

    /**
     * Services shared by every project running in this environment — cost
     * is split equally across projects attached to this environment.
     */
    @Builder.Default
    private List<SharedEnvService> sharedServices = new ArrayList<>();

    // ---------- Bookkeeping ----------

    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;

    // ==================================================================
    // Nested config types
    // ==================================================================

    /** Azure VM-backed node pool. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodePoolConfig {
        /** "system", "user", "spot", "windows", or any custom label. */
        private String kind;
        /** Display name, e.g. "user-lg" or "spot-pool". */
        private String poolName;
        /** Azure VM size, e.g. "Standard_D4s_v3". */
        private String vmSize;
        /** Advertised vCPU / RAM, used in capacity math. */
        private Double vCpuPerNode;
        private Double memoryGbPerNode;
        /** Number of nodes. */
        private Integer nodeCount;
        /** Azure meterId (from AzurePricingService). */
        private String azureMeterId;
        private String azureSkuName;
        /** Latest cached hourly rate (per single node). */
        private Double hourlyRateUsd;
    }

    /** A named piece of environment-level infra. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InfraResource {
        /** Friendly label, e.g. "prod-ingress". */
        private String name;
        /** Azure SKU / tier, e.g. "Standard_B2ms" or "Premium". */
        private String sku;
        /** Azure meterId (optional — lets us price it live). */
        private String azureMeterId;
        /** Cached hourly rate (populated by pricing scheduler). */
        private Double hourlyRateUsd;
        /** "env" (per-environment) or "global" (one for all environments). Applies to container registry. */
        private String scope;
        /** Count (e.g. ingress replicas). Defaults to 1. */
        private Integer count;
    }

    /**
     * A shared service used by all projects inside this environment.
     * Examples: Redis cache, RabbitMQ, API Management, Cosmos DB.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SharedEnvService {
        private String id;
        private String name;
        private String category;
        private String azureMeterId;
        private String azureSkuName;
        private Double hourlyRateUsd;
        private Double monthlyRateUsd;
        /** "env" (default) or "global". */
        private String scope;
        private String notes;
    }

    // ==================================================================
    // New category catalog (compute, ai, storage, security, aks, network, …)
    // ==================================================================

    /** A category bucket inside an environment (e.g. "compute", "network", "aks"). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryGroup {
        /** Lowercase key: compute | ai | storage | security | aks | network | database | external | other. */
        private String key;
        /** Display label, e.g. "Compute", "AI / ML". */
        private String displayName;
        /** Optional ordering hint for UI. */
        private Integer order;
        @Builder.Default
        private List<CategoryServiceItem> services = new ArrayList<>();
    }

    /**
     * A single service entry inside a category (Virtual Machine, Key Vault, …).
     * For most categories this is a flat row driven by an Azure meterId. For
     * the AKS category the entry is composite — its {@link #aksNodes} carries
     * system / user / spot node pools plus the control-plane line item.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryServiceItem {
        private String id;
        /** Catalog name, e.g. "Virtual Machine", "Key Vault", "AKS Cluster". */
        private String name;
        /** Optional friendly label. */
        private String displayName;

        // ---- Azure pricing fields ----
        private String azureMeterId;
        private String azureSkuName;
        private String azureProductName;
        private String azureServiceName;
        private String azureServiceFamily;
        private String azureArmRegionName;
        private String azureUnitOfMeasure;
        private Double azureRetailPriceUsd;
        private Double hourlyRateUsd;
        private Double monthlyRateUsd;
        private Instant lastPriceFetchedAt;

        // ---- Compute spec (for VM-like services) ----
        private Double vCpuPerNode;
        private Double memoryGbPerNode;

        /** Multiplier applied to the per-unit price. Defaults to 1. */
        private Integer count;

        /** Free-form admin notes. */
        private String notes;

        /**
         * Cost-allocation rule used by the cost engine to split this
         * service's bill across projects in the environment:
         *
         * <ul>
         *   <li>{@code SYSTEM_NODE} — split equally across all projects in env</li>
         *   <li>{@code USER_NODE} / {@code SPOT_NODE} — split by replicas × (cpu+memory) of project microservices</li>
         *   <li>{@code NETWORK} / {@code SECURITY} — split equally across projects in env</li>
         *   <li>{@code AI_SHARED} — split equally across all projects in all envs that opt in</li>
         *   <li>{@code EXTERNAL} — project-exclusive (e.g. MongoDB Atlas)</li>
         *   <li>{@code GENERAL} — default, equal split</li>
         * </ul>
         */
        private String allocation;

        /**
         * AKS composite — system/user/spot node pools + control-plane.
         * Populated only when {@link #name} represents an AKS cluster.
         */
        @Builder.Default
        private List<AksNodeSpec> aksNodes = new ArrayList<>();
    }

    /** One node-pool inside an AKS composite service (or the control-plane line). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AksNodeSpec {
        /** "system" | "user" | "spot" | "control-plane". */
        private String role;
        private String poolName;
        private String azureMeterId;
        private String azureSkuName;
        private String azureProductName;
        private String azureUnitOfMeasure;
        private Double azureRetailPriceUsd;
        private Double hourlyRateUsd;
        private Double monthlyRateUsd;
        private Double vCpuPerNode;
        private Double memoryGbPerNode;
        private Integer nodeCount;
        private Instant lastPriceFetchedAt;
    }
}
