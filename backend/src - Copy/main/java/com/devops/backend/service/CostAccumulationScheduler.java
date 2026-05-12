package com.devops.backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fires every minute and writes a CostSnapshot for every currently running
 * cloud service, producing the real-time timeline DevOps sees.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CostAccumulationScheduler {

    private final CostMonitoringService costMonitoringService;

    @Scheduled(initialDelay = 60_000L, fixedRate = 60_000L)
    public void tick() {
        try {
            int n = costMonitoringService.tickLiveCosts();
            if (n > 0) log.debug("Cost tick processed {} running services", n);
        } catch (Exception e) {
            log.warn("Cost tick failed: {}", e.getMessage());
        }
    }
}
