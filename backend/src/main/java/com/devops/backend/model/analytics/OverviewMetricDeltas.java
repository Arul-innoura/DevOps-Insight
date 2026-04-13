package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Optional integer adjustments added to ticket-derived overview KPIs (admin reporting).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverviewMetricDeltas {
    private Integer totalDelta;
    private Integer resolvedDelta;
    private Integer inProgressDelta;
    private Integer pendingDelta;
    private Integer actionRequiredDelta;
}
