import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Activity, Wifi, WifiOff, GitBranch, GitCommit, User as UserIcon,
    Server, RefreshCw, XCircle, CheckCircle2, AlertTriangle, MinusCircle,
    Loader2, Clock, Copy, Mail, ExternalLink, ChevronDown, ChevronUp,
    Layers, Hash, Zap
} from "lucide-react";
import "./LiveBuildView.css";
import {
    getExecution, cancelExecution, EXECUTION_STATUS, TASK_STATUS, TASK_STATUS_COLOR
} from "../services/codeCutService";
import { useBuildLive } from "../services/useBuildLive";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(ms) {
    if (ms == null || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function formatEta(elapsedMs, estimatedMs) {
    if (!estimatedMs || estimatedMs <= 0) return "—";
    const remaining = Math.max(0, estimatedMs - (elapsedMs || 0));
    return formatDuration(remaining);
}

function statusIcon(status, size = 16) {
    switch (status) {
        case TASK_STATUS.SUCCEEDED: return <CheckCircle2 size={size} color="#10b981" />;
        case TASK_STATUS.FAILED: return <XCircle size={size} color="#ef4444" />;
        case TASK_STATUS.CANCELLED:
        case TASK_STATUS.SKIPPED: return <MinusCircle size={size} color="#6b7280" />;
        case TASK_STATUS.RUNNING: return <Loader2 size={size} color="#8b5cf6" className="lb-spin" />;
        case TASK_STATUS.RETRYING: return <RefreshCw size={size} color="#f59e0b" className="lb-spin" />;
        case TASK_STATUS.QUEUED: return <Clock size={size} color="#3b82f6" />;
        default: return <Server size={size} color="#94a3b8" />;
    }
}

function isTerminal(execStatus) {
    return [
        EXECUTION_STATUS.SUCCEEDED,
        EXECUTION_STATUS.FAILED,
        EXECUTION_STATUS.PARTIAL,
        EXECUTION_STATUS.CANCELLED
    ].includes(execStatus);
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Card
// ─────────────────────────────────────────────────────────────────────────────

function ServiceCard({ task, logs, expanded, onToggle }) {
    const logRef = useRef(null);
    const status = task.status;
    const color = TASK_STATUS_COLOR[status] || "#94a3b8";
    const attempts = task.attempts || [];
    const attemptCount = attempts.length;
    const isRetrying = status === TASK_STATUS.RETRYING;
    const elapsed = task.startedAt
        ? Math.max(0, Date.now() - new Date(task.startedAt).getTime())
        : 0;
    const eta = task.estimatedDurationMs
        ? formatEta(elapsed, task.estimatedDurationMs)
        : "—";
    const pct = Math.max(0, Math.min(100, task.progressPercent || 0));

    useEffect(() => {
        if (expanded && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs, expanded]);

    return (
        <div className="lb-card" style={{ borderColor: color }}>
            <button
                type="button"
                className="lb-card-head"
                onClick={onToggle}
                aria-expanded={expanded}
            >
                <div className="lb-card-title">
                    <span className="lb-card-icon" style={{ color }}>{statusIcon(status, 18)}</span>
                    <div className="lb-card-name">
                        <strong>{task.serviceName || task.jenkinsJobName || task.serviceId}</strong>
                        <span className="lb-card-job"><GitBranch size={11} /> {task.jenkinsJobName}</span>
                    </div>
                </div>
                <div className="lb-card-right">
                    <span className="lb-pill" style={{ background: color, color: "#fff" }}>
                        {status || "PENDING"}
                    </span>
                    {attemptCount > 1 && (
                        <span className="lb-attempts" title="Attempt count">
                            <RefreshCw size={11} /> {attemptCount}
                        </span>
                    )}
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </button>

            <div className="lb-card-body">
                <div className="lb-stage-row">
                    <span className="lb-stage-label">
                        {isRetrying ? "Retrying" : task.currentStage || (
                            status === TASK_STATUS.PENDING
                                ? ((task.dependsOn?.length > 0 || (task.wave ?? 0) > 0) ? "Waiting on dependencies" : "Queued")
                                : "Initializing"
                        )}
                    </span>
                    <span className="lb-stage-eta"><Clock size={11} /> {eta}</span>
                </div>
                <div className="lb-progress">
                    <div
                        className="lb-progress-fill"
                        style={{
                            width: status === TASK_STATUS.SUCCEEDED ? "100%" : `${pct}%`,
                            background: color
                        }}
                    />
                </div>

                {expanded && (
                    <>
                        <div className="lb-meta-row">
                            {task.latestBuildUrl && (
                                <a
                                    className="lb-link"
                                    href={task.latestBuildUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <ExternalLink size={11} /> Open in Jenkins
                                </a>
                            )}
                            {(task.dependsOn || []).length > 0 && (
                                <span className="lb-deps">
                                    <Layers size={11} /> depends on {task.dependsOn.length}
                                </span>
                            )}
                            <span className="lb-deps">
                                <Hash size={11} /> wave {(task.wave ?? 0) + 1}
                            </span>
                        </div>
                        <div className="lb-log" ref={logRef}>
                            {(logs || task.logTail || []).slice(-400).map((line, i) => (
                                <div key={i} className="lb-log-line">{line}</div>
                            ))}
                            {(!logs || logs.length === 0) && (!task.logTail || task.logTail.length === 0) && (
                                <div className="lb-log-empty">Logs will stream here once the build starts…</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveBuildView() {
    const { executionId } = useParams();
    const [initialExec, setInitialExec] = useState(null);
    const [error, setError] = useState(null);
    const [expandedSet, setExpandedSet] = useState(() => new Set());
    const [cancelling, setCancelling] = useState(false);
    const [, forceTick] = useState(0); // re-render once a second for ticking ETA

    const { execution, logs, connected, setExecution } = useBuildLive(executionId, initialExec);

    useEffect(() => {
        if (!executionId) return;
        let abort = false;
        getExecution(executionId)
            .then((exec) => { if (!abort) setInitialExec(exec); })
            .catch((e) => { if (!abort) setError(e.message || "Failed to load execution"); });
        return () => { abort = true; };
    }, [executionId]);

    useEffect(() => {
        document.title = execution
            ? `Build · ${execution.projectName || ""} · ${execution.environment || ""}`
            : "Live Build · DevOps Insight";
    }, [execution]);

    useEffect(() => {
        const id = setInterval(() => forceTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const tasksByWave = useMemo(() => {
        const map = new Map();
        (execution?.tasks || []).forEach((t) => {
            const w = t.wave ?? 0;
            if (!map.has(w)) map.set(w, []);
            map.get(w).push(t);
        });
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [execution]);

    const counts = useMemo(() => {
        const total = execution?.totalServices ?? (execution?.tasks?.length || 0);
        const succ = execution?.succeededServices ?? 0;
        const fail = execution?.failedServices ?? 0;
        const inflight = (execution?.tasks || []).filter((t) =>
            [TASK_STATUS.RUNNING, TASK_STATUS.QUEUED, TASK_STATUS.RETRYING].includes(t.status)
        ).length;
        const retries = (execution?.tasks || [])
            .reduce((acc, t) => acc + Math.max(0, (t.attempts?.length || 0) - 1), 0);
        return { total, succ, fail, inflight, retries };
    }, [execution]);

    const overallElapsed = execution?.startedAt
        ? Math.max(0, Date.now() - new Date(execution.startedAt).getTime())
        : 0;
    const overallEta = formatEta(overallElapsed, execution?.estimatedTotalMs);
    const headerColor = (() => {
        if (!execution) return "#3b82f6";
        switch (execution.status) {
            case EXECUTION_STATUS.SUCCEEDED: return "#10b981";
            case EXECUTION_STATUS.FAILED: return "#ef4444";
            case EXECUTION_STATUS.PARTIAL: return "#f59e0b";
            case EXECUTION_STATUS.CANCELLED: return "#6b7280";
            case EXECUTION_STATUS.RUNNING: return "#8b5cf6";
            default: return "#3b82f6";
        }
    })();

    const toggleCard = (id) => setExpandedSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const handleCancel = async () => {
        if (!executionId || cancelling) return;
        if (!window.confirm("Cancel this build? Running Jenkins jobs will be stopped.")) return;
        setCancelling(true);
        try {
            const updated = await cancelExecution(executionId);
            setExecution(updated);
        } catch (e) {
            setError(e.message || "Cancel failed");
        } finally {
            setCancelling(false);
        }
    };

    const copyId = () => {
        if (!executionId) return;
        navigator.clipboard?.writeText(executionId).catch(() => {});
    };

    if (error) {
        return (
            <div className="live-build-page">
                <div className="lb-error">
                    <AlertTriangle size={20} /> {error}
                </div>
            </div>
        );
    }

    return (
        <div className="live-build-page">
            <header className="lb-header" style={{ background: `linear-gradient(120deg, ${headerColor}, #0f172a)` }}>
                <div className="lb-title">
                    <div className="lb-title-main">
                        <Zap size={22} />
                        <h1>{execution?.projectName || "Loading…"}</h1>
                        <span className="lb-env-pill">{execution?.environment}</span>
                        <span className="lb-status-pill" style={{ background: headerColor }}>
                            {execution?.status || "QUEUED"}
                        </span>
                    </div>
                    <div className="lb-title-meta">
                        <span><GitBranch size={13} /> {execution?.branchName || "—"}</span>
                        <span><GitCommit size={13} /> {execution?.commitId || "(latest HEAD)"}</span>
                        {execution?.triggeredByName && (
                            <span><UserIcon size={13} /> {execution.triggeredByName}</span>
                        )}
                        <span title="Connection">
                            {connected ? <Wifi size={13} color="#10b981" /> : <WifiOff size={13} color="#f59e0b" />}
                            {connected ? " live" : " polling"}
                        </span>
                        <button type="button" className="lb-id-btn" onClick={copyId} title="Copy execution id">
                            <Copy size={11} /> {executionId?.slice(-10)}
                        </button>
                    </div>
                </div>
                <div className="lb-stats">
                    <div className="lb-stat">
                        <span className="lb-stat-num">{counts.succ}</span>
                        <span className="lb-stat-lbl">Succeeded</span>
                    </div>
                    <div className="lb-stat">
                        <span className="lb-stat-num" style={{ color: "#fca5a5" }}>{counts.fail}</span>
                        <span className="lb-stat-lbl">Failed</span>
                    </div>
                    <div className="lb-stat">
                        <span className="lb-stat-num">{counts.inflight}</span>
                        <span className="lb-stat-lbl">Running</span>
                    </div>
                    <div className="lb-stat">
                        <span className="lb-stat-num">{counts.total}</span>
                        <span className="lb-stat-lbl">Total</span>
                    </div>
                    <div className="lb-stat">
                        <span className="lb-stat-num">{counts.retries}</span>
                        <span className="lb-stat-lbl">Retries</span>
                    </div>
                    <div className="lb-stat">
                        <span className="lb-stat-num">{overallEta}</span>
                        <span className="lb-stat-lbl">ETA</span>
                    </div>
                    {!isTerminal(execution?.status) && (
                        <button
                            type="button"
                            className="lb-cancel-btn"
                            onClick={handleCancel}
                            disabled={cancelling}
                        >
                            <XCircle size={14} /> {cancelling ? "Cancelling…" : "Cancel build"}
                        </button>
                    )}
                </div>
                <div className="lb-overall-bar">
                    <div
                        className="lb-overall-fill"
                        style={{
                            width: counts.total
                                ? `${Math.min(100, ((counts.succ + counts.fail) / counts.total) * 100)}%`
                                : "0%"
                        }}
                    />
                </div>
            </header>

            <main className="lb-main">
                {execution?.status === EXECUTION_STATUS.QUEUED && (
                    <div className="lb-banner lb-banner-warn">
                        <Clock size={16} />
                        <strong>Build queued.</strong>
                        <span>Waiting for the orchestrator to start the first wave…</span>
                    </div>
                )}
                {execution?.status === EXECUTION_STATUS.SUCCEEDED && (
                    <div className="lb-banner lb-banner-success">
                        <CheckCircle2 size={16} />
                        <strong>Build completed successfully.</strong>
                        <span>All services built and deployed.</span>
                    </div>
                )}
                {execution?.status === EXECUTION_STATUS.CANCELLED && (
                    <div className="lb-banner lb-banner-cancel">
                        <MinusCircle size={16} />
                        <strong>Build was cancelled.</strong>
                        <span>All pending and running jobs have been stopped.</span>
                    </div>
                )}
                {execution?.status === EXECUTION_STATUS.FAILED && (
                    <div className="lb-banner lb-banner-fail">
                        <AlertTriangle size={16} />
                        <strong>Build failed after all retries.</strong>
                        <span>Please contact the DevOps team — an alert email has been sent.</span>
                        <a href="mailto:devopsteam@encipherhealth.com" className="lb-banner-link">
                            <Mail size={14} /> Email DevOps
                        </a>
                    </div>
                )}
                {execution?.status === EXECUTION_STATUS.PARTIAL && (
                    <div className="lb-banner lb-banner-warn">
                        <AlertTriangle size={16} />
                        <strong>Some services failed.</strong>
                        <span>See per-service log to investigate.</span>
                    </div>
                )}

                {tasksByWave.length === 0 && (
                    <div className="lb-empty">
                        <Activity size={28} /> Waiting for build orchestrator…
                    </div>
                )}

                {tasksByWave.map(([wave, tasks]) => (
                    <section key={wave} className="lb-wave">
                        <div className="lb-wave-head">
                            <span className="lb-wave-num">Wave {wave + 1}</span>
                            <span className="lb-wave-meta">
                                {tasks.length} service{tasks.length === 1 ? "" : "s"} · {tasks.length > 1 ? "running in parallel" : "single service"}
                            </span>
                        </div>
                        <div className="lb-wave-grid">
                            {tasks.map((t) => (
                                <ServiceCard
                                    key={t.serviceId}
                                    task={t}
                                    logs={logs[t.serviceId]}
                                    expanded={expandedSet.has(t.serviceId)}
                                    onToggle={() => toggleCard(t.serviceId)}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </main>
        </div>
    );
}
