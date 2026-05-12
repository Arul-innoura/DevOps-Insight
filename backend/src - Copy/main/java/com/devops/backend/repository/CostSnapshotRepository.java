package com.devops.backend.repository;

import com.devops.backend.model.monitoring.CostSnapshot;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface CostSnapshotRepository extends MongoRepository<CostSnapshot, String> {

    List<CostSnapshot> findByProjectIdAndCapturedAtBetweenOrderByCapturedAtAsc(
            String projectId, Instant from, Instant to);

    List<CostSnapshot> findByProjectIdAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc(
            String projectId, String environment, Instant from, Instant to);

    List<CostSnapshot> findByCloudServiceIdAndCapturedAtBetweenOrderByCapturedAtAsc(
            String cloudServiceId, Instant from, Instant to);
}
