package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/** Persistent record of one complete DevOps manual start→stop cycle for an environment. */
@Document(collection = "monitoring_cycle_records")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MonitoringCycleRecord {

    @Id
    private String id;

    @Indexed
    private String productName;

    private String environment;

    private Instant startedAt;
    private String  startedBy;

    /** Null while still running. */
    private Instant stoppedAt;
    private String  stoppedBy;
}
