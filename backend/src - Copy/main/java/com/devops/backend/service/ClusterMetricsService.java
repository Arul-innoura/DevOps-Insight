package com.devops.backend.service;

import com.devops.backend.model.monitoring.ClusterConnection;
import com.devops.backend.model.monitoring.ClusterLiveMetrics;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface ClusterMetricsService {

    // ── Connection management ─────────────────────────────────────────────────

    /** Save (or overwrite) the kubeconfig for an environment and test the connection. */
    ClusterConnection saveConnection(String environmentId, String environmentName,
                                     String kubeconfigContent, String jenkinsNodePool,
                                     String actor);

    /** Remove the stored kubeconfig and evict any cached client. */
    void deleteConnection(String environmentId);

    /** Test live connectivity and update connected/lastError on the stored record. */
    boolean testConnection(String environmentId);

    Optional<ClusterConnection> getConnection(String environmentId);

    List<ClusterConnection> listConnections();

    // ── Metrics collection ────────────────────────────────────────────────────

    /**
     * Connect to the cluster for this environment, collect all metrics and persist
     * a new {@link ClusterLiveMetrics} snapshot.
     */
    ClusterLiveMetrics collectAndSave(String environmentId);

    /** Called by the scheduler — runs collectAndSave for every connected environment. */
    void collectAllConnected();

    // ── Metrics retrieval ─────────────────────────────────────────────────────

    Optional<ClusterLiveMetrics> getLatest(String environmentId);

    List<ClusterLiveMetrics> getHistory(String environmentId, Instant from, Instant to);

    /** Summary of latest snapshot per environment — for the overview dashboard. */
    List<Map<String, Object>> getAllLatestSummaries();
}
