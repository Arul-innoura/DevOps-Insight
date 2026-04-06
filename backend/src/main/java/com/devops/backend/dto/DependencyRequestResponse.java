package com.devops.backend.dto;

import com.devops.backend.model.DependencyRequestStatus;
import com.devops.backend.model.DependencyRequestType;
import com.devops.backend.model.DependencyType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DependencyRequestResponse {

    private String id;
    private String dependencyName;
    private String groupId;
    private String artifactId;
    private String version;
    private DependencyType type;
    private DependencyRequestType requestType;
    private DependencyRequestStatus status;
    private String vulnerabilitySeverity;
    private String requestedBy;
    private String requestedByEmail;
    private String existingVersion;
    private String rejectionReason;
    private String processedBy;
    private String processedByEmail;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant processedAt;
}
