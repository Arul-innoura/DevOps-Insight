package com.devops.backend.service;

import com.devops.backend.dto.monitoring.FluctuationPoint;
import com.devops.backend.dto.monitoring.ResourceHierarchyNode;

import java.time.Instant;
import java.util.List;

/**
 * Read model for the Resource Monitoring analytics section.
 * Visible to both USER and DEVOPS roles — pricing data is filtered out
 * for USER callers upstream in the controller.
 */
public interface ResourceMonitoringService {

    /** Full Environment → Cluster → Project → Microservice tree. */
    List<ResourceHierarchyNode> getHierarchy();

    /** Subtree rooted at a single environment (for lazy loading). */
    List<ResourceHierarchyNode> getEnvironmentSubtree(String environment);

    /** Fluctuation timeline at an environment/cluster scope. */
    List<FluctuationPoint> getClusterFluctuation(String environment, String clusterName,
                                                 Instant from, Instant to);

    /** Fluctuation timeline for a project (summed across microservices). */
    List<FluctuationPoint> getProjectFluctuation(String projectId, String environment,
                                                 Instant from, Instant to);

    /** Fluctuation timeline for a single microservice. */
    List<FluctuationPoint> getMicroserviceFluctuation(String microserviceId,
                                                      Instant from, Instant to);

    /** Capture a snapshot of a project's current config (manual trigger for DevOps). */
    int snapshotProject(String projectId, String environment, String actor);

    /** Capture snapshots for every project & environment — invoked by scheduler. */
    int snapshotAll(String source);
}
