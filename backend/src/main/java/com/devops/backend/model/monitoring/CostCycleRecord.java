package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Persistent record of one complete cost-monitoring start→stop cycle for a cloud service.
 * Stored in its own collection so history is never lost if ServiceRuntimeState is recreated.
 */
@Document(collection = "cost_cycle_records")
@CompoundIndex(name = "proj_svc_start", def = "{'projectId': 1, 'cloudServiceId': 1, 'startedAt': 1}")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CostCycleRecord {

    @Id
    private String id;

    private String projectId;
    private String cloudServiceId;
    private String cloudServiceName;

    private Instant startedAt;
    private Instant endedAt;
    private long    durationSeconds;
    private Double  totalUsd;
    private Double  hourlyRateUsd;
}
