package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * Operational metrics returned alongside live cost — req rate, error rate,
 * latency, restarts, top consumers. Read-only view, no persistence.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrometheusExtraMetrics {

    private String env;
    private String namespace;
    private Instant capturedAt;

    private Double requestsPerSec;
    private Double errorsPerSec;
    private Double errorRatePct;
    private Double p50LatencyMs;
    private Double p95LatencyMs;
    private Double p99LatencyMs;

    private Integer totalRestarts;
    private Integer crashLoopingPods;
    private Integer pendingPods;
    private Integer readyPods;

    private Double networkRxBytesPerSec;
    private Double networkTxBytesPerSec;

    private List<TopConsumer> topCpuConsumers;
    private List<TopConsumer> topMemoryConsumers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TopConsumer {
        private String name;
        private String namespace;
        private Double value;
        private String unit;
    }
}
