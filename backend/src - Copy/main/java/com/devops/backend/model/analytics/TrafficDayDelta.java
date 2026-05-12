package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-day ingress/egress deltas for the traffic analytics chart.
 * {@code environment} is empty string for "All environments" view; otherwise matches ticket environment.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficDayDelta {
    private int year;
    private int month;
    private int day;
    @Builder.Default
    private String environment = "";
    private int ingressDelta;
    private int egressDelta;
}
