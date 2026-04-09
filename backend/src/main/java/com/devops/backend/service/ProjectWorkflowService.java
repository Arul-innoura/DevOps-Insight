package com.devops.backend.service;

import com.devops.backend.model.Environment;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.InfrastructureConfig;
import com.devops.backend.model.workflow.WorkflowConfiguration;

public interface ProjectWorkflowService {

    ProjectWorkflowSettings getOrCreate(String projectId, String actorName);

    ProjectWorkflowSettings save(ProjectWorkflowSettings settings, String actorName);

    WorkflowConfiguration resolveEffective(String projectId, RequestType requestType);

    /**
     * Overlay environment-specific workflow infrastructure (e.g. monthly cost for QA) onto a base snapshot.
     */
    InfrastructureConfig mergeInfrastructureForEnvironment(
            String projectId, Environment environment, InfrastructureConfig snapshotInfrastructure);
}
