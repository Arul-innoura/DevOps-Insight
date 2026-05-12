package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Frontend-facing DTO for one manual start→stop cycle. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CycleRecord {
    private String id;
    private String productName;
    private String environment;
    private String startedAt;       // ISO-8601
    private String startedBy;
    private String stoppedAt;       // ISO-8601, null = still running
    private String stoppedBy;
    private Long   durationSeconds; // null = still running
}
