package com.devops.backend.service;

import com.devops.backend.dto.monitoring.CostTimelinePoint;
import com.devops.backend.dto.monitoring.LiveCostRow;
import com.devops.backend.dto.monitoring.ProjectCostBreakdown;

import java.time.Instant;
import java.util.List;

/**
 * DevOps-only cost tracking. Uses the latest Azure retail prices and the
 * current running state of each cloud service to produce real-time USD
 * figures, including shared-resource splits.
 */
public interface CostMonitoringService {

    /**
     * Re-apply the latest cached Azure prices to every cloud service and
     * every cluster node pool. Called after a pricing refresh.
     *
     * @return number of rows whose hourlyRateUsd was updated.
     */
    int applyLatestPricesToProjects();

    /** Capture a new cost snapshot for every currently running service. */
    int tickLiveCosts();

    /** Start a running cycle for a specific cloud service on a project/env. */
    void startCycle(String projectId, String environment, String cloudServiceId, String actor);

    /** Stop the current running cycle (if any) for a cloud service. */
    void stopCycle(String projectId, String environment, String cloudServiceId, String actor);

    /** Live breakdown across all projects for DevOps. */
    List<LiveCostRow> getLiveCosts();

    /** Per-project breakdown — totals plus per-service rows. */
    ProjectCostBreakdown getProjectBreakdown(String projectId, String environment);

    /** Historical cost timeline for a project (or service) over a window. */
    List<CostTimelinePoint> getCostTimeline(String projectId, String environment, String cloudServiceId,
                                            Instant from, Instant to);
}
