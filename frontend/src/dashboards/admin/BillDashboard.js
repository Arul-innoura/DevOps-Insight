// Bill-style cost dashboard — invoice layout per project, grouped by category.
// Reads /api/billing/* endpoints (cost engine v2). Live month-to-date with
// previous-month toggle and arbitrary range filter.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Receipt, RefreshCw, Calendar, ChevronDown, ChevronRight,
    Cpu, Boxes, Network as NetworkIcon, Shield, HardDrive, Database,
    Sparkles, Server, ExternalLink
} from "lucide-react";
import { getLiveBills, getCurrentMonthBill, getPreviousMonthBill, getBillRange } from "../../services/billingService";

const CATEGORY_ICONS = {
    compute: Cpu, aks: Boxes, network: NetworkIcon, security: Shield,
    storage: HardDrive, database: Database, ai: Sparkles, external: ExternalLink, other: Server
};

const RANGE_PRESETS = [
    { key: "live",    label: "Live (this month)" },
    { key: "prev",    label: "Previous month" },
    { key: "day",     label: "Last 24 hours" },
    { key: "week",    label: "Last 7 days" },
    { key: "year",    label: "Year-to-date" },
    { key: "custom",  label: "Custom range" }
];

const fmt$ = (v) => (v == null || isNaN(v)) ? "$0.00" : `$${Number(v).toFixed(2)}`;
const fmtSmall$ = (v) => (v == null || isNaN(v)) ? "—" : `$${Number(v).toFixed(4)}`;

export default function BillDashboard() {
    const [liveBills, setLiveBills] = useState([]);
    const [activeProjectId, setActiveProjectId] = useState(null);
    const [activeBill, setActiveBill] = useState(null);
    const [rangeKey, setRangeKey] = useState("live");
    const [customFrom, setCustomFrom] = useState(toLocalDateValue(monthStart()));
    const [customTo, setCustomTo] = useState(toLocalDateValue(new Date()));
    const [openCats, setOpenCats] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const loadLive = useCallback(async () => {
        setRefreshing(true);
        try {
            const data = await getLiveBills();
            const arr = Array.isArray(data) ? data : [];
            setLiveBills(arr);
            if (!activeProjectId && arr.length) setActiveProjectId(arr[0].projectId);
        } catch (e) {
            setError(e?.message || "Failed to load bills");
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [activeProjectId]);

    useEffect(() => { void loadLive(); }, [loadLive]);

    // Auto-refresh every 30s when on "live" range
    useEffect(() => {
        if (rangeKey !== "live") return;
        const t = setInterval(() => { void loadLive(); }, 30000);
        return () => clearInterval(t);
    }, [rangeKey, loadLive]);

    const loadActive = useCallback(async () => {
        if (!activeProjectId) { setActiveBill(null); return; }
        try {
            if (rangeKey === "live") {
                const bill = await getCurrentMonthBill(activeProjectId);
                setActiveBill(bill);
            } else if (rangeKey === "prev") {
                const bill = await getPreviousMonthBill(activeProjectId);
                setActiveBill(bill);
            } else if (rangeKey === "day" || rangeKey === "week" || rangeKey === "year") {
                const now = new Date();
                let from;
                if (rangeKey === "day")  from = new Date(now.getTime() - 24 * 3600 * 1000);
                if (rangeKey === "week") from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
                if (rangeKey === "year") from = new Date(now.getFullYear(), 0, 1);
                const bill = await getBillRange(activeProjectId, from.toISOString(), now.toISOString(), rangeKey);
                setActiveBill(bill);
            } else if (rangeKey === "custom") {
                const from = new Date(customFrom);
                const to = new Date(customTo);
                if (isNaN(from) || isNaN(to) || from >= to) return;
                const bill = await getBillRange(activeProjectId, from.toISOString(), to.toISOString(), "custom");
                setActiveBill(bill);
            }
        } catch (e) {
            setError(e?.message || "Failed to load bill");
        }
    }, [activeProjectId, rangeKey, customFrom, customTo]);

    useEffect(() => { void loadActive(); }, [loadActive]);

    const grouped = useMemo(() => {
        if (!activeBill?.lines) return [];
        const map = new Map();
        for (const l of activeBill.lines) {
            const key = l.categoryKey || "other";
            if (!map.has(key)) map.set(key, { key, displayName: l.categoryDisplayName || key, items: [], subtotalMonthly: 0, subtotalMtd: 0 });
            const g = map.get(key);
            g.items.push(l);
            g.subtotalMonthly += l.effectiveMonthlyUsd || 0;
            g.subtotalMtd += l.monthToDateUsd || 0;
        }
        return Array.from(map.values()).sort((a, b) => b.subtotalMonthly - a.subtotalMonthly);
    }, [activeBill]);

    return (
        <div className="bill-dashboard">
            <style>{cssBlock}</style>

            <div className="bd-toolbar">
                <div className="bd-title">
                    <Receipt size={16} />
                    <strong>Cloud Bill</strong>
                    <span className="bd-sub">Live, allocated cost per project — updated every 30s</span>
                </div>
                <div className="bd-actions">
                    <button className="bd-btn ghost" onClick={loadLive} disabled={refreshing}>
                        <RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh"}
                    </button>
                </div>
            </div>

            {error && <div className="bd-error">{error}</div>}

            <div className="bd-body">
                {/* Projects list */}
                <aside className="bd-projects">
                    <div className="bd-projects-head">Projects</div>
                    {loading && <div className="bd-empty">Loading…</div>}
                    {!loading && liveBills.length === 0 && <div className="bd-empty">No bills yet.</div>}
                    {liveBills.map(b => (
                        <button
                            key={b.projectId}
                            className={`bd-project ${b.projectId === activeProjectId ? "active" : ""}`}
                            onClick={() => setActiveProjectId(b.projectId)}
                        >
                            <div className="bd-project-name">{b.projectName}</div>
                            <div className="bd-project-meta">
                                <span title="Effective hourly">{fmtSmall$(b.totalHourlyUsd)}/hr</span>
                                <span title="Projected monthly">{fmt$(b.totalMonthlyUsd)}/mo</span>
                            </div>
                            <div className="bd-project-mtd">
                                <span>MTD</span>
                                <strong>{fmt$(b.totalMonthToDateUsd)}</strong>
                            </div>
                        </button>
                    ))}
                </aside>

                {/* Bill area */}
                <section className="bd-bill">
                    {!activeBill ? (
                        <div className="bd-empty large">Select a project to view its bill.</div>
                    ) : (
                        <>
                            <div className="bd-bill-head">
                                <div>
                                    <h2>{activeBill.projectName}</h2>
                                    <span className="bd-sub">{activeBill.windowLabel} · {fmtRange(activeBill.windowStart, activeBill.windowEnd)}</span>
                                </div>
                                <div className="bd-range">
                                    <Calendar size={14} />
                                    <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
                                        {RANGE_PRESETS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                                    </select>
                                    {rangeKey === "custom" && (
                                        <>
                                            <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                                            <span>→</span>
                                            <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="bd-summary-cards">
                                <SummaryCard label="Effective hourly" value={fmtSmall$(activeBill.totalHourlyUsd) + "/hr"} />
                                <SummaryCard label="Projected monthly" value={fmt$(activeBill.totalMonthlyUsd)} primary />
                                <SummaryCard label="Month-to-date" value={fmt$(activeBill.totalMonthToDateUsd)} accent />
                                <SummaryCard label="Lines" value={activeBill.lines?.length || 0} />
                            </div>

                            {/* Allocation breakdown bars */}
                            <div className="bd-allocation">
                                <AllocBar title="By category" data={activeBill.byCategory} />
                                <AllocBar title="By environment" data={activeBill.byEnvironment} />
                                <AllocBar title="By namespace" data={activeBill.byNamespace} />
                            </div>

                            {/* Invoice table */}
                            <div className="bd-invoice">
                                <div className="bd-invoice-head">
                                    <span>Service</span>
                                    <span>Env</span>
                                    <span>Alloc</span>
                                    <span>Count</span>
                                    <span>Share</span>
                                    <span>$/hr</span>
                                    <span>$/mo</span>
                                    <span>MTD</span>
                                </div>
                                {grouped.length === 0 && (
                                    <div className="bd-empty">No services configured yet for this project.</div>
                                )}
                                {grouped.map(group => {
                                    const Icon = CATEGORY_ICONS[group.key] || Server;
                                    const open = openCats[group.key] !== false;
                                    return (
                                        <div key={group.key} className="bd-group">
                                            <button className="bd-group-head" onClick={() => setOpenCats(s => ({ ...s, [group.key]: !open }))}>
                                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                <Icon size={14} />
                                                <strong>{group.displayName}</strong>
                                                <span className="bd-pill">{group.items.length}</span>
                                                <div className="grow" />
                                                <span className="bd-group-totals">
                                                    {fmt$(group.subtotalMonthly)}/mo · MTD {fmt$(group.subtotalMtd)}
                                                </span>
                                            </button>
                                            {open && (
                                                <div className="bd-rows">
                                                    {group.items.map(line => (
                                                        <div key={line.serviceId + line.environmentId} className="bd-row">
                                                            <span className="bd-svc">
                                                                <strong>{line.customName || line.serviceName}</strong>
                                                                {line.namespace && <span className="bd-pill ns">{line.namespace}</span>}
                                                            </span>
                                                            <span>{line.environmentName || "—"}</span>
                                                            <span><span className="bd-pill alloc">{line.allocation}</span></span>
                                                            <span>×{line.count || 1}</span>
                                                            <span>{((line.shareFraction || 0) * 100).toFixed(0)}%</span>
                                                            <span>{fmtSmall$(line.effectiveHourlyUsd)}</span>
                                                            <span>{fmt$(line.effectiveMonthlyUsd)}</span>
                                                            <span><strong>{fmt$(line.monthToDateUsd)}</strong></span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <div className="bd-grand">
                                    <span>TOTAL</span>
                                    <span>{fmt$(activeBill.totalMonthlyUsd)}/mo</span>
                                    <span className="mtd">MTD {fmt$(activeBill.totalMonthToDateUsd)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, primary, accent }) {
    return (
        <div className={`bd-summary ${primary ? "primary" : ""} ${accent ? "accent" : ""}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function AllocBar({ title, data }) {
    const entries = Object.entries(data || {}).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return null;
    return (
        <div className="bd-alloc-block">
            <div className="bd-alloc-title">{title}</div>
            {entries.map(([k, v]) => (
                <div key={k} className="bd-alloc-row">
                    <span className="bd-alloc-name">{k}</span>
                    <div className="bd-alloc-bar">
                        <div className="bd-alloc-fill" style={{ width: `${(v / total) * 100}%` }} />
                    </div>
                    <span className="bd-alloc-val">{fmt$(v)}</span>
                </div>
            ))}
        </div>
    );
}

// ---------------- helpers ----------------

function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0); }
function toLocalDateValue(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtRange(from, to) {
    if (!from || !to) return "";
    const f = new Date(from), t = new Date(to);
    const opts = { month: "short", day: "numeric", year: "numeric" };
    return `${f.toLocaleDateString(undefined, opts)} → ${t.toLocaleDateString(undefined, opts)}`;
}

const cssBlock = `
.bill-dashboard { display:flex; flex-direction:column; gap:14px; padding: 4px; }
.bd-toolbar { display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background:#f8f9fc; border:1px solid #e6e9f0; border-radius:9px; }
.bd-title { display:flex; align-items:center; gap:8px; }
.bd-sub { color:#6b7280; font-size:12px; margin-left: 6px; }
.bd-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px; cursor:pointer; color:#374151; }
.bd-btn.ghost { background:#fff; }
.bd-error { color:#b91c1c; background:#fee2e2; padding:8px 12px; border-radius:7px; font-size:13px; }
.bd-body { display:grid; grid-template-columns: 280px 1fr; gap:14px; }
@media (max-width: 900px) { .bd-body { grid-template-columns: 1fr; } }
.bd-projects { background:#fff; border:1px solid #e2e6ee; border-radius:10px; padding:8px; max-height: 80vh; overflow:auto; }
.bd-projects-head { padding: 6px 8px 10px; font-weight:600; color:#1f2937; }
.bd-project { display:flex; flex-direction:column; gap:3px; padding:9px 10px; border:1px solid transparent; background:#f8f9fc; border-radius:8px; cursor:pointer; width:100%; text-align:left; margin-bottom:4px; }
.bd-project.active { border-color:#2563eb; background:#eff5ff; }
.bd-project-name { font-weight:600; color:#1f2937; }
.bd-project-meta { display:flex; gap:8px; font-size:11px; color:#475569; }
.bd-project-mtd { display:flex; justify-content:space-between; font-size:11px; color:#1f2937; padding-top:4px; border-top:1px dashed #e2e6ee; margin-top:3px; }
.bd-project-mtd span { color:#6b7280; text-transform:uppercase; }
.bd-bill { background:#fff; border:1px solid #e2e6ee; border-radius:10px; padding:14px 16px; min-height: 60vh; }
.bd-bill-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding-bottom:10px; border-bottom:2px solid #1f2937; }
.bd-bill-head h2 { margin:0; font-size:20px; }
.bd-range { display:flex; align-items:center; gap:6px; font-size:13px; color:#475569; }
.bd-range select, .bd-range input { padding:5px 8px; border:1px solid #d4d8e0; border-radius:6px; font-size:13px; }
.bd-summary-cards { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; padding:14px 0; }
@media (max-width:600px) { .bd-summary-cards { grid-template-columns: repeat(2, 1fr); } }
.bd-summary { background:#f8f9fc; border:1px solid #e7eaf2; border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:4px; }
.bd-summary span { font-size:11px; color:#6b7280; text-transform:uppercase; }
.bd-summary strong { font-size:18px; color:#1f2937; }
.bd-summary.primary { background:#eff5ff; border-color:#bfdbfe; }
.bd-summary.primary strong { color:#1d4ed8; }
.bd-summary.accent { background:#fef3c7; border-color:#fde68a; }
.bd-summary.accent strong { color:#92400e; }
.bd-allocation { display:grid; grid-template-columns: repeat(3, 1fr); gap:14px; padding-bottom:14px; border-bottom:1px solid #eef1f6; }
@media (max-width: 800px) { .bd-allocation { grid-template-columns: 1fr; } }
.bd-alloc-block { background:#f8f9fc; border:1px solid #e7eaf2; border-radius:8px; padding:10px 12px; }
.bd-alloc-title { font-size:11px; color:#475569; text-transform:uppercase; margin-bottom:6px; font-weight:600; }
.bd-alloc-row { display:grid; grid-template-columns: 90px 1fr 70px; align-items:center; gap:6px; font-size:12px; padding:2px 0; }
.bd-alloc-bar { height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden; }
.bd-alloc-fill { height:100%; background:#2563eb; }
.bd-alloc-val { text-align:right; font-weight:600; color:#1f2937; }
.bd-invoice { padding-top: 10px; }
.bd-invoice-head { display:grid; grid-template-columns: 2fr 1.2fr 1fr 0.6fr 0.6fr 0.8fr 0.9fr 0.9fr; gap:8px; padding:8px 10px; font-size:11px; color:#64748b; text-transform:uppercase; border-bottom:1px solid #e7eaf2; }
.bd-group { border-bottom:1px solid #f1f3f7; }
.bd-group-head { width:100%; display:flex; align-items:center; gap:8px; padding:9px 10px; background:#f8f9fc; border:none; cursor:pointer; font-size:13px; }
.bd-group-totals { font-size:12px; color:#1f2937; font-weight:600; }
.bd-rows { display:flex; flex-direction:column; }
.bd-row { display:grid; grid-template-columns: 2fr 1.2fr 1fr 0.6fr 0.6fr 0.8fr 0.9fr 0.9fr; gap:8px; padding:6px 10px; font-size:12px; align-items:center; border-bottom:1px dashed #eef1f6; }
.bd-row > span { overflow: hidden; text-overflow: ellipsis; }
.bd-svc { display:flex; flex-direction:column; gap:2px; }
.bd-pill { padding:1px 7px; border-radius:999px; background:#eef0f6; color:#475066; font-size:10px; font-weight:600; display:inline-block; width:fit-content; }
.bd-pill.alloc { background:#e0f2fe; color:#075985; }
.bd-pill.ns { background:#dcfce7; color:#166534; }
.bd-grand { display:flex; align-items:center; justify-content:space-between; padding:14px 10px; border-top:2px solid #1f2937; margin-top:10px; font-size:16px; font-weight:700; }
.bd-grand .mtd { color:#92400e; }
.bd-empty { text-align:center; padding:14px; color:#6b7280; font-size:13px; }
.bd-empty.large { padding:60px; font-size:15px; }
.grow { flex:1 1 auto; }
`;
