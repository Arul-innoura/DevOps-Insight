package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * One auto-build execution. Owned by a {@link CodeCutRequest}.
 * Holds the orchestrator's per-service progress, attempts, and current stage.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "build_executions")
public class BuildExecution {

    @Id
    private String id;

    @Indexed
    private String codeCutRequestId;

    @Indexed
    private String projectId;

    private String projectName;

    @Indexed
    private String environment;

    private String branchName;
    private String commitId;

    /** Snapshot of agent/cluster/protocol/credentials used (for audit + rerun). */
    private String agentLabel;
    private Integer clusters;
    private String gitProtocol;
    private String gitCredentialsId;

    /** Triggered-by user (the one who solved the captcha). */
    private String triggeredByName;
    private String triggeredByEmail;

    @Indexed
    private ExecutionStatus status;

    private Instant queuedAt;
    private Instant startedAt;
    private Instant finishedAt;

    /** ETA in milliseconds for the entire execution (max-per-wave summed). */
    private Long estimatedTotalMs;

    /** Snapshot of per-service tasks. Order is stable for UI rendering. */
    @Builder.Default
    private List<ServiceTask> tasks = new ArrayList<>();

    private Integer totalServices;
    private Integer succeededServices;
    private Integer failedServices;
    private Integer cancelledServices;

    /** Email thread Message-ID — same as on the parent CodeCutRequest. */
    private String emailThreadMessageId;
    private boolean finalEmailSent;

    private String cancelledByName;
    private String cancelledByEmail;
    private Instant cancelledAt;

    public enum ExecutionStatus {
        QUEUED,
        RUNNING,
        SUCCEEDED,
        PARTIAL,
        FAILED,
        CANCELLED
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ServiceTask {
        private String serviceId;
        private String serviceName;
        private String jenkinsJobName;

        /** Snapshot of parametrized flag from ServiceBuildPlan (true = buildWithParameters). */
        @Builder.Default
        private Boolean parametrized = Boolean.TRUE;

        /** Service ids this task waits for. */
        @Builder.Default
        private List<String> dependsOn = new ArrayList<>();

        /** Topological wave (0 = first). Used for column rendering. */
        private Integer wave;

        private TaskStatus status;
        private String currentStage;
        private Integer progressPercent;

        private Long estimatedDurationMs;
        private Instant startedAt;
        private Instant finishedAt;

        /** Tail of console log (most recent lines, capped). Persisted for resume. */
        @Builder.Default
        private List<String> logTail = new ArrayList<>();

        /** Position in Jenkins progressive log (so we keep streaming after restart). */
        private Long logCursor;

        @Builder.Default
        private List<Attempt> attempts = new ArrayList<>();

        /** Convenience: latest attempt's Jenkins build URL. */
        private String latestBuildUrl;

        public enum TaskStatus {
            PENDING,
            QUEUED,
            RUNNING,
            SUCCEEDED,
            FAILED,
            RETRYING,
            CANCELLED,
            SKIPPED
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Attempt {
        private Integer attemptNumber;
        private String queueLocation;
        private Long jenkinsBuildNumber;
        private String jenkinsBuildUrl;
        private String result; // SUCCESS, FAILURE, ABORTED, UNSTABLE
        private String failureStage;
        private Instant startedAt;
        private Instant finishedAt;
        private Long durationMs;
    }
}
