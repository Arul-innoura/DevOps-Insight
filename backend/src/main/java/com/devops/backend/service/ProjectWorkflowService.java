package com.devops.backend.service;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.WorkflowConfiguration;

public interface ProjectWorkflowService {

    ProjectWorkflowSettings getOrCreate(String projectId, String actorName);

    ProjectWorkflowSettings save(ProjectWorkflowSettings settings, String actorName);

    WorkflowConfiguration resolveEffective(String projectId, RequestType requestType);
}
