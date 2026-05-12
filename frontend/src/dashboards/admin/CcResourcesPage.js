/**
 * CcResourcesPage — Resource usage with full time-range filtering and
 * per-namespace drill-down graphs.
 *
 * Sections:
 *   1. Filter controls (live window / date / month / year / range)
 *   2. Cluster utilisation quick stats
 *   3. Cluster CPU used vs total · Memory used vs total (area charts)
 *   4. Namespace drill-down: dropdown → metric tabs (CPU / Memory / Pods)
 *      → LiveAreaChart used (solid) vs request/spec (dashed)
 *   5. Top-5 namespace CPU comparison (multi-line)
 *   6. Top-5 namespace Memory comparison (multi-line)
 *   7. Namespace resource snapshot table (click a row → drill-down)
 *   8. Top CPU / memory consumer lists
 */

import React, { useMemo, useState } from "react";
import {
    Activity, Cpu, Database, AlertTriangle,
    Clock, Calendar, ChevronDown, Layers, BarChart2, Package,
} from "lucide-react";
import { fmt$Tiny, fmtNum, fmtPct, TopList } from "./ClusterCostDashboard";
import { LiveAreaChart, CostMultiLineChart } from "../../components/ClusterCostMiniCharts";

// ── deterministic colour from namespace name ──────────────────────────────────
const NS_PALETTE = [
    "#f97316","#3b82f6","#10b981","#a855f7","#ef4444",
    "#06b6d4","#84cc16","#ec4899","#f59e0b","#6366f1",
];
function nsColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return NS_PALETTE[h % NS_PALETTE.length];
}

// ── metric tab definitions ────────────────────────────────────────────────────
const METRIC_TABS = [
    { key: "cpu",    label: "CPU cores",   color: "#f97316", allocColor: "#fdba74" },
    { key: "memory", label: "Memory GB",   color: "#ec4899", allocColor: "#f9a8d4" },
    { key: "pods",   label: "Pod count",   color: "#6366f1", allocColor: null      },
];

export default function CcResourcesPage({ ctx }) {
    const {
        env, snapshot, metrics,
        tsCpuUsedSeries, tsCpuTotalSeries,
        tsMemUsedSeries, tsMemTotalSeries,
        tsPoints, workloadNs, isSystemNs,
        effectiveGranularity,
        tsMode,        setTsMode,
        tsLiveWindow,  setTsLiveWindow,
        tsDate,        setTsDate,
        tsMonth,       setTsMonth,
        tsYear,        setTsYear,
        tsCustomFrom,  setTsCustomFrom,
        tsCustomTo,    setTsCustomTo,
        tsGranularity, setTsGranularity,
        tsWindow,      tsLoading, tsError,
        tsFromMs, tsToMs,
    } = ctx;

    const [selectedNs,   setSelectedNs]   = useState("__all__");
    const [activeMetric, setActiveMetric] = useState("cpu");

    // ── namespace options list (sorted by peak CPU) ───────────────────────────
    const nsOptions = useMemo(() => {
        const seen = new Map();
        for (const p of tsPoints) {
            for (const nl of (p.namespaces || [])) {
                if (!seen.has(nl.namespace)) {
                    seen.set(nl.namespace, {
                        ns: nl.namespace, isSystem: isSystemNs(nl.namespace),
                        cpuMax: 0, memMax: 0, podMax: 0,
                    });
                }
                const e = seen.get(nl.namespace);
                if ((nl.cpuUsedCores  || 0) > e.cpuMax) e.cpuMax = nl.cpuUsedCores;
                if ((nl.memoryUsedGb  || 0) > e.memMax) e.memMax = nl.memoryUsedGb;
                if ((nl.podCount      || 0) > e.podMax) e.podMax = nl.podCount;
            }
        }
        // Fallback to live snapshot when no time-series loaded yet
        if (!seen.size && snapshot?.namespaces) {
            for (const n of snapshot.namespaces) {
                seen.set(n.namespace, {
                    ns: n.namespace, isSystem: isSystemNs(n.namespace),
                    cpuMax: n.cpuCores   || 0,
                    memMax: n.memoryGb   || 0,
                    podMax: n.podCount   || 0,
                });
            }
        }
        return [...seen.values()].sort((a, b) => b.cpuMax - a.cpuMax);
    }, [tsPoints, snapshot, isSystemNs]);

    // ── per-namespace time-series for selected ns ─────────────────────────────
    const nsCpuUsedSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const r = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: r?.cpuUsedCores || 0 };
        });
    }, [selectedNs, tsPoints]);

    const nsCpuReqSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const r = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: r?.cpuRequestCores || 0 };
        });
    }, [selectedNs, tsPoints]);

    const nsMemUsedSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const r = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: r?.memoryUsedGb || 0 };
        });
    }, [selectedNs, tsPoints]);

    const nsMemReqSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const r = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: r?.memoryRequestGb || 0 };
        });
    }, [selectedNs, tsPoints]);

    const nsPodSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const r = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: r?.podCount || 0 };
        });
    }, [selectedNs, tsPoints]);

    // Live snapshot stats for selected ns
    const selectedNsLive = useMemo(() => {
        if (selectedNs === "__all__" || !snapshot?.namespaces) return null;
        return snapshot.namespaces.find(n => n.namespace === selectedNs) ?? null;
    }, [selectedNs, snapshot]);

    // ── top-5 ns comparison series ────────────────────────────────────────────
    const topCpuNs = useMemo(() =>
        [...workloadNs].sort((a, b) => (b.cpuRequestCores || 0) - (a.cpuRequestCores || 0)).slice(0, 5).map(n => n.namespace),
    [workloadNs]);
    const topMemNs = useMemo(() =>
        [...workloadNs].sort((a, b) => (b.memoryRequestGb || 0) - (a.memoryRequestGb || 0)).slice(0, 5).map(n => n.namespace),
    [workloadNs]);

    const cpuNsSeries = useMemo(() => topCpuNs.map(nsName => ({
        key: nsName, label: nsName, color: nsColor(nsName),
        points: tsPoints.map(p => {
            const r = (p.namespaces || []).find(x => x.namespace === nsName);
            return { t: p.t, value: r?.cpuUsedCores || 0 };
        }),
    })), [topCpuNs, tsPoints]);

    const memNsSeries = useMemo(() => topMemNs.map(nsName => ({
        key: nsName, label: nsName, color: nsColor(nsName),
        points: tsPoints.map(p => {
            const r = (p.namespaces || []).find(x => x.namespace === nsName);
            return { t: p.t, value: r?.memoryUsedGb || 0 };
        }),
    })), [topMemNs, tsPoints]);

    // ── pod-count multi-line for top 5 by pod count ───────────────────────────
    const topPodNs = useMemo(() =>
        [...workloadNs].sort((a, b) => (b.podCount || 0) - (a.podCount || 0)).slice(0, 5).map(n => n.namespace),
    [workloadNs]);

    const podNsSeries = useMemo(() => topPodNs.map(nsName => ({
        key: nsName, label: nsName, color: nsColor(nsName),
        points: tsPoints.map(p => {
            const r = (p.namespaces || []).find(x => x.namespace === nsName);
            return { t: p.t, value: r?.podCount || 0 };
        }),
    })), [topPodNs, tsPoints]);

    // ── product-wise resource aggregation ────────────────────────────────────
    const productResources = useMemo(() => {
        if (!snapshot?.products?.length) return [];
        const nsMap = new Map((snapshot.namespaces || []).map(n => [n.namespace, n]));
        return snapshot.products
            .map(p => {
                const nsList = (p.namespaceNames || []).map(ns => nsMap.get(ns)).filter(Boolean);
                return {
                    name:       p.projectName || p.normalizedKey || "Unknown",
                    status:     p.status || (p.running ? "UP" : "DOWN"),
                    running:    !!p.running,
                    namespaces: p.namespaceNames || [],
                    podCount:   p.podCount        || nsList.reduce((s, n) => s + (n.podCount || 0), 0),
                    runningPods: p.runningPodCount || 0,
                    cpuReq:     nsList.reduce((s, n) => s + (n.cpuRequestCores  || 0), 0),
                    memReq:     nsList.reduce((s, n) => s + (n.memoryRequestGb  || 0), 0),
                    cpuUsed:    nsList.reduce((s, n) => s + (n.cpuCores || n.cpuUsedCores || 0), 0),
                    memUsed:    nsList.reduce((s, n) => s + (n.memoryGb || 0), 0),
                    hourly:     nsList.reduce((s, n) => s + (n.smoothedHourlyUsd || n.hourlyRateUsd || 0), 0),
                    pct:        p.percentOfTotal || 0,
                };
            })
            .sort((a, b) => Number(b.running) - Number(a.running) || b.hourly - a.hourly);
    }, [snapshot]);

    // Total spend per namespace for the loaded time window
    const nsRangeTotals = useMemo(() => {
        if (tsPoints.length < 2) return {};
        const durHr = (new Date(tsPoints[tsPoints.length - 1].t) - new Date(tsPoints[0].t)) / 3600000;
        const sums = {}, cnts = {};
        for (const p of tsPoints) {
            for (const nl of (p.namespaces || [])) {
                sums[nl.namespace] = (sums[nl.namespace] || 0) + (nl.hourlyUsd || 0);
                cnts[nl.namespace] = (cnts[nl.namespace] || 0) + 1;
            }
        }
        const out = {};
        for (const [ns, sum] of Object.entries(sums)) {
            out[ns] = (sum / cnts[ns]) * Math.max(durHr, 0);
        }
        return out;
    }, [tsPoints]);

    // ── guards (after all hooks) ──────────────────────────────────────────────
    if (!snapshot) return <div className="pcp-empty">No snapshot yet.</div>;
    if (!snapshot.cluster) return <div className="pcp-empty"><AlertTriangle size={16}/> No cluster data.</div>;

    const c       = snapshot.cluster;
    const cpuUtil = c.totalCpuCores > 0 ? (c.usedCpuCores / c.totalCpuCores) * 100 : 0;
    const memUtil = c.totalMemoryGb  > 0 ? (c.usedMemoryGb  / c.totalMemoryGb)  * 100 : 0;

    const activeTab = METRIC_TABS.find(t => t.key === activeMetric) || METRIC_TABS[0];

    // Choose correct series pair for active metric
    const drillUsedSeries  = activeMetric === "cpu"    ? nsCpuUsedSeries
                           : activeMetric === "memory" ? nsMemUsedSeries
                           :                             nsPodSeries;
    const drillAllocSeries = activeMetric === "cpu"    ? nsCpuReqSeries
                           : activeMetric === "memory" ? nsMemReqSeries
                           :                             [];
    const drillValueLabel  = activeMetric === "cpu"    ? "cores"
                           : activeMetric === "memory" ? "GB"
                           :                             "pods";
    const drillValueFmt    = activeMetric === "pods"
        ? v => `${Math.round(v)}`
        : v => v < 1 ? v.toFixed(3) : v.toFixed(2);

    const drillCurrentUsed  = activeMetric === "cpu"    ? selectedNsLive?.cpuCores      ?? selectedNsLive?.cpuUsedCores
                            : activeMetric === "memory" ? selectedNsLive?.memoryGb
                            :                             selectedNsLive?.podCount;
    const drillCurrentAlloc = activeMetric === "cpu"    ? selectedNsLive?.cpuRequestCores
                            : activeMetric === "memory" ? selectedNsLive?.memoryRequestGb
                            :                             undefined;

    const hasData = drillUsedSeries.length > 0 && drillUsedSeries.some(p => p.value > 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Page header ── */}
            <div className="pcp-section pcp-sec-resource" style={{ padding: "10px 14px 8px" }}>
                <div className="pcp-section-title" style={{ marginBottom: 0 }}>
                    <Activity size={15}/> Resource Usage
                    <span className="pcp-section-sub">
                        — CPU · Memory · Pods · per-namespace drill-down · full time range filter
                    </span>
                </div>
            </div>

            {/* ── Products by environment ── */}
            {productResources.length > 0 && (
                <div className="pcp-section" style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <Package size={14} style={{ color: "#475569" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Products — {(env || "").toUpperCase()} environment
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>
                            {productResources.filter(p => p.running).length} UP /&nbsp;
                            {productResources.filter(p => !p.running).length} DOWN
                        </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 8 }}>
                        {productResources.map(p => (
                            <div key={p.name} style={{
                                border: `1.5px solid ${p.running ? "#bbf7d0" : "#fecaca"}`,
                                borderLeft: `4px solid ${p.running ? "#22c55e" : "#ef4444"}`,
                                borderRadius: 8,
                                background: p.running ? "#f0fdf4" : "#fff5f5",
                                padding: "9px 12px",
                                display: "flex", flexDirection: "column", gap: 5,
                            }}>
                                {/* Product name + status */}
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: "50%",
                                        background: p.running ? "#22c55e" : "#ef4444",
                                        flexShrink: 0,
                                    }} />
                                    <span style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {p.name}
                                    </span>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                                        background: p.running ? "#dcfce7" : "#fee2e2",
                                        color:      p.running ? "#16a34a" : "#dc2626",
                                    }}>
                                        {p.status}
                                    </span>
                                </div>
                                {/* Namespace(s) subtitle */}
                                <div style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.namespaces.join(" · ") || "—"}
                                </div>
                                {/* Resource specs row */}
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
                                        <span style={{ color: "#f97316", fontWeight: 600 }}>{fmtNum(p.cpuReq, 2)}c</span>
                                        <span style={{ color: "#94a3b8" }}> cpu req</span>
                                    </span>
                                    <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
                                        <span style={{ color: "#ec4899", fontWeight: 600 }}>{fmtNum(p.memReq, 1)} GB</span>
                                        <span style={{ color: "#94a3b8" }}> mem req</span>
                                    </span>
                                    <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
                                        <span style={{ color: "#6366f1", fontWeight: 600 }}>{p.podCount}</span>
                                        <span style={{ color: "#94a3b8" }}>
                                            {p.runningPods > 0 ? ` (${p.runningPods} running)` : " pods"}
                                        </span>
                                    </span>
                                    {p.hourly > 0 && (
                                        <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", marginLeft: "auto" }}>
                                            <span style={{ color: "#10b981", fontWeight: 600 }}>{fmt$Tiny(p.hourly)}</span>
                                            <span style={{ color: "#94a3b8" }}>/hr</span>
                                        </span>
                                    )}
                                </div>
                                {/* CPU used bar */}
                                {p.cpuReq > 0 && (
                                    <div style={{ marginTop: 2 }}>
                                        <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                                            <div style={{
                                                height: "100%", borderRadius: 2,
                                                width: `${Math.min(100, (p.cpuUsed / p.cpuReq) * 100).toFixed(1)}%`,
                                                background: "#f97316",
                                            }} />
                                        </div>
                                        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>
                                            cpu {fmtNum(p.cpuUsed, 2)}c used / {fmtNum(p.cpuReq, 2)}c req
                                            &nbsp;·&nbsp;
                                            mem {fmtNum(p.memUsed, 1)} / {fmtNum(p.memReq, 1)} GB
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Time-range filter controls ── */}
            <div className="pcp-section">
                <div className="pcp-ts-controls">
                    <div className="pcp-ts-ranges">
                        {[
                            ["live",  "Live window"],
                            ["date",  "Specific date"],
                            ["month", "Month"],
                            ["year",  "Year"],
                            ["range", "Custom range"],
                        ].map(([k, label]) => (
                            <button key={k}
                                    className={`pcp-ts-range-btn ${tsMode === k ? "on" : ""}`}
                                    onClick={() => setTsMode(k)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {tsMode === "live" && (
                        <div className="pcp-ts-custom">
                            <Clock size={12}/>
                            {[["30m","30 min"],["60m","1 hr"],["6h","6 hr"],["24h","24 hr"],["7d","7 days"]].map(([k, l]) => (
                                <button key={k}
                                        className={`pcp-ts-mini-btn ${tsLiveWindow === k ? "on" : ""}`}
                                        onClick={() => setTsLiveWindow(k)}>{l}</button>
                            ))}
                        </div>
                    )}
                    {tsMode === "date" && (
                        <div className="pcp-ts-custom">
                            <Calendar size={12}/>
                            <input type="date" value={tsDate} onChange={e => setTsDate(e.target.value)}/>
                        </div>
                    )}
                    {tsMode === "month" && (
                        <div className="pcp-ts-custom">
                            <Calendar size={12}/>
                            <input type="month" value={tsMonth} onChange={e => setTsMonth(e.target.value)}/>
                        </div>
                    )}
                    {tsMode === "year" && (
                        <div className="pcp-ts-custom">
                            <Calendar size={12}/>
                            <input type="number" min="2020" max="2099" placeholder="YYYY"
                                   value={tsYear} onChange={e => setTsYear(e.target.value)}
                                   style={{ width: 80, padding: "4px 8px", border: "none", outline: "none", background: "transparent", fontSize: 12 }}/>
                        </div>
                    )}
                    {tsMode === "range" && (
                        <div className="pcp-ts-custom">
                            <Calendar size={12}/>
                            <input type="datetime-local" value={tsCustomFrom} onChange={e => setTsCustomFrom(e.target.value)}/>
                            <span>→</span>
                            <input type="datetime-local" value={tsCustomTo} onChange={e => setTsCustomTo(e.target.value)}/>
                        </div>
                    )}

                    <div className="pcp-ts-gran">
                        <span>Bucket:</span>
                        <select value={tsGranularity} onChange={e => setTsGranularity(e.target.value)}>
                            <option value="auto">Auto ({effectiveGranularity})</option>
                            <option value="minute">Per tick</option>
                            <option value="hour">Hourly</option>
                            <option value="day">Daily</option>
                            <option value="month">Monthly</option>
                        </select>
                    </div>
                </div>
            </div>

            {tsError && <div className="pcp-warn">{tsError}</div>}

            {/* ── Cluster-level utilisation stats ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
                {[
                    { label: "CPU used",        value: `${fmtNum(c.usedCpuCores, 1)} cores`,  accent: "" },
                    { label: "CPU total",        value: `${fmtNum(c.totalCpuCores, 0)} cores`, accent: "" },
                    { label: "CPU utilisation",  value: fmtPct(cpuUtil),                        accent: cpuUtil > 80 ? "amber" : "green" },
                    { label: "Memory used",      value: `${fmtNum(c.usedMemoryGb, 1)} GB`,     accent: "" },
                    { label: "Memory total",     value: `${fmtNum(c.totalMemoryGb, 0)} GB`,    accent: "" },
                    { label: "Mem utilisation",  value: fmtPct(memUtil),                        accent: memUtil > 80 ? "amber" : "green" },
                ].map(item => (
                    <div key={item.label} className={`pcp-stat ${item.accent}`}>
                        <div className="pcp-stat-label">{item.label}</div>
                        <div className="pcp-stat-value">{item.value}</div>
                    </div>
                ))}
            </div>

            {/* ── Cluster CPU + Memory area charts ── */}
            {tsPoints.length > 0 && (
                <div className="pcp-resource-grid">
                    <div className="pcp-resource-card">
                        <div className="pcp-resource-card-title">
                            <Cpu size={12}/> Cluster CPU · used (solid) vs total (dashed)
                        </div>
                        <LiveAreaChart
                            points={tsCpuUsedSeries}
                            allocatedPoints={tsCpuTotalSeries}
                            color="#f97316" allocColor="#fdba74"
                            granularity={effectiveGranularity}
                            valueLabel="cores" valueFmt={v => fmtNum(v, 1)}
                            title="CPU used vs total"
                            currentValue={c.usedCpuCores} currentAllocated={c.totalCpuCores}
                            height={200}
                            fromMs={tsFromMs} toMs={tsToMs}
                        />
                    </div>
                    <div className="pcp-resource-card">
                        <div className="pcp-resource-card-title">
                            <Database size={12}/> Cluster Memory · used (solid) vs total (dashed)
                        </div>
                        <LiveAreaChart
                            points={tsMemUsedSeries}
                            allocatedPoints={tsMemTotalSeries}
                            color="#ec4899" allocColor="#f9a8d4"
                            granularity={effectiveGranularity}
                            valueLabel="GB" valueFmt={v => fmtNum(v, 1)}
                            title="Memory used vs total"
                            currentValue={c.usedMemoryGb} currentAllocated={c.totalMemoryGb}
                            height={200}
                            fromMs={tsFromMs} toMs={tsToMs}
                        />
                    </div>
                </div>
            )}

            {/* ── Namespace drill-down ─────────────────────────────────────────── */}
            <div className="pcp-ts-chart" style={{ borderColor: "#e2e8f0" }}>

                {/* Header row: title + dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <div className="pcp-ts-chart-title" style={{ marginBottom: 0, flex: "0 0 auto" }}>
                        <BarChart2 size={13}/> Namespace drill-down
                        <span className="pcp-section-sub" style={{ marginLeft: 6 }}>— pick a namespace to see CPU / Memory / Pod trends</span>
                    </div>

                    {/* Namespace selector */}
                    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <select
                            value={selectedNs}
                            onChange={e => setSelectedNs(e.target.value)}
                            style={{
                                appearance: "none",
                                padding: "6px 30px 6px 12px",
                                border: "1px solid #cbd5e1",
                                borderRadius: 7, fontSize: 13, fontWeight: 600,
                                color: selectedNs === "__all__" ? "#64748b" : nsColor(selectedNs),
                                background: "#fff", cursor: "pointer", minWidth: 200,
                            }}>
                            <option value="__all__">— pick a namespace —</option>
                            <optgroup label="Workload namespaces">
                                {nsOptions.filter(n => !n.isSystem).map(n => (
                                    <option key={n.ns} value={n.ns}>
                                        {n.ns}  (cpu {fmtNum(n.cpuMax, 2)} c · mem {fmtNum(n.memMax, 1)} GB)
                                    </option>
                                ))}
                            </optgroup>
                            <optgroup label="System namespaces">
                                {nsOptions.filter(n => n.isSystem).map(n => (
                                    <option key={n.ns} value={n.ns}>
                                        {n.ns}  (cpu {fmtNum(n.cpuMax, 2)} c · mem {fmtNum(n.memMax, 1)} GB)
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                        <ChevronDown size={13} style={{ position: "absolute", right: 8, color: "#64748b", pointerEvents: "none" }}/>
                    </div>

                    {/* Live stats badge for selected ns */}
                    {selectedNsLive && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {[
                                { label: "CPU used",  value: `${fmtNum(selectedNsLive.cpuCores ?? selectedNsLive.cpuUsedCores, 3)} cores`, color: "#f97316" },
                                { label: "CPU req",   value: `${fmtNum(selectedNsLive.cpuRequestCores, 3)} cores`,  color: "#fdba74" },
                                { label: "Mem used",  value: `${fmtNum(selectedNsLive.memoryGb, 2)} GB`,            color: "#ec4899" },
                                { label: "Mem req",   value: `${fmtNum(selectedNsLive.memoryRequestGb, 2)} GB`,     color: "#f9a8d4" },
                                { label: "Pods",      value: `${selectedNsLive.podCount ?? 0}`,                      color: "#6366f1" },
                                { label: "$/hr",      value: fmt$Tiny(selectedNsLive.smoothedHourlyUsd ?? selectedNsLive.hourlyRateUsd), color: "#10b981" },
                            ].map(s => (
                                <span key={s.label} style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
                                    {s.label}: <strong style={{ color: s.color }}>{s.value}</strong>
                                </span>
                            ))}
                            {nsRangeTotals[selectedNs] > 0 && (
                                <span style={{
                                    padding: "2px 9px", borderRadius: 6,
                                    background: "#f0fdf4", border: "1px solid #bbf7d0",
                                    color: "#15803d", fontWeight: 700, fontSize: 11,
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    whiteSpace: "nowrap",
                                }}>
                                    Range total: <strong>{fmt$Tiny(nsRangeTotals[selectedNs])}</strong>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {selectedNs === "__all__" ? (
                    <div className="pcp-empty" style={{ height: 90 }}>
                        Select a namespace from the dropdown above to view its resource graphs.
                    </div>
                ) : (
                    <>
                        {/* Metric tabs */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                            {METRIC_TABS.map(tab => (
                                <button key={tab.key}
                                        onClick={() => setActiveMetric(tab.key)}
                                        style={{
                                            padding: "5px 14px", fontSize: 12, fontWeight: 600,
                                            borderRadius: 7, cursor: "pointer",
                                            border: `1.5px solid ${activeMetric === tab.key ? tab.color : "#e2e8f0"}`,
                                            background: activeMetric === tab.key ? `${tab.color}15` : "#fff",
                                            color: activeMetric === tab.key ? tab.color : "#64748b",
                                            transition: "all .15s",
                                        }}>
                                    {tab.key === "cpu"    && <Cpu      size={11} style={{ marginRight: 4, verticalAlign: "middle" }}/>}
                                    {tab.key === "memory" && <Database size={11} style={{ marginRight: 4, verticalAlign: "middle" }}/>}
                                    {tab.key === "pods"   && <Layers   size={11} style={{ marginRight: 4, verticalAlign: "middle" }}/>}
                                    {tab.label}
                                </button>
                            ))}
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>
                                <span style={{ display: "inline-block", width: 20, borderTop: `2px solid ${activeTab.color}`, verticalAlign: "middle", marginRight: 4 }}/>
                                used
                                {activeTab.allocColor && (
                                    <>
                                        <span style={{ display: "inline-block", width: 20, borderTop: `2px dashed ${activeTab.allocColor}`, verticalAlign: "middle", margin: "0 4px 0 10px" }}/>
                                        request (spec)
                                    </>
                                )}
                            </span>
                        </div>

                        {/* Time-range gate */}
                        {!tsWindow ? (
                            <div className="pcp-empty" style={{ height: 80 }}>
                                Select a time range above to load data.
                            </div>
                        ) : tsLoading && tsPoints.length === 0 ? (
                            <div className="pcp-empty" style={{ height: 80 }}>Loading…</div>
                        ) : !hasData ? (
                            <div className="pcp-empty" style={{ height: 80 }}>
                                No {activeTab.label} data for <strong>{selectedNs}</strong> in this window.
                                The engine records one point every 60 s — wait a few ticks on a fresh cluster.
                            </div>
                        ) : (
                            <LiveAreaChart
                                points={drillUsedSeries}
                                allocatedPoints={drillAllocSeries}
                                color={activeTab.color}
                                allocColor={activeTab.allocColor ?? "#cbd5e1"}
                                granularity={effectiveGranularity}
                                valueLabel={drillValueLabel}
                                valueFmt={drillValueFmt}
                                title={`${selectedNs} · ${activeTab.label}`}
                                currentValue={drillCurrentUsed}
                                currentAllocated={drillCurrentAlloc}
                                height={240}
                                fromMs={tsFromMs} toMs={tsToMs}
                            />
                        )}
                    </>
                )}
            </div>

            {/* ── Only show comparison + table when data is loaded ── */}
            {tsPoints.length > 0 && (
                <>
                    {/* ── Top-5 namespace CPU comparison ── */}
                    {cpuNsSeries.length > 0 && (
                        <div className="pcp-ts-chart">
                            <div className="pcp-ts-chart-title">
                                <Cpu size={12}/> Top {cpuNsSeries.length} namespaces · CPU used (cores) over time
                            </div>
                            <CostMultiLineChart
                                series={cpuNsSeries} granularity={effectiveGranularity} height={180}
                                valueFmt={v => v < 1 ? v.toFixed(3) : v.toFixed(1)} valueLabel=" cores"
                                fromMs={tsFromMs} toMs={tsToMs}/>
                        </div>
                    )}

                    {/* ── Top-5 namespace Memory comparison ── */}
                    {memNsSeries.length > 0 && (
                        <div className="pcp-ts-chart">
                            <div className="pcp-ts-chart-title">
                                <Database size={12}/> Top {memNsSeries.length} namespaces · Memory used (GB) over time
                            </div>
                            <CostMultiLineChart
                                series={memNsSeries} granularity={effectiveGranularity} height={180}
                                valueFmt={v => v < 1 ? v.toFixed(3) : v.toFixed(1)} valueLabel=" GB"
                                fromMs={tsFromMs} toMs={tsToMs}/>
                        </div>
                    )}

                    {/* ── Top-5 namespace Pod count comparison ── */}
                    {podNsSeries.length > 0 && (
                        <div className="pcp-ts-chart">
                            <div className="pcp-ts-chart-title">
                                <Layers size={12}/> Top {podNsSeries.length} namespaces · Pod count over time
                            </div>
                            <CostMultiLineChart
                                series={podNsSeries} granularity={effectiveGranularity} height={180}
                                valueFmt={v => `${Math.round(v)}`} valueLabel=" pods"
                                fromMs={tsFromMs} toMs={tsToMs}/>
                        </div>
                    )}
                </>
            )}

            {/* ── Namespace resource snapshot table (click to drill in) ── */}
            {(workloadNs.length > 0 || (snapshot?.namespaces?.length > 0)) && (() => {
                const allNs = workloadNs.length > 0 ? workloadNs : (snapshot?.namespaces || []);
                return (
                    <div className="pcp-section pcp-sec-resource">
                        <div className="pcp-section-title">
                            Namespace resource snapshot
                            <span className="pcp-section-sub">— live values · click a row to drill into that namespace</span>
                        </div>
                        <div className="pcp-table-wrap">
                            <table className="pcp-table">
                                <thead>
                                    <tr>
                                        <th>Namespace</th>
                                        <th>Pods</th>
                                        <th>CPU used</th>
                                        <th>CPU req</th>
                                        <th>CPU util%</th>
                                        <th>Mem used</th>
                                        <th>Mem req</th>
                                        <th>Mem util%</th>
                                        <th>$/hr</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allNs
                                        .slice()
                                        .sort((a, b) => (b.cpuCores || b.cpuUsedCores || 0) - (a.cpuCores || a.cpuUsedCores || 0))
                                        .map(ns => {
                                            const used = ns.cpuCores ?? ns.cpuUsedCores ?? 0;
                                            const cpuU = ns.cpuRequestCores > 0 ? (used / ns.cpuRequestCores) * 100 : 0;
                                            const memU = ns.memoryRequestGb  > 0 ? (ns.memoryGb / ns.memoryRequestGb)  * 100 : 0;
                                            const hr   = ns.smoothedHourlyUsd ?? ns.hourlyRateUsd ?? 0;
                                            const isSel = selectedNs === ns.namespace;
                                            return (
                                                <tr key={ns.namespace}
                                                    onClick={() => setSelectedNs(isSel ? "__all__" : ns.namespace)}
                                                    style={{ cursor: "pointer", background: isSel ? `${nsColor(ns.namespace)}12` : undefined }}>
                                                    <td>
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: nsColor(ns.namespace), flexShrink: 0, display: "inline-block" }}/>
                                                            <strong>{ns.namespace}</strong>
                                                        </span>
                                                    </td>
                                                    <td>{ns.podCount ?? 0}</td>
                                                    <td>{fmtNum(used, 3)}</td>
                                                    <td>{fmtNum(ns.cpuRequestCores, 3)}</td>
                                                    <td className={cpuU > 90 ? "warn" : ""}>{fmtPct(cpuU)}</td>
                                                    <td>{fmtNum(ns.memoryGb, 2)} GB</td>
                                                    <td>{fmtNum(ns.memoryRequestGb, 2)} GB</td>
                                                    <td className={memU > 90 ? "warn" : ""}>{fmtPct(memU)}</td>
                                                    <td>{fmt$Tiny(hr)}</td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* ── Top CPU / memory consumers ── */}
            {metrics?.topCpuConsumers?.length > 0 && (
                <div className="pcp-twocol">
                    <TopList title="Top CPU consumers"    rows={metrics.topCpuConsumers}    unit="cores"/>
                    <TopList title="Top memory consumers" rows={metrics.topMemoryConsumers} unit="GB"/>
                </div>
            )}

        </div>
    );
}
