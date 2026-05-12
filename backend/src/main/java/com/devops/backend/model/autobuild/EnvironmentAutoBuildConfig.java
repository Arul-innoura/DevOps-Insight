package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Per-environment auto-build configuration for a project.
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}'s
 * {@code autoBuildConfig} map keyed by environment name (e.g. "QA", "Production").
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnvironmentAutoBuildConfig {

    /** Master toggle — when false the auto-build flow is hidden everywhere. */
    @Builder.Default
    private Boolean enabled = Boolean.FALSE;

    /** Default git branch to build (e.g. "main"). User can override per request. */
    private String defaultBranch;

    /** Default Jenkins build agent label. "any" = VM, custom = K8s pod label. */
    @Builder.Default
    private String agentLabel = "any";

    /** Default commit id (blank = HEAD). */
    private String defaultCommitId;

    /** Number of clusters to deploy. */
    @Builder.Default
    private Integer clusters = 1;

    /** Git protocol: "ssh" or "https". */
    @Builder.Default
    private String gitProtocol = "ssh";

    /** Jenkins credentials id (e.g. "EH-CICD-Git-Hub-App"). */
    private String gitCredentialsId;

    /**
     * Jenkins folder path that contains all microservice jobs for this environment.
     * E.g. "Platform/Microservices".  The orchestrator prepends this to each
     * service's {@code jobName} so admins only type the job name once.
     * Leave blank if jobs live at the root or if job names already include the path.
     */
    private String jenkinsFolder;

    /** Number of retries per service on failure (default 3 total attempts). */
    @Builder.Default
    private Integer retryAttempts = 3;

    /**
     * Whether to pass build parameters to Jenkins jobs (POST buildWithParameters).
     * When {@code false} all jobs in this environment are triggered with POST /build
     * (no parameter form body), regardless of the per-service {@code parametrized} flag.
     * Defaults to {@code true}.
     */
    @Builder.Default
    private Boolean useParameters = Boolean.TRUE;

    /**
     * Require dual approval (Lead + Manager) before trigger button appears.
     * Approvers are resolved from the project's existing workflow approval levels.
     * Defaults to true per product requirement.
     */
    @Builder.Default
    private Boolean requireDualApproval = Boolean.TRUE;

    /** Per-service build plan (defines Jenkins jobs + dependency order). */
    @Builder.Default
    private List<ServiceBuildPlan> services = new ArrayList<>();
}
