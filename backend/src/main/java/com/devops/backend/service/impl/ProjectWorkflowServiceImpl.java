package com.devops.backend.service.impl;

import com.devops.backend.model.Environment;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.workflow.EmailRoutingConfig;
import com.devops.backend.model.workflow.InfrastructureConfig;
import com.devops.backend.model.workflow.NotificationPreferenceConfig;
import com.devops.backend.model.workflow.RequestTypeWorkflowOverride;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.ProjectWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
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
    public WorkflowConfiguration resolveEffective(String projectId, RequestType requestType, String environmentKey) {
        ProjectWorkflowSettings settings = repository.findByProjectId(projectId).orElse(null);
        if (settings == null) {
            return WorkflowConfiguration.emptyDefaults();
        }
        WorkflowConfiguration base = null;
        if (settings.getRequestTypeOverrides() != null && requestType != null) {
            for (RequestTypeWorkflowOverride o : settings.getRequestTypeOverrides()) {
                if (o.getRequestType() != null
                        && o.getRequestType().equalsIgnoreCase(requestType.name())
                        && o.getConfiguration() != null) {
                    base = o.getConfiguration();
                    break;
                }
            }
            // New tickets use GENERAL_REQUEST; many projects still have overrides keyed as BUILD_REQUEST.
            if (base == null && requestType == RequestType.GENERAL_REQUEST) {
                for (RequestTypeWorkflowOverride o : settings.getRequestTypeOverrides()) {
                    if (o.getRequestType() != null
                            && o.getRequestType().equalsIgnoreCase(RequestType.BUILD_REQUEST.name())
                            && o.getConfiguration() != null) {
                        base = o.getConfiguration();
                        break;
                    }
                }
            }
        }
        if (base == null && settings.getDefaultConfiguration() != null) {
            base = settings.getDefaultConfiguration();
        }
        if (base == null) {
            base = WorkflowConfiguration.emptyDefaults();
        }
        if (environmentKey != null && !environmentKey.isBlank()) {
            WorkflowConfiguration envCfg = findEnvironmentWorkflow(settings.getEnvironmentConfigurations(), environmentKey);
            if (envCfg != null) {
                return withInheritedMandatoryRouting(base, envCfg);
            }
        }
        return base;
    }

    /**
     * Environment config can override default/request-type routing. If mandatory lists are not configured
     * on the env config, inherit them from base so defaults still apply across environments.
     */
    private static WorkflowConfiguration withInheritedMandatoryRouting(WorkflowConfiguration base, WorkflowConfiguration env) {
        if (env == null) {
            return base != null ? base : WorkflowConfiguration.emptyDefaults();
        }
        EmailRoutingConfig envRouting = env.getEmailRouting() != null
                ? env.getEmailRouting()
                : EmailRoutingConfig.builder().build();
        EmailRoutingConfig baseRouting = base != null ? base.getEmailRouting() : null;
        if (baseRouting == null) {
            return env;
        }
        return WorkflowConfiguration.builder()
                .emailRouting(EmailRoutingConfig.builder()
                        .to(envRouting.getTo() != null ? envRouting.getTo() : new ArrayList<>())
                        .cc(envRouting.getCc() != null ? envRouting.getCc() : new ArrayList<>())
                        .bcc(envRouting.getBcc() != null ? envRouting.getBcc() : new ArrayList<>())
                        .toMandatory(inheritWhenEmpty(envRouting.getToMandatory(), baseRouting.getToMandatory()))
                        .ccMandatory(inheritWhenEmpty(envRouting.getCcMandatory(), baseRouting.getCcMandatory()))
                        .bccMandatory(inheritWhenEmpty(envRouting.getBccMandatory(), baseRouting.getBccMandatory()))
                        .build())
                .approvalLevels(env.getApprovalLevels() != null ? env.getApprovalLevels() : new ArrayList<>())
                .managers(env.getManagers() != null ? env.getManagers() : new ArrayList<>())
                .costApprovalRequired(env.isCostApprovalRequired())
                .costApprovers(env.getCostApprovers() != null ? env.getCostApprovers() : new ArrayList<>())
                .notificationPreferences(env.getNotificationPreferences() != null
                        ? env.getNotificationPreferences()
                        : NotificationPreferenceConfig.builder().build())
                .infrastructure(env.getInfrastructure() != null ? env.getInfrastructure() : new InfrastructureConfig())
                .build();
    }

    private static List<String> inheritWhenEmpty(List<String> preferred, List<String> fallback) {
        if (preferred != null && !preferred.isEmpty()) {
            return new ArrayList<>(preferred);
        }
        return fallback == null ? new ArrayList<>() : new ArrayList<>(fallback);
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

    private static WorkflowConfiguration findEnvironmentWorkflow(
            Map<String, WorkflowConfiguration> map, String environmentKey) {
        if (map == null || map.isEmpty() || environmentKey == null || environmentKey.isBlank()) {
            return null;
        }
        String wanted = normalizeEnvLookupKey(environmentKey);
        Environment parsed = Environment.fromFlexibleKey(environmentKey);
        for (Map.Entry<String, WorkflowConfiguration> e : map.entrySet()) {
            String k = e.getKey();
            if (k == null || k.isBlank()) {
                continue;
            }
            if (normalizeEnvLookupKey(k).equals(wanted)) {
                return e.getValue();
            }
            if (parsed != null && parsed.matchesWorkflowKey(k)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static String normalizeEnvLookupKey(String value) {
        return String.valueOf(value == null ? "" : value)
                .trim()
                .toLowerCase(Locale.ROOT)
                .replace('-', ' ')
                .replace('_', ' ')
                .replaceAll("\\s+", " ");
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
