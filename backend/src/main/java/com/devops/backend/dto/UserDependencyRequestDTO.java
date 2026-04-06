package com.devops.backend.dto;

import com.devops.backend.model.DependencyType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for user-initiated dependency add/upgrade requests.
 * Triggered by Add Request / Update Version buttons on scan results.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDependencyRequestDTO {

    @NotBlank(message = "Dependency name is required")
    private String dependencyName;

    private String groupId;
    private String artifactId;

    @NotBlank(message = "Version is required")
    private String version;

    @NotNull(message = "Dependency type is required")
    private DependencyType type;

    @NotBlank(message = "Request type is required (ADD_DEPENDENCY or UPGRADE_VERSION)")
    private String requestType; // ADD_DEPENDENCY or UPGRADE_VERSION

    private String vulnerabilitySeverity; // Overall severity from scan

    private String existingVersion; // For upgrade requests — current version in DB
}
