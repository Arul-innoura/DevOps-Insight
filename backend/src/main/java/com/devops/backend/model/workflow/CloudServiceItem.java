package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a cloud infrastructure service (AWS / Azure / GCP) used by a project.
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 * Admin-only — not exposed to end users.
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
}
