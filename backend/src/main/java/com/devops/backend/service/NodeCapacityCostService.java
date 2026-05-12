package com.devops.backend.service;

import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown;

import java.util.List;
import java.util.Optional;

/**
 * Capacity-based cost engine — complements the per-service cycle engine in
 * {@link CostMonitoringService} with a second model:
 *   cost_of_project = (project_requested_cpu_or_mem / node_capacity) × node_cost
 *                   + equal share of environment-shared infra & services
 *
 * <p>Runs entirely from Azure public pricing + configured VM sizes + each
 * project's per-microservice CPU/memory requests. No actual runtime
 * telemetry required.
 */
public interface NodeCapacityCostService {

    /** Breakdown for every managed environment. */
    List<EnvironmentCapacityBreakdown> breakdownAll();

    /** Breakdown for a single environment by id. */
    Optional<EnvironmentCapacityBreakdown> breakdownFor(String environmentId);
}
