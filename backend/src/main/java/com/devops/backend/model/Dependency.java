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
 * Represents a dependency/artifact available in the local Nexus repository.
 * The database serves as a registry of what exists in Nexus.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "dependencies")
public class Dependency {

    @Id
    private String id;

    @Indexed
    private String name;

    @Indexed
    private String groupId;

    @Indexed
    private String artifactId;

    private String version;

    @Indexed
    private DependencyType type;

    private String description;

    private String addedBy;
    private String addedByEmail;

    private Instant createdAt;
    private Instant updatedAt;
}
