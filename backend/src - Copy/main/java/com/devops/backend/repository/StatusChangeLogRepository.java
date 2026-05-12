package com.devops.backend.repository;

import com.devops.backend.model.StatusChangeLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface StatusChangeLogRepository extends MongoRepository<StatusChangeLog, String> {

    List<StatusChangeLog> findByMemberEmailIgnoreCaseOrderByChangedAtDesc(String email);

    List<StatusChangeLog> findByChangedAtBetweenOrderByChangedAtDesc(Instant start, Instant end);

    List<StatusChangeLog> findByMemberEmailIgnoreCaseAndChangedAtBetweenOrderByChangedAtAsc(
            String email, Instant start, Instant end);

    List<StatusChangeLog> findByChangedAtBetweenOrderByChangedAtAsc(Instant start, Instant end);
}
