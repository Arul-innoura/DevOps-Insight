package com.devops.backend.repository;

import com.devops.backend.model.autobuild.CodeCutRequest;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface CodeCutRequestRepository extends MongoRepository<CodeCutRequest, String> {

    List<CodeCutRequest> findByProjectIdOrderByCreatedAtDesc(String projectId);

    List<CodeCutRequest> findByRequestedByEmailIgnoreCaseOrderByCreatedAtDesc(String email);

    List<CodeCutRequest> findByLeadApproverEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
            String email, CodeCutRequest.CodeCutStatus status);

    List<CodeCutRequest> findByManagerApproverEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
            String email, CodeCutRequest.CodeCutStatus status);

    Optional<CodeCutRequest> findTopByProjectIdAndEnvironmentOrderByCreatedAtDesc(
            String projectId, String environment);

    /** Find the CodeCutRequest created from a specific ticket (by ticket id). */
    Optional<CodeCutRequest> findTopByTicketIdOrderByCreatedAtDesc(String ticketId);
}
