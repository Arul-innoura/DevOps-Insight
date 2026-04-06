package com.devops.backend.repository;

import com.devops.backend.model.DependencyRequest;
import com.devops.backend.model.DependencyRequestStatus;
import com.devops.backend.model.DependencyRequestType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DependencyRequestRepository extends MongoRepository<DependencyRequest, String> {

    List<DependencyRequest> findByStatus(DependencyRequestStatus status);

    List<DependencyRequest> findByRequestType(DependencyRequestType requestType);

    List<DependencyRequest> findByStatusAndRequestType(DependencyRequestStatus status, DependencyRequestType requestType);

    List<DependencyRequest> findByRequestedByEmail(String email);

    List<DependencyRequest> findAllByOrderByCreatedAtDesc();

    @Query("{ '$or': [ " +
           "{ 'dependencyName': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'groupId': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'artifactId': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'requestedBy': { '$regex': ?0, '$options': 'i' } } " +
           "] }")
    List<DependencyRequest> searchByKeyword(String keyword);

    boolean existsByDependencyNameAndVersionAndStatusIn(String name, String version, List<DependencyRequestStatus> statuses);

    boolean existsByGroupIdAndArtifactIdAndVersionAndStatusIn(String groupId, String artifactId, String version, List<DependencyRequestStatus> statuses);
}
