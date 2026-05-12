package com.devops.backend.service;

import com.devops.backend.model.workflow.WorkflowApprover;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

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

    public Optional<WorkflowApprover> firstCostApprover(WorkflowConfiguration cfg) {
        if (cfg == null || cfg.getCostApprovers() == null || cfg.getCostApprovers().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(cfg.getCostApprovers().get(0));
    }
}
