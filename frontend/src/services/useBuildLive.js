/**
 * React hook that subscribes to live auto-build events for one execution.
 *
 * Primary path: WebSocket events (build:snapshot / build:task / build:log / build:done).
 * Fallback path: HTTP polling every 3 s when WebSocket is not connected, or when the
 * new tab opens before the WebSocket has had time to connect (common race on first load).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import websocketService from "./websocketService";
import { getExecution } from "./codeCutService";

const MAX_LOG_LINES = 1500;
const POLL_INTERVAL_MS = 3000;

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "PARTIAL", "CANCELLED"]);

function appendLog(buffer, serviceId, chunk) {
    if (!chunk) return buffer;
    const next = { ...buffer };
    const lines = (next[serviceId] || []).slice();
    chunk.split(/\r?\n/).forEach((line) => {
        if (line.length === 0) return;
        lines.push(line);
    });
    if (lines.length > MAX_LOG_LINES) {
        next[serviceId] = lines.slice(lines.length - MAX_LOG_LINES);
    } else {
        next[serviceId] = lines;
    }
    return next;
}

function applyTaskUpdate(prev, task, totals) {
    if (!prev) return prev;
    const tasks = (prev.tasks || []).slice();
    const idx = tasks.findIndex((t) => t.serviceId === task.serviceId);
    if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...task };
    } else {
        tasks.push(task);
    }
    return {
        ...prev,
        tasks,
        succeededServices: totals?.succeeded ?? prev.succeededServices,
        failedServices: totals?.failed ?? prev.failedServices,
        totalServices: totals?.total ?? prev.totalServices,
        status: totals?.status ?? prev.status
    };
}

export function useBuildLive(executionId, initialExecution = null) {
    const [execution, setExecution] = useState(initialExecution);
    const [logs, setLogs] = useState({});
    const [connected, setConnected] = useState(false);

    const idRef = useRef(executionId);
    const connectedRef = useRef(false);
    const executionRef = useRef(execution);
    const pollTimerRef = useRef(null);

    useEffect(() => { idRef.current = executionId; }, [executionId]);
    useEffect(() => { executionRef.current = execution; }, [execution]);
    useEffect(() => { connectedRef.current = connected; }, [connected]);

    // Seed state from the initial HTTP fetch.
    useEffect(() => {
        if (initialExecution) setExecution(initialExecution);
        if (initialExecution?.tasks) {
            const seed = {};
            initialExecution.tasks.forEach((t) => {
                if (t?.serviceId && Array.isArray(t.logTail) && t.logTail.length) {
                    seed[t.serviceId] = t.logTail.slice(-MAX_LOG_LINES);
                }
            });
            setLogs(seed);
        }
    }, [initialExecution]);

    // Poll helper — fetches the latest execution snapshot via HTTP and merges it in.
    const pollOnce = useCallback(async () => {
        const id = idRef.current;
        if (!id) return;
        try {
            const exec = await getExecution(id);
            if (!exec) return;
            setExecution(exec);
            // Seed log tails from snapshot (no streaming, but better than nothing).
            if (exec.tasks) {
                setLogs((prev) => {
                    const next = { ...prev };
                    exec.tasks.forEach((t) => {
                        if (t?.serviceId && Array.isArray(t.logTail) && t.logTail.length) {
                            const existing = prev[t.serviceId] || [];
                            // Only replace if snapshot has more lines.
                            if (t.logTail.length >= existing.length) {
                                next[t.serviceId] = t.logTail.slice(-MAX_LOG_LINES);
                            }
                        }
                    });
                    return next;
                });
            }
        } catch {
            // Polling errors are silent — WebSocket or next poll will recover.
        }
    }, []);

    // Manage the polling interval.
    const startPolling = useCallback(() => {
        if (pollTimerRef.current) return; // already running
        pollOnce(); // immediate first fetch
        pollTimerRef.current = setInterval(() => {
            // Stop polling when terminal or WebSocket has taken over.
            const exec = executionRef.current;
            if (connectedRef.current || (exec && TERMINAL_STATUSES.has(exec.status))) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
                return;
            }
            pollOnce();
        }, POLL_INTERVAL_MS);
    }, [pollOnce]);

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    // WebSocket subscriptions + polling fallback.
    useEffect(() => {
        if (!executionId) return undefined;

        const onSnapshot = (data) => {
            const exec = data?.data ?? data;
            if (!exec || exec.id !== idRef.current) return;
            setExecution(exec);
        };
        const onTask = (data) => {
            const payload = data?.data ?? data;
            if (!payload || payload.executionId !== idRef.current) return;
            setExecution((prev) => applyTaskUpdate(prev, payload.task || {}, payload));
        };
        const onLog = (data) => {
            const payload = data?.data ?? data;
            if (!payload || payload.executionId !== idRef.current) return;
            setLogs((prev) => appendLog(prev, payload.serviceId, payload.chunk));
        };
        const onDone = (data) => {
            const exec = data?.data ?? data;
            if (!exec || exec.id !== idRef.current) return;
            setExecution(exec);
            stopPolling();
        };
        const onState = (state) => {
            const isConnected = state === "connected";
            setConnected(isConnected);
            if (isConnected) {
                // WebSocket reconnected — do a one-shot HTTP fetch to catch any
                // events that were broadcast while we were disconnected, then stop polling.
                pollOnce();
                stopPolling();
            } else {
                // WebSocket down — start polling until it comes back.
                startPolling();
            }
        };

        websocketService.connect().catch(() => {});
        const offSnap  = websocketService.on("build:snapshot", onSnapshot);
        const offTask  = websocketService.on("build:task",     onTask);
        const offLog   = websocketService.on("build:log",      onLog);
        const offDone  = websocketService.on("build:done",     onDone);
        const offState = websocketService.onStateChange(onState);

        // Always start with polling so the new tab shows progress even if WebSocket
        // hasn't connected yet. Polling stops automatically once WebSocket is live.
        startPolling();

        return () => {
            offSnap?.();
            offTask?.();
            offLog?.();
            offDone?.();
            offState?.();
            stopPolling();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [executionId]);

    const setExternal = useCallback((exec) => setExecution(exec), []);

    return { execution, logs, connected, setExecution: setExternal };
}

export default useBuildLive;
