package com.devops.backend.service.impl;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.RequestTypeWorkflowOverride;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.ProjectWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;

@Service
@RequiredArgsConstructor
public class ProjectWorkflowServiceImpl implements ProjectWorkflowService {

    private final ProjectWorkflowSettingsRepository repository;

    @Override
    public ProjectWorkflowSettings getOrCreate(String projectId, String actorName) {
        return repository.findByProjectId(projectId).orElseGet(() -> {
            ProjectWorkflowSettings created = ProjectWorkflowSettings.builder()
                    .projectId(projectId)
                    .defaultConfiguration(WorkflowConfiguration.emptyDefaults())
                    .requestTypeOverrides(new ArrayList<>())
                    .updatedAt(Instant.now())
                    .updatedBy(actorName)
                    .build();
            return repository.save(created);
        });
    }

    @Override
    public ProjectWorkflowSettings save(ProjectWorkflowSettings settings, String actorName) {
        settings.setUpdatedAt(Instant.now());
        settings.setUpdatedBy(actorName);
        if (settings.getDefaultConfiguration() == null) {
            settings.setDefaultConfiguration(WorkflowConfiguration.emptyDefaults());
        }
        if (settings.getRequestTypeOverrides() == null) {
            settings.setRequestTypeOverrides(new ArrayList<>());
        }
        return repository.save(settings);
    }

    @Override
    public WorkflowConfiguration resolveEffective(String projectId, RequestType requestType) {
        ProjectWorkflowSettings settings = repository.findByProjectId(projectId).orElse(null);
        if (settings == null) {
            return WorkflowConfiguration.emptyDefaults();
        }
        if (settings.getRequestTypeOverrides() != null && requestType != null) {
            for (RequestTypeWorkflowOverride o : settings.getRequestTypeOverrides()) {
                if (o.getRequestType() != null
                        && o.getRequestType().equalsIgnoreCase(requestType.name())
                        && o.getConfiguration() != null) {
                    return o.getConfiguration();
                }
            }
        }
        if (settings.getDefaultConfiguration() != null) {
            return settings.getDefaultConfiguration();
        }
        return WorkflowConfiguration.emptyDefaults();
    }
}
