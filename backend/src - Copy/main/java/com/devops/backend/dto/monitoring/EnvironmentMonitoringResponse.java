package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnvironmentMonitoringResponse {
    private String productName;
    private int year;
    private int month;
    private int daysInMonth;
    private String generatedAt;
    private String currentActiveEnvironment;
    private String currentActiveSince;
    private List<EnvironmentSeries> environments;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EnvironmentSeries {
        private String environment;
        private boolean currentlyActive;
        private String activeSince;
        private double activeNowHours;
        private double totalActiveHours;
        private int activeDays;
        private List<DailyActiveHours> daily;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyActiveHours {
        private int day;
        private double activeHours;
    }
}

