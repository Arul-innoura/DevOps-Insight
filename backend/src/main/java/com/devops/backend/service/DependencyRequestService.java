package com.devops.backend.service;

import com.devops.backend.dto.DependencyRequestResponse;
import com.devops.backend.dto.ProcessDependencyRequestDTO;
import com.devops.backend.dto.CreateDependencyRequest;
import com.devops.backend.model.*;
import com.devops.backend.repository.DependencyRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class DependencyRequestService {

    private final DependencyRequestRepository requestRepository;
    private final DependencyService dependencyService;

    /**
     * Create a new dependency request (auto-generated from vulnerability scan).
     */
    public DependencyRequest createRequest(
            String dependencyName, String groupId, String artifactId,
            String version, DependencyType type, DependencyRequestType requestType,
            String severity, String existingVersion,
            String requestedBy, String requestedByEmail) {

        log.info("Creating {} request for {} v{} by {}", requestType, dependencyName, version, requestedBy);

        // Check if a pending/accepted request already exists for this dependency+version
        boolean exists;
        List<DependencyRequestStatus> activeStatuses = List.of(DependencyRequestStatus.PENDING, DependencyRequestStatus.ACCEPTED);
        if (groupId != null && artifactId != null && !groupId.isBlank() && !artifactId.isBlank()) {
            exists = requestRepository.existsByGroupIdAndArtifactIdAndVersionAndStatusIn(groupId, artifactId, version, activeStatuses);
        } else {
            exists = requestRepository.existsByDependencyNameAndVersionAndStatusIn(dependencyName, version, activeStatuses);
        }

        if (exists) {
            log.info("Request already exists for {} v{}, skipping creation", dependencyName, version);
            return null;
        }

        DependencyRequest request = DependencyRequest.builder()
                .dependencyName(dependencyName)
                .groupId(groupId)
                .artifactId(artifactId)
                .version(version)
                .type(type)
                .requestType(requestType)
                .status(DependencyRequestStatus.PENDING)
                .vulnerabilitySeverity(severity)
                .existingVersion(existingVersion)
                .requestedBy(requestedBy)
                .requestedByEmail(requestedByEmail)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        return requestRepository.save(request);
    }

    /**
     * Get all requests ordered by creation date.
     */
    public List<DependencyRequestResponse> getAllRequests() {
        return requestRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toResponse).toList();
    }

    /**
     * Get requests filtered by status.
     */
    public List<DependencyRequestResponse> getRequestsByStatus(DependencyRequestStatus status) {
        return requestRepository.findByStatus(status)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Get requests filtered by request type.
     */
    public List<DependencyRequestResponse> getRequestsByType(DependencyRequestType type) {
        return requestRepository.findByRequestType(type)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Search requests by keyword.
     */
    public List<DependencyRequestResponse> searchRequests(String keyword) {
        return requestRepository.searchByKeyword(keyword)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Accept a dependency request — add/update the dependency in the database.
     */
    public DependencyRequestResponse acceptRequest(String requestId, String processedBy, String processedByEmail) {
        log.info("Accepting dependency request {} by {}", requestId, processedBy);

        DependencyRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found: " + requestId));

        if (request.getStatus() != DependencyRequestStatus.PENDING) {
            throw new RuntimeException("Request is already " + request.getStatus());
        }

        request.setStatus(DependencyRequestStatus.ACCEPTED);
        request.setProcessedBy(processedBy);
        request.setProcessedByEmail(processedByEmail);
        request.setProcessedAt(Instant.now());
        request.setUpdatedAt(Instant.now());

        // If ADD_DEPENDENCY, add the dependency to the database
        if (request.getRequestType() == DependencyRequestType.ADD_DEPENDENCY) {
            CreateDependencyRequest createReq = CreateDependencyRequest.builder()
                    .name(request.getDependencyName())
                    .groupId(request.getGroupId())
                    .artifactId(request.getArtifactId())
                    .version(request.getVersion())
                    .type(request.getType())
                    .description("Added via dependency request acceptance")
                    .build();
            dependencyService.addDependency(createReq, processedBy, processedByEmail);
        }

        // If UPGRADE_VERSION, update the version in the database
        if (request.getRequestType() == DependencyRequestType.UPGRADE_VERSION) {
            var existingDep = dependencyService.findByCoordinates(request.getGroupId(), request.getArtifactId());
            if (existingDep.isEmpty()) {
                existingDep = dependencyService.findByName(request.getDependencyName());
            }
            existingDep.ifPresent(dep ->
                dependencyService.updateVersion(dep.getId(), request.getVersion(), processedBy, processedByEmail)
            );
        }

        return toResponse(requestRepository.save(request));
    }

    /**
     * Reject a dependency request.
     */
    public DependencyRequestResponse rejectRequest(String requestId, ProcessDependencyRequestDTO dto,
                                                    String processedBy, String processedByEmail) {
        log.info("Rejecting dependency request {} by {}", requestId, processedBy);

        DependencyRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found: " + requestId));

        if (request.getStatus() != DependencyRequestStatus.PENDING) {
            throw new RuntimeException("Request is already " + request.getStatus());
        }

        request.setStatus(DependencyRequestStatus.REJECTED);
        request.setRejectionReason(dto.getRejectionReason());
        request.setProcessedBy(processedBy);
        request.setProcessedByEmail(processedByEmail);
        request.setProcessedAt(Instant.now());
        request.setUpdatedAt(Instant.now());

        return toResponse(requestRepository.save(request));
    }

    private DependencyRequestResponse toResponse(DependencyRequest req) {
        return DependencyRequestResponse.builder()
                .id(req.getId())
                .dependencyName(req.getDependencyName())
                .groupId(req.getGroupId())
                .artifactId(req.getArtifactId())
                .version(req.getVersion())
                .type(req.getType())
                .requestType(req.getRequestType())
                .status(req.getStatus())
                .vulnerabilitySeverity(req.getVulnerabilitySeverity())
                .requestedBy(req.getRequestedBy())
                .requestedByEmail(req.getRequestedByEmail())
                .existingVersion(req.getExistingVersion())
                .rejectionReason(req.getRejectionReason())
                .processedBy(req.getProcessedBy())
                .processedByEmail(req.getProcessedByEmail())
                .createdAt(req.getCreatedAt())
                .updatedAt(req.getUpdatedAt())
                .processedAt(req.getProcessedAt())
                .build();
    }
}
