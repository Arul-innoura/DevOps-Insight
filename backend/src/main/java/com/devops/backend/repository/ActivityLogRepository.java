package com.devops.backend.repository;

import com.devops.backend.model.ActivityLog;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ActivityLogRepository extends MongoRepository<ActivityLog, String> {

    List<ActivityLog> findTop200ByOrderByTimestampDesc();

    List<ActivityLog> findByEntityTypeAndEntityIdOrderByTimestampDesc(String entityType, String entityId);

    List<ActivityLog> findByPerformedByEmailOrderByTimestampDesc(String email);
}
