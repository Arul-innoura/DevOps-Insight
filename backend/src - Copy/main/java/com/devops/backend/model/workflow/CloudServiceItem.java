package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Represents a cloud infrastructure service (AWS / Azure / GCP) used by a project.
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 * Admin-only — not exposed to end users.
 *
 * <p>Azure-specific fields (meterId / skuName / region) let the backend
 * re-fetch live pricing from the public Azure Retail Pricing API on a
 * schedule and feed real-time cost tracking.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CloudServiceItem {

    /** Client-generated unique identifier (used for frontend keying). */
    private String id;

    /** Cloud platform: AWS, Azure, or GCP. */
    private String cloudPlatform;

    /** Catalog service name from picker, e.g. "Azure Kubernetes Service (AKS)" — not edited by admin. */
    private String name;

    /**
     * Optional label the admin assigns to this row (e.g. "Prod EU cluster", "Shared Redis").
     * Distinct from {@link #name} which stays the catalog name.
     */
    private String customName;

    /** Service category, e.g. Compute, Database, Networking. */
    private String category;

    /** Price / cost estimate (amount or description, e.g. "150 / month"). */
    private String price;

    /** Single ISO 4217 currency code for {@link #price} (e.g. USD, EUR, INR). */
    private String currency;

    /** Rich-text HTML notes authored by admin. */
    private String notes;

    // ---------- Azure Retail Pricing API integration ----------

    /** Azure meterId (stable identifier for a SKU/region price). Mandatory for Azure. */
    private String azureMeterId;
    private String azureSkuName;
    private String azureProductName;
    private String azureServiceName;
    private String azureServiceFamily;
    private String azureArmRegionName;

    /** Unit of measure returned by Azure ("1 Hour", "1 GB/Month", "1 Month", etc.). */
    private String azureUnitOfMeasure;

    /** Latest retail price from Azure Retail API (always USD for this integration). */
    private Double azureRetailPriceUsd;

    /** Derived hourly rate in USD (retailPrice normalized to per-hour). */
    private Double hourlyRateUsd;

    /** 730h × hourly rate, for display only. */
    private Double monthlyRateUsd;

    /** When {@link #azureRetailPriceUsd} was last refreshed from the Azure API. */
    private Instant lastPriceFetchedAt;

    // ---------- Shared-resource distribution ----------

    /** True if this service is shared across multiple projects (e.g. Container Registry). */
    private Boolean sharedAcrossProjects;

    /** Project ids sharing this resource — cost is split proportionally. */
    @Builder.Default
    private List<String> sharedProjectIds = new ArrayList<>();

    // ---------- Real-time cost bookkeeping (populated by scheduler) ----------

    /** Moment the current running cycle started. Null when stopped. */
    private Instant runningSince;

    /** Accumulated cost for current cycle (resets on stop). */
    private Double currentCycleUsd;

    /** Lifetime accumulated USD for this service on this project. */
    private Double lifetimeUsd;
}
