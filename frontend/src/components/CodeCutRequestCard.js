import React, { useState } from "react";
import {
    GitBranch, GitCommit, Clock, User as UserIcon,
    CheckCircle2, XCircle, ShieldCheck, Zap, AlertTriangle, ExternalLink,
    PlayCircle
} from "lucide-react";
import {
    APPROVAL_STATE, CODE_CUT_STATUS, STATUS_LABEL, STATUS_COLOR,
    approveCodeCut, rejectCodeCut, cancelCodeCut
} from "../services/codeCutService";
import BuildCaptchaModal from "./BuildCaptchaModal";

/**
 * Generic card that renders a single code-cut request and contextual actions.
 *
 * `viewerRole` controls which actions appear:
 *   - "REQUESTER" → Trigger Build (when READY_TO_BUILD), Open live build, Cancel
 *   - "LEAD"      → Approve / Reject as Lead
 *   - "MANAGER"   → Approve / Reject as Manager
 *   - "ADMIN"     → all of the above
 */
export default function CodeCutRequestCard({ request, viewerRole = "REQUESTER", onChange }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [captchaOpen, setCaptchaOpen] = useState(false);
    const [actingNote, setActingNote] = useState("");
    const [actingFor, setActingFor] = useState(null); // "Lead" | "Manager"
    const [actingApprove, setActingApprove] = useState(true);

    const status = request.status;
    const statusColor = STATUS_COLOR[status] || "#6b7280";
    const isPendingApprovals = status === CODE_CUT_STATUS.PENDING_APPROVALS;
    const isReady = status === CODE_CUT_STATUS.READY_TO_BUILD;
    const isBuilding = status === CODE_CUT_STATUS.BUILDING;
    const showApproveAsLead = (viewerRole === "LEAD" || viewerRole === "ADMIN")
        && isPendingApprovals
        && request.leadApprovalState === APPROVAL_STATE.PENDING;
    const showApproveAsManager = (viewerRole === "MANAGER" || viewerRole === "ADMIN")
        && isPendingApprovals
        && request.managerApprovalState === APPROVAL_STATE.PENDING;
    const showTrigger = isReady && (viewerRole === "REQUESTER" || viewerRole === "ADMIN" || viewerRole === "LEAD" || viewerRole === "MANAGER");
    const showOpenLive = (isBuilding
            || status === CODE_CUT_STATUS.COMPLETED
            || status === CODE_CUT_STATUS.FAILED
            || status === CODE_CUT_STATUS.PARTIAL
            || status === CODE_CUT_STATUS.CANCELLED)
        && request.currentBuildExecutionId;

    const submitApproval = async (approve) => {
        if (!actingFor) return;
        setBusy(true);
        setError(null);
        try {
            const result = approve
                ? await approveCodeCut(request.id, actingFor, actingNote)
                : await rejectCodeCut(request.id, actingFor, actingNote);
            setActingFor(null);
            setActingNote("");
            onChange?.(result);
        } catch (e) {
            setError(e.message || "Action failed");
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        if (!window.confirm("Cancel this code cut request? This cannot be undone.")) return;
        setBusy(true);
        setError(null);
        try {
            const result = await cancelCodeCut(request.id);
            onChange?.(result);
        } catch (e) {
            setError(e.message || "Cancel failed");
        } finally {
            setBusy(false);
        }
    };

    const openLive = () => {
        if (!request.currentBuildExecutionId) return;
        const url = `${window.location.origin}/build/${request.currentBuildExecutionId}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="cc-card">
            <div className="cc-card-head">
                <h4 className="cc-card-title">
                    {request.projectName} <span style={{ color: "#94a3b8" }}>/</span> {request.environment}
                </h4>
                <span className="cc-status-pill" style={{ background: statusColor }}>
                    {STATUS_LABEL[status] || status}
                </span>
            </div>
            <div className="cc-meta">
                <span><GitBranch size={12} /> {request.branchName}</span>
                <span><GitCommit size={12} /> {request.commitId || "(latest HEAD)"}</span>
                <span><UserIcon size={12} /> {request.requestedByName}</span>
                {request.createdAt && (
                    <span><Clock size={12} /> {new Date(request.createdAt).toLocaleString()}</span>
                )}
            </div>

            <div className="cc-approval-row">
                <ApprovalChip role="Lead" name={request.leadApproverName || request.leadApproverEmail} state={request.leadApprovalState} />
                <ApprovalChip role="Manager" name={request.managerApproverName || request.managerApproverEmail} state={request.managerApprovalState} />
            </div>

            {request.requesterNote && (
                <p style={{ marginTop: 10, fontSize: 13, color: "#475569" }}>
                    <em>“{request.requesterNote}”</em>
                </p>
            )}

            {error && (
                <div style={{
                    marginTop: 10, padding: 8, borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", fontSize: 12,
                    display: "inline-flex", alignItems: "center", gap: 6
                }}>
                    <AlertTriangle size={12} /> {error}
                </div>
            )}

            <div className="cc-actions">
                {showApproveAsLead && (
                    <>
                        <button
                            type="button"
                            className="cc-btn cc-btn-primary"
                            onClick={() => { setActingFor("Lead"); setActingApprove(true); }}
                            disabled={busy}
                        ><CheckCircle2 size={13} /> Approve as Lead</button>
                        <button
                            type="button"
                            className="cc-btn cc-btn-danger"
                            onClick={() => { setActingFor("Lead"); setActingApprove(false); }}
                            disabled={busy}
                        ><XCircle size={13} /> Reject</button>
                    </>
                )}
                {showApproveAsManager && (
                    <>
                        <button
                            type="button"
                            className="cc-btn cc-btn-primary"
                            onClick={() => { setActingFor("Manager"); setActingApprove(true); }}
                            disabled={busy}
                        ><ShieldCheck size={13} /> Approve as Manager</button>
                        <button
                            type="button"
                            className="cc-btn cc-btn-danger"
                            onClick={() => { setActingFor("Manager"); setActingApprove(false); }}
                            disabled={busy}
                        ><XCircle size={13} /> Reject</button>
                    </>
                )}
                {showTrigger && (
                    <button
                        type="button"
                        className="cc-btn cc-btn-trigger"
                        onClick={() => setCaptchaOpen(true)}
                        disabled={busy}
                        title="Verify human and start the build"
                    ><Zap size={13} /> Trigger Build</button>
                )}
                {showOpenLive && (
                    <button
                        type="button"
                        className="cc-btn cc-btn-secondary"
                        onClick={openLive}
                    ><ExternalLink size={13} /> Open live view</button>
                )}
                {(viewerRole === "REQUESTER" || viewerRole === "ADMIN")
                    && (status === CODE_CUT_STATUS.PENDING_APPROVALS
                        || status === CODE_CUT_STATUS.READY_TO_BUILD) && (
                        <button
                            type="button"
                            className="cc-btn cc-btn-secondary"
                            onClick={cancel}
                            disabled={busy}
                        >Cancel request</button>
                    )}
            </div>

            {/* Inline note prompt for approve/reject */}
            {actingFor && (
                <div style={{
                    marginTop: 12, padding: 12, background: "rgba(99, 102, 241, 0.08)",
                    borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.25)"
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {actingApprove ? "Approve" : "Reject"} as {actingFor} — optional note
                    </div>
                    <textarea
                        rows={2}
                        value={actingNote}
                        onChange={(e) => setActingNote(e.target.value)}
                        placeholder="Add a short note (optional)…"
                        style={{
                            width: "100%", padding: 8, borderRadius: 6,
                            border: "1px solid #cbd5e1", fontSize: 13, fontFamily: "inherit"
                        }}
                    />
                    <div className="cc-actions" style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            className={`cc-btn ${actingApprove ? "cc-btn-primary" : "cc-btn-danger"}`}
                            disabled={busy}
                            onClick={() => submitApproval(actingApprove)}
                        >
                            {busy ? "Submitting…" : actingApprove ? "Confirm Approval" : "Confirm Rejection"}
                        </button>
                        <button
                            type="button"
                            className="cc-btn cc-btn-secondary"
                            onClick={() => { setActingFor(null); setActingNote(""); }}
                            disabled={busy}
                        >Cancel</button>
                    </div>
                </div>
            )}

            {captchaOpen && (
                <BuildCaptchaModal
                    codeCutId={request.id}
                    projectName={request.projectName}
                    onClose={() => setCaptchaOpen(false)}
                    onTriggered={(exec) => onChange?.({ ...request, status: CODE_CUT_STATUS.BUILDING, currentBuildExecutionId: exec?.id })}
                />
            )}
        </div>
    );
}

function ApprovalChip({ role, name, state }) {
    const color = state === APPROVAL_STATE.APPROVED ? "#10b981"
        : state === APPROVAL_STATE.REJECTED ? "#ef4444" : "#f59e0b";
    const icon = state === APPROVAL_STATE.APPROVED ? <CheckCircle2 size={11} />
        : state === APPROVAL_STATE.REJECTED ? <XCircle size={11} /> : <Clock size={11} />;
    return (
        <span className="cc-approval-cell" title={name || role}>
            <span style={{ fontWeight: 700 }}>{role}</span>
            <span style={{ color, display: "inline-flex", alignItems: "center", gap: 3 }}>
                {icon} {state || "PENDING"}
            </span>
            {name && <span style={{ color: "#64748b" }}>· {name}</span>}
        </span>
    );
}
