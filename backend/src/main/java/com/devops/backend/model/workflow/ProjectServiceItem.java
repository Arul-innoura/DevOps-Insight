package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents an internal project service (e.g. Auth Service, Payment API).
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 * Admin-only — not exposed to end users.
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
}
