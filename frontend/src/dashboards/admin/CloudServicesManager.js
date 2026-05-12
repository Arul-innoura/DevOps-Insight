// Cloud Services manager — provider → environment → category → service tree.
// Replaces the older flat EnvironmentsManager view in the admin left nav.
// Reads/writes the same /api/environments collection but uses the new
// `categoryGroups` structure on CloudEnvironment for the source of truth.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Cloud, ChevronDown, ChevronRight, Plus, Trash2, Save, RefreshCw,
    Search, X, Server, Shield, Database, HardDrive, Network as NetworkIcon,
    Cpu, Sparkles, Boxes, Edit3, AlertCircle
} from "lucide-react";
import {
    getCloudServicesTree,
    azureCatalogSuggest,
    createCloudEnvironment,
    updateCloudEnvironment,
    refreshCloudEnvironmentPrices
} from "../../services/cloudEnvironmentService";

const PROVIDERS = [
    { key: "AZURE", label: "Azure", enabled: true },
    { key: "AWS",   label: "AWS",   enabled: false },
    { key: "GCP",   label: "GCP",   enabled: false }
];

const CATEGORY_ICONS = {
    compute: Cpu,
    aks: Boxes,
    network: NetworkIcon,
    security: Shield,
    storage: HardDrive,
    database: Database,
    ai: Sparkles,
    other: Server
};

const ALLOCATION_OPTIONS = [
    { value: "GENERAL",     label: "General — equal split across projects" },
    { value: "SYSTEM_NODE", label: "System node — equal split across projects" },
    { value: "USER_NODE",   label: "User node — by replicas × CPU/memory" },
    { value: "SPOT_NODE",   label: "Spot node — by replicas × CPU/memory" },
    { value: "NETWORK",     label: "Network — equal split" },
    { value: "SECURITY",    label: "Security — equal split" },
    { value: "AI_SHARED",   label: "AI shared — split across all envs" },
    { value: "EXTERNAL",    label: "External — project-exclusive" }
];

const fmt$ = (v) => (v == null ? "—" : `$${Number(v).toFixed(4)}`);
const fmtMonthly = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

export default function CloudServicesManager() {
    const [tree, setTree] = useState([]);          // [{ provider, environments[], enabled }]
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeProvider, setActiveProvider] = useState("AZURE");
    const [activeEnvId, setActiveEnvId] = useState(null);
    const [openCategories, setOpenCategories] = useState({});
    const [suggestModal, setSuggestModal] = useState(null); // { categoryKey } when open
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = useCallback((msg, kind = "ok") => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ---- load tree ----
    const loadTree = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await getCloudServicesTree();
            const arr = Array.isArray(data) ? data : [];
            setTree(arr);
            // Pick first env in active provider on initial load
            const azure = arr.find(p => p.provider === activeProvider);
            if (azure && azure.environments?.length && !activeEnvId) {
                setActiveEnvId(azure.environments[0].id);
            }
        } catch (e) {
            setError(e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [activeProvider, activeEnvId]);

    useEffect(() => { void loadTree(); }, [loadTree]);

    const activeEnv = useMemo(() => {
        const node = tree.find(p => p.provider === activeProvider);
        return node?.environments?.find(e => e.id === activeEnvId) || null;
    }, [tree, activeProvider, activeEnvId]);

    const refreshPrices = async () => {
        setBusy(true);
        try {
            await refreshCloudEnvironmentPrices();
            await loadTree();
            showToast("Refreshed Azure prices");
        } catch (e) {
            showToast(e?.message || "Refresh failed", "err");
        } finally {
            setBusy(false);
        }
    };

    const persistEnv = async (env) => {
        try {
            const data = await updateCloudEnvironment(env.id, env);
            // Update tree in place
            setTree(prev => prev.map(p => ({
                ...p,
                environments: p.environments?.map(e => e.id === env.id ? data : e)
            })));
            showToast("Saved");
        } catch (e) {
            showToast(e?.message || "Save failed", "err");
            throw e;
        }
    };

    const updateActiveEnv = (mutator) => {
        if (!activeEnv) return null;
        const draft = JSON.parse(JSON.stringify(activeEnv));
        mutator(draft);
        return draft;
    };

    const onAddServiceFromSuggestion = async (sugg) => {
        const draft = updateActiveEnv((env) => {
            const cat = (env.categoryGroups || []).find(g => g.key === suggestModal.categoryKey);
            if (!cat) return;
            cat.services = cat.services || [];
            // Uniqueness — block in the UI as well as backend
            const dup = cat.services.find(s =>
                (s.name || "").toLowerCase() === (sugg.productName || sugg.skuName || "").toLowerCase());
            if (dup) {
                showToast("Service already exists in this category — increase the count instead", "err");
                throw new Error("dup");
            }
            const newSvc = {
                id: cryptoRandom(),
                name: sugg.productName || sugg.skuName || "Azure service",
                displayName: sugg.skuName || sugg.productName,
                azureMeterId: sugg.meterId,
                azureSkuName: sugg.skuName,
                azureProductName: sugg.productName,
                azureServiceName: sugg.serviceName,
                azureServiceFamily: sugg.serviceFamily,
                azureArmRegionName: sugg.armRegionName,
                azureUnitOfMeasure: sugg.unitOfMeasure,
                azureRetailPriceUsd: sugg.retailPrice,
                hourlyRateUsd: sugg.hourlyRateUsd,
                monthlyRateUsd: sugg.monthlyEstUsd,
                vCpuPerNode: sugg.vCpuPerNode || null,
                memoryGbPerNode: sugg.memoryGbPerNode || null,
                count: 1,
                allocation: defaultAllocation(suggestModal.categoryKey),
                aksNodes: []
            };
            cat.services.push(newSvc);
        });
        if (!draft) return;
        try {
            await persistEnv(draft);
            setSuggestModal(null);
        } catch { /* toast handled */ }
    };

    const onUpdateService = async (catKey, svcId, patch) => {
        const draft = updateActiveEnv((env) => {
            const cat = (env.categoryGroups || []).find(g => g.key === catKey);
            if (!cat) return;
            cat.services = (cat.services || []).map(s =>
                s.id === svcId ? { ...s, ...patch } : s);
        });
        if (draft) await persistEnv(draft);
    };

    const onDeleteService = async (catKey, svcId) => {
        if (!window.confirm("Remove this service from the category?")) return;
        const draft = updateActiveEnv((env) => {
            const cat = (env.categoryGroups || []).find(g => g.key === catKey);
            if (!cat) return;
            cat.services = (cat.services || []).filter(s => s.id !== svcId);
        });
        if (draft) await persistEnv(draft);
    };

    const onCreateEnv = async () => {
        const name = window.prompt("New environment name (e.g. PreProd):");
        if (!name || !name.trim()) return;
        const body = {
            name: name.trim(),
            displayName: name.trim(),
            provider: activeProvider,
            sharedScope: false,
            azureRegion: "eastus",
            description: "",
            categoryGroups: [] // server seeds template via normalize on save
        };
        try {
            const data = await createCloudEnvironment(body);
            await loadTree();
            setActiveEnvId(data.id);
            showToast("Environment created");
        } catch (e) {
            showToast(e?.message || "Create failed", "err");
        }
    };

    // ---- render ----
    return (
        <div className="cloud-services-manager">
            <style>{cssBlock}</style>

            <div className="csm-toolbar">
                <div className="csm-providers">
                    {PROVIDERS.map(p => {
                        const node = tree.find(t => t.provider === p.key);
                        const count = node?.environments?.length || 0;
                        const active = activeProvider === p.key;
                        return (
                            <button
                                key={p.key}
                                className={`csm-provider-tab ${active ? "active" : ""} ${!p.enabled ? "disabled" : ""}`}
                                disabled={!p.enabled}
                                onClick={() => p.enabled && setActiveProvider(p.key)}
                                title={!p.enabled ? `${p.label} catalog coming soon` : ""}
                            >
                                <Cloud size={14} />
                                <span>{p.label}</span>
                                <span className="csm-pill">{count}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="csm-actions">
                    <button className="csm-btn ghost" onClick={() => loadTree()} disabled={loading}>
                        <RefreshCw size={14} /> Reload
                    </button>
                    <button className="csm-btn ghost" onClick={refreshPrices} disabled={busy}>
                        <RefreshCw size={14} /> {busy ? "Refreshing…" : "Refresh prices"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="csm-error"><AlertCircle size={14} /> {error}</div>
            )}

            <div className="csm-body">
                {/* Left: env list */}
                <aside className="csm-env-list">
                    <div className="csm-env-list-head">
                        <span>Environments</span>
                        <button className="csm-btn small primary" onClick={onCreateEnv}>
                            <Plus size={12} /> New
                        </button>
                    </div>
                    {loading && <div className="csm-empty">Loading…</div>}
                    {!loading && (() => {
                        const node = tree.find(p => p.provider === activeProvider);
                        const envs = (node?.environments || []).slice().sort((a, b) => {
                            // Shared scope last
                            if (!!a.sharedScope !== !!b.sharedScope) return a.sharedScope ? 1 : -1;
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        if (!node?.enabled) {
                            return <div className="csm-empty">{activeProvider} catalog is not enabled yet.</div>;
                        }
                        if (envs.length === 0) {
                            return <div className="csm-empty">No environments yet — click <strong>New</strong>.</div>;
                        }
                        return envs.map(env => {
                            const services = (env.categoryGroups || [])
                                .reduce((sum, g) => sum + (g.services?.length || 0), 0);
                            return (
                                <button
                                    key={env.id}
                                    className={`csm-env-item ${env.id === activeEnvId ? "active" : ""} ${env.sharedScope ? "shared" : ""}`}
                                    onClick={() => setActiveEnvId(env.id)}
                                >
                                    <div className="csm-env-name">
                                        {env.sharedScope ? <Sparkles size={13} /> : <Server size={13} />}
                                        <span>{env.displayName || env.name}</span>
                                    </div>
                                    <div className="csm-env-meta">
                                        <span className="csm-pill">{services} svc</span>
                                        {env.sharedScope && <span className="csm-pill shared">shared</span>}
                                    </div>
                                </button>
                            );
                        });
                    })()}
                </aside>

                {/* Right: env detail */}
                <section className="csm-env-detail">
                    {!activeEnv ? (
                        <div className="csm-empty large">Select an environment to manage its services.</div>
                    ) : (
                        <CloudEnvDetail
                            env={activeEnv}
                            openCategories={openCategories}
                            setOpenCategories={setOpenCategories}
                            onUpdateService={onUpdateService}
                            onDeleteService={onDeleteService}
                            onAskAdd={(catKey) => setSuggestModal({ categoryKey: catKey })}
                            onSaveMeta={async (patch) => {
                                const draft = updateActiveEnv(env => Object.assign(env, patch));
                                if (draft) await persistEnv(draft);
                            }}
                        />
                    )}
                </section>
            </div>

            {suggestModal && (
                <AzureSuggestModal
                    categoryKey={suggestModal.categoryKey}
                    region={activeEnv?.azureRegion || "eastus"}
                    onClose={() => setSuggestModal(null)}
                    onPick={onAddServiceFromSuggestion}
                />
            )}

            {toast && (
                <div className={`csm-toast ${toast.kind}`}>{toast.msg}</div>
            )}
        </div>
    );
}

// ---------------- Env detail (categories + services) ----------------

function CloudEnvDetail({ env, openCategories, setOpenCategories, onUpdateService, onDeleteService, onAskAdd, onSaveMeta }) {
    const [name, setName] = useState(env.displayName || env.name);
    const [region, setRegion] = useState(env.azureRegion || "eastus");
    const [desc, setDesc] = useState(env.description || "");

    useEffect(() => {
        setName(env.displayName || env.name);
        setRegion(env.azureRegion || "eastus");
        setDesc(env.description || "");
    }, [env.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const totals = useMemo(() => {
        let hourly = 0, monthly = 0, services = 0;
        for (const g of env.categoryGroups || []) {
            for (const s of g.services || []) {
                services++;
                const c = s.count || 1;
                if (s.hourlyRateUsd != null) hourly += s.hourlyRateUsd * c;
                if (s.monthlyRateUsd != null) monthly += s.monthlyRateUsd * c;
                // AKS composite — sum sub-nodes too
                for (const n of s.aksNodes || []) {
                    if (n.hourlyRateUsd != null && n.nodeCount) hourly += n.hourlyRateUsd * n.nodeCount;
                    if (n.monthlyRateUsd != null && n.nodeCount) monthly += n.monthlyRateUsd * n.nodeCount;
                }
            }
        }
        return { hourly, monthly, services };
    }, [env]);

    return (
        <div className="csm-detail">
            <div className="csm-detail-head">
                <div>
                    <h2>{env.displayName || env.name}</h2>
                    <p className="csm-sub">
                        Provider: <strong>{env.provider || "AZURE"}</strong>
                        {env.sharedScope ? <span className="csm-pill shared" style={{marginLeft:8}}>SHARED SCOPE</span> : null}
                    </p>
                </div>
                <div className="csm-totals">
                    <div><span>Services</span><strong>{totals.services}</strong></div>
                    <div><span>Hourly</span><strong>{fmt$(totals.hourly)}</strong></div>
                    <div><span>Monthly</span><strong>{fmtMonthly(totals.monthly)}</strong></div>
                </div>
            </div>

            <div className="csm-meta-row">
                <label>
                    <span>Display name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                    <span>Azure region</span>
                    <input value={region} onChange={(e) => setRegion(e.target.value)} />
                </label>
                <label className="grow">
                    <span>Description</span>
                    <input value={desc} onChange={(e) => setDesc(e.target.value)} />
                </label>
                <button
                    className="csm-btn primary"
                    onClick={() => onSaveMeta({ displayName: name, azureRegion: region, description: desc })}
                >
                    <Save size={14} /> Save metadata
                </button>
            </div>

            <div className="csm-categories">
                {(env.categoryGroups || []).map(group => {
                    const Icon = CATEGORY_ICONS[group.key] || Server;
                    const open = openCategories[`${env.id}::${group.key}`] !== false;
                    return (
                        <div key={group.key} className="csm-category">
                            <button
                                className="csm-category-head"
                                onClick={() => setOpenCategories(s => ({ ...s, [`${env.id}::${group.key}`]: !open }))}
                            >
                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Icon size={14} />
                                <span>{group.displayName}</span>
                                <span className="csm-pill">{group.services?.length || 0}</span>
                                <div className="grow" />
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="csm-btn small primary as-span"
                                    onClick={(e) => { e.stopPropagation(); onAskAdd(group.key); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onAskAdd(group.key); } }}
                                >
                                    <Plus size={12} /> Add
                                </span>
                            </button>

                            {open && (
                                <div className="csm-services">
                                    {(group.services || []).length === 0 && (
                                        <div className="csm-empty">No services yet. Click <strong>Add</strong> to search the live Azure catalog.</div>
                                    )}
                                    {(group.services || []).map(svc => (
                                        <ServiceRow
                                            key={svc.id}
                                            svc={svc}
                                            categoryKey={group.key}
                                            onChange={(patch) => onUpdateService(group.key, svc.id, patch)}
                                            onDelete={() => onDeleteService(group.key, svc.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ServiceRow({ svc, categoryKey, onChange, onDelete }) {
    const isAks = categoryKey === "aks" && (svc.aksNodes && svc.aksNodes.length > 0);
    const monthlyEst = (svc.monthlyRateUsd != null ? svc.monthlyRateUsd : (svc.hourlyRateUsd ? svc.hourlyRateUsd * 730 : null))
                      * (svc.count || 1);

    return (
        <div className="csm-service">
            <div className="csm-svc-line">
                <div className="csm-svc-name">
                    <strong>{svc.displayName || svc.name}</strong>
                    {svc.azureSkuName && <span className="csm-pill">{svc.azureSkuName}</span>}
                    {svc.azureArmRegionName && <span className="csm-pill">{svc.azureArmRegionName}</span>}
                    {svc.vCpuPerNode > 0 && (
                        <span className="csm-pill">{svc.vCpuPerNode} vCPU · {svc.memoryGbPerNode}GB</span>
                    )}
                </div>
                <div className="csm-svc-meta">
                    <span title="Hourly per unit">{fmt$(svc.hourlyRateUsd)}/hr</span>
                    <span title="Estimated monthly">{fmtMonthly(monthlyEst)}/mo</span>
                </div>
                <button className="csm-icon-btn danger" onClick={onDelete} title="Remove">
                    <Trash2 size={14} />
                </button>
            </div>
            <div className="csm-svc-controls">
                <label>
                    <span>Count</span>
                    <input
                        type="number"
                        min={1}
                        value={svc.count || 1}
                        onChange={(e) => onChange({ count: Math.max(1, Number(e.target.value) || 1) })}
                    />
                </label>
                <label>
                    <span>Allocation</span>
                    <select
                        value={svc.allocation || "GENERAL"}
                        onChange={(e) => onChange({ allocation: e.target.value })}
                    >
                        {ALLOCATION_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label className="grow">
                    <span>Notes</span>
                    <input
                        value={svc.notes || ""}
                        onChange={(e) => onChange({ notes: e.target.value })}
                    />
                </label>
            </div>
            {isAks && (
                <div className="csm-aks-nodes">
                    <div className="csm-aks-head">AKS node pools</div>
                    {svc.aksNodes.map((n, idx) => (
                        <div key={idx} className="csm-aks-row">
                            <span className={`csm-pill role-${n.role}`}>{n.role}</span>
                            <span><strong>{n.azureSkuName || "—"}</strong></span>
                            <span>{n.vCpuPerNode || 0} vCPU · {n.memoryGbPerNode || 0}GB</span>
                            <span>×{n.nodeCount || 1}</span>
                            <span>{fmt$(n.hourlyRateUsd)}/hr</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------- Azure suggest modal ----------------

function AzureSuggestModal({ categoryKey, region, onClose, onPick }) {
    const [query, setQuery] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [spot, setSpot] = useState(false);
    const debRef = useRef();

    const search = useCallback(async (q) => {
        setLoading(true);
        try {
            const data = await azureCatalogSuggest({
                category: categoryKey, query: q || "", region, max: 30, spot
            });
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [categoryKey, region, spot]);

    useEffect(() => { void search(""); }, [search]);

    const onTyping = (v) => {
        setQuery(v);
        if (debRef.current) clearTimeout(debRef.current);
        debRef.current = setTimeout(() => void search(v), 250);
    };

    return (
        <div className="csm-modal-back" onClick={onClose}>
            <div className="csm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="csm-modal-head">
                    <h3>Add {categoryKey} service — Azure live catalog</h3>
                    <button className="csm-icon-btn" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="csm-search">
                    <Search size={14} />
                    <input
                        autoFocus
                        placeholder={`Search ${region}…`}
                        value={query}
                        onChange={(e) => onTyping(e.target.value)}
                    />
                    {(categoryKey === "compute" || categoryKey === "aks") && (
                        <label className="csm-spot">
                            <input type="checkbox" checked={spot} onChange={(e) => { setSpot(e.target.checked); }} />
                            Spot
                        </label>
                    )}
                </div>
                <div className="csm-results">
                    {loading && <div className="csm-empty">Searching Azure…</div>}
                    {!loading && items.length === 0 && <div className="csm-empty">No matches in {region}.</div>}
                    {items.map((r, i) => (
                        <button key={`${r.meterId}-${i}`} className="csm-result" onClick={() => onPick(r)}>
                            <div className="csm-result-line">
                                <strong>{r.productName || r.skuName}</strong>
                                {r.armSkuName && <span className="csm-pill">{r.armSkuName}</span>}
                                {r.skuName && r.skuName !== r.armSkuName && <span className="csm-pill">{r.skuName}</span>}
                            </div>
                            <div className="csm-result-meta">
                                {r.vCpuPerNode > 0 && <span>{r.vCpuPerNode} vCPU · {r.memoryGbPerNode}GB</span>}
                                <span>{fmt$(r.hourlyRateUsd)}/hr</span>
                                <span>{fmtMonthly(r.monthlyEstUsd)}/mo</span>
                                <span className="csm-pill">{r.serviceName}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ---------------- helpers ----------------

function defaultAllocation(catKey) {
    switch (catKey) {
        case "compute": return "USER_NODE";
        case "aks":     return "USER_NODE";
        case "network": return "NETWORK";
        case "security":return "SECURITY";
        case "ai":      return "AI_SHARED";
        case "external":return "EXTERNAL";
        default:        return "GENERAL";
    }
}

function cryptoRandom() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------- styles ----------------

const cssBlock = `
.cloud-services-manager { display:flex; flex-direction:column; gap:14px; padding: 8px 4px; }
.csm-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.csm-providers { display:flex; gap:6px; }
.csm-provider-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid #d4d8e0; background:#fff; border-radius:8px; cursor:pointer; font-size:13px; color:#3a4256; }
.csm-provider-tab.active { border-color:#2563eb; background:#eff5ff; color:#1d4ed8; }
.csm-provider-tab.disabled { opacity:.5; cursor:not-allowed; }
.csm-pill { padding:1px 7px; border-radius:999px; background:#eef0f6; color:#475066; font-size:11px; font-weight:600; }
.csm-pill.shared { background:#fef3c7; color:#92400e; }
.csm-pill.role-system { background:#dbeafe; color:#1e40af; }
.csm-pill.role-user { background:#dcfce7; color:#166534; }
.csm-pill.role-spot { background:#fee2e2; color:#991b1b; }
.csm-pill.role-control-plane { background:#e0e7ff; color:#3730a3; }
.csm-actions { display:flex; gap:6px; }
.csm-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px; cursor:pointer; color:#374151; }
.csm-btn.small { padding:4px 8px; font-size:12px; }
.csm-btn.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
.csm-btn.ghost { background:#f8f9fc; }
.csm-btn:disabled { opacity:.6; cursor:not-allowed; }
.csm-btn.as-span { display:inline-flex; align-items:center; gap:4px; }
.csm-icon-btn { background:transparent; border:none; cursor:pointer; padding:4px; border-radius:5px; color:#5b6478; }
.csm-icon-btn:hover { background:#f1f3f7; }
.csm-icon-btn.danger:hover { background:#fee2e2; color:#b91c1c; }
.csm-error { color:#b91c1c; background:#fee2e2; padding:8px 12px; border-radius:7px; display:flex; align-items:center; gap:8px; font-size:13px; }
.csm-body { display:grid; grid-template-columns: 280px 1fr; gap:14px; min-height: 60vh; }
@media (max-width: 900px) { .csm-body { grid-template-columns: 1fr; } }
.csm-env-list { background:#fff; border:1px solid #e2e6ee; border-radius:10px; padding:8px; max-height:80vh; overflow:auto; }
.csm-env-list-head { display:flex; align-items:center; justify-content:space-between; padding:6px 8px 10px; font-weight:600; color:#1f2937; }
.csm-env-item { display:flex; flex-direction:column; gap:4px; padding:9px 10px; border:1px solid transparent; background:#f8f9fc; border-radius:8px; cursor:pointer; width:100%; text-align:left; margin-bottom:4px; }
.csm-env-item.active { border-color:#2563eb; background:#eff5ff; }
.csm-env-item.shared { background:#fffbeb; }
.csm-env-name { display:flex; align-items:center; gap:6px; font-weight:600; color:#1f2937; }
.csm-env-meta { display:flex; gap:6px; }
.csm-empty { text-align:center; padding:14px; color:#6b7280; font-size:13px; }
.csm-empty.large { padding:48px; font-size:15px; }
.csm-env-detail { background:#fff; border:1px solid #e2e6ee; border-radius:10px; padding:14px 16px; min-height: 60vh; }
.csm-detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding-bottom:10px; border-bottom:1px solid #eef1f6; }
.csm-detail-head h2 { margin:0; font-size:18px; }
.csm-sub { margin:4px 0 0; color:#6b7280; font-size:13px; }
.csm-totals { display:flex; gap:14px; }
.csm-totals > div { background:#f8f9fc; border:1px solid #e7eaf2; padding:7px 12px; border-radius:8px; min-width:90px; text-align:right; }
.csm-totals span { display:block; font-size:11px; color:#6b7280; text-transform:uppercase; }
.csm-totals strong { font-size:14px; color:#1f2937; }
.csm-meta-row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; padding:10px 0; border-bottom:1px solid #eef1f6; }
.csm-meta-row label { display:flex; flex-direction:column; gap:3px; font-size:12px; color:#475569; }
.csm-meta-row label.grow { flex: 1 1 200px; }
.csm-meta-row input, .csm-meta-row select { padding:6px 9px; border:1px solid #d4d8e0; border-radius:6px; font-size:13px; }
.csm-categories { display:flex; flex-direction:column; gap:8px; padding-top:12px; }
.csm-category { border:1px solid #e2e6ee; border-radius:9px; overflow:hidden; }
.csm-category-head { width:100%; display:flex; align-items:center; gap:8px; padding:10px 14px; background:#f8f9fc; border:none; cursor:pointer; font-size:14px; font-weight:600; color:#1f2937; }
.csm-category-head:hover { background:#eef1f7; }
.csm-services { padding: 8px 12px 12px; display:flex; flex-direction:column; gap:8px; }
.csm-service { border:1px solid #eef1f6; border-radius:8px; padding:10px 12px; background:#fff; }
.csm-svc-line { display:flex; align-items:center; gap:10px; }
.csm-svc-name { display:flex; align-items:center; gap:8px; flex:1 1 auto; flex-wrap:wrap; }
.csm-svc-meta { display:flex; gap:10px; color:#475569; font-size:12px; }
.csm-svc-controls { display:flex; gap:10px; flex-wrap:wrap; padding-top:8px; }
.csm-svc-controls label { display:flex; flex-direction:column; gap:3px; font-size:11px; color:#64748b; }
.csm-svc-controls label.grow { flex: 1 1 200px; }
.csm-svc-controls input, .csm-svc-controls select { padding:5px 8px; border:1px solid #d4d8e0; border-radius:6px; font-size:13px; }
.csm-aks-nodes { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e6ee; }
.csm-aks-head { font-size:11px; text-transform:uppercase; color:#64748b; margin-bottom:6px; font-weight:600; }
.csm-aks-row { display:flex; align-items:center; gap:10px; font-size:12px; padding:4px 0; }
.grow { flex:1 1 auto; }
.csm-modal-back { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:1000; display:flex; align-items:center; justify-content:center; }
.csm-modal { background:#fff; border-radius:12px; width: min(720px, 92vw); max-height: 80vh; display:flex; flex-direction:column; overflow:hidden; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
.csm-modal-head { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #eef1f6; }
.csm-modal-head h3 { margin:0; font-size:15px; }
.csm-search { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid #eef1f6; }
.csm-search input { flex:1 1 auto; padding:6px 9px; border:1px solid #d4d8e0; border-radius:6px; font-size:13px; }
.csm-spot { display:flex; align-items:center; gap:4px; font-size:12px; color:#475569; }
.csm-results { flex:1 1 auto; overflow:auto; padding: 6px 0; }
.csm-result { display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; padding:8px 14px; border:none; background:#fff; border-bottom:1px solid #f1f3f7; cursor:pointer; text-align:left; }
.csm-result:hover { background:#eff5ff; }
.csm-result-line { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.csm-result-meta { display:flex; gap:10px; font-size:12px; color:#475569; flex-wrap:wrap; }
.csm-toast { position:fixed; bottom:24px; right:24px; padding:10px 14px; border-radius:8px; box-shadow: 0 8px 22px rgba(0,0,0,.18); font-size:13px; z-index:1100; }
.csm-toast.ok { background:#16a34a; color:#fff; }
.csm-toast.err { background:#b91c1c; color:#fff; }
`;
