package com.devops.backend.repository;

import com.devops.backend.model.analytics.MonitoringCycleRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface MonitoringCycleRecordRepository extends MongoRepository<MonitoringCycleRecord, String> {

    List<MonitoringCycleRecord> findByProductNameOrderByStartedAtDesc(String productName);

    List<MonitoringCycleRecord> findByProductNameAndStartedAtBetweenOrderByStartedAtDesc(
            String productName, Instant from, Instant to);

    List<MonitoringCycleRecord> findAllByOrderByStartedAtDesc();
}
