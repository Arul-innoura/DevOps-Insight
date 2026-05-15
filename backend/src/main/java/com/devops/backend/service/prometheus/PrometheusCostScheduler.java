package com.devops.backend.service.prometheus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Two-phase Prometheus cost scheduler.
 *
 * <p><b>Phase 1</b> (every 60 s, offset 0 s) — fetch topology from Prometheus
 * for all envs and cache it in memory.
 *
 * <p><b>Phase 2</b> (every 60 s, offset 30 s after Phase 1) — read the cached
 * topology, call the cloud-pricing APIs (Azure / AWS), compute per-namespace
 * costs, and persist the result to MongoDB. The UI then reads from MongoDB
 * every minute and always sees fresh, priced data.
 *
 * <p>The whole component disables itself when {@code app.prometheus.enabled=false}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.prometheus.enabled", havingValue = "true", matchIfMissing = true)
public class PrometheusCostScheduler {

    private final PrometheusCostService cost;

    /**
     * Phase 1 — Prometheus scrape every 60 s.
     * Initial delay of 20 s gives MongoDB and the Azure pricing cache time to warm up.
     */
    @Scheduled(initialDelayString = "20000", fixedRateString = "60000")
    public void phase1FetchTopology() {
        for (String env : cost.availableEnvs()) {
            try {
                cost.primeTopology(env);
            } catch (Exception ex) {
                log.warn("Phase-1 topology fetch failed env={}: {}", env, ex.getMessage());
            }
        }
    }

    /**
     * Phase 2 — price calculation + DB persist, 30 s after Phase 1.
     * Initial delay of 50 s (20 s boot + 30 s after Phase 1).
     */
    @Scheduled(initialDelayString = "50000", fixedRateString = "60000")
    public void phase2ComputeAndPersist() {
        for (String env : cost.availableEnvs()) {
            try {
                var snap = cost.computeAndPersist(env);
                if (log.isDebugEnabled() && snap != null && snap.isPrometheusReachable()) {
                    log.debug("Phase-2 cost computed env={} ns={} total=${}/hr",
                            env,
                            snap.getNamespaces() == null ? 0 : snap.getNamespaces().size(),
                            snap.getTotalHourlyUsd());
                }
            } catch (Exception ex) {
                log.warn("Phase-2 compute failed env={}: {}", env, ex.getMessage());
            }
        }
    }
}
