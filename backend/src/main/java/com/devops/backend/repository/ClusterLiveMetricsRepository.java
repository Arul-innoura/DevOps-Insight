package com.devops.backend.repository;

import com.devops.backend.model.monitoring.ClusterLiveMetrics;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ClusterLiveMetricsRepository extends MongoRepository<ClusterLiveMetrics, String> {

    Optional<ClusterLiveMetrics> findFirstByEnvironmentIdOrderByCapturedAtDesc(String environmentId);

    List<ClusterLiveMetrics> findByEnvironmentIdAndCapturedAtBetweenOrderByCapturedAtAsc(
            String environmentId, Instant from, Instant to);

    /** Latest N snapshots across all environments. */
    default List<ClusterLiveMetrics> findLatestPerEnvironment(String environmentId, int limit) {
        return findByEnvironmentIdOrderByCapturedAtDesc(environmentId,
                PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "capturedAt")));
    }

    List<ClusterLiveMetrics> findByEnvironmentIdOrderByCapturedAtDesc(
            String environmentId, PageRequest pageable);

    void deleteByEnvironmentId(String environmentId);
}
