package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Deltas applied to ingress/egress counts for one environment in the traffic-by-environment table. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnvTrafficDelta {
    private String environment;
    private int ingressDelta;
    private int egressDelta;
}
