package com.devops.backend.model;

import com.devops.backend.model.autobuild.EnvironmentAutoBuildConfig;
import com.devops.backend.model.autobuild.JenkinsConnection;
import com.devops.backend.model.workflow.CloudServiceItem;
import com.devops.backend.model.workflow.ClusterInfrastructure;
import com.devops.backend.model.workflow.ExternalServiceItem;
import com.devops.backend.model.workflow.ProjectServiceItem;
import com.devops.backend.model.workflow.ProjectServiceUsage;
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

    /**
     * Internal project services configured by admin (e.g. Auth Service, Payment API).
     * Not visible to end users.
     */
    @Builder.Default
    private List<ProjectServiceItem> projectServices = new ArrayList<>();

    /**
     * Cloud infrastructure services used by this project (AWS / Azure / GCP).
     * Not visible to end users.
     *
     * <p><b>Legacy.</b> The redesigned project config writes
     * {@link #serviceUsages} instead. This list is preserved for the
     * existing cost cycle / monitoring schedulers and the legacy editor.
     */
    @Builder.Default
    private List<CloudServiceItem> cloudServices = new ArrayList<>();

    /**
     * Project's opt-ins to {@code CategoryServiceItem}s on the managed
     * Cloud Services catalog (compute / network / aks / …).
     *
     * <p>Each entry references an {@code environmentId} +
     * {@code categoryKey} + {@code serviceId} on a {@link
     * com.devops.backend.model.environment.CloudEnvironment}, plus the
     * project-specific count / custom name / notes.
     */
    @Builder.Default
    private List<ProjectServiceUsage> serviceUsages = new ArrayList<>();

    /**
     * Manually-priced services that live outside the Azure catalog
     * (MongoDB Atlas, Datadog, Snowflake, …). Each row's monthly cost
     * is project-exclusive — full cost attributed to this project.
     */
    @Builder.Default
    private List<ExternalServiceItem> externalServices = new ArrayList<>();

    /**
     * Cluster infrastructure per environment (nodes, control plane, ingress).
     * Key = environment (e.g. "QA"). Used by Resource Monitoring to render
     * environment-level node configurations and cluster aggregates.
     */
    @Builder.Default
    private Map<String, ClusterInfrastructure> clusterInfrastructure = new HashMap<>();

    /**
     * Project-level Jenkins connection used by the auto-build / code-cut flow.
     * Optional — when null the auto-build feature is disabled for this project.
     */
    private JenkinsConnection jenkinsConnection;

    /**
     * Per-environment auto-build configuration.
     * Key = environment name (matches {@code environmentConfigurations}).
     * Each entry carries the toggle, defaults (branch/agent/clusters/etc.),
     * and the per-service Jenkins job + dependency plan.
     */
    @Builder.Default
    private Map<String, EnvironmentAutoBuildConfig> autoBuildConfig = new HashMap<>();

    private Instant updatedAt;
    private String updatedBy;
}
