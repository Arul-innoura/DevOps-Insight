package com.devops.backend.repository;

import com.devops.backend.model.monitoring.CostCycleRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface CostCycleRecordRepository extends MongoRepository<CostCycleRecord, String> {

    List<CostCycleRecord> findByProjectIdAndCloudServiceIdOrderByStartedAtAsc(
            String projectId, String cloudServiceId);

    List<CostCycleRecord> findByProjectIdOrderByStartedAtAsc(String projectId);
}
