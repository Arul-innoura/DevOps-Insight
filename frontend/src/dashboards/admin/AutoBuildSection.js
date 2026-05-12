import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    GitBranch, Server, Plus, Trash2, RefreshCw, CheckCircle2, XCircle,
    AlertTriangle, Eye, EyeOff, Save, Zap, Layers, ShieldCheck
} from "lucide-react";
import {
    getAutoBuildSettings, saveJenkinsConnection, testJenkinsConnection,
    saveEnvAutoBuildConfig, deleteEnvAutoBuildConfig,
    DEFAULT_ENV_AUTO_BUILD_CONFIG
} from "../../services/autoBuildService";

/**
 * Project Config → Auto Build tab.
 *
 * Lets the admin configure:
 *   1. Jenkins connection (URL, user, API token) per project.
 *   2. Per-environment auto-build defaults (branch / agent / clusters / etc.)
 *      and the per-microservice job mapping with dependency ordering.
 *
 * `projectServices` is the list already configured in the Services tab — used
 * here as the pool of microservices that can be wired to Jenkins jobs.
 */
export default function AutoBuildSection({ projectId, environments, projectServices }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [savingJenkins, setSavingJenkins] = useState(false);
    const [savingEnv, setSavingEnv] = useState(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [showToken, setShowToken] = useState(false);

    const [jenkins, setJenkins] = useState({
        jenkinsUrl: "", jenkinsUser: "", jenkinsApiToken: "",
        crumbPath: "", verified: null
    });
    const [envConfigs, setEnvConfigs] = useState({});
    const [activeEnv, setActiveEnv] = useState(environments?.[0] || "");

    useEffect(() => {
        if (!activeEnv && environments?.length) setActiveEnv(environments[0]);
    }, [environments, activeEnv]);

    const envsKey = (environments || []).join("\u0001");

    const refresh = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getAutoBuildSettings(projectId);
            setJenkins({
                jenkinsUrl: data?.jenkinsConnection?.jenkinsUrl || "",
                jenkinsUser: data?.jenkinsConnection?.jenkinsUser || "",
                jenkinsApiToken: data?.jenkinsConnection?.jenkinsApiToken || "",
                crumbPath: data?.jenkinsConnection?.crumbPath || "",
                verified: data?.jenkinsConnection?.verified ?? null
            });
            const map = data?.autoBuildConfig || {};
            const filled = {};
            const envs = envsKey ? envsKey.split("\u0001") : [];
            envs.forEach((env) => {
                filled[env] = map[env]
                    ? { ...DEFAULT_ENV_AUTO_BUILD_CONFIG, ...map[env] }
                    : { ...DEFAULT_ENV_AUTO_BUILD_CONFIG };
            });
            setEnvConfigs(filled);
        } catch (e) {
            setError(e.message || "Failed to load auto-build config");
        } finally {
            setLoading(false);
        }
    }, [projectId, envsKey]);

    useEffect(() => { refresh(); }, [refresh]);

    const onSaveJenkins = async () => {
        setSavingJenkins(true);
        setError(null);
        try {
            const saved = await saveJenkinsConnection(projectId, jenkins);
            setJenkins((prev) => ({ ...prev, ...saved, jenkinsApiToken: prev.jenkinsApiToken }));
        } catch (e) {
            setError(e.message || "Failed to save Jenkins connection");
        } finally {
            setSavingJenkins(false);
        }
    };

    const onTestJenkins = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const r = await testJenkinsConnection(projectId, jenkins);
            setTestResult(r);
        } catch (e) {
            setTestResult({ ok: false, message: e.message || "Test failed" });
        } finally {
            setTesting(false);
        }
    };

    const updateEnv = (env, patch) => {
        setEnvConfigs((prev) => ({
            ...prev,
            [env]: { ...(prev[env] || DEFAULT_ENV_AUTO_BUILD_CONFIG), ...patch }
        }));
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

            <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0 8px" }}>
                <Server size={16} /> Jenkins Connection
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
                Project-level credentials used to trigger parameterized builds. The API token is encrypted at rest
                and never returned to the browser after save.
            </p>

            <div className="ab-jenkins-grid">
                <label style={fieldLabel}>
                    Jenkins URL
                    <input
                        value={jenkins.jenkinsUrl}
                        onChange={(e) => setJenkins({ ...jenkins, jenkinsUrl: e.target.value })}
                        placeholder="https://jenkins.example.com"
                        style={fieldInput}
                    />
                </label>
                <label style={fieldLabel}>
                    Jenkins user
                    <input
                        value={jenkins.jenkinsUser}
                        onChange={(e) => setJenkins({ ...jenkins, jenkinsUser: e.target.value })}
                        placeholder="ci-bot"
                        style={fieldInput}
                    />
                </label>
                <label style={fieldLabel}>
                    Jenkins API token
                    <span style={{ position: "relative", display: "block" }}>
                        <input
                            type={showToken ? "text" : "password"}
                            value={jenkins.jenkinsApiToken}
                            onChange={(e) => setJenkins({ ...jenkins, jenkinsApiToken: e.target.value })}
                            placeholder="••••••••"
                            style={{ ...fieldInput, paddingRight: 36 }}
                        />
                        <button type="button"
                            onClick={() => setShowToken(!showToken)}
                            style={{ position: "absolute", right: 6, top: 8, background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                            title={showToken ? "Hide" : "Show"}
                        >{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    </span>
                </label>
                <label style={fieldLabel}>
                    Crumb path (optional)
                    <input
                        value={jenkins.crumbPath}
                        onChange={(e) => setJenkins({ ...jenkins, crumbPath: e.target.value })}
                        placeholder="/crumbIssuer/api/json"
                        style={fieldInput}
                    />
                </label>
            </div>

            <div className="cc-actions" style={{ marginTop: 12, alignItems: "center" }}>
                <button type="button" className="cc-btn cc-btn-primary" onClick={onSaveJenkins} disabled={savingJenkins}>
                    <Save size={13} /> {savingJenkins ? "Saving…" : "Save connection"}
                </button>
                <button type="button" className="cc-btn cc-btn-secondary" onClick={onTestJenkins} disabled={testing}>
                    <RefreshCw size={13} className={testing ? "lb-spin" : ""} /> Test connection
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
                {jenkins.verified && !testResult && (
                    <span style={{ fontSize: 12, color: "#10b981", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={13} /> Verified
                    </span>
                )}
            </div>

            {/* ── Per-environment cards ───────────────────────────────────── */}
            <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: "26px 0 8px" }}>
                <Zap size={16} /> Auto Build per Environment
            </h3>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {(environments || []).map((e) => {
                    const enabled = envConfigs[e]?.enabled;
                    return (
                        <button
                            key={e}
                            type="button"
                            className={`cc-btn ${activeEnv === e ? "cc-btn-primary" : "cc-btn-secondary"}`}
                            onClick={() => setActiveEnv(e)}
                        >
                            {e}
                            {enabled && <CheckCircle2 size={12} style={{ marginLeft: 4, color: "#fff" }} />}
                        </button>
                    );
                })}
                {(environments || []).length === 0 && (
                    <span style={{ color: "#64748b", fontSize: 13 }}>
                        No environments yet — add one in the General tab.
                    </span>
                )}
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

                    {/* Use Parameters master toggle */}
                    <div style={{ margin: "10px 0 14px", display: "flex", alignItems: "center", gap: 10 }}>
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
                            {/* Parameters toggle */}
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

                    <div className="cc-actions" style={{ marginTop: 16 }}>
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
