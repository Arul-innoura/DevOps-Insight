package com.devops.backend.service.impl;

import com.devops.backend.dto.ProjectRequest;
import com.devops.backend.model.Project;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.service.EventPublisherService;
import com.devops.backend.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProjectServiceImpl implements ProjectService {

    private final ProjectRepository projectRepository;
    private final EventPublisherService eventPublisher;

    @Override
    public List<Project> getProjects() {
        return projectRepository.findAllByOrderByNameAsc();
    }

    @Override
    public Project addProject(ProjectRequest request, String actorName) {
        String name = request.getName().trim();
        if (projectRepository.existsByNameIgnoreCase(name)) {
            throw new IllegalStateException("Project already exists");
        }

        Project project = Project.builder()
                .name(name)
                .tag(request.getTag() != null ? request.getTag().trim() : null)
                .environments(request.getEnvironments() == null ? List.of() : request.getEnvironments().stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toList()))
                .createdAt(Instant.now())
                .createdBy(actorName != null && !actorName.isBlank() ? actorName : "Admin")
                .build();

        Project saved = projectRepository.save(project);
        eventPublisher.publishProjectEvent("created", saved);
        return saved;
    }

    @Override
    public Project updateProjectEnvironments(String projectId, List<String> environments, String actorName) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        if (environments != null) {
            for (String e : environments) {
                if (e == null) {
                    continue;
                }
                String t = e.trim();
                if (!t.isEmpty()) {
                    ordered.add(t);
                }
            }
        }
        project.setEnvironments(List.copyOf(ordered));
        Project saved = projectRepository.save(project);
        eventPublisher.publishProjectEvent("updated", saved);
        return saved;
    }
}
