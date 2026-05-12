package com.devops.backend.repository;

import com.devops.backend.model.environment.CloudEnvironment;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CloudEnvironmentRepository extends MongoRepository<CloudEnvironment, String> {
    boolean existsByNameIgnoreCase(String name);
    Optional<CloudEnvironment> findByNameIgnoreCase(String name);
    List<CloudEnvironment> findAllByOrderByNameAsc();
}
