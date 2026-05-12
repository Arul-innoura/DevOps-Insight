package com.devops.backend.service;

import com.devops.backend.model.analytics.AnalyticsSettings;
import com.devops.backend.model.analytics.MonitoringDisplayToggle;

import java.util.List;

public interface AnalyticsSettingsService {

    AnalyticsSettings getOrDefault();

    AnalyticsSettings save(AnalyticsSettings body, String actorName);

    AnalyticsSettings saveMonitoringDisplayToggles(List<MonitoringDisplayToggle> toggles, String actorName);

    /** DevOps manual env control: action is "start" | "stop" | "auto". */
    void setManualControl(String productName, String environment, String action, String actorName);
}