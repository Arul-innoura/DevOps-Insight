package com.devops.backend.service;

import com.devops.backend.model.analytics.AnalyticsSettings;

public interface AnalyticsSettingsService {

    AnalyticsSettings getOrDefault();

    AnalyticsSettings save(AnalyticsSettings body, String actorName);
}
