package com.devops.backend.repository;

import com.devops.backend.model.monitoring.ServiceRuntimeState;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface ServiceRuntimeStateRepository extends MongoRepository<ServiceRuntimeState, String> {

    Optional<ServiceRuntimeState> findByProjectIdAndEnvironmentAndCloudServiceId(
            String projectId, String environment, String cloudServiceId);

    List<ServiceRuntimeState> findByRunningTrue();

    List<ServiceRuntimeState> findByProjectIdAndEnvironment(String projectId, String environment);

    List<ServiceRuntimeState> findByProjectIdAndCloudServiceId(String projectId, String cloudServiceId);
}
