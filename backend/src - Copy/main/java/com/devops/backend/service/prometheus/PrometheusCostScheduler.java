package com.devops.backend.service.prometheus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically pulls a Prometheus snapshot for every configured env and ticks
 * the cumulative cost accumulators. The scheduled cadence comes from
 * {@code app.prometheus.poll-seconds} but Spring's {@code @Scheduled} only
 * supports compile-time placeholders, so we use {@code fixedRateString} to
 * resolve the property at startup.
 *
 * <p>The whole component disables itself when {@code app.prometheus.enabled=false}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.prometheus.enabled", havingValue = "true", matchIfMissing = true)
public class PrometheusCostScheduler {

    private final PrometheusCostService cost;

    @Value("${app.prometheus.poll-seconds:30}")
    private int pollSeconds;

    /**
     * Tick every {@code app.prometheus.poll-seconds} seconds (default 30s)
     * starting 20 s after boot to give Mongo + Azure pricing cache a chance
     * to warm up.
     */
    @Scheduled(
            initialDelayString = "20000",
            fixedRateString = "#{${app.prometheus.poll-seconds:30} * 1000}"
    )
    public void tickAll() {
        for (String env : cost.availableEnvs()) {
            try {
                var snap = cost.tick(env);
                if (log.isDebugEnabled() && snap.isPrometheusReachable()) {
                    log.debug("Prometheus tick {} -> {} ns, ${}/hr",
                            env,
                            snap.getNamespaces() == null ? 0 : snap.getNamespaces().size(),
                            snap.getTotalHourlyUsd());
                }
            } catch (Exception ex) {
                log.warn("Prometheus tick failed for env {}: {}", env, ex.getMessage());
            }
        }
    }
}
