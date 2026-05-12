// Project-side Cloud Services panel — drops into ProjectWorkflowEditor under
// a new "Cloud Usage" tab. Reads the managed Cloud Services catalog
// (/api/environments/tree) and lets the admin TOGGLE which catalog services
// the current project consumes. For each toggle-on the admin sets count +
// custom name + notes (cost is computed from the catalog's hourly rate).
//
// Includes an "External services" section (MongoDB Atlas, Datadog, …) that
// captures manually-priced project-exclusive line items.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Cloud, ChevronDown, ChevronRight, Trash2, Plus, RefreshCw,
    Server, Shield, Database, HardDrive, Network as NetworkIcon, Cpu,
    Sparkles, Boxes, ExternalLink, ToggleLeft, ToggleRight
} from "lucide-react";
import { getCloudServicesTree } from "../../services/cloudEnvironmentService";

const CATEGORY_ICONS = {
    compute: Cpu, aks: Boxes, network: NetworkIcon, security: Shield,
    storage: HardDrive, database: Database, ai: Sparkles, other: Server
};

// Categories where a per-project "count" is meaningful. For everything else
// (e.g. Ingress, Load Balancer, AKS control plane) count stays at 1.
const COUNT_CATEGORIES = new Set(["compute", "security", "storage", "database", "ai", "other"]);

const fmt$ = (v) => (v == null ? "—" : `$${Number(v).toFixed(4)}`);
const fmtMonthly = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

export default function ProjectCloudServicesPanel({
    serviceUsages, setServiceUsages,
    externalServices, setExternalServices
}) {
    const [tree, setTree] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openEnvs, setOpenEnvs] = useState({});
    const [openCats, setOpenCats] = useState({});

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getCloudServicesTree();
            setTree(Array.isArray(data) ? data : []);
        } catch {
            setTree([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void reload(); }, [reload]);

    // Index existing usages for quick lookup
    const usageByKey = useMemo(() => {
        const m = new Map();
        for (const u of serviceUsages || []) {
            m.set(`${u.environmentId}::${u.serviceId}`, u);
        }
        return m;
    }, [serviceUsages]);

    const toggleService = (env, group, svc) => {
        const key = `${env.id}::${svc.id}`;
        const existing = usageByKey.get(key);
        if (existing) {
            // Remove
            setServiceUsages((serviceUsages || []).filter(u =>
                !(u.environmentId === env.id && u.serviceId === svc.id)));
            return;
        }
        const newUsage = {
            id: cryptoRandom(),
            environmentId: env.id,
            environmentName: env.name,
            categoryKey: group.key,
            serviceId: svc.id,
            serviceName: svc.displayName || svc.name,
            customName: "",
            count: 1,
            notes: "",
            enabled: true
        };
        setServiceUsages([...(serviceUsages || []), newUsage]);
    };

    const updateUsage = (id, patch) => {
        setServiceUsages((serviceUsages || []).map(u =>
            u.id === id ? { ...u, ...patch } : u));
    };

    // Totals for summary
    const totals = useMemo(() => {
        let monthly = 0;
        for (const u of serviceUsages || []) {
            const env = findEnv(tree, u.environmentId);
            const svc = findService(env, u.serviceId);
            if (svc?.monthlyRateUsd != null) {
                monthly += svc.monthlyRateUsd * (u.count || 1);
            }
        }
        for (const e of externalServices || []) {
            if (e.monthlyCostUsd != null) monthly += Number(e.monthlyCostUsd) || 0;
        }
        return { monthly, usages: (serviceUsages || []).length, ext: (externalServices || []).length };
    }, [tree, serviceUsages, externalServices]);

    return (
        <div className="proj-cloud-panel">
            <style>{cssBlock}</style>

            <div className="pcp-toolbar">
                <div>
                    <strong>Cloud usage</strong>
                    <span className="pcp-sub">Toggle which managed Cloud Services this project uses. Cost is calculated from the catalog rate × count.</span>
                </div>
                <div className="pcp-totals">
                    <div><span>Toggled services</span><strong>{totals.usages}</strong></div>
                    <div><span>External services</span><strong>{totals.ext}</strong></div>
                    <div><span>Monthly est.</span><strong>{fmtMonthly(totals.monthly)}</strong></div>
                    <button className="pcp-btn ghost" onClick={reload} disabled={loading}>
                        <RefreshCw size={14} /> Reload catalog
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="pcp-empty">Loading catalog…</div>
            ) : (
                <div className="pcp-envs">
                    {(tree.find(p => p.provider === "AZURE")?.environments || []).map(env => {
                        const open = openEnvs[env.id] !== false;
                        const enabledCount = (serviceUsages || []).filter(u => u.environmentId === env.id).length;
                        return (
                            <div key={env.id} className={`pcp-env ${env.sharedScope ? "shared" : ""}`}>
                                <button className="pcp-env-head" onClick={() => setOpenEnvs(s => ({ ...s, [env.id]: !open }))}>
                                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    {env.sharedScope ? <Sparkles size={14} /> : <Server size={14} />}
                                    <strong>{env.displayName || env.name}</strong>
                                    {env.sharedScope && <span className="pcp-pill shared">shared</span>}
                                    <span className="pcp-pill">{enabledCount} on</span>
                                </button>
                                {open && (
                                    <div className="pcp-cats">
                                        {(env.categoryGroups || []).map(group => {
                                            if (!group.services?.length) return null;
                                            const Icon = CATEGORY_ICONS[group.key] || Server;
                                            const ckey = `${env.id}::${group.key}`;
                                            const opened = openCats[ckey] !== false;
                                            return (
                                                <div key={group.key} className="pcp-cat">
                                                    <button className="pcp-cat-head" onClick={() => setOpenCats(s => ({ ...s, [ckey]: !opened }))}>
                                                        {opened ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        <Icon size={13} />
                                                        <span>{group.displayName}</span>
                                                        <span className="pcp-pill">{group.services.length}</span>
                                                    </button>
                                                    {opened && (
                                                        <div className="pcp-svcs">
                                                            {group.services.map(svc => {
                                                                const k = `${env.id}::${svc.id}`;
                                                                const usage = usageByKey.get(k);
                                                                const monthly = svc.monthlyRateUsd != null
                                                                    ? svc.monthlyRateUsd * (usage?.count || 1)
                                                                    : null;
                                                                return (
                                                                    <div key={svc.id} className={`pcp-svc ${usage ? "on" : ""}`}>
                                                                        <button
                                                                            className="pcp-toggle"
                                                                            onClick={() => toggleService(env, group, svc)}
                                                                            title={usage ? "Disable" : "Enable for this project"}
                                                                        >
                                                                            {usage ? <ToggleRight size={20} color="#16a34a" /> : <ToggleLeft size={20} color="#94a3b8" />}
                                                                        </button>
                                                                        <div className="pcp-svc-name">
                                                                            <strong>{svc.displayName || svc.name}</strong>
                                                                            {svc.azureSkuName && <span className="pcp-pill">{svc.azureSkuName}</span>}
                                                                            {svc.vCpuPerNode > 0 && (
                                                                                <span className="pcp-pill">{svc.vCpuPerNode} vCPU · {svc.memoryGbPerNode}GB</span>
                                                                            )}
                                                                            <span className="pcp-pill alloc">{svc.allocation || "GENERAL"}</span>
                                                                        </div>
                                                                        <div className="pcp-svc-meta">
                                                                            <span title="Catalog hourly">{fmt$(svc.hourlyRateUsd)}/hr</span>
                                                                            <span title="Monthly × count">{fmtMonthly(monthly)}/mo</span>
                                                                        </div>
                                                                        {usage && (
                                                                            <div className="pcp-usage-row">
                                                                                <label>
                                                                                    <span>Custom name</span>
                                                                                    <input
                                                                                        value={usage.customName || ""}
                                                                                        onChange={(e) => updateUsage(usage.id, { customName: e.target.value })}
                                                                                        placeholder={svc.displayName || svc.name}
                                                                                    />
                                                                                </label>
                                                                                {COUNT_CATEGORIES.has(group.key) && (
                                                                                    <label>
                                                                                        <span>Count</span>
                                                                                        <input
                                                                                            type="number"
                                                                                            min={1}
                                                                                            value={usage.count || 1}
                                                                                            onChange={(e) => updateUsage(usage.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                                                                                        />
                                                                                    </label>
                                                                                )}
                                                                                <label className="grow">
                                                                                    <span>Notes</span>
                                                                                    <input
                                                                                        value={usage.notes || ""}
                                                                                        onChange={(e) => updateUsage(usage.id, { notes: e.target.value })}
                                                                                    />
                                                                                </label>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* External services */}
            <div className="pcp-external">
                <div className="pcp-external-head">
                    <ExternalLink size={14} />
                    <strong>External services</strong>
                    <span className="pcp-sub">MongoDB Atlas, Datadog, etc. Manually enter monthly cost — fully attributed to this project.</span>
                    <div className="grow" />
                    <button
                        className="pcp-btn primary small"
                        onClick={() => setExternalServices([...(externalServices || []), {
                            id: cryptoRandom(), name: "", vendor: "", monthlyCostUsd: 0, currency: "USD", notes: "", environment: ""
                        }])}
                    >
                        <Plus size={12} /> Add external
                    </button>
                </div>
                {(externalServices || []).length === 0 && (
                    <div className="pcp-empty">No external services. Click <strong>Add external</strong> to add one.</div>
                )}
                {(externalServices || []).map((ext, idx) => (
                    <div key={ext.id || idx} className="pcp-ext-row">
                        <label>
                            <span>Name</span>
                            <input value={ext.name || ""} onChange={(e) => patchExternal(externalServices, setExternalServices, idx, { name: e.target.value })} placeholder="MongoDB Atlas (Prod)" />
                        </label>
                        <label>
                            <span>Vendor</span>
                            <input value={ext.vendor || ""} onChange={(e) => patchExternal(externalServices, setExternalServices, idx, { vendor: e.target.value })} placeholder="MongoDB Atlas" />
                        </label>
                        <label>
                            <span>Monthly $</span>
                            <input type="number" step="0.01" value={ext.monthlyCostUsd ?? 0} onChange={(e) => patchExternal(externalServices, setExternalServices, idx, { monthlyCostUsd: Number(e.target.value) })} />
                        </label>
                        <label>
                            <span>Env</span>
                            <input value={ext.environment || ""} onChange={(e) => patchExternal(externalServices, setExternalServices, idx, { environment: e.target.value })} placeholder="all" />
                        </label>
                        <label className="grow">
                            <span>Notes</span>
                            <input value={ext.notes || ""} onChange={(e) => patchExternal(externalServices, setExternalServices, idx, { notes: e.target.value })} />
                        </label>
                        <button className="pcp-icon-btn danger" onClick={() => setExternalServices((externalServices || []).filter((_, i) => i !== idx))}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------- helpers ----------------

function patchExternal(list, setList, idx, patch) {
    setList((list || []).map((row, i) => i === idx ? { ...row, ...patch } : row));
}

function findEnv(tree, envId) {
    for (const p of tree || []) {
        const e = (p.environments || []).find(x => x.id === envId);
        if (e) return e;
    }
    return null;
}
function findService(env, svcId) {
    if (!env) return null;
    for (const g of env.categoryGroups || []) {
        const s = (g.services || []).find(x => x.id === svcId);
        if (s) return s;
    }
    return null;
}
function cryptoRandom() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const cssBlock = `
.proj-cloud-panel { display:flex; flex-direction:column; gap:14px; }
.pcp-toolbar { display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; padding:10px 12px; background:#f8f9fc; border:1px solid #e6e9f0; border-radius:9px; }
.pcp-toolbar > div:first-child { display:flex; flex-direction:column; }
.pcp-sub { font-size:12px; color:#64748b; margin-left:8px; }
.pcp-totals { display:flex; gap:10px; align-items:center; }
.pcp-totals > div { background:#fff; border:1px solid #e7eaf2; padding:6px 12px; border-radius:7px; min-width:90px; text-align:right; }
.pcp-totals span { display:block; font-size:11px; color:#6b7280; text-transform:uppercase; }
.pcp-totals strong { font-size:13px; color:#1f2937; }
.pcp-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px; cursor:pointer; color:#374151; }
.pcp-btn.small { padding:4px 8px; font-size:12px; }
.pcp-btn.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
.pcp-btn.ghost { background:#f8f9fc; }
.pcp-icon-btn { background:transparent; border:none; cursor:pointer; padding:4px; border-radius:5px; color:#5b6478; }
.pcp-icon-btn.danger:hover { background:#fee2e2; color:#b91c1c; }
.pcp-pill { padding:1px 7px; border-radius:999px; background:#eef0f6; color:#475066; font-size:11px; font-weight:600; }
.pcp-pill.shared { background:#fef3c7; color:#92400e; }
.pcp-pill.alloc { background:#e0f2fe; color:#075985; }
.pcp-empty { text-align:center; padding:14px; color:#6b7280; font-size:13px; }
.pcp-envs { display:flex; flex-direction:column; gap:8px; }
.pcp-env { border:1px solid #e2e6ee; border-radius:9px; overflow:hidden; }
.pcp-env.shared { background:#fffbeb; }
.pcp-env-head { width:100%; display:flex; align-items:center; gap:8px; padding:10px 14px; background:#f8f9fc; border:none; cursor:pointer; font-size:14px; color:#1f2937; }
.pcp-env.shared .pcp-env-head { background:#fffbeb; }
.pcp-env-head:hover { background:#eef1f7; }
.pcp-cats { padding:6px 10px 12px; }
.pcp-cat { margin: 4px 0; }
.pcp-cat-head { width:100%; display:flex; align-items:center; gap:7px; padding:6px 10px; background:#fff; border:1px dashed #e2e6ee; border-radius:7px; cursor:pointer; font-size:13px; color:#374151; }
.pcp-svcs { padding: 6px 0 0 14px; display:flex; flex-direction:column; gap:6px; }
.pcp-svc { display:grid; grid-template-columns: 32px 1fr auto; align-items:center; gap:8px; padding:7px 10px; background:#fff; border:1px solid #eef1f6; border-radius:7px; }
.pcp-svc.on { border-color:#86efac; background:#f0fdf4; }
.pcp-toggle { background:transparent; border:none; cursor:pointer; padding:0; }
.pcp-svc-name { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.pcp-svc-meta { display:flex; gap:10px; font-size:12px; color:#475569; }
.pcp-usage-row { grid-column: 1 / -1; display:flex; gap:8px; flex-wrap:wrap; padding-top:6px; border-top:1px dashed #d1fae5; }
.pcp-usage-row label { display:flex; flex-direction:column; gap:2px; font-size:11px; color:#475569; }
.pcp-usage-row label.grow { flex:1 1 200px; }
.pcp-usage-row input, .pcp-usage-row select { padding:5px 8px; border:1px solid #d4d8e0; border-radius:5px; font-size:12px; }
.pcp-external { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:12px; }
.pcp-external-head { display:flex; align-items:center; gap:8px; padding-bottom:8px; border-bottom:1px solid #eef1f6; margin-bottom:8px; }
.pcp-ext-row { display:flex; gap:8px; align-items:end; flex-wrap:wrap; padding: 6px 0; border-bottom:1px solid #f1f3f7; }
.pcp-ext-row label { display:flex; flex-direction:column; gap:2px; font-size:11px; color:#475569; }
.pcp-ext-row label.grow { flex:1 1 240px; }
.pcp-ext-row input { padding:5px 8px; border:1px solid #d4d8e0; border-radius:5px; font-size:12px; min-width: 110px; }
.grow { flex:1 1 auto; }
`;
