package com.devops.backend.repository;

import com.devops.backend.model.ProjectWorkflowSettings;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProjectWorkflowSettingsRepository extends MongoRepository<ProjectWorkflowSettings, String> {
    Optional<ProjectWorkflowSettings> findByProjectId(String projectId);
}
