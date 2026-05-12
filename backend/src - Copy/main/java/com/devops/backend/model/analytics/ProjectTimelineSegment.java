package com.devops.backend.model.analytics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Admin-configured project / environment run window shown on analytics and monitoring roadmaps.
 * Dates are ISO {@code YYYY-MM-DD} (local calendar day).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectTimelineSegment {

    private String id;

    private String projectName;

    @Builder.Default
    private String environment = "";

    /** ISO date YYYY-MM-DD */
    private String startDate;

    /** ISO date YYYY-MM-DD; empty means open-ended (chart extends to "today") */
    @Builder.Default
    private String endDate = "";

    private String label;

    @Builder.Default
    private String color = "";

    @Builder.Default
    private int sortOrder = 0;
}
