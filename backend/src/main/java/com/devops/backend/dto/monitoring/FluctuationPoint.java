package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * One sample on a resource fluctuation line chart.
 * Day 1 = 2 cores; Day 2 = 4 cores, 349 MB memory; Day 3 = back to 2 cores → 3 points.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FluctuationPoint {
    private Instant capturedAt;
    private Double cpuCores;
    private Double memoryMb;
    private Integer nodeCount;
    private String source;
}
