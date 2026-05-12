package com.devops.backend.service.autobuild;

import com.devops.backend.config.TicketWebSocketHandler;
import com.devops.backend.model.autobuild.BuildExecution;
import com.devops.backend.model.autobuild.CodeCutRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Centralised WebSocket broadcaster for auto-build events.
 *
 * <p>Reuses the existing {@link TicketWebSocketHandler} so the frontend's
 * single shared WebSocket connection receives these alongside ticket events.
 */
@Service
@RequiredArgsConstructor
public class BuildBroadcastService {

    private final TicketWebSocketHandler webSocketHandler;

    public void emitCodeCutUpdated(CodeCutRequest request) {
        webSocketHandler.broadcast("codecut:updated", codeCutToMap(request));
    }

    public void emitBuildSnapshot(BuildExecution exec) {
        webSocketHandler.broadcast("build:snapshot", executionToMap(exec));
    }

    public void emitTaskUpdate(BuildExecution exec, BuildExecution.ServiceTask task) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("executionId", exec.getId());
        payload.put("task", taskToMap(task));
        payload.put("succeeded", exec.getSucceededServices());
        payload.put("failed", exec.getFailedServices());
        payload.put("total", exec.getTotalServices());
        payload.put("status", exec.getStatus() == null ? null : exec.getStatus().name());
        payload.put("ts", Instant.now().toEpochMilli());
        webSocketHandler.broadcast("build:task", payload);
    }

    public void emitLog(String executionId, String serviceId, String chunk) {
        if (chunk == null || chunk.isEmpty()) return;
        Map<String, Object> payload = new HashMap<>();
        payload.put("executionId", executionId);
        payload.put("serviceId", serviceId);
        payload.put("chunk", chunk);
        payload.put("ts", Instant.now().toEpochMilli());
        webSocketHandler.broadcast("build:log", payload);
    }

    public void emitDone(BuildExecution exec) {
        webSocketHandler.broadcast("build:done", executionToMap(exec));
    }

    // ---- mapping helpers ----------------------------------------------------

    public Map<String, Object> codeCutToMap(CodeCutRequest r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("projectId", r.getProjectId());
        m.put("projectName", r.getProjectName());
        m.put("environment", r.getEnvironment());
        m.put("branchName", r.getBranchName());
        m.put("commitId", r.getCommitId());
        m.put("status", r.getStatus() == null ? null : r.getStatus().name());
        m.put("requestedByName", r.getRequestedByName());
        m.put("requestedByEmail", r.getRequestedByEmail());
        m.put("leadApproverName", r.getLeadApproverName());
        m.put("leadApproverEmail", r.getLeadApproverEmail());
        m.put("leadApprovalState", r.getLeadApprovalState() == null ? null : r.getLeadApprovalState().name());
        m.put("managerApproverName", r.getManagerApproverName());
        m.put("managerApproverEmail", r.getManagerApproverEmail());
        m.put("managerApprovalState", r.getManagerApprovalState() == null ? null : r.getManagerApprovalState().name());
        m.put("currentBuildExecutionId", r.getCurrentBuildExecutionId());
        m.put("createdAt", r.getCreatedAt() == null ? null : r.getCreatedAt().toString());
        m.put("updatedAt", r.getUpdatedAt() == null ? null : r.getUpdatedAt().toString());
        return m;
    }

    public Map<String, Object> executionToMap(BuildExecution e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("codeCutRequestId", e.getCodeCutRequestId());
        m.put("projectId", e.getProjectId());
        m.put("projectName", e.getProjectName());
        m.put("environment", e.getEnvironment());
        m.put("branchName", e.getBranchName());
        m.put("commitId", e.getCommitId());
        m.put("status", e.getStatus() == null ? null : e.getStatus().name());
        m.put("queuedAt", e.getQueuedAt() == null ? null : e.getQueuedAt().toString());
        m.put("startedAt", e.getStartedAt() == null ? null : e.getStartedAt().toString());
        m.put("finishedAt", e.getFinishedAt() == null ? null : e.getFinishedAt().toString());
        m.put("estimatedTotalMs", e.getEstimatedTotalMs());
        m.put("totalServices", e.getTotalServices());
        m.put("succeededServices", e.getSucceededServices());
        m.put("failedServices", e.getFailedServices());
        m.put("cancelledServices", e.getCancelledServices());
        m.put("triggeredByName", e.getTriggeredByName());
        m.put("triggeredByEmail", e.getTriggeredByEmail());
        List<Map<String, Object>> tasks = e.getTasks() == null ? List.of()
                : e.getTasks().stream().map(this::taskToMap).collect(Collectors.toList());
        m.put("tasks", tasks);
        return m;
    }

    public Map<String, Object> taskToMap(BuildExecution.ServiceTask t) {
        Map<String, Object> m = new HashMap<>();
        m.put("serviceId", t.getServiceId());
        m.put("serviceName", t.getServiceName());
        m.put("jenkinsJobName", t.getJenkinsJobName());
        m.put("dependsOn", t.getDependsOn());
        m.put("wave", t.getWave());
        m.put("status", t.getStatus() == null ? null : t.getStatus().name());
        m.put("currentStage", t.getCurrentStage());
        m.put("progressPercent", t.getProgressPercent());
        m.put("estimatedDurationMs", t.getEstimatedDurationMs());
        m.put("startedAt", t.getStartedAt() == null ? null : t.getStartedAt().toString());
        m.put("finishedAt", t.getFinishedAt() == null ? null : t.getFinishedAt().toString());
        m.put("attempts", t.getAttempts());
        m.put("latestBuildUrl", t.getLatestBuildUrl());
        m.put("logTail", t.getLogTail());
        return m;
    }
}
