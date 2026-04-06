package com.devops.backend.service;

import com.devops.backend.model.workflow.ApprovalLevelConfig;
import com.devops.backend.model.workflow.WorkflowApprover;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WorkflowSnapshotService {

    private final ObjectMapper objectMapper;

    public WorkflowConfiguration parse(String json) {
        if (json == null || json.isBlank()) {
            return WorkflowConfiguration.emptyDefaults();
        }
        try {
            return objectMapper.readValue(json, WorkflowConfiguration.class);
        } catch (JsonProcessingException e) {
            return WorkflowConfiguration.emptyDefaults();
        }
    }

    public String serialize(WorkflowConfiguration configuration) {
        if (configuration == null) {
            configuration = WorkflowConfiguration.emptyDefaults();
        }
        try {
            return objectMapper.writeValueAsString(configuration);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize workflow configuration", e);
        }
    }

    public Optional<WorkflowApprover> firstApproverAtLevel(WorkflowConfiguration cfg, int level) {
        if (cfg == null || cfg.getApprovalLevels() == null) {
            return Optional.empty();
        }
        return cfg.getApprovalLevels().stream()
                .filter(l -> l.getLevel() == level)
                .findFirst()
                .flatMap(l -> l.getApprovers() == null || l.getApprovers().isEmpty()
                        ? Optional.empty()
                        : Optional.of(l.getApprovers().get(0)));
    }

    public List<WorkflowApprover> approversAtLevel(WorkflowConfiguration cfg, int level) {
        if (cfg == null || cfg.getApprovalLevels() == null) {
            return Collections.emptyList();
        }
        return cfg.getApprovalLevels().stream()
                .filter(l -> l.getLevel() == level)
                .findFirst()
                .map(ApprovalLevelConfig::getApprovers)
                .orElse(Collections.emptyList());
    }

    public boolean isApproverAtLevel(WorkflowConfiguration cfg, int level, String email) {
        if (email == null) {
            return false;
        }
        String norm = email.trim().toLowerCase();
        return approversAtLevel(cfg, level).stream()
                .anyMatch(a -> a.getEmail() != null && a.getEmail().trim().equalsIgnoreCase(norm));
    }

    public Optional<WorkflowApprover> firstCostApprover(WorkflowConfiguration cfg) {
        if (cfg == null || cfg.getCostApprovers() == null || cfg.getCostApprovers().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(cfg.getCostApprovers().get(0));
    }
}
