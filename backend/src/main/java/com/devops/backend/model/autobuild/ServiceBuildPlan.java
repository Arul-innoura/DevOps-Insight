package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Per-microservice build plan for one environment.
 * Defines the Jenkins job to invoke and which other services it depends on.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServiceBuildPlan {

    /** Stable id (matches {@code ProjectServiceItem.id} when possible). */
    private String id;

    /** Service display name (e.g. "Auth Service"). */
    private String serviceName;

    /** Jenkins job/folder path (e.g. "platform/auth-service"). */
    private String jobName;

    /**
     * Optional override for the build agent label
     * ("any" → VM agents; e.g. "k8s-pod" → K8s pod). Falls back to env default.
     */
    private String agentLabel;

    /**
     * Service ids this service depends on. Builds wait for all dependencies
     * to succeed before starting. Empty list = independent (runs in parallel
     * with other independents).
     */
    @Builder.Default
    private List<String> dependsOn = new ArrayList<>();

    /** When false, skip this service for the current environment. */
    @Builder.Default
    private Boolean enabled = Boolean.TRUE;

    /**
     * Whether to trigger this job with parameters (POST buildWithParameters).
     * Set to {@code false} for plain pipeline jobs that accept no parameters —
     * those are triggered with POST /build instead.
     * Defaults to {@code true}; the orchestrator also auto-detects via HTTP 400
     * as a safety net, so this flag only needs to be set explicitly when you want
     * to suppress parameter passing regardless.
     */
    @Builder.Default
    private Boolean parametrized = Boolean.TRUE;
}
