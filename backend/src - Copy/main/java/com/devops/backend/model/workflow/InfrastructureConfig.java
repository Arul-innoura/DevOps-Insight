package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfrastructureConfig {

    @Builder.Default
    private String cpu = "";

    @Builder.Default
    private String memory = "";

    @Builder.Default
    private boolean databaseRequired = false;

    @Builder.Default
    private String databaseType = "";

    @Builder.Default
    private String databaseAllocation = "";

    @Builder.Default
    private String cloudProvider = "";

    @Builder.Default
    private String region = "";

    @Builder.Default
    private String monthlyCostEstimate = "";
}
