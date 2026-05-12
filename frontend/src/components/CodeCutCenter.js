import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Inbox, Plus, RefreshCw, AlertTriangle, ListChecks } from "lucide-react";
import {
    listMyCodeCuts, listLeadInbox, listManagerInbox,
    listCodeCutForProject, createCodeCut
} from "../services/codeCutService";
import websocketService from "../services/websocketService";
import CodeCutRequestCard from "./CodeCutRequestCard";

/**
 * Combined "Code Cut Center" that all dashboards can drop in.
 *
 * Sections shown depend on the {@code roles} prop:
 *   - "REQUESTER" → list of my requests + new-request form
 *   - "LEAD"      → pending requests assigned to me as lead
 *   - "MANAGER"   → pending requests assigned to me as manager
 *   - "ADMIN"     → all requests across one project (selected via projectId)
 */
export default function CodeCutCenter({
    roles = ["REQUESTER"],
    projectId,
    projectName,
    environments = [],
    defaultEnvironment,
    requestFormProjects = [] // [{id, name, environments: ["QA","Production"]}]
}) {
    const [tab, setTab] = useState(roles[0]);
    const [requests, setRequests] = useState({ REQUESTER: [], LEAD: [], MANAGER: [], ADMIN: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const work = {};
            if (roles.includes("REQUESTER")) work.REQUESTER = await listMyCodeCuts();
            if (roles.includes("LEAD")) work.LEAD = await listLeadInbox();
            if (roles.includes("MANAGER")) work.MANAGER = await listManagerInbox();
            if (roles.includes("ADMIN") && projectId) work.ADMIN = await listCodeCutForProject(projectId);
            setRequests((prev) => ({ ...prev, ...work }));
        } catch (e) {
            setError(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [roles, projectId]);

    useEffect(() => { refresh(); }, [refresh]);

    // Listen for live code-cut updates so the inbox stays fresh.
    useEffect(() => {
        const onUpdate = () => { refresh(); };
        const off = websocketService.on("codecut:updated", onUpdate);
        websocketService.connect().catch(() => {});
        return () => { off?.(); };
    }, [refresh]);

    const replaceById = (updated) => {
        setRequests((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                next[k] = (next[k] || []).map((r) => r.id === updated.id ? { ...r, ...updated } : r);
            }
            return next;
        });
        // Lead & manager inbox might no longer match — refetch on next tick.
        setTimeout(refresh, 400);
    };

    const tabsToShow = roles;
    const activeList = requests[tab] || [];

    return (
        <div className="cc-center">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                {tabsToShow.length > 1 && tabsToShow.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`cc-btn ${tab === r ? "cc-btn-primary" : "cc-btn-secondary"}`}
                        onClick={() => setTab(r)}
                    >
                        {r === "REQUESTER" && <><GitBranch size={13} /> My Requests</>}
                        {r === "LEAD" && <><ListChecks size={13} /> Lead Inbox{requests.LEAD?.length ? ` (${requests.LEAD.length})` : ""}</>}
                        {r === "MANAGER" && <><Inbox size={13} /> Manager Inbox{requests.MANAGER?.length ? ` (${requests.MANAGER.length})` : ""}</>}
                        {r === "ADMIN" && <><Inbox size={13} /> All Project Requests</>}
                    </button>
                ))}
                <button
                    type="button"
                    className="cc-btn cc-btn-secondary"
                    onClick={refresh}
                    disabled={loading}
                    title="Refresh"
                ><RefreshCw size={13} className={loading ? "lb-spin" : ""} /></button>
            </div>

            {error && (
                <div style={{
                    padding: 10, borderRadius: 10,
                    background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c",
                    display: "inline-flex", alignItems: "center", gap: 6
                }}><AlertTriangle size={14} /> {error}</div>
            )}

            {tab === "REQUESTER" && (
                <NewCodeCutForm
                    projects={requestFormProjects}
                    defaultProjectId={projectId}
                    defaultProjectName={projectName}
                    defaultEnvironment={defaultEnvironment}
                    fallbackEnvironments={environments}
                    onCreated={(created) => {
                        setRequests((prev) => ({ ...prev, REQUESTER: [created, ...(prev.REQUESTER || [])] }));
                    }}
                />
            )}

            <div style={{ marginTop: 12 }}>
                {activeList.length === 0 && !loading && (
                    <div style={{
                        padding: 18, textAlign: "center",
                        background: "rgba(148, 163, 184, 0.1)", borderRadius: 12,
                        color: "#64748b"
                    }}>No {tab.toLowerCase()} requests yet.</div>
                )}
                {activeList.map((r) => (
                    <CodeCutRequestCard
                        key={r.id}
                        request={r}
                        viewerRole={tab}
                        onChange={replaceById}
                    />
                ))}
            </div>
        </div>
    );
}

function NewCodeCutForm({ projects, defaultProjectId, defaultProjectName, defaultEnvironment, fallbackEnvironments, onCreated }) {
    const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
    const [environment, setEnvironment] = useState(defaultEnvironment || "");
    const [branch, setBranch] = useState("main");
    const [commitId, setCommitId] = useState("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const project = useMemo(
        () => projects.find((p) => p.id === projectId)
            || (defaultProjectId ? { id: defaultProjectId, name: defaultProjectName, environments: fallbackEnvironments } : null),
        [projects, projectId, defaultProjectId, defaultProjectName, fallbackEnvironments]
    );
    const envOptions = project?.environments?.length ? project.environments : fallbackEnvironments;

    useEffect(() => {
        if (!environment && envOptions?.length) setEnvironment(envOptions[0]);
    }, [environment, envOptions]);

    const submit = async (e) => {
        e.preventDefault();
        if (!projectId || !environment || !branch) {
            setError("Project, environment and branch are required");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const created = await createCodeCut({
                projectId,
                projectName: project?.name || defaultProjectName,
                environment,
                branchName: branch,
                commitId: commitId || null,
                note
            });
            setBranch("main");
            setCommitId("");
            setNote("");
            onCreated?.(created);
        } catch (err) {
            setError(err.message || "Failed to create request");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="cc-card" style={{ background: "rgba(99, 102, 241, 0.05)", borderColor: "rgba(99, 102, 241, 0.25)" }}>
            <h4 className="cc-card-title" style={{ marginBottom: 10 }}>
                <Plus size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                New code cut request
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                    Project
                    {projects.length > 0 ? (
                        <select
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            style={inputStyle}
                            disabled={submitting}
                        >
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    ) : (
                        <input value={defaultProjectName || projectId} disabled style={inputStyle} />
                    )}
                </label>
                <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                    Environment
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                        style={inputStyle}
                        disabled={submitting}
                    >
                        {(envOptions || []).map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                    Branch
                    <input
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        style={inputStyle}
                        placeholder="main"
                        disabled={submitting}
                    />
                </label>
                <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                    Commit (optional)
                    <input
                        value={commitId}
                        onChange={(e) => setCommitId(e.target.value)}
                        style={inputStyle}
                        placeholder="leave blank for HEAD"
                        disabled={submitting}
                    />
                </label>
            </div>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note for approvers…"
                rows={2}
                style={{ ...inputStyle, marginTop: 8, fontFamily: "inherit", width: "100%" }}
                disabled={submitting}
            />
            {error && (
                <div style={{
                    marginTop: 8, padding: 8, borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", fontSize: 12,
                    display: "inline-flex", alignItems: "center", gap: 6
                }}><AlertTriangle size={12} /> {error}</div>
            )}
            <div className="cc-actions" style={{ marginTop: 10 }}>
                <button type="submit" className="cc-btn cc-btn-primary" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit code cut request"}
                </button>
            </div>
        </form>
    );
}

const inputStyle = {
    marginTop: 4,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: 13,
    fontWeight: 400,
    background: "#fff",
    color: "#0f172a"
};
