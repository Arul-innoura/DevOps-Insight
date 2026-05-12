package com.devops.backend.repository;

import com.devops.backend.model.monitoring.ClusterConnection;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface ClusterConnectionRepository extends MongoRepository<ClusterConnection, String> {
    Optional<ClusterConnection> findByEnvironmentId(String environmentId);
    List<ClusterConnection> findAllByConnectedTrue();
    boolean existsByEnvironmentId(String environmentId);
    void deleteByEnvironmentId(String environmentId);
}
