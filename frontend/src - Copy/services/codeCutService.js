/**
 * Code-cut / auto-build flow service module.
 * Talks to /api/code-cut on the backend.
 */

import { apiRequest } from "./apiClient";

const enc = encodeURIComponent;

export const CODE_CUT_STATUS = Object.freeze({
    PENDING_APPROVALS: "PENDING_APPROVALS",
    REJECTED: "REJECTED",
    READY_TO_BUILD: "READY_TO_BUILD",
    BUILDING: "BUILDING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    PARTIAL: "PARTIAL",
    CANCELLED: "CANCELLED"
});

export const APPROVAL_STATE = Object.freeze({
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
});

export const TASK_STATUS = Object.freeze({
    PENDING: "PENDING",
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    SUCCEEDED: "SUCCEEDED",
    FAILED: "FAILED",
    RETRYING: "RETRYING",
    CANCELLED: "CANCELLED",
    SKIPPED: "SKIPPED"
});

export const EXECUTION_STATUS = Object.freeze({
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    SUCCEEDED: "SUCCEEDED",
    PARTIAL: "PARTIAL",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
});

/**
 * Create a code cut request (user dashboard).
 */
export const createCodeCut = ({ projectId, projectName, environment, branchName, commitId, note }) =>
    apiRequest(`/code-cut`, {
        method: "POST",
        body: JSON.stringify({ projectId, projectName, environment, branchName, commitId, note })
    });

export const getCodeCut = (id) => apiRequest(`/code-cut/${enc(id)}`);

export const listCodeCutForProject = (projectId) =>
    apiRequest(`/code-cut/project/${enc(projectId)}`);

export const listMyCodeCuts = () => apiRequest(`/code-cut/mine`);

export const listLeadInbox = () => apiRequest(`/code-cut/inbox/lead`);
export const listManagerInbox = () => apiRequest(`/code-cut/inbox/manager`);

export const approveCodeCut = (id, role, note) =>
    apiRequest(`/code-cut/${enc(id)}/approve?role=${enc(role)}`, {
        method: "POST",
        body: JSON.stringify({ note: note || "" })
    });

export const rejectCodeCut = (id, role, note) =>
    apiRequest(`/code-cut/${enc(id)}/reject?role=${enc(role)}`, {
        method: "POST",
        body: JSON.stringify({ note: note || "" })
    });

/** Issue a captcha challenge — returns { challenge: "ABCDE" }. */
export const issueCaptcha = (id) =>
    apiRequest(`/code-cut/${enc(id)}/captcha`, { method: "POST" });

/** Submit captcha + start the build. */
export const triggerBuild = (id, captcha) =>
    apiRequest(`/code-cut/${enc(id)}/trigger`, {
        method: "POST",
        body: JSON.stringify({ captcha })
    });

export const cancelCodeCut = (id) =>
    apiRequest(`/code-cut/${enc(id)}/cancel`, { method: "POST" });

export const cancelExecution = (executionId) =>
    apiRequest(`/code-cut/executions/${enc(executionId)}/cancel`, { method: "POST" });

export const getExecution = (executionId) =>
    apiRequest(`/code-cut/executions/${enc(executionId)}`);

export const listExecutionsForRequest = (requestId) =>
    apiRequest(`/code-cut/executions/by-request/${enc(requestId)}`);

/**
 * Return the CodeCutRequest linked to a ticket (GET, read-only).
 * Resolves to the request object or throws a 404-derived error if none exists.
 */
export const getByTicket = (ticketId) =>
    apiRequest(`/code-cut/by-ticket/${enc(ticketId)}`);

/**
 * Idempotent: find or create a CodeCutRequest for a ticket whose approvals
 * are already complete. Returns a request in READY_TO_BUILD state.
 */
export const ensureForTicket = (ticketId) =>
    apiRequest(`/code-cut/from-ticket/${enc(ticketId)}`, { method: "POST" });

/** Friendly labels for badges. */
export const STATUS_LABEL = {
    PENDING_APPROVALS: "Awaiting approvals",
    REJECTED: "Rejected",
    READY_TO_BUILD: "Ready to build",
    BUILDING: "Building",
    COMPLETED: "Completed",
    FAILED: "Failed",
    PARTIAL: "Partial",
    CANCELLED: "Cancelled"
};

export const STATUS_COLOR = {
    PENDING_APPROVALS: "#f59e0b",
    REJECTED: "#ef4444",
    READY_TO_BUILD: "#3b82f6",
    BUILDING: "#8b5cf6",
    COMPLETED: "#10b981",
    FAILED: "#ef4444",
    PARTIAL: "#f59e0b",
    CANCELLED: "#6b7280"
};

export const TASK_STATUS_COLOR = {
    PENDING: "#94a3b8",
    QUEUED: "#3b82f6",
    RUNNING: "#8b5cf6",
    SUCCEEDED: "#10b981",
    FAILED: "#ef4444",
    RETRYING: "#f59e0b",
    CANCELLED: "#6b7280",
    SKIPPED: "#6b7280"
};
