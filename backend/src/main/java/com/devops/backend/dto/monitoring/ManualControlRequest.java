package com.devops.backend.dto.monitoring;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ManualControlRequest {
    private String productName;
    private String environment;
    /** "start" | "stop" | "auto" */
    private String action;
}
