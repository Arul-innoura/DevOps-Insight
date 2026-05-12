import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Layers, Plus, Trash2, Save, X, Server, Globe, Shield, Database,
    Box, HardDrive, Plug, ChevronDown, ChevronRight, RefreshCw
} from "lucide-react";
import {
    getCloudEnvironments, createCloudEnvironment, updateCloudEnvironment,
    deleteCloudEnvironment, refreshCloudEnvironmentPrices, emptyEnvironment,
    lookupAzurePrice, searchAzurePrices,
} from "../../services/cloudEnvironmentService";
import AzureVmSizePicker from "../../components/AzureVmSizePicker";
import AzureCatalogAutocomplete from "../../components/AzureCatalogAutocomplete";
import { useToast } from "../../services/ToastNotification";

const AZURE_REGIONS = [
    "eastus", "eastus2", "westus", "westus2", "westus3",
    "centralus", "northcentralus", "southcentralus",
    "northeurope", "westeurope", "uksouth", "ukwest",
    "southeastasia", "eastasia", "japaneast", "australiaeast",
    "southindia", "centralindia", "westindia",
];

export default function EnvironmentsManager() {
    const toast = useToast();
    const [envs, setEnvs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [editing, setEditing] = useState(null); // id or "new"
    const [form, setForm] = useState(emptyEnvironment());
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getCloudEnvironments();
            setEnvs(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load environments");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        setForm(emptyEnvironment());
        setEditing("new");
    };

    const openEdit = (env) => {
        setForm({ ...emptyEnvironment(), ...env });
        setEditing(env.id);
    };

    const cancelEdit = () => {
        setEditing(null);
        setForm(emptyEnvironment());
    };

    const save = async () => {
        if (!form.name?.trim()) {
            toast.warning("Environment name is required");
            return;
        }
        setSaving(true);
        try {
            if (editing === "new") {
                await createCloudEnvironment(form);
                toast.success(`Environment "${form.name}" created`);
            } else {
                await updateCloudEnvironment(editing, form);
                toast.success(`Environment "${form.name}" updated`);
            }
            cancelEdit();
            load();
        } catch (e) {
            toast.error(e?.message || "Failed to save environment");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (env) => {
        if (!window.confirm(`Delete environment "${env.name}"? Projects referencing it will still work but lose infrastructure config.`)) return;
        try {
            await deleteCloudEnvironment(env.id);
            toast.success(`Deleted "${env.name}"`);
            load();
        } catch {
            toast.error("Delete failed");
        }
    };

    const refreshPrices = async () => {
        try {
            const r = await refreshCloudEnvironmentPrices();
            toast.success(`Refreshed prices on ${r?.refreshed ?? 0} environments`);
            load();
        } catch {
            toast.error("Price refresh failed");
        }
    };

    return (
        <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 20, display: "flex", alignItems: "center", gap: 8 }}>
                        <Layers size={20} /> Environments
                    </h2>
                    <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
                        Managed Azure environments (top level). Projects select from these during configuration.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={refreshPrices} style={secondaryBtn}>
                        <RefreshCw size={14} /> Refresh prices
                    </button>
                    <button onClick={openCreate} style={primaryBtn}>
                        <Plus size={14} /> New environment
                    </button>
                </div>
            </div>

            {loading && <div style={muted}>Loading…</div>}

            {!loading && envs.length === 0 && editing !== "new" && (
                <div style={emptyCard}>
                    No environments yet. Create one to start configuring Azure infrastructure for your projects.
                </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
                {editing === "new" && (
                    <EnvForm form={form} setForm={setForm} onSave={save} onCancel={cancelEdit} saving={saving} />
                )}
                {envs.map((env) => {
                    const isExpanded = expandedId === env.id;
                    const isEditing = editing === env.id;
                    if (isEditing) {
                        return <EnvForm key={env.id} form={form} setForm={setForm} onSave={save} onCancel={cancelEdit} saving={saving} />;
                    }
                    return (
                        <div key={env.id} style={envCard}>
                            <div style={envHeader} onClick={() => setExpandedId(isExpanded ? null : env.id)}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <strong>{env.name}</strong>
                                    {env.displayName && (
                                        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                                            — {env.displayName}
                                        </span>
                                    )}
                                    <span style={regionBadge}>{env.azureRegion || "eastus"}</span>
                                </div>
                                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => openEdit(env)} style={iconBtn} title="Edit">✎</button>
                                    <button onClick={() => remove(env)} style={{ ...iconBtn, color: "#dc2626" }} title="Delete">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            {isExpanded && <EnvSummary env={env} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EnvForm({ form, setForm, onSave, onCancel, saving }) {
    const update = (patch) => setForm((f) => ({ ...f, ...patch }));
    const region = form.azureRegion || "eastus";

    return (
        <div style={formCard}>
            <div style={formHeader}>
                <strong>{form.id ? "Edit environment" : "New environment"}</strong>
                <button onClick={onCancel} style={iconBtn}><X size={16} /></button>
            </div>

            <div style={formRow}>
                <Field label="Name *" hint="Short unique id like 'prod-eastus'">
                    <input style={input} value={form.name || ""} onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="Display name" hint="Pretty label shown in UI">
                    <input style={input} value={form.displayName || ""} onChange={(e) => update({ displayName: e.target.value })} />
                </Field>
                <Field label="Azure region">
                    <select style={input} value={region} onChange={(e) => update({ azureRegion: e.target.value })}>
                        {AZURE_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                </Field>
            </div>

            <Field label="Description">
                <textarea rows={2} style={{ ...input, resize: "vertical" }} value={form.description || ""} onChange={(e) => update({ description: e.target.value })} />
            </Field>

            <SectionTitle icon={<Server size={14} />}>Node pools</SectionTitle>
            <NodePoolEditor
                label="System node pool"
                poolKind="system"
                region={region}
                pool={form.systemNodePool}
                onChange={(p) => update({ systemNodePool: { ...p, kind: "system" } })}
            />
            <NodePoolEditor
                label="User node pool"
                poolKind="user"
                region={region}
                pool={form.userNodePool}
                onChange={(p) => update({ userNodePool: { ...p, kind: "user" } })}
            />

            {(form.additionalNodePools || []).map((pool, i) => (
                <div key={i} style={{ position: "relative" }}>
                    <NodePoolEditor
                        label={pool.poolName || `Additional pool ${i + 1}`}
                        poolKind={pool.kind || "user"}
                        region={region}
                        pool={pool}
                        onChange={(p) => {
                            const updated = [...(form.additionalNodePools || [])];
                            updated[i] = p;
                            update({ additionalNodePools: updated });
                        }}
                        showKindPicker
                    />
                    <button
                        type="button"
                        onClick={() => {
                            const updated = (form.additionalNodePools || []).filter((_, idx) => idx !== i);
                            update({ additionalNodePools: updated });
                        }}
                        style={{ position: "absolute", top: 8, right: 8, ...iconBtn, color: "#dc2626", padding: "3px 6px" }}
                        title="Remove this pool"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => update({ additionalNodePools: [...(form.additionalNodePools || []), { kind: "user", poolName: "", vmSize: "", nodeCount: 1 }] })}
                style={{ ...secondaryBtn, marginTop: 6, fontSize: 12 }}
            >
                <Plus size={12} /> Add node pool
            </button>

            <SectionTitle icon={<Globe size={14} />}>Shared infrastructure</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                <InfraEditor icon={<Plug size={12} />} label="Ingress" category="network" region={region} res={form.ingress} onChange={(v) => update({ ingress: v })} />
                <InfraEditor icon={<Globe size={12} />} label="Load balancer" category="network" region={region} res={form.loadBalancer} onChange={(v) => update({ loadBalancer: v })} />
                <InfraEditor icon={<Box size={12} />} label="Container registry" category="security" region={region} res={form.containerRegistry} onChange={(v) => update({ containerRegistry: v })} allowScope />
                <InfraEditor icon={<Globe size={12} />} label="Domain / DNS" category="network" region={region} res={form.domain} onChange={(v) => update({ domain: v })} />
                <InfraEditor icon={<Shield size={12} />} label="Key vault" category="security" region={region} res={form.keyVault} onChange={(v) => update({ keyVault: v })} />
                <InfraEditor icon={<HardDrive size={12} />} label="Storage" category="storage" region={region} res={form.storage} onChange={(v) => update({ storage: v })} />
            </div>

            <SectionTitle icon={<Database size={14} />}>Shared services (Redis, queues, API gateway, …)</SectionTitle>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Services shared by every project in this environment — cost split equally.
                Set scope to <strong>Global</strong> for a resource shared across all environments; global-scoped services are excluded from per-environment cost totals.
            </div>
            <SharedServicesEditor
                items={form.sharedServices || []}
                onChange={(v) => update({ sharedServices: v })}
                region={region}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
                <button onClick={onSave} disabled={saving} style={primaryBtn}>
                    <Save size={14} /> {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </div>
    );
}

const POOL_KINDS = ["system", "user", "spot", "windows", "gpu", "arm"];

function NodePoolEditor({ label, poolKind, region, pool, onChange, showKindPicker }) {
    const p = pool || {};
    const apply = (patch) => onChange({ ...p, ...patch });
    const isSpot = poolKind === "spot" || p.kind === "spot";
    return (
        <div style={nodePoolCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>{label}</strong>
                    {showKindPicker ? (
                        <>
                            <input
                                placeholder="Pool name (e.g. spot-pool)"
                                style={{ ...input, flex: 1, marginBottom: 0, fontSize: 12 }}
                                value={p.poolName || ""}
                                onChange={(e) => apply({ poolName: e.target.value })}
                            />
                            <select
                                style={{ ...input, width: "auto", minWidth: 80, fontSize: 12 }}
                                value={p.kind || "user"}
                                onChange={(e) => apply({ kind: e.target.value })}
                            >
                                {POOL_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                        </>
                    ) : (
                        <span style={{ fontSize: 11, background: "var(--badge-bg,#eff6ff)", color: "var(--badge-fg,#1d4ed8)", padding: "1px 6px", borderRadius: 8 }}>
                            {poolKind}
                        </span>
                    )}
                </div>
                {p.hourlyRateUsd != null ? (
                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600, whiteSpace: "nowrap" }}>
                        ${Number(p.hourlyRateUsd).toFixed(4)}/hr × {p.nodeCount || 0} = ${(p.hourlyRateUsd * (p.nodeCount || 0) * 730).toFixed(0)}/mo
                    </span>
                ) : (
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Pick VM size</span>
                )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
                <div>
                    <Label>VM size{isSpot ? " (spot)" : ""}</Label>
                    <AzureVmSizePicker
                        region={region}
                        value={p.vmSize}
                        spot={isSpot}
                        onPick={(row) => apply({
                            vmSize: row.armSkuName || row.skuName,
                            azureSkuName: row.skuName,
                            azureMeterId: row.meterId,
                            hourlyRateUsd: priceToHourly(row.retailPrice, row.unitOfMeasure),
                            vCpuPerNode: row.vCpuPerNode || null,
                            memoryGbPerNode: row.memoryGbPerNode || null,
                        })}
                    />
                </div>
                <div>
                    <Label>Nodes</Label>
                    <input type="number" min={0} style={input} value={p.nodeCount ?? ""} onChange={(e) => apply({ nodeCount: numOrNull(e.target.value) })} />
                </div>
                <div>
                    <Label>vCPU/node</Label>
                    <input type="number" step="0.5" style={input} value={p.vCpuPerNode ?? ""} onChange={(e) => apply({ vCpuPerNode: numOrNull(e.target.value) })} />
                </div>
                <div>
                    <Label>RAM GB/node</Label>
                    <input type="number" step="0.5" style={input} value={p.memoryGbPerNode ?? ""} onChange={(e) => apply({ memoryGbPerNode: numOrNull(e.target.value) })} />
                </div>
            </div>
        </div>
    );
}

function InfraEditor({ icon, label, category, region, res, onChange, allowScope }) {
    const r = res || {};
    const apply = (patch) => onChange({ ...r, ...patch });

    const applyAzurePrice = (row) => {
        const hourly = row.hourlyRateUsd != null
            ? row.hourlyRateUsd
            : priceToHourly(row.retailPrice, row.unitOfMeasure);
        apply({
            sku: row.skuName || r.sku,
            azureMeterId: row.meterId,
            azureSkuName: row.skuName,
            hourlyRateUsd: hourly,
        });
    };

    const isGlobal = allowScope && (r.scope || "env") === "global";

    return (
        <div style={infraCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                {icon}
                <strong style={{ fontSize: 13 }}>{label}</strong>
                {r.hourlyRateUsd != null && !isGlobal && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669", fontWeight: 600 }}>
                        ${(r.hourlyRateUsd * 730).toFixed(2)}/mo
                    </span>
                )}
                {isGlobal && (
                    <span style={{ marginLeft: "auto", fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 8 }}>
                        global — not counted here
                    </span>
                )}
            </div>

            <input
                placeholder={`${label} name / tag (optional)`}
                style={{ ...input, marginBottom: 6 }}
                value={r.name || ""}
                onChange={(e) => apply({ name: e.target.value })}
            />

            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <AzureCatalogAutocomplete
                        category={category}
                        region={region}
                        value={r.azureMeterId || r.azureSkuName ? {
                            skuName: r.azureSkuName,
                            armSkuName: r.sku,
                            hourlyRateUsd: r.hourlyRateUsd,
                        } : null}
                        onPick={applyAzurePrice}
                        onClear={() => apply({
                            sku: "",
                            azureMeterId: "",
                            azureSkuName: "",
                            hourlyRateUsd: null,
                        })}
                        minChars={0}
                        size="sm"
                    />
                </div>
                {allowScope && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <select
                            style={{ ...input, width: "auto", minWidth: 100 }}
                            value={r.scope || "env"}
                            onChange={(e) => apply({ scope: e.target.value })}
                        >
                            <option value="env">Per-env</option>
                            <option value="global">Global (shared)</option>
                        </select>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {isGlobal
                                ? "Shared resource — excluded from per-env cost"
                                : "Separate instance per environment"}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function SharedServicesEditor({ items, onChange, region = "eastus" }) {
    const add = () => onChange([...(items || []), {
        id: `svc-${Date.now()}`, name: "", category: "", scope: "env",
        azureMeterId: "", azureSkuName: "", hourlyRateUsd: null, monthlyRateUsd: null,
    }]);
    const update = (i, patch) => onChange((items || []).map((x, idx) => idx === i ? { ...x, ...patch } : x));
    const remove = (i) => onChange((items || []).filter((_, idx) => idx !== i));

    const applyAzurePrice = (idx, row) => {
        const s = (items || [])[idx] || {};
        const hourly = row.hourlyRateUsd != null
            ? row.hourlyRateUsd
            : priceToHourly(row.retailPrice, row.unitOfMeasure);
        const monthly = row.monthlyEstUsd != null
            ? row.monthlyEstUsd
            : (hourly != null ? hourly * 730 : null);
        update(idx, {
            azureMeterId: row.meterId,
            azureSkuName: row.skuName,
            hourlyRateUsd: hourly,
            monthlyRateUsd: monthly,
            name: s.name || row.productName || row.serviceName || "",
            category: s.category || row.serviceFamily || row.serviceName || "",
        });
    };

    return (
        <div>
            {(items || []).map((s, i) => (
                <div key={s.id || i} style={{
                    marginBottom: 8, padding: "10px 12px",
                    border: "1px solid var(--border-color)", borderRadius: 6,
                    background: "var(--card-bg-alt, #fafafa)",
                }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr", gap: 6, marginBottom: 6 }}>
                        <input
                            placeholder="Service name (e.g. Redis Cache, API Management)"
                            style={input} value={s.name || ""}
                            onChange={(e) => update(i, { name: e.target.value })}
                        />
                        <input
                            placeholder="Category (e.g. Caching, Messaging)"
                            style={input} value={s.category || ""}
                            onChange={(e) => update(i, { category: e.target.value })}
                        />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <AzureCatalogAutocomplete
                                category={suggestCategoryFromLabel(s.category)}
                                region={region}
                                value={s.azureMeterId || s.azureSkuName ? {
                                    skuName: s.azureSkuName,
                                    hourlyRateUsd: s.hourlyRateUsd,
                                    monthlyEstUsd: s.monthlyRateUsd,
                                } : null}
                                onPick={(row) => applyAzurePrice(i, row)}
                                onClear={() => update(i, {
                                    azureMeterId: "",
                                    azureSkuName: "",
                                    hourlyRateUsd: null,
                                    monthlyRateUsd: null,
                                })}
                                minChars={0}
                                size="sm"
                            />
                        </div>
                        <select style={{ ...input, width: "auto", minWidth: 100 }} value={s.scope || "env"} onChange={(e) => update(i, { scope: e.target.value })}>
                            <option value="env">Per-env</option>
                            <option value="global">Global</option>
                        </select>
                        <button onClick={() => remove(i)} style={{ ...iconBtn, color: "#dc2626", padding: "4px 8px" }}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            ))}
            <button onClick={add} style={secondaryBtn}><Plus size={12} /> Add shared service</button>
        </div>
    );
}

/** Maps the shared-service "Category" text field to a catalog-suggest bucket (type a known key for a narrow search). */
function suggestCategoryFromLabel(label) {
    if (!label || !String(label).trim()) return "other";
    const c = String(label).trim().toLowerCase();
    const valid = new Set(["compute", "aks", "network", "security", "storage", "database", "ai", "other"]);
    return valid.has(c) ? c : "other";
}

function EnvSummary({ env }) {
    const row = (label, v) => (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>{label}</span>
            <span>{v || "—"}</span>
        </div>
    );
    const pool = (p) => {
        if (!p?.vmSize) return "—";
        const mo = p.hourlyRateUsd && p.nodeCount ? ` · $${(p.hourlyRateUsd * p.nodeCount * 730).toFixed(0)}/mo` : "";
        return `${p.vmSize} × ${p.nodeCount || 0}${mo}`;
    };
    const additionalPools = env.additionalNodePools || [];
    return (
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border-color)" }}>
            {row("System pool", pool(env.systemNodePool))}
            {row("User pool", pool(env.userNodePool))}
            {additionalPools.map((p, i) => row(p.poolName || `Pool ${i + 3}`, `[${p.kind || "user"}] ${pool(p)}`))}
            {row("Ingress", env.ingress?.name || env.ingress?.sku)}
            {row("Load balancer", env.loadBalancer?.sku)}
            {row("Container registry", env.containerRegistry?.sku && `${env.containerRegistry.sku} (${env.containerRegistry.scope || "env"})`)}
            {row("Key vault", env.keyVault?.name)}
            {row("Storage", env.storage?.name)}
            {row("Shared services", (env.sharedServices || []).length
                ? `${(env.sharedServices || []).length} services`
                : "—")}
        </div>
    );
}

// Helpers

const priceToHourly = (retail, unit) => {
    if (retail == null) return null;
    const u = String(unit || "").toLowerCase();
    if (u.includes("hour")) return retail;
    if (u.includes("month")) return retail / 730;
    if (u.includes("day")) return retail / 24;
    if (u.includes("year")) return retail / (730 * 12);
    return retail;
};

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

const Field = ({ label, hint, children }) => (
    <label style={{ display: "block", flex: 1 }}>
        <Label hint={hint}>{label}</Label>
        {children}
    </label>
);

const Label = ({ children, hint }) => (
    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>{children}</span>
        {hint && <span style={{ opacity: 0.7 }}>{hint}</span>}
    </div>
);

const SectionTitle = ({ icon, children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "18px 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #4b5563)" }}>
        {icon}{children}
    </div>
);

// Styles

const input = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid var(--border-color)",
    borderRadius: 6,
    background: "var(--input-bg, #fff)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
};

const primaryBtn = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", background: "#2563eb", color: "#fff",
    border: 0, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500,
};
const secondaryBtn = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", background: "var(--card-bg, #fff)",
    border: "1px solid var(--border-color)", borderRadius: 6,
    cursor: "pointer", fontSize: 13, color: "var(--text-primary)",
};
const iconBtn = {
    background: "transparent", border: 0, cursor: "pointer",
    padding: 4, borderRadius: 4, color: "var(--text-primary)",
};
const envCard = {
    border: "1px solid var(--border-color)", borderRadius: 8,
    background: "var(--card-bg, #fff)",
};
const envHeader = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", cursor: "pointer",
};
const regionBadge = {
    background: "var(--badge-bg, #eff6ff)", color: "var(--badge-fg, #1d4ed8)",
    padding: "2px 8px", borderRadius: 12, fontSize: 11, fontFamily: "monospace",
};
const formCard = {
    border: "1px solid var(--border-color)", borderRadius: 8, padding: 16,
    background: "var(--card-bg, #fff)",
};
const formHeader = {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
};
const formRow = {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10,
};
const nodePoolCard = {
    border: "1px dashed var(--border-color)", borderRadius: 6,
    padding: 10, marginBottom: 8,
};
const infraCard = {
    border: "1px solid var(--border-color)", borderRadius: 6, padding: 8,
};
const muted = { color: "var(--text-muted)", fontSize: 13 };
const emptyCard = {
    padding: 24, textAlign: "center",
    color: "var(--text-muted)", fontSize: 13,
    border: "1px dashed var(--border-color)", borderRadius: 8,
};
