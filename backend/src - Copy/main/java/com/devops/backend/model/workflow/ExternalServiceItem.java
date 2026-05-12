package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Project-exclusive external service that lives outside the Azure catalog —
 * e.g. MongoDB Atlas, third-party SaaS, on-prem hosted services. Cost is
 * entered manually per month and attributed wholly to the owning project.
 *
 * <p>Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExternalServiceItem {

    private String id;

    /** Display name, e.g. "MongoDB Atlas (Prod)". */
    private String name;

    /** Vendor / provider, e.g. "MongoDB Atlas", "Datadog", "Snowflake". */
    private String vendor;

    /** Manually entered monthly cost in USD (always project-exclusive). */
    private Double monthlyCostUsd;

    /** Optional currency override; defaults to USD. */
    private String currency;

    /** Free-form notes. */
    private String notes;

    /** Optional environment this external service belongs to. Blank → all. */
    private String environment;
}
