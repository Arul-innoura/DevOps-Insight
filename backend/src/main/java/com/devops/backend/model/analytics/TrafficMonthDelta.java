package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Deltas applied to a row in the monthly traffic table ({@code yearMonth} = {@code yyyy-MM}). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficMonthDelta {
    private String yearMonth;
    private int ingressDelta;
    private int egressDelta;
}
