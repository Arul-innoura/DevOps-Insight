import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    GitBranch, Server, Plus, Trash2, RefreshCw, CheckCircle2, XCircle,
    AlertTriangle, Eye, EyeOff, Save, Zap, Layers, ShieldCheck, UserCheck
} from "lucide-react";
import {
    getAutoBuildSettings, testJenkinsConnection,
    saveEnvAutoBuildConfig, deleteEnvAutoBuildConfig,
    DEFAULT_ENV_AUTO_BUILD_CONFIG
} from "../../services/autoBuildService";
import { fetchWorkflowDirectoryContacts } from "../../services/workflowDirectoryService";
import WorkflowPersonSuggest from "../../components/WorkflowPersonSuggest";

/**
 * Project Config → Auto Build tab.
 *
 * Each environment has its own Jenkins connection + build configuration.
 * Environment selector is at the top; all settings are scoped to the active env.
 */
export default function AutoBuildSection({ projectId, environments, projectServices }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [savingEnv, setSavingEnv] = useState(null);

    // Per-env Jenkins test state
    const [testingEnv, setTestingEnv] = useState(null);
    const [testResults, setTestResults] = useState({});
    const [showToken, setShowToken] = useState({});

    const [envConfigs, setEnvConfigs] = useState({});
    const [activeEnv, setActiveEnv] = useState(environments?.[0] || "");
    const [contacts, setContacts] = useState([]);

    useEffect(() => {
        if (!activeEnv && environments?.length) setActiveEnv(environments[0]);
    }, [environments, activeEnv]);

    useEffect(() => {
        let cancelled = false;
        fetchWorkflowDirectoryContacts({})
            .then((rows) => { if (!cancelled) setContacts(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (!cancelled) setContacts([]); });
        return () => { cancelled = true; };
    }, []);

    const envsKey = (environments || []).join("");

    const refresh = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getAutoBuildSettings(projectId);
            const map = data?.autoBuildConfig || {};
            const filled = {};
            const propEnvs = envsKey ? envsKey.split("") : [];
            // Union of envs from prop + any saved envs in the backend — saved
            // values must always render, even if the parent's environments prop
            // hasn't loaded yet on first mount.
            const allEnvs = Array.from(new Set([...propEnvs, ...Object.keys(map)]));
            allEnvs.forEach((env) => {
                const saved = map[env]
                    ? { ...DEFAULT_ENV_AUTO_BUILD_CONFIG, ...map[env] }
                    : { ...DEFAULT_ENV_AUTO_BUILD_CONFIG };
                saved.jenkinsConnection = {
                    ...DEFAULT_ENV_AUTO_BUILD_CONFIG.jenkinsConnection,
                    ...(map[env]?.jenkinsConnection || {})
                };
                saved.approvers = Array.isArray(map[env]?.approvers) ? map[env].approvers : [];
                filled[env] = saved;
            });
            setEnvConfigs((prev) => ({ ...prev, ...filled }));
            if (!activeEnv && allEnvs.length) {
                setActiveEnv(allEnvs[0]);
            }
        } catch (e) {
            setError(e.message || "Failed to load auto-build config");
        } finally {
            setLoading(false);
        }
    }, [projectId, envsKey, activeEnv]);

    useEffect(() => { refresh(); }, [refresh]);

    /* ── env config helpers ─────────────────────────────────────── */

    const updateEnv = (env, patch) => {
        setEnvConfigs((prev) => ({
            ...prev,
            [env]: { ...(prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG), ...patch }
        }));
    };

    const updateJenkins = (env, patch) => {
        setEnvConfigs((prev) => {
            const cfg = prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG;
            return {
                ...prev,
                [env]: {
                    ...cfg,
                    jenkinsConnection: { ...(cfg.jenkinsConnection || DEFAULT_ENV_AUTO_BUILD_CONFIG.jenkinsConnection), ...patch }
                }
            };
        });
    };

    const updateService = (env, serviceId, patch) => {
        setEnvConfigs((prev) => {
            const next = { ...prev };
            const cfg = next[env] = { ...(next[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG) };
            cfg.services = (cfg.services || []).map((s) => s.id === serviceId ? { ...s, ...patch } : s);
            return next;
        });
    };

    const addService = (env, projectService) => {
        setEnvConfigs((prev) => {
            const next = { ...prev };
            const cfg = next[env] = { ...(next[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG) };
            cfg.services = [...(cfg.services || []), {
                id: projectService.id || `svc-${Date.now()}`,
                serviceName: projectService.serviceName,
                jobName: "",
                agentLabel: "",
                dependsOn: [],
                enabled: true,
                parametrized: true
            }];
            return next;
        });
    };

    const removeService = (env, serviceId) => {
        setEnvConfigs((prev) => {
            const next = { ...prev };
            const cfg = next[env] = { ...(next[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG) };
            cfg.services = (cfg.services || []).filter((s) => s.id !== serviceId);
            return next;
        });
    };

    const addApprover = (env) => {
        setEnvConfigs((prev) => {
            const cfg = prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG;
            return { ...prev, [env]: { ...cfg, approvers: [...(cfg.approvers || []), { name: "", email: "" }] } };
        });
    };

    const updateApprover = (env, idx, patch) => {
        setEnvConfigs((prev) => {
            const cfg = prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG;
            const approvers = (cfg.approvers || []).map((a, i) => i === idx ? { ...a, ...patch } : a);
            return { ...prev, [env]: { ...cfg, approvers } };
        });
    };

    const removeApprover = (env, idx) => {
        setEnvConfigs((prev) => {
            const cfg = prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG;
            const approvers = (cfg.approvers || []).filter((_, i) => i !== idx);
            return { ...prev, [env]: { ...cfg, approvers } };
        });
    };

    const onTestJenkins = async (env) => {
        const conn = envConfigs[env]?.jenkinsConnection || {};
        setTestingEnv(env);
        setTestResults((prev) => ({ ...prev, [env]: null }));
        try {
            const r = await testJenkinsConnection(projectId, conn, env);
            setTestResults((prev) => ({ ...prev, [env]: r }));
        } catch (e) {
            setTestResults((prev) => ({ ...prev, [env]: { ok: false, message: e.message || "Test failed" } }));
        } finally {
            setTestingEnv(null);
        }
    };

    const onSaveEnv = async (env) => {
        setSavingEnv(env);
        setError(null);
        try {
            await saveEnvAutoBuildConfig(projectId, env, envConfigs[env]);
        } catch (e) {
            setError(e.message || "Failed to save environment config");
        } finally {
            setSavingEnv(null);
        }
    };

    const onDeleteEnv = async (env) => {
        if (!window.confirm(`Remove auto-build config for ${env}?`)) return;
        try {
            await deleteEnvAutoBuildConfig(projectId, env);
            setEnvConfigs((prev) => {
                const next = { ...prev };
                next[env] = { ...DEFAULT_ENV_AUTO_BUILD_CONFIG };
                return next;
            });
        } catch (e) {
            setError(e.message || "Delete failed");
        }
    };

    const env = activeEnv;
    const cfg = envConfigs[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG;
    const jc = cfg.jenkinsConnection || DEFAULT_ENV_AUTO_BUILD_CONFIG.jenkinsConnection;
    const tokenVisible = !!showToken[env];
    const testResult = testResults[env] || null;

    const orphanProjectServices = useMemo(() => {
        const have = new Set((cfg.services || []).map((s) => s.id));
        return (projectServices || []).filter((p) => p?.id && !have.has(p.id));
    }, [cfg, projectServices]);

    if (loading) {
        return (
            <div className="ab-tab-section">
                <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                    <RefreshCw size={16} className="lb-spin" /> Loading auto-build config…
                </div>
            </div>
        );
    }

    return (
        <div className="ab-tab-section">
            {error && (
                <div style={{
                    margin: "10px 0", padding: 10, borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c",
                    display: "inline-flex", alignItems: "center", gap: 6
                }}><AlertTriangle size={14} /> {error}</div>
            )}

            {/* ── Environment selector ─────────────────────────────────────── */}
            <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0 8px" }}>
                <Zap size={16} /> Auto Build — Select Environment
            </h3>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {(() => {
                    // Show tabs for the union of prop envs + any envs already saved
                    // so admins can see (and edit) configs even before the parent
                    // finishes loading the environments list.
                    const tabEnvs = Array.from(new Set([...(environments || []), ...Object.keys(envConfigs)]));
                    if (tabEnvs.length === 0) {
                        return (
                            <span style={{ color: "#64748b", fontSize: 13 }}>
                                No environments yet — add one in the General tab.
                            </span>
                        );
                    }
                    return tabEnvs.map((e) => {
                        const enabled = envConfigs[e]?.enabled;
                        return (
                            <button
                                key={e}
                                type="button"
                                className={`cc-btn ${activeEnv === e ? "cc-btn-primary" : "cc-btn-secondary"}`}
                                onClick={() => setActiveEnv(e)}
                            >
                                {e}
                                {enabled && <CheckCircle2 size={12} style={{ marginLeft: 4 }} />}
                            </button>
                        );
                    });
                })()}
            </div>

            {env && (
                <div className="ab-env-card">
                    <div className="ab-env-head">
                        <h4 className="ab-env-title">
                            <Layers size={14} /> {env}
                        </h4>
                        <label className="ab-toggle">
                            <input
                                type="checkbox"
                                checked={!!cfg.enabled}
                                onChange={(e) => updateEnv(env, { enabled: e.target.checked })}
                            />
                            <span>Enable auto build</span>
                        </label>
                    </div>

                    {/* ── Jenkins Connection (per env) ──────────────────────── */}
                    <h4 style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px 0 4px" }}>
                        <Server size={14} /> Jenkins Connection
                    </h4>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                        Credentials used to trigger builds for <strong>{env}</strong>. The API token is encrypted at rest and never returned to the browser after save.
                    </p>

                    <div className="ab-jenkins-grid">
                        <label style={fieldLabel}>
                            Jenkins URL
                            <input
                                value={jc.jenkinsUrl || ""}
                                onChange={(e) => updateJenkins(env, { jenkinsUrl: e.target.value })}
                                placeholder="https://jenkins.example.com"
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Jenkins user
                            <input
                                value={jc.jenkinsUser || ""}
                                onChange={(e) => updateJenkins(env, { jenkinsUser: e.target.value })}
                                placeholder="ci-bot"
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Jenkins API token
                            <span style={{ position: "relative", display: "block" }}>
                                <input
                                    type={tokenVisible ? "text" : "password"}
                                    value={jc.jenkinsApiToken || ""}
                                    onChange={(e) => updateJenkins(env, { jenkinsApiToken: e.target.value })}
                                    placeholder="••••••••"
                                    style={{ ...fieldInput, paddingRight: 36 }}
                                />
                                <button type="button"
                                    onClick={() => setShowToken((prev) => ({ ...prev, [env]: !prev[env] }))}
                                    style={{ position: "absolute", right: 6, top: 8, background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                                    title={tokenVisible ? "Hide" : "Show"}
                                >{tokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                            </span>
                        </label>
                        <label style={fieldLabel}>
                            Crumb path (optional)
                            <input
                                value={jc.crumbPath || ""}
                                onChange={(e) => updateJenkins(env, { crumbPath: e.target.value })}
                                placeholder="/crumbIssuer/api/json"
                                style={fieldInput}
                            />
                        </label>
                    </div>

                    <div className="cc-actions" style={{ marginTop: 10, marginBottom: 18, alignItems: "center" }}>
                        <button type="button" className="cc-btn cc-btn-secondary" onClick={() => onTestJenkins(env)} disabled={testingEnv === env}>
                            <RefreshCw size={13} className={testingEnv === env ? "lb-spin" : ""} /> Test connection
                        </button>
                        {testResult && (
                            <span style={{
                                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
                                color: testResult.ok ? "#10b981" : "#ef4444"
                            }}>
                                {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                {testResult.ok
                                    ? `Connected${testResult.version ? ` · Jenkins ${testResult.version}` : ""}`
                                    : (testResult.message || "Failed")}
                            </span>
                        )}
                        {jc.verified && !testResult && (
                            <span style={{ fontSize: 12, color: "#10b981", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <CheckCircle2 size={13} /> Verified
                            </span>
                        )}
                    </div>

                    {/* ── Use Parameters toggle ────────────────────────────── */}
                    <div style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <label className="ab-toggle" style={{ margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={cfg.useParameters !== false}
                                onChange={(e) => updateEnv(env, { useParameters: e.target.checked })}
                            />
                            <span>Use build parameters</span>
                        </label>
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                            {cfg.useParameters !== false
                                ? "Jenkins jobs will receive BRANCH_NAME, AGENT_LABEL, CLUSTERS etc."
                                : "Jobs are triggered with POST /build — no parameters sent."}
                        </span>
                    </div>

                    <div className="ab-env-grid" style={{ opacity: cfg.useParameters !== false ? 1 : 0.4, pointerEvents: cfg.useParameters !== false ? "auto" : "none" }}>
                        <label style={fieldLabel}>
                            Default branch (BRANCH_NAME)
                            <input
                                value={cfg.defaultBranch || ""}
                                onChange={(e) => updateEnv(env, { defaultBranch: e.target.value })}
                                placeholder="main"
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Agent label (AGENT_LABEL)
                            <input
                                value={cfg.agentLabel || ""}
                                onChange={(e) => updateEnv(env, { agentLabel: e.target.value })}
                                placeholder="any | k8s-pod | linux-2204"
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Default commit (COMMIT_ID)
                            <input
                                value={cfg.defaultCommitId || ""}
                                onChange={(e) => updateEnv(env, { defaultCommitId: e.target.value })}
                                placeholder="(blank = HEAD)"
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Clusters (CLUSTERS)
                            <input
                                type="number"
                                min={1}
                                value={cfg.clusters ?? 1}
                                onChange={(e) => updateEnv(env, { clusters: Number(e.target.value) || 1 })}
                                style={fieldInput}
                            />
                        </label>
                        <label style={fieldLabel}>
                            Git protocol (GIT_PROTOCOL)
                            <select
                                value={cfg.gitProtocol || "ssh"}
                                onChange={(e) => updateEnv(env, { gitProtocol: e.target.value })}
                                style={fieldInput}
                            >
                                <option value="ssh">ssh</option>
                                <option value="https">https</option>
                            </select>
                        </label>
                        <label style={fieldLabel}>
                            Git credentials id (GIT_CREDENTIALS_ID)
                            <input
                                value={cfg.gitCredentialsId || ""}
                                onChange={(e) => updateEnv(env, { gitCredentialsId: e.target.value })}
                                placeholder="EH-CICD-Git-Hub-App"
                                style={fieldInput}
                            />
                        </label>
                    </div>

                    <div className="ab-env-grid">
                        <label style={fieldLabel}>
                            Jenkins folder
                            <input
                                value={cfg.jenkinsFolder || ""}
                                onChange={(e) => updateEnv(env, { jenkinsFolder: e.target.value })}
                                placeholder="Platform/Microservices"
                                style={fieldInput}
                            />
                            <span style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                                Folder path that contains all service jobs. Each service below only needs its job name (not the full path).
                            </span>
                        </label>
                        <label style={fieldLabel}>
                            Retry attempts on failure
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={cfg.retryAttempts ?? 3}
                                onChange={(e) => updateEnv(env, { retryAttempts: Number(e.target.value) || 3 })}
                                style={fieldInput}
                            />
                        </label>
                    </div>

                    {/* ── Microservice build plan ──────────────────────────── */}
                    <h4 style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
                        <GitBranch size={14} /> Microservice build plan
                    </h4>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                        Map each service to its Jenkins job and choose which other services it depends on.
                        Independent services run in parallel; dependants wait for their parents.
                    </p>

                    {(cfg.services || []).length === 0 && (
                        <div style={{ padding: 12, background: "rgba(148, 163, 184, 0.1)", borderRadius: 8, fontSize: 13, color: "#64748b" }}>
                            No services configured yet — add from the pool below.
                        </div>
                    )}

                    {(cfg.services || []).map((s) => (
                        <div key={s.id} className="ab-svc-row">
                            <div style={{ fontWeight: 600 }}>{s.serviceName}</div>
                            <input
                                value={s.jobName || ""}
                                placeholder="job-name"
                                onChange={(e) => updateService(env, s.id, { jobName: e.target.value })}
                                style={fieldInput}
                            />
                            <label
                                title={s.parametrized !== false
                                    ? "Sending build parameters — click to disable"
                                    : "No parameters sent (plain /build) — click to enable"}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                                    userSelect: "none", color: s.parametrized !== false ? "#7c3aed" : "#64748b"
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={s.parametrized !== false}
                                    onChange={(e) => updateService(env, s.id, { parametrized: e.target.checked })}
                                    style={{ accentColor: "#7c3aed" }}
                                />
                                Params
                            </label>
                            <select
                                multiple
                                className="ab-svc-multiselect"
                                value={s.dependsOn || []}
                                onChange={(e) => {
                                    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                                    updateService(env, s.id, { dependsOn: selected });
                                }}
                            >
                                {(cfg.services || []).filter((o) => o.id !== s.id).map((o) => (
                                    <option key={o.id} value={o.id}>{o.serviceName}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="cc-btn cc-btn-danger"
                                onClick={() => removeService(env, s.id)}
                                title="Remove from plan"
                            ><Trash2 size={12} /></button>
                        </div>
                    ))}

                    {orphanProjectServices.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                            <span style={{ fontSize: 12, color: "#64748b", marginRight: 8 }}>
                                Add from project services:
                            </span>
                            {orphanProjectServices.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    className="cc-btn cc-btn-secondary"
                                    onClick={() => addService(env, s)}
                                    style={{ marginRight: 6, marginBottom: 6 }}
                                ><Plus size={11} /> {s.serviceName}</button>
                            ))}
                        </div>
                    )}

                    {/* ── Approvals ────────────────────────────────────────── */}
                    <div style={{ marginTop: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                <UserCheck size={14} /> Approvals
                            </h4>
                            <button
                                type="button"
                                className="cc-btn cc-btn-secondary"
                                onClick={() => addApprover(env)}
                                style={{ fontSize: 12, padding: "4px 10px" }}
                            >
                                <Plus size={12} /> Add Approver
                            </button>
                        </div>
                        <p style={{ fontSize: 12, color: "#64748b", marginTop: 0, marginBottom: 8 }}>
                            Approvers who must sign off before a build is triggered for <strong>{env}</strong>. Add one or more.
                        </p>
                        {(cfg.approvers || []).length === 0 ? (
                            <div style={{ fontSize: 13, color: "#94a3b8", padding: "8px 12px", background: "rgba(148,163,184,0.1)", borderRadius: 7 }}>
                                No approvers set — builds will trigger without approval.
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {(cfg.approvers || []).map((ap, idx) => (
                                    <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <span style={{ fontSize: 12, color: "#64748b", minWidth: 60 }}>#{idx + 1}</span>
                                        <div style={{ flex: 1 }}>
                                            <WorkflowPersonSuggest
                                                layout="cost"
                                                showRole={false}
                                                contacts={contacts}
                                                value={{ role: "", name: ap.name || "", email: ap.email || "" }}
                                                onChange={(v) => updateApprover(env, idx, { name: v.name, email: v.email })}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="cc-btn cc-btn-danger"
                                            onClick={() => removeApprover(env, idx)}
                                            title="Remove approver"
                                        ><Trash2 size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Save / Reset ─────────────────────────────────────── */}
                    <div className="cc-actions" style={{ marginTop: 20 }}>
                        <button
                            type="button"
                            className="cc-btn cc-btn-primary"
                            onClick={() => onSaveEnv(env)}
                            disabled={savingEnv === env}
                        >
                            <ShieldCheck size={13} /> {savingEnv === env ? "Saving…" : `Save ${env} config`}
                        </button>
                        <button
                            type="button"
                            className="cc-btn cc-btn-danger"
                            onClick={() => onDeleteEnv(env)}
                        >
                            <Trash2 size={13} /> Reset / disable
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


const fieldLabel = {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--card-fg, #1f2937)"
};
const fieldInput = {
    marginTop: 4,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontSize: 13
};
