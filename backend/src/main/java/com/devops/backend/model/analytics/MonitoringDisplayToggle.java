package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Controls whether an environment + product pair appears in monitoring charts (user / DevOps).
 * Hours are still derived from tickets when enabled.
 * {@code runningOverride} lets DevOps force "running" vs "stopped" for dashboard metrics when non-null.
 * When switching to running, {@code manualRunningSince} records the click time until stopped or auto.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MonitoringDisplayToggle {

    @Builder.Default
    private String productName = "";

    @Builder.Default
    private String environment = "";

    /** When false, the pair is hidden from published monitoring charts. */
    @Builder.Default
    private Boolean enabled = true;

    /**
     * When {@code null}, "running" is inferred from open tickets. When {@code true} or {@code false},
     * DevOps overrides the live running indicator and related chart labels for this product × environment.
     */
    private Boolean runningOverride;

    /** Set when live status is set to Running (start of manual uptime for charts). */
    private Instant manualRunningSince;

    /** Set when live status moves from Running to Stopped (end of manual segment). */
    private Instant manualRunningStoppedAt;
}
