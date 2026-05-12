package com.devops.backend.repository;

import com.devops.backend.model.Project;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectRepository extends MongoRepository<Project, String> {
    boolean existsByNameIgnoreCase(String name);
    List<Project> findAllByOrderByNameAsc();
    Optional<Project> findByNameIgnoreCase(String name);
}
