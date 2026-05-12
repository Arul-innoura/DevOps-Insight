package com.devops.backend.dto.azure;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Slim row returned by the Azure catalog auto-suggest endpoint
 * ({@code GET /api/azure-pricing/catalog/suggest}). Designed for live admin
 * autocomplete: the UI displays a few fields per row and, on selection,
 * the full payload is copied onto a {@code CategoryServiceItem} or node-pool
 * config — no manual SKU typing.
 *
 * <p>All money fields are USD per the Retail Pricing API contract.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AzureCatalogSuggestion {

    /** Stable Azure meter id (key for re-pricing). */
    private String meterId;

    /** Marketing-friendly SKU name, e.g. {@code "D4 v3"}. */
    private String skuName;

    /** ARM SKU name, e.g. {@code "Standard_D4_v3"}. Empty for non-VM rows. */
    private String armSkuName;

    /** Full product name, e.g. {@code "Virtual Machines DSv3 Series"}. */
    private String productName;

    /** Top-level Azure service, e.g. {@code "Virtual Machines"}. */
    private String serviceName;

    /** Azure service family, e.g. {@code "Compute"}, {@code "Networking"}. */
    private String serviceFamily;

    /** ARM region the price applies to, e.g. {@code "eastus"}. */
    private String armRegionName;

    /** Per-unit retail price (USD). */
    private Double retailPrice;

    /** {@code "1 Hour"}, {@code "1 GB/Month"}, …. */
    private String unitOfMeasure;

    private String currencyCode;

    /** {@code "Consumption"} | {@code "Reservation"} | {@code "Spot"}. */
    private String type;

    // ----- Derived (computed server-side from armSkuName / unitOfMeasure) -----

    /** Parsed vCPU count for VM-like SKUs ({@code 0} when not applicable). */
    private Integer vCpuPerNode;

    /** Estimated RAM (GB) for VM-like SKUs ({@code 0} when not applicable). */
    private Integer memoryGbPerNode;

    /** Retail price normalised to a per-hour rate when the unit is time-based. */
    private Double hourlyRateUsd;

    /** Estimated monthly cost (USD) — hourly × 730, or per-month unit as-is. */
    private Double monthlyEstUsd;

    /** App-side category bucket the row was matched against (compute / aks / …). */
    private String category;
}
