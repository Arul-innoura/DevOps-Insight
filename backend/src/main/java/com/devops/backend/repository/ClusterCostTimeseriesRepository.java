package com.devops.backend.repository;

import com.devops.backend.model.monitoring.ClusterCostTimeseriesPoint;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ClusterCostTimeseriesRepository
        extends MongoRepository<ClusterCostTimeseriesPoint, String> {

    /** Range query for one env, oldest first — used for line/bar charts. */
    List<ClusterCostTimeseriesPoint> findByEnvAndCapturedAtBetweenOrderByCapturedAtAsc(
            String env, Instant from, Instant to);

    /** Most-recent N points for one env, newest first. */
    List<ClusterCostTimeseriesPoint> findTop500ByEnvOrderByCapturedAtDesc(String env);

    /** Single latest point for one env — used as DB fallback for live snapshot. */
    Optional<ClusterCostTimeseriesPoint> findTopByEnvOrderByCapturedAtDesc(String env);
}
