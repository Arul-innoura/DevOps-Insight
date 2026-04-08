import React, { useState, useEffect, useCallback } from "react";
import {
    ChevronDown,
    ChevronRight,
    Building,
    Save,
    CheckCircle,
    Tag,
    DollarSign,
    Cpu,
    Cloud,
    Users,
    ToggleLeft,
    ToggleRight
} from "lucide-react";
import { getProjects } from "../../services/ticketService";

const CURRENCIES = ["USD", "INR", "EUR", "GBP"];

const ENV_COLORS = {
    Dev: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
    QA: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
    Stage: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
    UAT: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
    Production: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" }
};

const DEFAULT_ENV_META = {
    managerName: "",
    managerEmail: "",
    leadName: "",
    leadEmail: "",
    ceoName: "",
    ceoEmail: "",
    costApproval: false,
    cloudTag: "",
    cpuUtilization: "",
    estimatedCost: "",
    currency: "USD"
};

const storageKey = (productId, env) =>
    `nametag_products_${productId}_${env}`;

const loadMeta = (productId, env) => {
    try {
        const raw = localStorage.getItem(storageKey(productId, env));
        if (raw) return { ...DEFAULT_ENV_META, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_ENV_META };
};

const saveMeta = (productId, env, data) => {
    try {
        localStorage.setItem(storageKey(productId, env), JSON.stringify(data));
    } catch { /* ignore */ }
};

const CpuBar = ({ value }) => {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    const color = pct >= 80 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#22c55e";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <div style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: "#e5e7eb",
                overflow: "hidden"
            }}>
                <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 4,
                    transition: "width 0.3s ease"
                }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: "#6b7280", minWidth: 36 }}>{pct}%</span>
        </div>
    );
};

const EnvironmentForm = ({ projectId, env, onSaved }) => {
    const [form, setForm] = useState(() => loadMeta(projectId, env));
    const [saved, setSaved] = useState(false);

    const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleUpdate = (e) => {
        e.preventDefault();
        saveMeta(projectId, env, form);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
        onSaved?.();
    };

    const envStyle = ENV_COLORS[env] || { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };

    return (
        <form className="team-form" onSubmit={handleUpdate} style={{ marginTop: "1rem" }}>
            {/* Contacts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        <Users size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Manager Name
                    </label>
                    <input
                        type="text"
                        placeholder="Manager full name"
                        value={form.managerName}
                        onChange={(e) => set("managerName", e.target.value)}
                    />
                </div>
                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        Manager Email
                    </label>
                    <input
                        type="email"
                        placeholder="manager@company.com"
                        value={form.managerEmail}
                        onChange={(e) => set("managerEmail", e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        Lead Name
                    </label>
                    <input
                        type="text"
                        placeholder="Tech lead full name"
                        value={form.leadName}
                        onChange={(e) => set("leadName", e.target.value)}
                    />
                </div>
                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        Lead Email
                    </label>
                    <input
                        type="email"
                        placeholder="lead@company.com"
                        value={form.leadEmail}
                        onChange={(e) => set("leadEmail", e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        CEO Name
                    </label>
                    <input
                        type="text"
                        placeholder="CEO full name"
                        value={form.ceoName}
                        onChange={(e) => set("ceoName", e.target.value)}
                    />
                </div>
                <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                        CEO Email
                    </label>
                    <input
                        type="email"
                        placeholder="ceo@company.com"
                        value={form.ceoEmail}
                        onChange={(e) => set("ceoEmail", e.target.value)}
                    />
                </div>
            </div>

            {/* Cost Approval Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 0", borderTop: "1px solid #e5e7eb", marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", flex: 1 }}>
                    Cost Approval Required
                </span>
                <button
                    type="button"
                    onClick={() => set("costApproval", !form.costApproval)}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        color: form.costApproval ? "#22c55e" : "#9ca3af"
                    }}
                    title={form.costApproval ? "Disable cost approval" : "Enable cost approval"}
                >
                    {form.costApproval
                        ? <ToggleRight size={32} />
                        : <ToggleLeft size={32} />}
                </button>
                <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: form.costApproval ? "#22c55e" : "#9ca3af"
                }}>
                    {form.costApproval ? "ON" : "OFF"}
                </span>
            </div>

            {/* Cloud Tag */}
            <div style={{ marginTop: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    <Cloud size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Cloud Tag
                </label>
                <input
                    type="text"
                    placeholder="e.g. AWS us-east-1, Azure, GCP"
                    value={form.cloudTag}
                    onChange={(e) => set("cloudTag", e.target.value)}
                />
            </div>

            {/* CPU Utilization */}
            <div style={{ marginTop: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    <Cpu size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    CPU / Resource Utilization (%)
                </label>
                <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0–100"
                    value={form.cpuUtilization}
                    onChange={(e) => set("cpuUtilization", e.target.value)}
                    style={{ maxWidth: 160 }}
                />
                <CpuBar value={form.cpuUtilization} />
            </div>

            {/* Estimated Cost */}
            <div style={{ marginTop: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    <DollarSign size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Estimated Cost
                </label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        type="number"
                        min="0"
                        placeholder="Amount"
                        value={form.estimatedCost}
                        onChange={(e) => set("estimatedCost", e.target.value)}
                        style={{ maxWidth: 180 }}
                    />
                    <select
                        value={form.currency}
                        onChange={(e) => set("currency", e.target.value)}
                        style={{ maxWidth: 90 }}
                    >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <p style={{
                    fontSize: "0.72rem",
                    color: "#6b7280",
                    fontStyle: "italic",
                    marginTop: "0.35rem",
                    marginBottom: 0
                }}>
                    * Amount is estimated and may vary
                </p>
            </div>

            {/* Update Button */}
            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button type="submit" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Save size={15} /> Update
                </button>
                {saved && (
                    <span style={{ fontSize: "0.8rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle size={14} /> Saved
                    </span>
                )}
            </div>
        </form>
    );
};

const EnvSection = ({ projectId, env }) => {
    const [open, setOpen] = useState(false);
    const envStyle = ENV_COLORS[env] || { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
    const meta = loadMeta(projectId, env);
    const hasData = meta.managerName || meta.cloudTag || meta.estimatedCost;

    return (
        <div style={{
            border: `1px solid ${envStyle.border}`,
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: "0.5rem"
        }}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.6rem 1rem",
                    background: envStyle.bg,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left"
                }}
            >
                {open ? <ChevronDown size={15} color={envStyle.text} /> : <ChevronRight size={15} color={envStyle.text} />}
                <span style={{ fontWeight: 700, fontSize: "0.8rem", color: envStyle.text, flex: 1 }}>
                    {env}
                </span>
                {hasData && (
                    <span style={{
                        fontSize: "0.68rem",
                        background: envStyle.text,
                        color: "#fff",
                        borderRadius: 99,
                        padding: "1px 8px"
                    }}>
                        Configured
                    </span>
                )}
                {meta.cloudTag && (
                    <span style={{
                        fontSize: "0.7rem",
                        color: envStyle.text,
                        opacity: 0.8,
                        display: "flex",
                        alignItems: "center",
                        gap: 3
                    }}>
                        <Cloud size={11} /> {meta.cloudTag}
                    </span>
                )}
            </button>
            {open && (
                <div style={{ padding: "0.75rem 1rem 1rem", background: "#fff" }}>
                    <EnvironmentForm projectId={projectId} env={env} />
                </div>
            )}
        </div>
    );
};

const ProductCard = ({ project }) => {
    const [open, setOpen] = useState(false);
    const envs = Array.isArray(project.environments) ? project.environments : [];
    const productId = project.id || project.name;

    return (
        <div className="analytics-card" style={{ padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "1rem 1.25rem",
                    background: open ? "#f8fafc" : "#fff",
                    border: "none",
                    borderBottom: open ? "1px solid #e5e7eb" : "none",
                    cursor: "pointer",
                    textAlign: "left"
                }}
            >
                <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1rem",
                    flexShrink: 0
                }}>
                    {(project.name || "P").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
                        {project.name}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: 4 }}>
                        {project.tag && (
                            <span style={{
                                fontSize: "0.7rem",
                                background: "#e0e7ff",
                                color: "#4338ca",
                                borderRadius: 4,
                                padding: "1px 7px",
                                display: "flex",
                                alignItems: "center",
                                gap: 3
                            }}>
                                <Tag size={10} /> {project.tag}
                            </span>
                        )}
                        {envs.map(env => {
                            const style = ENV_COLORS[env] || {};
                            return (
                                <span key={env} style={{
                                    fontSize: "0.7rem",
                                    background: style.bg || "#f3f4f6",
                                    color: style.text || "#374151",
                                    borderRadius: 4,
                                    padding: "1px 7px",
                                    fontWeight: 600
                                }}>
                                    {env}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <div style={{ color: "#6b7280" }}>
                    {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
            </button>

            {open && (
                <div style={{ padding: "1rem 1.25rem" }}>
                    {envs.length === 0 ? (
                        <p style={{ color: "#9ca3af", fontSize: "0.85rem", fontStyle: "italic" }}>
                            No environments configured for this product.
                        </p>
                    ) : (
                        envs.map(env => (
                            <EnvSection key={env} projectId={productId} env={env} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

const NameProductsView = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await getProjects({ force: true });
            setProjects(list || []);
        } catch (err) {
            setError(err?.message || "Failed to load products.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" />
                <p>Loading products…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="empty-state">
                <Building size={40} />
                <h3>Could not load products</h3>
                <p>{error}</p>
                <button className="btn-secondary" onClick={loadProjects}>Retry</button>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="empty-state">
                <Building size={48} />
                <h3>No Products Found</h3>
                <p>Register a service under <strong>Services</strong> first, then come back here to configure its environment metadata.</p>
            </div>
        );
    }

    return (
        <div className="team-management-view">
            <div className="analytics-card" style={{ marginBottom: "1.25rem" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <Building size={18} /> Name Products
                </h3>
                <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
                    Configure per-environment metadata — contacts, cloud tags, resource utilization, and cost estimates — for each registered product.
                </p>
            </div>

            {projects.map(project => (
                <ProductCard key={project.id || project.name} project={project} />
            ))}
        </div>
    );
};

export default NameProductsView;
