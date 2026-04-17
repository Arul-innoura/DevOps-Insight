package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Global analytics display overrides. Ticket data remains source of truth; these values are added to counts.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "analytics_settings")
public class AnalyticsSettings {

    public static final String GLOBAL_ID = "global";

    @Id
    private String id;

    private OverviewMetricDeltas overviewMetricDeltas;

    @Builder.Default
    private List<TrafficDayDelta> dayTrafficDeltas = new ArrayList<>();

    @Builder.Default
    private List<TrafficMonthDelta> monthTrafficDeltas = new ArrayList<>();

    @Builder.Default
    private List<EnvTrafficDelta> envTrafficDeltas = new ArrayList<>();

    /** Admin-defined project/environment timeline rows for roadmap charts (User / DevOps / Admin). */
    @Builder.Default
    private List<ProjectTimelineSegment> projectTimelineSegments = new ArrayList<>();

    /**
     * DevOps/Admin-controlled visibility of environment + product rows on the monitoring analytics page.
     */
    @Builder.Default
    private List<MonitoringDisplayToggle> monitoringDisplayToggles = new ArrayList<>();

    private Instant updatedAt;
    private String updatedBy;
}
