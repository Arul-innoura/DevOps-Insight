package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Represents a request from a User to add or upgrade a dependency in Nexus.
 * DevOps can accept or reject these requests.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "dependency_requests")
public class DependencyRequest {

    @Id
    private String id;

    private String dependencyName;
    private String groupId;
    private String artifactId;
    private String version;

    @Indexed
    private DependencyType type;

    @Indexed
    private DependencyRequestType requestType;

    @Indexed
    private DependencyRequestStatus status;

    private String vulnerabilitySeverity;

    private String requestedBy;
    private String requestedByEmail;

    // For upgrade requests — the version currently in the database
    private String existingVersion;

    private String rejectionReason;

    private String processedBy;
    private String processedByEmail;

    private Instant createdAt;
    private Instant updatedAt;
    private Instant processedAt;
}
