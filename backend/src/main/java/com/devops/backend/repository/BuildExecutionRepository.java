package com.devops.backend.repository;

import com.devops.backend.model.autobuild.BuildExecution;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface BuildExecutionRepository extends MongoRepository<BuildExecution, String> {

    List<BuildExecution> findByCodeCutRequestIdOrderByQueuedAtDesc(String codeCutRequestId);

    List<BuildExecution> findByProjectIdOrderByQueuedAtDesc(String projectId);

    List<BuildExecution> findByStatus(BuildExecution.ExecutionStatus status);
}
