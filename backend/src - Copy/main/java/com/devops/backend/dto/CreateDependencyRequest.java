package com.devops.backend.dto;

import com.devops.backend.model.DependencyType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateDependencyRequest {

    @NotBlank(message = "Dependency name is required")
    private String name;

    private String groupId;
    private String artifactId;

    @NotBlank(message = "Version is required")
    private String version;

    @NotNull(message = "Dependency type is required")
    private DependencyType type;

    private String description;
}
