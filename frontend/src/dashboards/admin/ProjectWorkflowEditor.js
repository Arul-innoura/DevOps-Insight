import React, { useState, useEffect, useCallback } from "react";
import {
    X, Plus, Trash2, Save, Layers, Mail, Bell, ArrowUp, ArrowDown,
    Users, DollarSign, Shield, CheckCircle, AlertCircle, MessageSquare,
    Settings, Cloud, Cpu, Database, HardDrive, Globe, Server, ChevronDown, ChevronRight
} from "lucide-react";
import { getProjectWorkflow, saveProjectWorkflow } from "../../services/projectWorkflowService";
import { ENVIRONMENTS, updateProjectEnvironments } from "../../services/ticketService";
import EmailChipsInput from "../../components/EmailChipsInput";

const ENV_COLORS = {
    Dev:        { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd", dot: "#3b82f6" },
    QA:         { bg: "#fef3c7", text: "#92400e", border: "#fcd34d", dot: "#f59e0b" },
    Stage:      { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd", dot: "#8b5cf6" },
    UAT:        { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7", dot: "#10b981" },
    Production: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", dot: "#ef4444" }
};

const getEnvStyle = (env) => ENV_COLORS[env] || { bg: "#f3f4f6", text: "#374151", border: "#d1d5db", dot: "#6b7280" };

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

const emptyInfra = () => ({
    cpu: '',
    memory: '',
    databaseRequired: false,
    databaseType: '',
    databaseAllocation: '',
    cloudProvider: '',
    region: '',
    monthlyCostEstimate: ''
});

const emptyWorkflow = () => ({
    emailRouting: { to: [], cc: [], bcc: [] },
    approvalLevels: [],
    managers: [],
    costApprovalRequired: false,
    costApprovers: [],
    notificationPreferences: emptyNotif(),
    infrastructure: emptyInfra()
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

const normalizeCfg = (raw) => ({
    ...emptyWorkflow(),
    ...(raw || {}),
    infrastructure: { ...emptyInfra(), ...(raw?.infrastructure || {}) },
    approvalLevels: normalizeApprovalLevels(raw?.approvalLevels || []),
    notificationPreferences: { ...emptyNotif(), ...(raw?.notificationPreferences || {}) },
    emailRouting: { to: [], cc: [], bcc: [], ...(raw?.emailRouting || {}) },
    managers: raw?.managers || [],
    costApprovers: raw?.costApprovers || []
});

// ─── Workflow Form ────────────────────────────────────────────────────────────
const WorkflowForm = ({ cfg, setCfg }) => {
    const addApproverRow = () => {
        const levels = [...(cfg.approvalLevels || [])];
        levels.push({ level: levels.length + 1, approvers: [{ role: "", name: "", email: "" }] });
        setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(levels) });
    };

    return (
        <div className="workflow-editor-form">
            {/* Approval Chain */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon primary">
                        <Shield size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Approval Chain</h4>
                        <p>Level-wise approval workflow — each level sends to the next on approval</p>
                    </div>
                    <button type="button" className="btn-add-item" onClick={addApproverRow}>
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
                                <div key={`${lvl.level}-${idx}`} className="approval-level-card">
                                    <div className="approval-level-header">
                                        <div className="level-badge">Level {idx + 1}</div>
                                        <div className="level-actions">
                                            <button
                                                type="button" className="btn-icon-sm"
                                                disabled={idx === 0} title="Move up"
                                                onClick={() => {
                                                    if (idx === 0) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><ArrowUp size={12} /></button>
                                            <button
                                                type="button" className="btn-icon-sm"
                                                disabled={idx === (cfg.approvalLevels || []).length - 1} title="Move down"
                                                onClick={() => {
                                                    if (idx >= (cfg.approvalLevels || []).length - 1) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><ArrowDown size={12} /></button>
                                            <button
                                                type="button" className="btn-icon-sm danger" title="Remove"
                                                onClick={() => {
                                                    const next = [...cfg.approvalLevels];
                                                    next.splice(idx, 1);
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <div className="approval-level-fields">
                                        <input
                                            placeholder="Designation / Role (e.g. Lead, Manager)"
                                            value={lvl.approvers?.[0]?.role || ""}
                                            onChange={(e) => {
                                                const al = [...cfg.approvalLevels];
                                                al[idx].approvers = [{ ...(al[idx].approvers?.[0] || {}), role: e.target.value }];
                                                setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(al) });
                                            }}
                                        />
                                        <input
                                            placeholder="Full Name"
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

            {/* Email Routing */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon">
                        <Mail size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Email Routing</h4>
                        <p>Configure notification recipients for this environment</p>
                    </div>
                </div>
                <div className="workflow-section-content">
                    {[
                        { key: "to", label: "Primary Recipients", hint: "To" },
                        { key: "cc", label: "Copy Recipients", hint: "CC" },
                        { key: "bcc", label: "Hidden Recipients", hint: "BCC" }
                    ].map(({ key, label, hint }) => (
                        <div className="workflow-input-group" key={key}>
                            <label>
                                <span className="label-text">{label}</span>
                                <span className="label-hint">{hint}</span>
                            </label>
                            <EmailChipsInput
                                mode="array"
                                value={cfg.emailRouting?.[key] || []}
                                onChange={(val) => setCfg({ ...cfg, emailRouting: { ...cfg.emailRouting, [key]: val } })}
                                placeholder="Enter email address"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Cost Authorization */}
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
                                    type="button" className="btn-add-item small"
                                    onClick={() => setCfg({ ...cfg, costApprovers: [...(cfg.costApprovers || []), { name: "", email: "" }] })}
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            {(cfg.costApprovers || []).length === 0 ? (
                                <div className="workflow-empty-hint">Add cost approvers who can authorize financial expenditures.</div>
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
                                                type="button" className="btn-remove-item"
                                                onClick={() => {
                                                    const ca = [...(cfg.costApprovers || [])];
                                                    ca.splice(j, 1);
                                                    setCfg({ ...cfg, costApprovers: ca });
                                                }}
                                            ><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Infrastructure & Cloud */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon" style={{ background: '#ecfeff', color: '#0891b2' }}>
                        <Server size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Infrastructure & Cloud</h4>
                        <p>Resource allocation, cloud provider, and cost configuration</p>
                    </div>
                </div>
                <div className="workflow-section-content">

                    {/* Cloud Provider pills */}
                    <div className="infra-group-label"><Cloud size={13} /> Cloud Provider</div>
                    <div className="infra-provider-pills">
                        {[
                            { value: 'Azure',      emoji: '☁️',  color: '#0078d4', bg: '#e8f4fd' },
                            { value: 'AWS',        emoji: '🟠',  color: '#ff9900', bg: '#fff8ee' },
                            { value: 'GCP',        emoji: '🔵',  color: '#4285f4', bg: '#eaf1ff' },
                            { value: 'On-Premise', emoji: '🏢',  color: '#64748b', bg: '#f1f5f9' },
                        ].map(({ value, emoji, color, bg }) => {
                            const active = cfg.infrastructure?.cloudProvider === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    className={`infra-provider-pill ${active ? 'active' : ''}`}
                                    style={active ? { borderColor: color, background: bg, color } : {}}
                                    onClick={() => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, cloudProvider: active ? '' : value } })}
                                >
                                    <span>{emoji}</span>
                                    <span>{value}</span>
                                    {active && <span className="infra-pill-check">✓</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Region */}
                    <div className="workflow-input-group" style={{ marginTop: '1rem' }}>
                        <label>
                            <span className="label-text"><Globe size={13} style={{ marginRight: 4 }} />Zone / Region</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. East US 2, ap-south-1, eu-west-1"
                            value={cfg.infrastructure?.region || ''}
                            onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, region: e.target.value } })}
                        />
                    </div>

                    {/* Compute resources */}
                    <div className="infra-group-label" style={{ marginTop: '1.25rem' }}><Cpu size={13} /> Compute Resources</div>
                    <div className="infra-resource-cards">
                        <div className="infra-resource-card cpu">
                            <div className="infra-resource-icon"><Cpu size={20} /></div>
                            <div className="infra-resource-body">
                                <div className="infra-resource-label">CPU Cores</div>
                                <input
                                    type="text"
                                    className="infra-resource-input"
                                    placeholder="e.g. 2 vCPU"
                                    value={cfg.infrastructure?.cpu || ''}
                                    onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, cpu: e.target.value } })}
                                />
                            </div>
                        </div>
                        <div className="infra-resource-card mem">
                            <div className="infra-resource-icon"><HardDrive size={20} /></div>
                            <div className="infra-resource-body">
                                <div className="infra-resource-label">Memory (RAM)</div>
                                <input
                                    type="text"
                                    className="infra-resource-input"
                                    placeholder="e.g. 8 GB"
                                    value={cfg.infrastructure?.memory || ''}
                                    onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, memory: e.target.value } })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Database */}
                    <div className="infra-group-label" style={{ marginTop: '1.25rem' }}><Database size={13} /> Database</div>
                    <div className="infra-db-toggle">
                        <div className="infra-db-toggle-row">
                            <div className="infra-db-toggle-label">
                                <Database size={15} />
                                <span>Database Required</span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={!!cfg.infrastructure?.databaseRequired}
                                    onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, databaseRequired: e.target.checked } })}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        {cfg.infrastructure?.databaseRequired && (
                            <div className="infra-db-fields">
                                <div className="infra-db-type-grid">
                                    {['PostgreSQL','MySQL','MongoDB','SQL Server','Redis','CosmosDB','DynamoDB'].map(db => {
                                        const icons = { PostgreSQL:'🐘', MySQL:'🐬', MongoDB:'🍃', 'SQL Server':'🪟', Redis:'🔴', CosmosDB:'🌌', DynamoDB:'⚡' };
                                        const active = cfg.infrastructure?.databaseType === db;
                                        return (
                                            <button
                                                key={db}
                                                type="button"
                                                className={`infra-db-pill ${active ? 'active' : ''}`}
                                                onClick={() => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, databaseType: active ? '' : db } })}
                                            >
                                                <span>{icons[db] || '🗄️'}</span>
                                                <span>{db}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="workflow-input-group" style={{ marginTop: '0.75rem' }}>
                                    <label><span className="label-text">Storage Allocation</span></label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 50 GB, Standard S1, 100 IOPS"
                                        value={cfg.infrastructure?.databaseAllocation || ''}
                                        onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, databaseAllocation: e.target.value } })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Monthly Cost */}
                    <div className="infra-cost-box">
                        <div className="infra-cost-label">
                            <DollarSign size={15} />
                            <span>Monthly Estimated Cost</span>
                            <span className="infra-cost-badge">Admin &amp; DevOps only</span>
                        </div>
                        <input
                            type="text"
                            className="infra-cost-input"
                            placeholder="e.g. $150 / month"
                            value={cfg.infrastructure?.monthlyCostEstimate || ''}
                            onChange={(e) => setCfg({ ...cfg, infrastructure: { ...cfg.infrastructure, monthlyCostEstimate: e.target.value } })}
                        />
                    </div>

                </div>
            </div>

            {/* Notifications */}
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
                                            onChange={(e) => setCfg({
                                                ...cfg,
                                                notificationPreferences: {
                                                    ...emptyNotif(),
                                                    ...cfg.notificationPreferences,
                                                    [key]: e.target.checked
                                                }
                                            })}
                                        />
                                        <span>Enabled</span>
                                    </label>
                                    <label className="checkbox-pill mandatory">
                                        <input
                                            type="checkbox"
                                            checked={!!cfg.notificationPreferences?.[`${key}Mandatory`]}
                                            onChange={(e) => setCfg({
                                                ...cfg,
                                                notificationPreferences: {
                                                    ...emptyNotif(),
                                                    ...cfg.notificationPreferences,
                                                    [`${key}Mandatory`]: e.target.checked
                                                }
                                            })}
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
};

// ─── Main Editor ──────────────────────────────────────────────────────────────
const ProjectWorkflowEditor = ({ project, onClose, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [docId, setDocId] = useState(null);
    const [activeTab, setActiveTab] = useState("default");

    // default config + per-env configs
    const [defaultCfg, setDefaultCfg] = useState(emptyWorkflow);
    const [envCfgs, setEnvCfgs] = useState({});
    /** Ordered list of environment names (editable here; persisted on product + workflow). */
    const [managedEnvs, setManagedEnvs] = useState([]);
    const [newEnvName, setNewEnvName] = useState("");

    const projectEnvsKey = Array.isArray(project?.environments) ? project.environments.join("\u0001") : "";

    const load = useCallback(async () => {
        if (!project?.id) return;
        setLoading(true);
        setError("");
        try {
            const data = await getProjectWorkflow(project.id);
            setDocId(data.id || null);
            setDefaultCfg(normalizeCfg(data.defaultConfiguration));

            const rawEnvCfgs = data.environmentConfigurations || {};
            const fromProject = Array.isArray(project?.environments) ? project.environments.filter(Boolean) : [];
            const fromStored = Object.keys(rawEnvCfgs);
            const merged = [...fromProject];
            for (const k of fromStored) {
                if (k && !merged.includes(k)) merged.push(k);
            }

            const normalized = {};
            for (const env of merged) {
                normalized[env] = normalizeCfg(rawEnvCfgs[env] || null);
            }
            setManagedEnvs(merged);
            setEnvCfgs(normalized);
        } catch (e) {
            setError(e.message || "Failed to load workflow");
        } finally {
            setLoading(false);
        }
    }, [project?.id, projectEnvsKey]);

    useEffect(() => { load(); }, [load]);

    const removeManagedEnv = (env) => {
        setManagedEnvs((prev) => prev.filter((e) => e !== env));
        setEnvCfgs((prev) => {
            const next = { ...prev };
            delete next[env];
            return next;
        });
        if (activeTab === env) setActiveTab("default");
    };

    const addManagedEnv = (name) => {
        const t = String(name || "").trim();
        if (!t) return;
        setManagedEnvs((prev) => {
            if (prev.includes(t)) return prev;
            return [...prev, t];
        });
        setEnvCfgs((prev) => {
            if (prev[t]) return prev;
            return { ...prev, [t]: normalizeCfg(null) };
        });
        setActiveTab(t);
    };

    const addCustomEnv = () => {
        addManagedEnv(newEnvName);
        setNewEnvName("");
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            await updateProjectEnvironments(project.id, managedEnvs);

            const filteredCfgs = Object.fromEntries(
                managedEnvs.map((env) => {
                    const cfg = envCfgs[env] || emptyWorkflow();
                    return [
                        env,
                        { ...cfg, approvalLevels: normalizeApprovalLevels(cfg.approvalLevels || []) }
                    ];
                })
            );

            const body = {
                id: docId,
                projectId: project.id,
                defaultConfiguration: {
                    ...defaultCfg,
                    approvalLevels: normalizeApprovalLevels(defaultCfg.approvalLevels || [])
                },
                environmentConfigurations: filteredCfgs,
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

    const setEnvCfg = (env, cfg) => setEnvCfgs(prev => ({ ...prev, [env]: cfg }));

    const activeCfg = activeTab === "default" ? defaultCfg : (envCfgs[activeTab] || emptyWorkflow());
    const setActiveCfg = (cfg) => {
        if (activeTab === "default") setDefaultCfg(cfg);
        else setEnvCfg(activeTab, cfg);
    };

    const getEnvLevelCount = (env) => (envCfgs[env]?.approvalLevels || []).length;
    const getEnvCloud = (env) => envCfgs[env]?.infrastructure?.cloudProvider || '';

    const defaultLevels = (defaultCfg.approvalLevels || []).length;
    const defaultCloud = defaultCfg.infrastructure?.cloudProvider || '';

    return (
        <div className="modal-overlay workflow-modal-overlay" onClick={onClose}>
            <div className="modal-content workflow-editor-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header workflow-modal-header">
                    <div className="modal-title-group">
                        <div className="modal-icon"><Settings size={22} /></div>
                        <div>
                            <h2>Configure Workflow</h2>
                            <span className="modal-subtitle">{project?.name} · Manage approval workflows, notifications, and cost authorization settings</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body workflow-modal-body">
                    {error && (
                        <div className="workflow-error">
                            <AlertCircle size={16} /><span>{error}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="workflow-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading configuration...</span>
                        </div>
                    ) : (
                        <>
                            {/* Summary cards */}
                            <div className="workflow-summary-cards">
                                <div className="summary-card">
                                    <div className="summary-icon"><Users size={18} /></div>
                                    <div className="summary-content">
                                        <span className="summary-value">{defaultLevels}</span>
                                        <span className="summary-label">Default Levels</span>
                                    </div>
                                </div>
                                <div className={`summary-card ${defaultCfg.costApprovalRequired ? 'active' : ''}`}>
                                    <div className="summary-icon"><DollarSign size={18} /></div>
                                    <div className="summary-content">
                                        <span className="summary-value">{defaultCfg.costApprovalRequired ? 'Active' : 'Off'}</span>
                                        <span className="summary-label">Cost Approval</span>
                                    </div>
                                </div>
                                <div className={`summary-card ${defaultCloud ? 'active' : ''}`}>
                                    <div className="summary-icon"><Cloud size={18} /></div>
                                    <div className="summary-content">
                                        <span className="summary-value">{defaultCloud || 'N/A'}</span>
                                        <span className="summary-label">Default Cloud</span>
                                    </div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-icon"><Layers size={18} /></div>
                                    <div className="summary-content">
                                        <span className="summary-value">{managedEnvs.length || 0}</span>
                                        <span className="summary-label">Environments</span>
                                    </div>
                                </div>
                            </div>

                            {/* Manage environments — add / remove / custom */}
                            <div className="workflow-env-manager">
                                <div className="workflow-env-manager-head">
                                    <div>
                                        <h4 className="workflow-env-manager-title">Deployment environments</h4>
                                        <p className="workflow-env-manager-hint">
                                            Add or remove environments for this product. Each can have its own workflow override.
                                            Custom names appear in request forms for this product.
                                        </p>
                                    </div>
                                </div>
                                <div className="workflow-env-chips">
                                    {managedEnvs.length === 0 ? (
                                        <span className="workflow-env-empty">No environments yet — add from the catalog or create a custom name.</span>
                                    ) : (
                                        managedEnvs.map((env) => {
                                            const st = getEnvStyle(env);
                                            return (
                                                <span key={env} className="workflow-env-chip" style={{ borderColor: st.border, background: st.bg, color: st.text }}>
                                                    <span className="workflow-env-chip-dot" style={{ background: st.dot }} />
                                                    {env}
                                                    <button
                                                        type="button"
                                                        className="workflow-env-chip-remove"
                                                        title={`Remove ${env}`}
                                                        onClick={() => removeManagedEnv(env)}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                                <div className="workflow-env-add-row">
                                    <span className="workflow-env-add-label">Add preset</span>
                                    <div className="workflow-env-catalog">
                                        {ENVIRONMENTS.map((env) => (
                                            <button
                                                key={env}
                                                type="button"
                                                className={`workflow-env-catalog-btn ${managedEnvs.includes(env) ? "disabled" : ""}`}
                                                disabled={managedEnvs.includes(env)}
                                                onClick={() => addManagedEnv(env)}
                                            >
                                                <Plus size={12} /> {env}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="workflow-env-custom-row">
                                    <span className="workflow-env-add-label">New environment</span>
                                    <input
                                        type="text"
                                        className="workflow-env-custom-input"
                                        placeholder="e.g. Sandbox, DR, EU-West"
                                        value={newEnvName}
                                        onChange={(e) => setNewEnvName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomEnv())}
                                    />
                                    <button type="button" className="btn-secondary workflow-env-add-custom" onClick={addCustomEnv}>
                                        <Plus size={14} /> Add
                                    </button>
                                </div>
                            </div>

                            {/* Environment tabs */}
                            <div className="workflow-env-tabs">
                                <button
                                    type="button"
                                    className={`workflow-env-tab ${activeTab === 'default' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('default')}
                                >
                                    <Layers size={13} /> Default
                                    {defaultLevels > 0 && (
                                        <span className="env-tab-badge">{defaultLevels} lvl</span>
                                    )}
                                </button>
                                {managedEnvs.map(env => {
                                    const style = getEnvStyle(env);
                                    const lvlCount = getEnvLevelCount(env);
                                    const cloud = getEnvCloud(env);
                                    const isActive = activeTab === env;
                                    return (
                                        <button
                                            key={env}
                                            type="button"
                                            className={`workflow-env-tab ${isActive ? 'active' : ''}`}
                                            style={isActive ? { borderColor: style.dot, color: style.text, background: style.bg } : {}}
                                            onClick={() => setActiveTab(env)}
                                        >
                                            <span style={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: style.dot || '#6b7280',
                                                display: 'inline-block', flexShrink: 0
                                            }} />
                                            {env}
                                            {lvlCount > 0 && <span className="env-tab-badge">{lvlCount} lvl</span>}
                                            {cloud && <span className="env-tab-badge cloud">{cloud}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Tab label */}
                            <div className="workflow-tab-label">
                                {activeTab === 'default' ? (
                                    <span>Default configuration — applies to all environments unless overridden below</span>
                                ) : (
                                    <span>
                                        <span style={{
                                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                                            background: getEnvStyle(activeTab).dot || '#6b7280',
                                            marginRight: 6, verticalAlign: 'middle'
                                        }} />
                                        {activeTab} environment — overrides the default workflow for this environment only
                                    </span>
                                )}
                            </div>

                            {/* Active form */}
                            <WorkflowForm cfg={activeCfg} setCfg={setActiveCfg} />
                        </>
                    )}
                </div>

                <div className="modal-footer workflow-modal-footer">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-primary" disabled={loading || saving} onClick={save}>
                        <Save size={16} /> {saving ? "Saving..." : "Save Configuration"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectWorkflowEditor;
