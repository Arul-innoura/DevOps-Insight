import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Save, Layers, Mail, Bell } from "lucide-react";
import { getProjectWorkflow, saveProjectWorkflow } from "../../services/projectWorkflowService";
import { REQUEST_TYPES } from "../../services/ticketService";

const parseEmails = (s) =>
    (s || "")
        .split(/[,;\n]+/)
        .map((e) => e.trim())
        .filter(Boolean);

const joinEmails = (arr) => (Array.isArray(arr) ? arr.join(", ") : "");

const emptyNotif = () => ({
    ticketStatusChanges: true,
    ticketStatusChangesMandatory: false,
    approvalRequests: true,
    approvalRequestsMandatory: true,
    approvalCompleted: true,
    approvalCompletedMandatory: false,
    costApprovalUpdates: true,
    costApprovalUpdatesMandatory: true,
    commentsAndUpdates: true,
    commentsAndUpdatesMandatory: false
});

const emptyWorkflow = () => ({
    emailRouting: { to: [], cc: [], bcc: [] },
    approvalLevels: [],
    managers: [],
    costApprovalRequired: false,
    costApprovers: [],
    notificationPreferences: emptyNotif()
});

const ProjectWorkflowEditor = ({ project, onClose, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [docId, setDocId] = useState(null);
    const [defaultCfg, setDefaultCfg] = useState(emptyWorkflow);
    const [overrides, setOverrides] = useState([]);

    const load = useCallback(async () => {
        if (!project?.id) return;
        setLoading(true);
        setError("");
        try {
            const data = await getProjectWorkflow(project.id);
            setDocId(data.id || null);
            setDefaultCfg({
                ...emptyWorkflow(),
                ...(data.defaultConfiguration || {})
            });
            setOverrides(
                (data.requestTypeOverrides || []).map((o) => ({
                    requestType: o.requestType || "NEW_ENVIRONMENT",
                    configuration: { ...emptyWorkflow(), ...(o.configuration || {}) }
                }))
            );
        } catch (e) {
            setError(e.message || "Failed to load workflow");
        } finally {
            setLoading(false);
        }
    }, [project?.id]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const body = {
                id: docId,
                projectId: project.id,
                defaultConfiguration: defaultCfg,
                requestTypeOverrides: overrides.map((o) => ({
                    requestType: o.requestType,
                    configuration: o.configuration
                }))
            };
            await saveProjectWorkflow(project.id, body);
            onSaved?.();
            onClose?.();
        } catch (e) {
            setError(e.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const addLevel = (cfg, setCfg) => {
        const levels = [...(cfg.approvalLevels || [])];
        const next = (levels.reduce((m, l) => Math.max(m, l.level || 0), 0) || 0) + 1;
        levels.push({ level: next, approvers: [{ name: "", email: "" }] });
        setCfg({ ...cfg, approvalLevels: levels });
    };

    const addOverride = () => {
        const used = new Set(overrides.map((o) => o.requestType));
        const nextType = Object.keys(REQUEST_TYPES).find((k) => !used.has(k)) || "NEW_ENVIRONMENT";
        setOverrides([...overrides, { requestType: nextType, configuration: emptyWorkflow() }]);
    };

    const defaultApprovalLevels = (defaultCfg.approvalLevels || []).length;
    const defaultCostRequired = !!defaultCfg.costApprovalRequired;

    const renderWorkflowForm = (cfg, setCfg, title) => (
        <div className="analytics-card" style={{ marginBottom: "1rem" }}>
            <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={16} /> {title}
            </h4>

            <div className="team-form" style={{ marginTop: "0.75rem" }}>
                <label>Thread To (comma-separated)</label>
                <input
                    type="text"
                    value={joinEmails(cfg.emailRouting?.to)}
                    onChange={(e) =>
                        setCfg({
                            ...cfg,
                            emailRouting: { ...cfg.emailRouting, to: parseEmails(e.target.value) }
                        })
                    }
                    placeholder="devopsteam@company.com"
                />
                <label>Thread CC</label>
                <input
                    type="text"
                    value={joinEmails(cfg.emailRouting?.cc)}
                    onChange={(e) =>
                        setCfg({
                            ...cfg,
                            emailRouting: { ...cfg.emailRouting, cc: parseEmails(e.target.value) }
                        })
                    }
                />
                <label>Thread BCC</label>
                <input
                    type="text"
                    value={joinEmails(cfg.emailRouting?.bcc)}
                    onChange={(e) =>
                        setCfg({
                            ...cfg,
                            emailRouting: { ...cfg.emailRouting, bcc: parseEmails(e.target.value) }
                        })
                    }
                />
            </div>

            <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>Project managers (auto-fill in new request)</strong>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setCfg({ ...cfg, managers: [...(cfg.managers || []), { name: "", email: "" }] })}
                    >
                        <Plus size={14} /> Add manager
                    </button>
                </div>
                {(cfg.managers || []).map((m, idx) => (
                    <div key={`mgr-${idx}`} className="form-row" style={{ marginTop: 8 }}>
                        <input
                            placeholder="Manager name"
                            value={m.name || ""}
                            onChange={(e) => {
                                const managers = [...(cfg.managers || [])];
                                managers[idx] = { ...managers[idx], name: e.target.value };
                                setCfg({ ...cfg, managers });
                            }}
                        />
                        <input
                            placeholder="Manager email"
                            type="email"
                            value={m.email || ""}
                            onChange={(e) => {
                                const managers = [...(cfg.managers || [])];
                                managers[idx] = { ...managers[idx], email: e.target.value };
                                setCfg({ ...cfg, managers });
                            }}
                        />
                        <button
                            type="button"
                            className="btn-icon btn-danger"
                            onClick={() => {
                                const managers = [...(cfg.managers || [])];
                                managers.splice(idx, 1);
                                setCfg({ ...cfg, managers });
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>Approval levels (sequential)</strong>
                    <button type="button" className="btn-secondary" onClick={() => addLevel(cfg, setCfg)}>
                        <Plus size={14} /> Add level
                    </button>
                </div>
                {(cfg.approvalLevels || []).map((lvl, idx) => (
                    <div key={lvl.level + "-" + idx} className="team-member-card" style={{ marginTop: "0.5rem" }}>
                        <div className="team-member-head">
                            <span>Level {lvl.level}</span>
                            <button
                                type="button"
                                className="btn-icon btn-danger"
                                onClick={() => {
                                    const next = [...cfg.approvalLevels];
                                    next.splice(idx, 1);
                                    setCfg({ ...cfg, approvalLevels: next });
                                }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        {(lvl.approvers || []).map((ap, j) => (
                            <div key={j} className="form-row" style={{ marginTop: 8 }}>
                                <input
                                    placeholder="Name"
                                    value={ap.name || ""}
                                    onChange={(e) => {
                                        const al = [...cfg.approvalLevels];
                                        al[idx].approvers[j] = { ...al[idx].approvers[j], name: e.target.value };
                                        setCfg({ ...cfg, approvalLevels: al });
                                    }}
                                />
                                <input
                                    placeholder="Email"
                                    type="email"
                                    value={ap.email || ""}
                                    onChange={(e) => {
                                        const al = [...cfg.approvalLevels];
                                        al[idx].approvers[j] = { ...al[idx].approvers[j], email: e.target.value };
                                        setCfg({ ...cfg, approvalLevels: al });
                                    }}
                                />
                            </div>
                        ))}
                        <button
                            type="button"
                            className="btn-secondary"
                            style={{ marginTop: 8 }}
                            onClick={() => {
                                const al = [...cfg.approvalLevels];
                                al[idx].approvers = [...(al[idx].approvers || []), { name: "", email: "" }];
                                setCfg({ ...cfg, approvalLevels: al });
                            }}
                        >
                            <Plus size={14} /> Approver
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={!!cfg.costApprovalRequired}
                        onChange={(e) => setCfg({ ...cfg, costApprovalRequired: e.target.checked })}
                    />
                    Cost approval required for this configuration
                </label>
                {cfg.costApprovalRequired && (
                    <div style={{ marginTop: 8 }}>
                        <strong>Cost approvers</strong>
                        {(cfg.costApprovers || []).map((ap, j) => (
                            <div key={j} className="form-row" style={{ marginTop: 8 }}>
                                <input
                                    placeholder="Name"
                                    value={ap.name || ""}
                                    onChange={(e) => {
                                        const ca = [...(cfg.costApprovers || [])];
                                        ca[j] = { ...ca[j], name: e.target.value };
                                        setCfg({ ...cfg, costApprovers: ca });
                                    }}
                                />
                                <input
                                    placeholder="Email"
                                    type="email"
                                    value={ap.email || ""}
                                    onChange={(e) => {
                                        const ca = [...(cfg.costApprovers || [])];
                                        ca[j] = { ...ca[j], email: e.target.value };
                                        setCfg({ ...cfg, costApprovers: ca });
                                    }}
                                />
                            </div>
                        ))}
                        <button
                            type="button"
                            className="btn-secondary"
                            style={{ marginTop: 8 }}
                            onClick={() =>
                                setCfg({
                                    ...cfg,
                                    costApprovers: [...(cfg.costApprovers || []), { name: "", email: "" }]
                                })
                            }
                        >
                            <Plus size={14} /> Cost approver
                        </button>
                    </div>
                )}
            </div>

            <div style={{ marginTop: "1rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bell size={16} /> Notification defaults
                </h4>
                <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Mandatory channels ignore end-user opt-out. Approval request emails are always mandatory.
                </p>
                {[
                    ["ticketStatusChanges", "Ticket status changes"],
                    ["approvalRequests", "Approval requests"],
                    ["approvalCompleted", "Approval completed"],
                    ["costApprovalUpdates", "Cost approval updates"],
                    ["commentsAndUpdates", "Comments / updates"]
                ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <input
                            type="checkbox"
                            checked={!!cfg.notificationPreferences?.[key]}
                            onChange={(e) =>
                                setCfg({
                                    ...cfg,
                                    notificationPreferences: {
                                        ...emptyNotif(),
                                        ...cfg.notificationPreferences,
                                        [key]: e.target.checked
                                    }
                                })
                            }
                        />
                        {label}
                        <input
                            type="checkbox"
                            title="Mandatory"
                            checked={!!cfg.notificationPreferences?.[`${key}Mandatory`]}
                            onChange={(e) =>
                                setCfg({
                                    ...cfg,
                                    notificationPreferences: {
                                        ...emptyNotif(),
                                        ...cfg.notificationPreferences,
                                        [`${key}Mandatory`]: e.target.checked
                                    }
                                })
                            }
                        />
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>mandatory</span>
                    </label>
                ))}
            </div>
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content create-ticket-modal"
                style={{ maxWidth: 720, maxHeight: "90vh", overflow: "auto" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2>
                        <Mail size={22} style={{ verticalAlign: "middle", marginRight: 8 }} />
                        Product Workflow: {project?.name}
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {error && (
                        <div className="form-error" style={{ marginBottom: "1rem" }}>
                            {error}
                        </div>
                    )}
                    {loading ? (
                        <p>Loading configuration…</p>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                                    gap: 10,
                                    marginBottom: "1rem"
                                }}
                            >
                                <div className="team-member-card">
                                    <div className="team-member-head"><strong>Default approvals</strong></div>
                                    <div>{defaultApprovalLevels} level(s)</div>
                                </div>
                                <div className="team-member-card">
                                    <div className="team-member-head"><strong>Cost approval</strong></div>
                                    <div>{defaultCostRequired ? "Required" : "Not required"}</div>
                                </div>
                                <div className="team-member-card">
                                    <div className="team-member-head"><strong>Overrides</strong></div>
                                    <div>{overrides.length} request type(s)</div>
                                </div>
                            </div>
                            <p style={{ color: "#64748b", marginBottom: "1rem" }}>
                                Default applies to all request types unless you add a request-type override below.
                                Thread emails use To/CC/BCC; approval links are sent only to configured approvers.
                            </p>
                            {renderWorkflowForm(defaultCfg, setDefaultCfg, "Default configuration")}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h3>Request Type Overrides</h3>
                                <button type="button" className="btn-primary" onClick={addOverride}>
                                    <Plus size={14} /> Add request type
                                </button>
                            </div>
                            {overrides.map((ov, i) => (
                                <div key={i} style={{ marginTop: "1rem", borderTop: "1px solid #DFE1E6", paddingTop: "1rem" }}>
                                    <div className="form-row" style={{ marginBottom: 8 }}>
                                        <label>Request type</label>
                                        <select
                                            value={ov.requestType}
                                            onChange={(e) => {
                                                const next = [...overrides];
                                                next[i] = { ...next[i], requestType: e.target.value };
                                                setOverrides(next);
                                            }}
                                        >
                                            {Object.keys(REQUEST_TYPES).map((k) => (
                                                <option key={k} value={k}>
                                                    {REQUEST_TYPES[k]}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn-icon btn-danger"
                                            onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {renderWorkflowForm(ov.configuration, (c) => {
                                        const next = [...overrides];
                                        next[i] = { ...next[i], configuration: c };
                                        setOverrides(next);
                                    }, `Override: ${REQUEST_TYPES[ov.requestType] || ov.requestType}`)}
                                </div>
                            ))}
                        </>
                    )}
                </div>
                <div className="form-actions" style={{ padding: "1rem", position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #DFE1E6" }}>
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="btn-primary" disabled={loading || saving} onClick={save}>
                        <Save size={16} /> {saving ? "Saving…" : "Save workflow"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectWorkflowEditor;
