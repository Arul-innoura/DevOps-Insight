package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A project's opt-in usage of a service from the Cloud Services catalog
 * (i.e. a {@code CategoryServiceItem} on a {@code CloudEnvironment}).
 *
 * <p>The redesigned project config surfaces every catalog service as a
 * toggle. Toggling on creates a {@code ProjectServiceUsage} that captures
 * the project-specific count/custom name/notes; cost is computed by the
 * cost engine from the source catalog item's hourly rate × count, split
 * according to the catalog item's allocation rule.
 *
 * <p>Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectServiceUsage {

    private String id;

    /** {@code CloudEnvironment.id} this usage references. */
    private String environmentId;

    /** {@code CloudEnvironment.name} (denormalised for display). */
    private String environmentName;

    /** Category key on the env, e.g. {@code "compute"}, {@code "aks"}. */
    private String categoryKey;

    /** Catalog {@code CategoryServiceItem.id}. */
    private String serviceId;

    /** Catalog service display name (denormalised — kept in sync on read). */
    private String serviceName;

    /** Optional project-side label, e.g. "primary keyvault". */
    private String customName;

    /**
     * Project's count of this service (e.g. 9 keyvaults across 10 microservices).
     * Multiplied with the catalog hourly rate. Defaults to 1.
     */
    private Integer count;

    /** Project notes on why/where this service is used. */
    private String notes;

    /** Toggle. False = service is configured but not currently in use. */
    private Boolean enabled;
}
