package com.devops.backend.dto;

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
public class DependencyResponse {

    private String id;
    private String name;
    private String groupId;
    private String artifactId;
    private String version;
    private DependencyType type;
    private String description;
    private String addedBy;
    private String addedByEmail;
    private Instant createdAt;
    private Instant updatedAt;
}
