package com.devops.backend.model;

import com.devops.backend.model.workflow.RequestTypeWorkflowOverride;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "project_workflow_settings")
public class ProjectWorkflowSettings {

    @Id
    private String id;

    @Indexed(unique = true)
    private String projectId;

    private WorkflowConfiguration defaultConfiguration;

    /**
     * Per-environment workflow configurations. Key = environment name (e.g. "Dev", "QA", "Production").
     * Each environment can override the default workflow with its own approval chain, notifications, and infrastructure.
     */
    @Builder.Default
    private Map<String, WorkflowConfiguration> environmentConfigurations = new HashMap<>();

    @Builder.Default
    private List<RequestTypeWorkflowOverride> requestTypeOverrides = new ArrayList<>();

    private Instant updatedAt;
    private String updatedBy;
}
