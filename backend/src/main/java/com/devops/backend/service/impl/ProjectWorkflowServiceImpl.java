package com.devops.backend.service.impl;

import com.devops.backend.model.Environment;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.InfrastructureConfig;
import com.devops.backend.model.workflow.RequestTypeWorkflowOverride;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.ProjectWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

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
                    .environmentConfigurations(new HashMap<>())
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
        if (settings.getEnvironmentConfigurations() == null) {
            settings.setEnvironmentConfigurations(new HashMap<>());
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

    @Override
    public InfrastructureConfig mergeInfrastructureForEnvironment(
            String projectId, Environment environment, InfrastructureConfig snapshotInfrastructure) {

        InfrastructureConfig base = snapshotInfrastructure != null
                ? snapshotInfrastructure
                : InfrastructureConfig.builder().build();
        if (projectId == null || projectId.isBlank() || environment == null) {
            return base;
        }
        ProjectWorkflowSettings settings = repository.findByProjectId(projectId).orElse(null);
        if (settings == null || settings.getEnvironmentConfigurations() == null) {
            return base;
        }
        WorkflowConfiguration envWf = findEnvironmentWorkflow(settings.getEnvironmentConfigurations(), environment);
        if (envWf == null || envWf.getInfrastructure() == null) {
            return base;
        }
        return mergeInfrastructureLayers(base, envWf.getInfrastructure());
    }

    private static WorkflowConfiguration findEnvironmentWorkflow(
            Map<String, WorkflowConfiguration> map, Environment env) {
        if (map == null || map.isEmpty() || env == null) {
            return null;
        }
        for (Map.Entry<String, WorkflowConfiguration> e : map.entrySet()) {
            String k = e.getKey();
            if (k == null || k.isBlank()) {
                continue;
            }
            if (env.matchesWorkflowKey(k)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static InfrastructureConfig mergeInfrastructureLayers(InfrastructureConfig base, InfrastructureConfig over) {
        if (over == null) {
            return base;
        }
        return InfrastructureConfig.builder()
                .cpu(firstNonBlank(over.getCpu(), base.getCpu()))
                .memory(firstNonBlank(over.getMemory(), base.getMemory()))
                .databaseRequired(over.isDatabaseRequired() || base.isDatabaseRequired())
                .databaseType(firstNonBlank(over.getDatabaseType(), base.getDatabaseType()))
                .databaseAllocation(firstNonBlank(over.getDatabaseAllocation(), base.getDatabaseAllocation()))
                .cloudProvider(firstNonBlank(over.getCloudProvider(), base.getCloudProvider()))
                .region(firstNonBlank(over.getRegion(), base.getRegion()))
                .monthlyCostEstimate(firstNonBlank(over.getMonthlyCostEstimate(), base.getMonthlyCostEstimate()))
                .build();
    }

    private static String firstNonBlank(String preferred, String fallback) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        return fallback != null ? fallback : "";
    }
}
