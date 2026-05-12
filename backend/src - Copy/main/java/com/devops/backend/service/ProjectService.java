package com.devops.backend.service;

import com.devops.backend.dto.ProjectRequest;
import com.devops.backend.model.Project;

import java.util.List;

public interface ProjectService {
    List<Project> getProjects();
    Project addProject(ProjectRequest request, String actorName);

    /**
     * Replace deployment environment names for a product (used from admin workflow UI).
     */
    Project updateProjectEnvironments(String projectId, java.util.List<String> environments, String actorName);
}
