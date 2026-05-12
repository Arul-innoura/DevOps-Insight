package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Full workflow replacement when the ticket's request type matches {@link #requestType}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RequestTypeWorkflowOverride {
    /** {@link com.devops.backend.model.RequestType} name, e.g. NEW_ENVIRONMENT */
    private String requestType;
    private WorkflowConfiguration configuration;
}
