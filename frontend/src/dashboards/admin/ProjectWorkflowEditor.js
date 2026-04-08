import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Save, Layers, Mail, Bell, ArrowUp, ArrowDown, Users, DollarSign, Shield, CheckCircle, AlertCircle, MessageSquare, Settings } from "lucide-react";
import { getProjectWorkflow, saveProjectWorkflow } from "../../services/projectWorkflowService";
import EmailChipsInput from "../../components/EmailChipsInput";

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

const normalizeApprovalLevels = (levels = []) =>
    (levels || []).map((lvl, idx) => {
        const first = Array.isArray(lvl?.approvers) && lvl.approvers.length > 0 ? lvl.approvers[0] : {};
        return {
            ...lvl,
            level: idx + 1,
            approvers: [{
                role: first?.role || "",
                name: first?.name || "",
                email: first?.email || ""
            }]
        };
    });

const ProjectWorkflowEditor = ({ project, onClose, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [docId, setDocId] = useState(null);
    const [defaultCfg, setDefaultCfg] = useState(emptyWorkflow);

    const load = useCallback(async () => {
        if (!project?.id) return;
        setLoading(true);
        setError("");
        try {
            const data = await getProjectWorkflow(project.id);
            setDocId(data.id || null);
            setDefaultCfg({
                ...emptyWorkflow(),
                ...(data.defaultConfiguration || {}),
                approvalLevels: normalizeApprovalLevels(data?.defaultConfiguration?.approvalLevels || [])
            });
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
                defaultConfiguration: {
                    ...defaultCfg,
                    approvalLevels: normalizeApprovalLevels(defaultCfg.approvalLevels || [])
                },
                requestTypeOverrides: []
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

    const addApproverRow = (cfg, setCfg) => {
        const levels = [...(cfg.approvalLevels || [])];
        levels.push({ level: levels.length + 1, approvers: [{ role: "", name: "", email: "" }] });
        setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(levels) });
    };

    const defaultApprovalLevels = (defaultCfg.approvalLevels || []).length;
    const defaultCostRequired = !!defaultCfg.costApprovalRequired;

    const renderWorkflowForm = (cfg, setCfg, title) => (
        <div className="workflow-editor-form">
            {/* Email Routing Section */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon">
                        <Mail size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Email Routing</h4>
                        <p>Configure notification recipients</p>
                    </div>
                </div>
                <div className="workflow-section-content">
                    <div className="workflow-input-group">
                        <label>
                            <span className="label-text">Primary Recipients</span>
                            <span className="label-hint">To</span>
                        </label>
                        <EmailChipsInput
                            mode="array"
                            value={cfg.emailRouting?.to || []}
                            onChange={(to) =>
                                setCfg({
                                    ...cfg,
                                    emailRouting: { ...cfg.emailRouting, to }
                                })
                            }
                            placeholder="Enter email address"
                        />
                    </div>
                    <div className="workflow-input-group">
                        <label>
                            <span className="label-text">Copy Recipients</span>
                            <span className="label-hint">CC</span>
                        </label>
                        <EmailChipsInput
                            mode="array"
                            value={cfg.emailRouting?.cc || []}
                            onChange={(cc) =>
                                setCfg({
                                    ...cfg,
                                    emailRouting: { ...cfg.emailRouting, cc }
                                })
                            }
                            placeholder="Enter email address"
                        />
                    </div>
                    <div className="workflow-input-group">
                        <label>
                            <span className="label-text">Hidden Recipients</span>
                            <span className="label-hint">BCC</span>
                        </label>
                        <EmailChipsInput
                            mode="array"
                            value={cfg.emailRouting?.bcc || []}
                            onChange={(bcc) =>
                                setCfg({
                                    ...cfg,
                                    emailRouting: { ...cfg.emailRouting, bcc }
                                })
                            }
                            placeholder="Enter email address"
                        />
                    </div>
                </div>
            </div>

            {/* Default Approvers Section */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon accent">
                        <Users size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Quick Approvers</h4>
                        <p>Default team members for fast approval</p>
                    </div>
                    <button
                        type="button"
                        className="btn-add-item"
                        onClick={() => setCfg({ ...cfg, managers: [...(cfg.managers || []), { name: "", email: "" }] })}
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>
                <div className="workflow-section-content">
                    {(cfg.managers || []).length === 0 ? (
                        <div className="workflow-empty-hint">
                            No quick approvers configured. Add team members for streamlined approval routing.
                        </div>
                    ) : (
                        <div className="approver-list">
                            {(cfg.managers || []).map((m, idx) => (
                                <div key={`mgr-${idx}`} className="approver-row">
                                    <div className="approver-number">{idx + 1}</div>
                                    <div className="approver-inputs">
                                        <input
                                            placeholder="Name"
                                            value={m.name || ""}
                                            onChange={(e) => {
                                                const managers = [...(cfg.managers || [])];
                                                managers[idx] = { ...managers[idx], name: e.target.value };
                                                setCfg({ ...cfg, managers });
                                            }}
                                        />
                                        <input
                                            placeholder="Email"
                                            type="email"
                                            value={m.email || ""}
                                            onChange={(e) => {
                                                const managers = [...(cfg.managers || [])];
                                                managers[idx] = { ...managers[idx], email: e.target.value };
                                                setCfg({ ...cfg, managers });
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-remove-item"
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
                    )}
                </div>
            </div>

            {/* Approval Chain Section */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon primary">
                        <Shield size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Approval Chain</h4>
                        <p>Sequential approval workflow configuration</p>
                    </div>
                    <button type="button" className="btn-add-item" onClick={() => addApproverRow(cfg, setCfg)}>
                        <Plus size={14} /> Add Level
                    </button>
                </div>
                <div className="workflow-section-content">
                    {(cfg.approvalLevels || []).length === 0 ? (
                        <div className="workflow-empty-hint">
                            No approval levels configured. Add levels to create an approval hierarchy.
                        </div>
                    ) : (
                        <div className="approval-chain">
                            {(cfg.approvalLevels || []).map((lvl, idx) => (
                                <div key={lvl.level + "-" + idx} className="approval-level-card">
                                    <div className="approval-level-header">
                                        <div className="level-badge">Level {idx + 1}</div>
                                        <div className="level-actions">
                                            <button
                                                type="button"
                                                className="btn-icon-sm"
                                                disabled={idx === 0}
                                                title="Move up"
                                                onClick={() => {
                                                    if (idx === 0) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                    setCfg({
                                                        ...cfg,
                                                        approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 }))
                                                    });
                                                }}
                                            >
                                                <ArrowUp size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-icon-sm"
                                                disabled={idx === (cfg.approvalLevels || []).length - 1}
                                                title="Move down"
                                                onClick={() => {
                                                    if (idx >= (cfg.approvalLevels || []).length - 1) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                    setCfg({
                                                        ...cfg,
                                                        approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 }))
                                                    });
                                                }}
                                            >
                                                <ArrowDown size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-icon-sm danger"
                                                title="Remove"
                                                onClick={() => {
                                                    const next = [...cfg.approvalLevels];
                                                    next.splice(idx, 1);
                                                    setCfg({
                                                        ...cfg,
                                                        approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 }))
                                                    });
                                                }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="approval-level-fields">
                                        <input
                                            placeholder="Role (e.g. Lead, Manager)"
                                            value={lvl.approvers?.[0]?.role || ""}
                                            onChange={(e) => {
                                                const al = [...cfg.approvalLevels];
                                                al[idx].approvers = [{ ...(al[idx].approvers?.[0] || {}), role: e.target.value }];
                                                setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(al) });
                                            }}
                                        />
                                        <input
                                            placeholder="Name"
                                            value={lvl.approvers?.[0]?.name || ""}
                                            onChange={(e) => {
                                                const al = [...cfg.approvalLevels];
                                                al[idx].approvers = [{ ...(al[idx].approvers?.[0] || {}), name: e.target.value }];
                                                setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(al) });
                                            }}
                                        />
                                        <input
                                            placeholder="Email"
                                            type="email"
                                            value={lvl.approvers?.[0]?.email || ""}
                                            onChange={(e) => {
                                                const al = [...cfg.approvalLevels];
                                                al[idx].approvers = [{ ...(al[idx].approvers?.[0] || {}), email: e.target.value }];
                                                setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(al) });
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Cost Approval Section */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon warning">
                        <DollarSign size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Cost Authorization</h4>
                        <p>Financial approval requirements</p>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={!!cfg.costApprovalRequired}
                            onChange={(e) => setCfg({ ...cfg, costApprovalRequired: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {cfg.costApprovalRequired && (
                    <div className="workflow-section-content">
                        <div className="cost-approvers-section">
                            <div className="section-subheader">
                                <span>Cost Approvers</span>
                                <button
                                    type="button"
                                    className="btn-add-item small"
                                    onClick={() =>
                                        setCfg({
                                            ...cfg,
                                            costApprovers: [...(cfg.costApprovers || []), { name: "", email: "" }]
                                        })
                                    }
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            {(cfg.costApprovers || []).length === 0 ? (
                                <div className="workflow-empty-hint">
                                    Add cost approvers who can authorize financial expenditures.
                                </div>
                            ) : (
                                <div className="approver-list">
                                    {(cfg.costApprovers || []).map((ap, j) => (
                                        <div key={j} className="approver-row compact">
                                            <div className="approver-inputs">
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
                                            <button
                                                type="button"
                                                className="btn-remove-item"
                                                onClick={() => {
                                                    const ca = [...(cfg.costApprovers || [])];
                                                    ca.splice(j, 1);
                                                    setCfg({ ...cfg, costApprovers: ca });
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Notifications Section */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon info">
                        <Bell size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Notifications</h4>
                        <p>Configure alert preferences</p>
                    </div>
                </div>
                <div className="workflow-section-content">
                    <div className="notification-grid">
                        {[
                            { key: "ticketStatusChanges", label: "Status Updates", icon: AlertCircle, desc: "When ticket status changes" },
                            { key: "approvalRequests", label: "Approval Requests", icon: Shield, desc: "When approval is needed" },
                            { key: "approvalCompleted", label: "Approvals Done", icon: CheckCircle, desc: "When approval is completed" },
                            { key: "costApprovalUpdates", label: "Cost Updates", icon: DollarSign, desc: "Financial approval status" },
                            { key: "commentsAndUpdates", label: "Comments", icon: MessageSquare, desc: "New comments and updates" }
                        ].map(({ key, label, icon: Icon, desc }) => (
                            <div key={key} className="notification-item">
                                <div className="notification-info">
                                    <Icon size={16} className="notification-icon" />
                                    <div>
                                        <span className="notification-label">{label}</span>
                                        <span className="notification-desc">{desc}</span>
                                    </div>
                                </div>
                                <div className="notification-controls">
                                    <label className="checkbox-pill">
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
                                        <span>Enabled</span>
                                    </label>
                                    <label className="checkbox-pill mandatory">
                                        <input
                                            type="checkbox"
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
                                        <span>Required</span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="modal-overlay workflow-modal-overlay" onClick={onClose}>
            <div
                className="modal-content workflow-editor-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header workflow-modal-header">
                    <div className="modal-title-group">
                        <div className="modal-icon">
                            <Settings size={22} />
                        </div>
                        <div>
                            <h2>Workflow Configuration</h2>
                            <span className="modal-subtitle">{project?.name}</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body workflow-modal-body">
                    {error && (
                        <div className="workflow-error">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                    {loading ? (
                        <div className="workflow-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading configuration...</span>
                        </div>
                    ) : (
                        <>
                            <div className="workflow-summary-cards">
                                <div className="summary-card">
                                    <div className="summary-icon">
                                        <Users size={18} />
                                    </div>
                                    <div className="summary-content">
                                        <span className="summary-value">{defaultApprovalLevels}</span>
                                        <span className="summary-label">Approval Levels</span>
                                    </div>
                                </div>
                                <div className={`summary-card ${defaultCostRequired ? 'active' : ''}`}>
                                    <div className="summary-icon">
                                        <DollarSign size={18} />
                                    </div>
                                    <div className="summary-content">
                                        <span className="summary-value">{defaultCostRequired ? 'Active' : 'Off'}</span>
                                        <span className="summary-label">Cost Approval</span>
                                    </div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-icon">
                                        <Layers size={18} />
                                    </div>
                                    <div className="summary-content">
                                        <span className="summary-value">Standard</span>
                                        <span className="summary-label">Workflow Mode</span>
                                    </div>
                                </div>
                            </div>
                            {renderWorkflowForm(defaultCfg, setDefaultCfg, "Default configuration")}
                        </>
                    )}
                </div>
                <div className="modal-footer workflow-modal-footer">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="btn-primary" disabled={loading || saving} onClick={save}>
                        <Save size={16} /> {saving ? "Saving..." : "Save Configuration"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectWorkflowEditor;
