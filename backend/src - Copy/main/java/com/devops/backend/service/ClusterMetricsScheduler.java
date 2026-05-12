package com.devops.backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Polls every connected AKS cluster every 60 seconds and persists a
 * {@link com.devops.backend.model.monitoring.ClusterLiveMetrics} snapshot.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClusterMetricsScheduler {

    private final ClusterMetricsService clusterMetricsService;

    // @Scheduled(initialDelayString = "PT30S", fixedDelayString = "PT60S")
    public void collect() {
        log.debug("ClusterMetricsScheduler: collecting live metrics from all connected clusters");
        try {
            clusterMetricsService.collectAllConnected();
        } catch (Exception e) {
            log.error("ClusterMetricsScheduler error: {}", e.getMessage(), e);
        }
    }
}
