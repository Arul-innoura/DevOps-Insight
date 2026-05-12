package com.devops.backend.repository;

import com.devops.backend.model.analytics.AnalyticsSettings;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AnalyticsSettingsRepository extends MongoRepository<AnalyticsSettings, String> {
}
