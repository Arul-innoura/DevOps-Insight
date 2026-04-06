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
import java.util.List;

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

    @Builder.Default
    private List<RequestTypeWorkflowOverride> requestTypeOverrides = new ArrayList<>();

    private Instant updatedAt;
    private String updatedBy;
}
