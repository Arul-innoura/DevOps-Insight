package com.devops.backend.service.autobuild;

import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.autobuild.BuildExecution;
import com.devops.backend.model.autobuild.CodeCutRequest;
import com.devops.backend.model.autobuild.EnvironmentAutoBuildConfig;
import com.devops.backend.model.autobuild.JenkinsConnection;
import com.devops.backend.model.autobuild.ServiceBuildPlan;
import com.devops.backend.repository.BuildExecutionRepository;
import com.devops.backend.repository.CodeCutRequestRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Orchestrates parameterised Jenkins builds for an entire project's
 * microservice graph in one execution.
 *
 * <p>Algorithm:
 * <ol>
 *     <li>Compute topological waves from {@link ServiceBuildPlan#getDependsOn()}.</li>
 *     <li>For each wave, start every service's Jenkins build in parallel.</li>
 *     <li>A 2-second polling pump fetches Jenkins build status + progressive
 *         console log per running task; updates are persisted and broadcast
 *         to the frontend over WebSocket.</li>
 *     <li>On task failure: retry up to {@code retryAttempts} (default 3)
 *         before marking the task FAILED.</li>
 *     <li>Once all running tasks in a wave reach a terminal state, the next
 *         wave starts. Tasks whose dependencies failed are marked SKIPPED.</li>
 *     <li>When the whole graph is terminal, the final email is sent and the
 *         execution status is computed (SUCCEEDED / PARTIAL / FAILED).</li>
 * </ol>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class BuildOrchestratorService {

    private static final long POLL_INTERVAL_MS = 2000L;
    private static final int LOG_TAIL_LIMIT = 200;

    private final ProjectWorkflowSettingsRepository workflowRepo;
    private final CodeCutRequestRepository codeCutRepo;
    private final BuildExecutionRepository executionRepo;
    private final JenkinsClient jenkinsClient;
    private final BuildEmailService emailService;
    private final BuildBroadcastService broadcaster;

    /** Per-execution mutex to avoid two pumps running for the same execution. */
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    /** Currently scheduled poll futures so we can cancel on stop/cancel. */
    private final Map<String, ScheduledFuture<?>> pumpFutures = new ConcurrentHashMap<>();

    private ScheduledExecutorService scheduler;

    @PostConstruct
    void start() {
        scheduler = Executors.newScheduledThreadPool(4, r -> {
            Thread t = new Thread(r, "auto-build-pump");
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    void stop() {
        if (scheduler != null) scheduler.shutdownNow();
    }

    /**
     * Plan and start a brand-new BuildExecution from an approved CodeCutRequest.
     * Caller must have already verified the captcha.
     */
    public BuildExecution startBuild(CodeCutRequest request, String triggeredByName, String triggeredByEmail) {
        ProjectWorkflowSettings settings = workflowRepo.findByProjectId(request.getProjectId())
                .orElseThrow(() -> new IllegalStateException(
                        "No workflow settings for project " + request.getProjectId()));
        EnvironmentAutoBuildConfig envCfg = Optional.ofNullable(settings.getAutoBuildConfig())
                .map(m -> m.get(request.getEnvironment()))
                .orElseThrow(() -> new IllegalStateException(
                        "No auto-build config for env " + request.getEnvironment()));
        if (Boolean.FALSE.equals(envCfg.getEnabled())) {
            throw new IllegalStateException("Auto-build is disabled for this environment");
        }
        JenkinsConnection conn = settings.getJenkinsConnection();
        if (conn == null || conn.getJenkinsUrl() == null || conn.getJenkinsUrl().isBlank()) {
            throw new IllegalStateException("Jenkins connection is not configured for this project");
        }

        List<ServiceBuildPlan> services = (envCfg.getServices() == null ? List.<ServiceBuildPlan>of() : envCfg.getServices())
                .stream()
                .filter(p -> Boolean.TRUE.equals(p.getEnabled()) || p.getEnabled() == null)
                .filter(p -> p.getJobName() != null && !p.getJobName().isBlank())
                .collect(Collectors.toList());
        if (services.isEmpty()) {
            throw new IllegalStateException("No enabled services configured for this environment");
        }

        Map<String, List<String>> deps = new HashMap<>();
        Map<String, ServiceBuildPlan> byId = new HashMap<>();
        for (ServiceBuildPlan p : services) {
            byId.put(p.getId(), p);
            deps.put(p.getId(), p.getDependsOn() == null ? new ArrayList<>() : new ArrayList<>(p.getDependsOn()));
        }
        // Drop deps to services not in our build set (they're skipped/disabled).
        for (Map.Entry<String, List<String>> e : deps.entrySet()) {
            e.getValue().removeIf(d -> !byId.containsKey(d));
        }
        List<List<String>> waves = topoWaves(deps);

        // Build tasks list in a stable order: by wave then by name.
        List<BuildExecution.ServiceTask> tasks = new ArrayList<>();
        long estimatedTotalMs = 0L;
        for (int w = 0; w < waves.size(); w++) {
            long waveMax = 0L;
            List<String> ids = waves.get(w);
            ids.sort((a, b) -> safeName(byId.get(a)).compareToIgnoreCase(safeName(byId.get(b))));
            for (String id : ids) {
                ServiceBuildPlan p = byId.get(id);
                Long est = jenkinsClient.getEstimatedDuration(conn, resolveJobPath(envCfg, p.getJobName()));
                if (est != null && est > waveMax) waveMax = est;
                BuildExecution.ServiceTask task = BuildExecution.ServiceTask.builder()
                        .serviceId(p.getId())
                        .serviceName(p.getServiceName())
                        .jenkinsJobName(p.getJobName())
                        .parametrized(p.getParametrized() == null ? Boolean.TRUE : p.getParametrized())
                        .dependsOn(new ArrayList<>(deps.get(p.getId())))
                        .wave(w)
                        .status(BuildExecution.ServiceTask.TaskStatus.PENDING)
                        .estimatedDurationMs(est)
                        .progressPercent(0)
                        .logTail(new ArrayList<>())
                        .attempts(new ArrayList<>())
                        .logCursor(0L)
                        .build();
                tasks.add(task);
            }
            estimatedTotalMs += waveMax;
        }

        BuildExecution exec = BuildExecution.builder()
                .codeCutRequestId(request.getId())
                .projectId(request.getProjectId())
                .projectName(request.getProjectName())
                .environment(request.getEnvironment())
                .branchName(request.getBranchName())
                .commitId(request.getCommitId())
                .agentLabel(envCfg.getAgentLabel())
                .clusters(envCfg.getClusters())
                .gitProtocol(envCfg.getGitProtocol())
                .gitCredentialsId(envCfg.getGitCredentialsId())
                .triggeredByName(triggeredByName)
                .triggeredByEmail(triggeredByEmail)
                .status(BuildExecution.ExecutionStatus.QUEUED)
                .queuedAt(Instant.now())
                .estimatedTotalMs(estimatedTotalMs > 0 ? estimatedTotalMs : null)
                .tasks(tasks)
                .totalServices(tasks.size())
                .succeededServices(0)
                .failedServices(0)
                .cancelledServices(0)
                .emailThreadMessageId(request.getEmailThreadMessageId())
                .build();
        exec = executionRepo.save(exec);

        request.setCurrentBuildExecutionId(exec.getId());
        request.setStatus(CodeCutRequest.CodeCutStatus.BUILDING);
        request.setUpdatedAt(Instant.now());
        codeCutRepo.save(request);

        emailService.sendBuildStartedEmail(request, exec);
        broadcaster.emitCodeCutUpdated(request);
        broadcaster.emitBuildSnapshot(exec);

        // Start the pump.
        final String execId = exec.getId();
        ScheduledFuture<?> f = scheduler.scheduleWithFixedDelay(
                () -> safePump(execId),
                500L, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);
        pumpFutures.put(execId, f);
        return exec;
    }

    /** Cancel a running execution. Stops Jenkins builds + skips pending tasks. */
    public BuildExecution cancel(String executionId, String byName, String byEmail) {
        // Use the same per-execution lock as the pump to prevent a race where the
        // pump computes SUCCEEDED and overwrites the CANCELLED status we set here.
        Object lock = locks.computeIfAbsent(executionId, k -> new Object());
        synchronized (lock) {
        return cancelLocked(executionId, byName, byEmail);
        }
    }

    private BuildExecution cancelLocked(String executionId, String byName, String byEmail) {
        BuildExecution exec = executionRepo.findById(executionId)
                .orElseThrow(() -> new IllegalArgumentException("execution not found: " + executionId));
        if (isTerminal(exec.getStatus())) return exec;
        ProjectWorkflowSettings settings = workflowRepo.findByProjectId(exec.getProjectId()).orElse(null);
        JenkinsConnection conn = settings == null ? null : settings.getJenkinsConnection();

        for (BuildExecution.ServiceTask t : exec.getTasks()) {
            if (t.getStatus() == BuildExecution.ServiceTask.TaskStatus.RUNNING
                    || t.getStatus() == BuildExecution.ServiceTask.TaskStatus.QUEUED) {
                if (conn != null && t.getLatestBuildUrl() != null) {
                    try { jenkinsClient.stopBuild(conn, t.getLatestBuildUrl()); }
                    catch (Exception e) { log.warn("[AutoBuild] stop failed: {}", e.getMessage()); }
                }
                t.setStatus(BuildExecution.ServiceTask.TaskStatus.CANCELLED);
                t.setFinishedAt(Instant.now());
            } else if (t.getStatus() == BuildExecution.ServiceTask.TaskStatus.PENDING
                    || t.getStatus() == BuildExecution.ServiceTask.TaskStatus.RETRYING) {
                t.setStatus(BuildExecution.ServiceTask.TaskStatus.CANCELLED);
            }
        }
        exec.setStatus(BuildExecution.ExecutionStatus.CANCELLED);
        exec.setFinishedAt(Instant.now());
        exec.setCancelledByName(byName);
        exec.setCancelledByEmail(byEmail);
        exec.setCancelledAt(Instant.now());
        recountTotals(exec);
        exec = executionRepo.save(exec);

        ScheduledFuture<?> f = pumpFutures.remove(executionId);
        if (f != null) f.cancel(false);

        codeCutRepo.findById(exec.getCodeCutRequestId()).ifPresent(req -> {
            req.setStatus(CodeCutRequest.CodeCutStatus.CANCELLED);
            req.setUpdatedAt(Instant.now());
            codeCutRepo.save(req);
            emailService.sendFinalEmail(req, executionRepo.findById(executionId).orElseThrow());
            broadcaster.emitCodeCutUpdated(req);
        });

        broadcaster.emitDone(exec);
        return exec;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pump — runs every POLL_INTERVAL_MS while the execution is active.
    // ─────────────────────────────────────────────────────────────────────────

    private void safePump(String executionId) {
        Object lock = locks.computeIfAbsent(executionId, k -> new Object());
        synchronized (lock) {
            try {
                pump(executionId);
            } catch (Exception e) {
                log.error("[AutoBuild] pump error for {}: {}", executionId, e.getMessage(), e);
            }
        }
    }

    private void pump(String executionId) {
        BuildExecution exec = executionRepo.findById(executionId).orElse(null);
        if (exec == null || isTerminal(exec.getStatus())) {
            ScheduledFuture<?> f = pumpFutures.remove(executionId);
            if (f != null) f.cancel(false);
            return;
        }
        ProjectWorkflowSettings settings = workflowRepo.findByProjectId(exec.getProjectId()).orElse(null);
        JenkinsConnection conn = settings == null ? null : settings.getJenkinsConnection();
        if (conn == null || conn.getJenkinsUrl() == null || conn.getJenkinsUrl().isBlank()) {
            failExecution(exec, "Jenkins connection not configured — set URL and API token in Admin → Project → Auto Build");
            return;
        }
        EnvironmentAutoBuildConfig envCfg = settings.getAutoBuildConfig() == null ? null
                : settings.getAutoBuildConfig().get(exec.getEnvironment());
        int maxAttempts = envCfg != null && envCfg.getRetryAttempts() != null && envCfg.getRetryAttempts() > 0
                ? envCfg.getRetryAttempts() : 3;

        boolean changed = false;
        if (exec.getStatus() == BuildExecution.ExecutionStatus.QUEUED) {
            exec.setStatus(BuildExecution.ExecutionStatus.RUNNING);
            exec.setStartedAt(Instant.now());
            // Persist the RUNNING status immediately so the frontend sees it on the
            // next HTTP poll even if no task changes happen this tick.
            executionRepo.save(exec);
            broadcaster.emitBuildSnapshot(exec);
        }

        // 1) Drive existing running tasks.
        for (BuildExecution.ServiceTask task : exec.getTasks()) {
            if (task.getStatus() == BuildExecution.ServiceTask.TaskStatus.QUEUED
                    || task.getStatus() == BuildExecution.ServiceTask.TaskStatus.RUNNING
                    || task.getStatus() == BuildExecution.ServiceTask.TaskStatus.RETRYING) {
                if (driveRunning(exec, task, conn, envCfg, maxAttempts)) changed = true;
            }
        }

        // 2) Start anything whose deps are now satisfied.
        for (BuildExecution.ServiceTask task : exec.getTasks()) {
            if (task.getStatus() == BuildExecution.ServiceTask.TaskStatus.PENDING) {
                Optional<DependencyVerdict> verdict = depsReady(exec, task);
                if (verdict.isPresent()) {
                    DependencyVerdict v = verdict.get();
                    if (v == DependencyVerdict.SKIP) {
                        task.setStatus(BuildExecution.ServiceTask.TaskStatus.SKIPPED);
                        task.setFinishedAt(Instant.now());
                        appendLog(task, "[skipped] dependency failed");
                        broadcaster.emitTaskUpdate(exec, task);
                        changed = true;
                    } else if (v == DependencyVerdict.START) {
                        if (startTask(exec, task, conn, envCfg)) changed = true;
                    }
                }
            }
        }

        // 3) Final state?
        boolean allDone = exec.getTasks().stream().allMatch(t -> isTaskTerminal(t.getStatus()));
        if (allDone) {
            recountTotals(exec);
            int succeeded = exec.getSucceededServices() == null ? 0 : exec.getSucceededServices();
            int failed = exec.getFailedServices() == null ? 0 : exec.getFailedServices();
            int total = exec.getTotalServices() == null ? exec.getTasks().size() : exec.getTotalServices();
            BuildExecution.ExecutionStatus finalStatus;
            if (failed == 0 && succeeded > 0 && succeeded == total) {
                finalStatus = BuildExecution.ExecutionStatus.SUCCEEDED;
            } else if (failed > 0 && succeeded > 0) {
                finalStatus = BuildExecution.ExecutionStatus.PARTIAL;
            } else if (failed > 0) {
                finalStatus = BuildExecution.ExecutionStatus.FAILED;
            } else {
                finalStatus = BuildExecution.ExecutionStatus.CANCELLED;
            }
            exec.setStatus(finalStatus);
            exec.setFinishedAt(Instant.now());
            BuildExecution saved = executionRepo.save(exec);
            ScheduledFuture<?> f = pumpFutures.remove(executionId);
            if (f != null) f.cancel(false);

            codeCutRepo.findById(exec.getCodeCutRequestId()).ifPresent(req -> {
                req.setStatus(switch (finalStatus) {
                    case SUCCEEDED -> CodeCutRequest.CodeCutStatus.COMPLETED;
                    case FAILED -> CodeCutRequest.CodeCutStatus.FAILED;
                    case PARTIAL -> CodeCutRequest.CodeCutStatus.PARTIAL;
                    case CANCELLED -> CodeCutRequest.CodeCutStatus.CANCELLED;
                    default -> CodeCutRequest.CodeCutStatus.COMPLETED;
                });
                req.setUpdatedAt(Instant.now());
                codeCutRepo.save(req);
                if (!saved.isFinalEmailSent()) {
                    emailService.sendFinalEmail(req, saved);
                    saved.setFinalEmailSent(true);
                    executionRepo.save(saved);
                }
                broadcaster.emitCodeCutUpdated(req);
            });
            broadcaster.emitDone(saved);
            return;
        }

        if (changed) {
            recountTotals(exec);
            executionRepo.save(exec);
        }
    }

    /** Start a single task's Jenkins job. Returns true if state changed. */
    private boolean startTask(BuildExecution exec, BuildExecution.ServiceTask task,
                              JenkinsConnection conn, EnvironmentAutoBuildConfig envCfg) {
        if (task.getAttempts() == null) task.setAttempts(new ArrayList<>());
        int attemptNumber = task.getAttempts().size() + 1;
        try {
            Map<String, String> params = JenkinsClient.params();
            params.put("BRANCH_NAME", exec.getBranchName());
            params.put("COMMIT_ID", exec.getCommitId() == null ? "" : exec.getCommitId());
            params.put("AGENT_LABEL", envCfg != null && envCfg.getAgentLabel() != null ? envCfg.getAgentLabel() : "any");
            params.put("CLUSTERS", String.valueOf(envCfg != null && envCfg.getClusters() != null ? envCfg.getClusters() : 1));
            params.put("GIT_PROTOCOL", envCfg != null && envCfg.getGitProtocol() != null ? envCfg.getGitProtocol() : "ssh");
            params.put("GIT_CREDENTIALS_ID", envCfg != null && envCfg.getGitCredentialsId() != null ? envCfg.getGitCredentialsId() : "");
            params.put("ENVIRONMENT", exec.getEnvironment());
            params.put("SERVICE_NAME", task.getServiceName());

            String jobPath = resolveJobPath(envCfg, task.getJenkinsJobName());
            // env-level flag overrides per-service flag when it's explicitly false
            boolean envUseParams = envCfg == null || !Boolean.FALSE.equals(envCfg.getUseParameters());
            boolean useParams = envUseParams && !Boolean.FALSE.equals(task.getParametrized());
            JenkinsClient.TriggerResult tr = jenkinsClient.triggerBuild(conn, jobPath, params, useParams);

            BuildExecution.Attempt att = BuildExecution.Attempt.builder()
                    .attemptNumber(attemptNumber)
                    .queueLocation(tr.getQueueLocation())
                    .startedAt(Instant.now())
                    .build();
            task.getAttempts().add(att);
            task.setStatus(BuildExecution.ServiceTask.TaskStatus.QUEUED);
            task.setStartedAt(task.getStartedAt() != null ? task.getStartedAt() : Instant.now());
            task.setLogCursor(0L);
            task.setProgressPercent(1);
            appendLog(task, "[queued] attempt " + attemptNumber + " — " + tr.getQueueLocation());
            broadcaster.emitTaskUpdate(exec, task);
            return true;
        } catch (Exception e) {
            log.error("[AutoBuild] trigger failed for {}: {}", task.getJenkinsJobName(), e.getMessage());
            // Record the trigger failure as an attempt so the retry counter properly
            // increments. Without this, attemptCount stays 0 forever and retries loop.
            BuildExecution.Attempt failedAtt = BuildExecution.Attempt.builder()
                    .attemptNumber(attemptNumber)
                    .startedAt(Instant.now())
                    .finishedAt(Instant.now())
                    .result("TRIGGER_ERROR")
                    .failureStage("TRIGGER")
                    .build();
            task.getAttempts().add(failedAtt);
            appendLog(task, "[error] attempt " + attemptNumber + " trigger failed: " + e.getMessage());
            int maxAttempts = envCfg != null && envCfg.getRetryAttempts() != null ? envCfg.getRetryAttempts() : 3;
            return handleAttemptFailure(exec, task, "TRIGGER_ERROR", maxAttempts);
        }
    }

    private boolean driveRunning(BuildExecution exec, BuildExecution.ServiceTask task,
                                 JenkinsConnection conn, EnvironmentAutoBuildConfig envCfg, int maxAttempts) {
        if (task.getAttempts() == null || task.getAttempts().isEmpty()) return false;
        BuildExecution.Attempt att = task.getAttempts().get(task.getAttempts().size() - 1);
        boolean changed = false;

        // If the last attempt failed during the trigger (no queue location was ever
        // issued), re-trigger now. This is the only place a RETRYING task gets
        // re-launched — keeping it here (driven by the pump schedule) prevents the
        // unbounded recursion that happens when retrying inline.
        if (att.getJenkinsBuildUrl() == null && att.getQueueLocation() == null) {
            return startTask(exec, task, conn, envCfg);
        }

        // Promote QUEUED → RUNNING by polling the queue item if no buildUrl yet.
        if (att.getJenkinsBuildUrl() == null) {
            try {
                JenkinsClient.QueueItem q = jenkinsClient.pollQueue(conn, att.getQueueLocation());
                if (q.isCancelled()) {
                    appendLog(task, "[cancelled] queue item cancelled");
                    return handleAttemptFailure(exec, task, "QUEUE_CANCELLED", maxAttempts);
                }
                if (q.isExecutable() && q.getBuildUrl() != null) {
                    att.setJenkinsBuildNumber(q.getBuildNumber());
                    att.setJenkinsBuildUrl(q.getBuildUrl());
                    task.setLatestBuildUrl(q.getBuildUrl());
                    task.setStatus(BuildExecution.ServiceTask.TaskStatus.RUNNING);
                    appendLog(task, "[running] build #" + q.getBuildNumber() + " — " + q.getBuildUrl());
                    broadcaster.emitTaskUpdate(exec, task);
                    return true;
                }
                return false;
            } catch (Exception e) {
                log.warn("[AutoBuild] queue poll failed: {}", e.getMessage());
                return false;
            }
        }

        // Already RUNNING — fetch progressive log + status.
        try {
            JenkinsClient.ConsoleChunk chunk = jenkinsClient.getProgressiveLog(conn,
                    att.getJenkinsBuildUrl(), task.getLogCursor() == null ? 0L : task.getLogCursor());
            if (chunk.getText() != null && !chunk.getText().isEmpty()) {
                task.setLogCursor(chunk.getNextStart());
                String stage = jenkinsClient.detectStage(chunk.getText());
                if (stage != null && !stage.equals(task.getCurrentStage())) {
                    task.setCurrentStage(stage);
                    appendLog(task, "[stage] " + stage);
                }
                appendLog(task, chunk.getText());
                broadcaster.emitLog(exec.getId(), task.getServiceId(), chunk.getText());
                changed = true;
            }
        } catch (Exception e) {
            log.debug("[AutoBuild] progressive log fetch failed: {}", e.getMessage());
        }

        try {
            JenkinsClient.BuildStatus status = jenkinsClient.getBuildStatus(conn, att.getJenkinsBuildUrl());
            if (status.getEstimatedDurationMs() > 0) {
                task.setEstimatedDurationMs(status.getEstimatedDurationMs());
            }
            // Compute progress from elapsed vs estimated.
            if (task.getStartedAt() != null && task.getEstimatedDurationMs() != null
                    && task.getEstimatedDurationMs() > 0) {
                long elapsed = Math.max(0L, Instant.now().toEpochMilli() - task.getStartedAt().toEpochMilli());
                int pct = (int) Math.min(99L, (elapsed * 99L) / task.getEstimatedDurationMs());
                task.setProgressPercent(pct);
            }
            if (!status.isBuilding() && status.getResult() != null) {
                att.setResult(status.getResult());
                att.setFinishedAt(Instant.now());
                att.setDurationMs(status.getDurationMs());
                if ("SUCCESS".equalsIgnoreCase(status.getResult())) {
                    task.setStatus(BuildExecution.ServiceTask.TaskStatus.SUCCEEDED);
                    task.setFinishedAt(Instant.now());
                    task.setProgressPercent(100);
                    appendLog(task, "[done] " + status.getResult());
                    broadcaster.emitTaskUpdate(exec, task);
                    return true;
                } else {
                    att.setFailureStage(task.getCurrentStage());
                    appendLog(task, "[failed] " + status.getResult() + (task.getCurrentStage() != null
                            ? " at stage " + task.getCurrentStage() : ""));
                    boolean stateChanged = handleAttemptFailure(exec, task, status.getResult(), maxAttempts);
                    return stateChanged || changed;
                }
            }
        } catch (Exception e) {
            log.debug("[AutoBuild] build status poll failed: {}", e.getMessage());
        }

        if (changed) broadcaster.emitTaskUpdate(exec, task);
        return changed;
    }

    /**
     * Mark an attempt failed; either schedule a retry or permanently fail the task.
     *
     * <p>IMPORTANT: do NOT call {@code startTask} here. Retrying inline causes
     * unbounded recursion (each failed trigger immediately calls this again).
     * Instead, set the task to RETRYING and let the next pump tick re-trigger it
     * via {@link #driveRunning}.
     */
    private boolean handleAttemptFailure(BuildExecution exec, BuildExecution.ServiceTask task,
                                         String reason, int maxAttempts) {
        int attemptCount = task.getAttempts() == null ? 0 : task.getAttempts().size();
        if (attemptCount < maxAttempts) {
            task.setStatus(BuildExecution.ServiceTask.TaskStatus.RETRYING);
            appendLog(task, "[retry] attempt " + attemptCount + "/" + maxAttempts + " failed ("
                    + reason + ") — will retry on next tick");
            broadcaster.emitTaskUpdate(exec, task);
            return true;
        }
        // All attempts exhausted — mark as failed.
        task.setStatus(BuildExecution.ServiceTask.TaskStatus.FAILED);
        task.setFinishedAt(Instant.now());
        task.setProgressPercent(100);
        appendLog(task, "[failed] all " + maxAttempts + " attempt(s) exhausted (" + reason + ")");
        broadcaster.emitTaskUpdate(exec, task);
        return true;
    }

    private enum DependencyVerdict { START, SKIP }

    private Optional<DependencyVerdict> depsReady(BuildExecution exec, BuildExecution.ServiceTask task) {
        if (task.getDependsOn() == null || task.getDependsOn().isEmpty()) {
            return Optional.of(DependencyVerdict.START);
        }
        Map<String, BuildExecution.ServiceTask> byId = exec.getTasks().stream()
                .collect(Collectors.toMap(BuildExecution.ServiceTask::getServiceId, t -> t, (a, b) -> a));
        boolean allDone = true;
        for (String depId : task.getDependsOn()) {
            BuildExecution.ServiceTask dep = byId.get(depId);
            if (dep == null) continue;
            BuildExecution.ServiceTask.TaskStatus s = dep.getStatus();
            if (s == BuildExecution.ServiceTask.TaskStatus.FAILED
                    || s == BuildExecution.ServiceTask.TaskStatus.CANCELLED
                    || s == BuildExecution.ServiceTask.TaskStatus.SKIPPED) {
                return Optional.of(DependencyVerdict.SKIP);
            }
            if (s != BuildExecution.ServiceTask.TaskStatus.SUCCEEDED) {
                allDone = false;
            }
        }
        return allDone ? Optional.of(DependencyVerdict.START) : Optional.empty();
    }

    private void failExecution(BuildExecution exec, String reason) {
        exec.setStatus(BuildExecution.ExecutionStatus.FAILED);
        exec.setFinishedAt(Instant.now());
        for (BuildExecution.ServiceTask t : exec.getTasks()) {
            if (!isTaskTerminal(t.getStatus())) {
                t.setStatus(BuildExecution.ServiceTask.TaskStatus.FAILED);
                appendLog(t, "[failed] " + reason);
            }
        }
        recountTotals(exec);
        executionRepo.save(exec);
        ScheduledFuture<?> f = pumpFutures.remove(exec.getId());
        if (f != null) f.cancel(false);
        codeCutRepo.findById(exec.getCodeCutRequestId()).ifPresent(req -> {
            req.setStatus(CodeCutRequest.CodeCutStatus.FAILED);
            req.setUpdatedAt(Instant.now());
            codeCutRepo.save(req);
            emailService.sendFinalEmail(req, exec);
        });
        broadcaster.emitDone(exec);
    }

    private void recountTotals(BuildExecution exec) {
        int succ = 0, fail = 0, canc = 0;
        for (BuildExecution.ServiceTask t : exec.getTasks()) {
            switch (t.getStatus()) {
                case SUCCEEDED -> succ++;
                case FAILED -> fail++;
                case CANCELLED, SKIPPED -> canc++;
                default -> { /* in-flight */ }
            }
        }
        exec.setSucceededServices(succ);
        exec.setFailedServices(fail);
        exec.setCancelledServices(canc);
    }

    private static boolean isTerminal(BuildExecution.ExecutionStatus s) {
        return s == BuildExecution.ExecutionStatus.SUCCEEDED
                || s == BuildExecution.ExecutionStatus.FAILED
                || s == BuildExecution.ExecutionStatus.PARTIAL
                || s == BuildExecution.ExecutionStatus.CANCELLED;
    }

    private static boolean isTaskTerminal(BuildExecution.ServiceTask.TaskStatus s) {
        return s == BuildExecution.ServiceTask.TaskStatus.SUCCEEDED
                || s == BuildExecution.ServiceTask.TaskStatus.FAILED
                || s == BuildExecution.ServiceTask.TaskStatus.CANCELLED
                || s == BuildExecution.ServiceTask.TaskStatus.SKIPPED;
    }

    private static void appendLog(BuildExecution.ServiceTask task, String text) {
        if (text == null || text.isBlank()) return;
        if (task.getLogTail() == null) task.setLogTail(new ArrayList<>());
        for (String line : text.split("\\r?\\n")) {
            if (line.isBlank()) continue;
            task.getLogTail().add(line);
        }
        if (task.getLogTail().size() > LOG_TAIL_LIMIT) {
            int from = task.getLogTail().size() - LOG_TAIL_LIMIT;
            task.setLogTail(new ArrayList<>(task.getLogTail().subList(from, task.getLogTail().size())));
        }
    }

    /** Kahn's algorithm — returns waves where each wave is a list of node ids. */
    private static List<List<String>> topoWaves(Map<String, List<String>> deps) {
        Map<String, Set<String>> remaining = new HashMap<>();
        for (Map.Entry<String, List<String>> e : deps.entrySet()) {
            remaining.put(e.getKey(), new HashSet<>(e.getValue()));
        }
        List<List<String>> waves = new ArrayList<>();
        while (!remaining.isEmpty()) {
            List<String> wave = remaining.entrySet().stream()
                    .filter(e -> e.getValue().isEmpty())
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toList());
            if (wave.isEmpty()) {
                // Cycle — flatten the rest into a final wave to avoid blocking forever.
                wave = new ArrayList<>(remaining.keySet());
            }
            Collections.sort(wave);
            waves.add(wave);
            for (String done : wave) remaining.remove(done);
            for (Set<String> pending : remaining.values()) pending.removeAll(wave);
        }
        return waves;
    }

    private static String safeName(ServiceBuildPlan p) {
        return p == null || p.getServiceName() == null ? "" : p.getServiceName();
    }

    /**
     * Prepend the environment-level Jenkins folder to the service job name.
     * Examples:
     *   folder="Platform/Services", jobName="auth-service" → "Platform/Services/auth-service"
     *   folder="",                  jobName="auth-service" → "auth-service"
     *   folder=null,                jobName="jobs/auth"    → "jobs/auth"  (already qualified)
     */
    private static String resolveJobPath(EnvironmentAutoBuildConfig envCfg, String jobName) {
        if (jobName == null) return "";
        String folder = envCfg != null ? envCfg.getJenkinsFolder() : null;
        if (folder == null || folder.isBlank()) return jobName;
        String f = folder.replaceAll("/+$", "");
        String j = jobName.replaceAll("^/+", "");
        return f + "/" + j;
    }
}
