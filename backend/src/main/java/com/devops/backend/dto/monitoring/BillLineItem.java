package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One line on a project's cloud-services bill — represents a catalog
 * service or external service after allocation has been applied.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BillLineItem {

    /** Source — "AZURE_CATALOG" or "EXTERNAL". */
    private String source;

    private String environmentId;
    private String environmentName;

    /** Category key (compute / aks / network / …) — null for external. */
    private String categoryKey;
    private String categoryDisplayName;

    private String serviceId;
    /** Catalog service name (or external service name). */
    private String serviceName;
    /** Project-side label override, when set. */
    private String customName;

    /** Allocation rule applied (SYSTEM_NODE, USER_NODE, …, EXTERNAL). */
    private String allocation;

    /** Project's count multiplier — e.g. 9 keyvaults. */
    private Integer count;

    /** Catalog item's per-unit hourly rate (USD). Null for external. */
    private Double catalogHourlyUsd;

    /** Catalog hourly × count — pre-allocation. */
    private Double subtotalHourlyUsd;

    /**
     * Fraction of {@code subtotalHourlyUsd} attributed to this project after
     * allocation rules are applied. Range [0, 1].
     */
    private Double shareFraction;

    /** Effective hourly cost for this project after share applied. */
    private Double effectiveHourlyUsd;

    /** Effective monthly cost — effective hourly × 730 (or external fixed monthly). */
    private Double effectiveMonthlyUsd;

    /** Month-to-date USD as of the snapshot moment. */
    private Double monthToDateUsd;

    /** Optional namespace (microservice) this line is attributed to, when applicable. */
    private String namespace;

    /** Free-form notes (project-side or admin-side). */
    private String notes;
}
