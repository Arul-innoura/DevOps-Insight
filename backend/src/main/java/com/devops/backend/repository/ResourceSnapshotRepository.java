package com.devops.backend.repository;

import com.devops.backend.model.monitoring.ResourceSnapshot;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface ResourceSnapshotRepository extends MongoRepository<ResourceSnapshot, String> {

    List<ResourceSnapshot> findByProjectIdAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc(
            String projectId, String environment, Instant from, Instant to);

    List<ResourceSnapshot> findByScopeAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc(
            String scope, String environment, Instant from, Instant to);

    List<ResourceSnapshot> findByMicroserviceIdAndCapturedAtBetweenOrderByCapturedAtAsc(
            String microserviceId, Instant from, Instant to);
}
