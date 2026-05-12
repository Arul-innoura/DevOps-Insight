package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowApprover {
    /** Optional role/level label like Lead, Manager, Director. */
    private String role;
    private String name;
    private String email;
}
