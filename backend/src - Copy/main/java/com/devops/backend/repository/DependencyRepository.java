package com.devops.backend.repository;

import com.devops.backend.model.Dependency;
import com.devops.backend.model.DependencyType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DependencyRepository extends MongoRepository<Dependency, String> {

    @Query("{ '$or': [ " +
           "{ 'name': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'groupId': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'artifactId': { '$regex': ?0, '$options': 'i' } } " +
           "] }")
    List<Dependency> searchByKeyword(String keyword);

    List<Dependency> findByType(DependencyType type);

    Optional<Dependency> findByGroupIdAndArtifactIdAndVersion(String groupId, String artifactId, String version);

    Optional<Dependency> findByGroupIdAndArtifactId(String groupId, String artifactId);

    Optional<Dependency> findByNameAndVersion(String name, String version);

    Optional<Dependency> findByName(String name);

    List<Dependency> findByNameContainingIgnoreCase(String name);

    boolean existsByGroupIdAndArtifactId(String groupId, String artifactId);

    boolean existsByNameIgnoreCase(String name);
}
