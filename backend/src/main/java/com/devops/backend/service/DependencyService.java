package com.devops.backend.service;

import com.devops.backend.dto.CreateDependencyRequest;
import com.devops.backend.dto.DependencyResponse;
import com.devops.backend.model.Dependency;
import com.devops.backend.model.DependencyType;
import com.devops.backend.repository.DependencyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DependencyService {

    private final DependencyRepository dependencyRepository;

    /**
     * Add a new dependency to the database (represents it existing in Nexus).
     */
    public DependencyResponse addDependency(CreateDependencyRequest request, String userName, String userEmail) {
        log.info("Adding dependency: {} v{} by {}", request.getName(), request.getVersion(), userName);

        Dependency dependency = Dependency.builder()
                .name(request.getName())
                .groupId(request.getGroupId())
                .artifactId(request.getArtifactId())
                .version(request.getVersion())
                .type(request.getType())
                .description(request.getDescription())
                .addedBy(userName)
                .addedByEmail(userEmail)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        Dependency saved = dependencyRepository.save(dependency);
        return toResponse(saved);
    }

    /**
     * Search dependencies by keyword (name, groupId, artifactId).
     */
    public List<DependencyResponse> searchDependencies(String keyword) {
        log.info("Searching dependencies with keyword: {}", keyword);
        List<Dependency> results = dependencyRepository.searchByKeyword(keyword);
        return results.stream().map(this::toResponse).toList();
    }

    /**
     * Get all dependencies.
     */
    public List<DependencyResponse> getAllDependencies() {
        return dependencyRepository.findAll().stream().map(this::toResponse).toList();
    }

    /**
     * Get dependencies by type.
     */
    public List<DependencyResponse> getDependenciesByType(DependencyType type) {
        return dependencyRepository.findByType(type).stream().map(this::toResponse).toList();
    }

    /**
     * Delete a dependency from the database.
     */
    public void deleteDependency(String id) {
        log.info("Deleting dependency: {}", id);
        dependencyRepository.deleteById(id);
    }

    /**
     * Find dependency by Maven coordinates.
     */
    public Optional<Dependency> findByCoordinates(String groupId, String artifactId) {
        if (groupId != null && artifactId != null && !groupId.isBlank() && !artifactId.isBlank()) {
            return dependencyRepository.findByGroupIdAndArtifactId(groupId, artifactId);
        }
        return Optional.empty();
    }

    /**
     * Find dependency by name.
     */
    public Optional<Dependency> findByName(String name) {
        return dependencyRepository.findByName(name);
    }

    /**
     * Check if a dependency exists in the local DB and return status info.
     * Used by the dependency-check endpoint for the user search flow.
     */
    public java.util.Map<String, Object> checkDependency(String name, String version) {
        java.util.Map<String, Object> result = new java.util.HashMap<>();

        Optional<Dependency> dep = findByName(name);
        if (dep.isEmpty()) {
            // Try partial match
            var partials = dependencyRepository.findByNameContainingIgnoreCase(name);
            if (!partials.isEmpty()) {
                dep = Optional.of(partials.get(0));
            }
        }

        if (dep.isPresent()) {
            result.put("availableInNexus", true);
            result.put("nexusVersion", dep.get().getVersion());
            result.put("versionMatch", dep.get().getVersion().equals(version));
            result.put("dependency", toResponse(dep.get()));
        } else {
            result.put("availableInNexus", false);
            result.put("nexusVersion", null);
            result.put("versionMatch", false);
            result.put("dependency", null);
        }
        return result;
    }

    /**
     * Update dependency version (used when an upgrade request is accepted).
     */
    public DependencyResponse updateVersion(String id, String newVersion, String userName, String userEmail) {
        log.info("Updating dependency {} to version {} by {}", id, newVersion, userName);
        Dependency dep = dependencyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Dependency not found: " + id));
        dep.setVersion(newVersion);
        dep.setUpdatedAt(Instant.now());
        return toResponse(dependencyRepository.save(dep));
    }

    private DependencyResponse toResponse(Dependency dep) {
        return DependencyResponse.builder()
                .id(dep.getId())
                .name(dep.getName())
                .groupId(dep.getGroupId())
                .artifactId(dep.getArtifactId())
                .version(dep.getVersion())
                .type(dep.getType())
                .description(dep.getDescription())
                .addedBy(dep.getAddedBy())
                .addedByEmail(dep.getAddedByEmail())
                .createdAt(dep.getCreatedAt())
                .updatedAt(dep.getUpdatedAt())
                .build();
    }
}
