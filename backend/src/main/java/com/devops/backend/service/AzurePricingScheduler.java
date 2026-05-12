package com.devops.backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Refreshes every in-use Azure meter price from the public Retail Pricing
 * API once per hour, and at application startup. Keeps {@code CloudServiceItem}
 * pricing honest without asking the admin to re-enter figures.
 * After prices refresh, resource monitoring snapshots are also captured so
 * the resource dashboard reflects any updated cost rates immediately.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AzurePricingScheduler {

    private final AzurePricingService azurePricingService;
    private final CostMonitoringService costMonitoringService;
    private final ResourceMonitoringService resourceMonitoringService;
    private final CloudEnvironmentService cloudEnvironmentService;

    /** Run 30 seconds after startup then every hour. */
    @Scheduled(initialDelay = 30_000L, fixedRate = 3_600_000L)
    public void hourlyRefresh() {
        try {
            int refreshed = azurePricingService.refreshAllInUseMeters();
            int applied = costMonitoringService.applyLatestPricesToProjects();
            int envApplied = cloudEnvironmentService.applyLatestPrices();
            log.info("Azure pricing hourly refresh: {} meters refreshed, {} project rates updated, {} environments repriced",
                    refreshed, applied, envApplied);
        } catch (Exception e) {
            log.warn("Azure pricing hourly refresh failed: {}", e.getMessage(), e);
        }

        // Also snapshot all project resources so resource monitoring reflects fresh cost data
        try {
            int snapshotted = resourceMonitoringService.snapshotAll("PRICE_REFRESH");
            log.info("Resource monitoring auto-snapshot triggered after price refresh: {} snapshots written", snapshotted);
        } catch (Exception e) {
            log.warn("Resource monitoring auto-snapshot failed: {}", e.getMessage(), e);
        }
    }
}
