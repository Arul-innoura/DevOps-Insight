/**
 * CcCostHistoryPage — Comprehensive cost analysis page.
 *
 * Sections:
 *   1. Filter controls (live window / specific date / month / year / range)
 *   2. Period summary stats (avg/peak/min $/hr, total spend, bucket count)
 *   3. Cluster total cost trend (LiveAreaChart — live up/down)
 *   4. Per-namespace cost graph with dropdown selector
 *   5. System vs Workload split (CostMultiLineChart)
 *   6. Per-project cost trends (CostMultiLineChart top-5)
 *   7. Cost forecast (linear regression, next 6 h)
 *   8. Month-to-date analysis + projected month-end
 *   9. Cost efficiency panel (utilisation, waste, cost per pod)
 *  10. Namespace cost ranking table (avg $/hr, peak, trend ↑↓)
 */

import React, { useMemo, useState } from "react";
import {
    DollarSign, TrendingUp, TrendingDown, Clock, Calendar, LineChart,
    Activity, Cpu, ChevronDown,
} from "lucide-react";
import {
    fmt$, fmt$Tiny, fmtNum, fmtPct, Stat,
} from "./ClusterCostDashboard";
import { LiveAreaChart, CostMultiLineChart } from "../../components/ClusterCostMiniCharts";

// Simple linear regression → {slope, intercept, t0}
function linReg(points) {
    const n = points.length;
    if (n < 2) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const t0 = new Date(points[0].t).getTime();
    for (const p of points) {
        const x = (new Date(p.t).getTime() - t0) / 3600000;
        const y = p.value || 0;
        sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope     = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept, t0 };
}

// NS colour palette — deterministic from name so the same ns is always the same colour
const NS_PALETTE = [
    "#3b82f6","#10b981","#f59e0b","#a855f7","#ef4444",
    "#06b6d4","#84cc16","#f97316","#ec4899","#6366f1",
];
function nsColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return NS_PALETTE[h % NS_PALETTE.length];
}

export default function CcCostHistoryPage({ ctx }) {
    const {
        snapshot, totals, isSystemNs,
        tsMode, setTsMode,
        tsLiveWindow, setTsLiveWindow,
        tsDate, setTsDate, tsMonth, setTsMonth,
        tsYear, setTsYear,
        tsCustomFrom, setTsCustomFrom, tsCustomTo, setTsCustomTo,
        tsGranularity, setTsGranularity, effectiveGranularity, tsWindow,
        tsPoints, tsLoading, tsError,
        tsTotalSeries, tsSystemTotalSeries, tsWorkloadTotalSeries, tsTopProjectSeries,
    } = ctx;

    const [selectedNs, setSelectedNs] = useState("__all__");

    // ── Cost display unit — scale to meaningful amount per bucket ─────────
    // "minute" ticks → keep as $/hr rate; "day" → $/day; "month" → $/month
    const { costMultiplier, costUnit } = useMemo(() => {
        if (effectiveGranularity === "month") return { costMultiplier: 720,  costUnit: "/month" };
        if (effectiveGranularity === "day")   return { costMultiplier: 24,   costUnit: "/day"   };
        return { costMultiplier: 1, costUnit: "/hr" };
    }, [effectiveGranularity]);

    // ── All namespaces seen in tsPoints (for dropdown) ────────────────────
    const nsOptions = useMemo(() => {
        const seen = new Map();
        for (const p of tsPoints) {
            const t = new Date(p.t).getTime();
            for (const nl of (p.namespaces || [])) {
                const v = nl.hourlyUsd || 0;
                if (!seen.has(nl.namespace)) {
                    seen.set(nl.namespace, { ns: nl.namespace, total: 0, count: 0, peak: 0, last: 0, lastT: 0, isSystem: isSystemNs(nl.namespace) });
                }
                const e = seen.get(nl.namespace);
                e.total += v; e.count += 1;
                if (v > e.peak) e.peak = v;
                if (t > e.lastT) { e.lastT = t; e.last = v; }
            }
        }
        // Fallback to live snapshot
        if (!seen.size && snapshot?.namespaces) {
            for (const n of snapshot.namespaces) {
                const v = n.smoothedHourlyUsd ?? n.hourlyRateUsd ?? 0;
                seen.set(n.namespace, { ns: n.namespace, total: v, count: 1, peak: v, last: v, lastT: 0, isSystem: isSystemNs(n.namespace) });
            }
        }
        return [...seen.values()]
            .map(e => ({ ...e, avg: e.count > 0 ? e.total / e.count : 0 }))
            .sort((a, b) => b.last - a.last);
    }, [tsPoints, snapshot, isSystemNs]);

    // ── Selected namespace cost series ────────────────────────────────────
    const selectedNsSeries = useMemo(() => {
        if (selectedNs === "__all__" || !tsPoints.length) return [];
        return tsPoints.map(p => {
            const row = (p.namespaces || []).find(n => n.namespace === selectedNs);
            return { t: p.t, value: row?.hourlyUsd || 0 };
        });
    }, [selectedNs, tsPoints]);

    // Current live value for selected ns (from snapshot)
    const selectedNsLive = useMemo(() => {
        if (selectedNs === "__all__" || !snapshot?.namespaces) return null;
        const n = snapshot.namespaces.find(n => n.namespace === selectedNs);
        return n ? (n.smoothedHourlyUsd ?? n.hourlyRateUsd ?? 0) : null;
    }, [selectedNs, snapshot]);

    // ── Period-level statistics ───────────────────────────────────────────
    const periodStats = useMemo(() => {
        if (!tsTotalSeries.length) return null;
        const vals  = tsTotalSeries.map(p => p.value || 0);
        const avg   = vals.reduce((s, v) => s + v, 0) / vals.length;
        const peak  = Math.max(...vals);
        const min   = Math.min(...vals);
        const durHr = tsTotalSeries.length > 1
            ? (new Date(tsTotalSeries[tsTotalSeries.length - 1].t) - new Date(tsTotalSeries[0].t)) / 3600000
            : 1;
        // Total spend = sum(rate × bucket_duration). avg × durHr is more accurate
        // than sum(v × multiplier) for minute-level ticks.
        const totalSpend = avg * Math.max(durHr, 0);
        return { avg, peak, min, totalSpend, durHr };
    }, [tsTotalSeries]);

    // ── Namespace cost ranking (with actual peak, not just last) ──────────
    const nsRanking = useMemo(() => {
        if (!tsPoints.length) return [];
        const map = new Map();
        for (const p of tsPoints) {
            for (const nl of (p.namespaces || [])) {
                const v = nl.hourlyUsd || 0;
                if (!map.has(nl.namespace)) {
                    map.set(nl.namespace, {
                        ns: nl.namespace, project: nl.matchedProjectName || "",
                        total: 0, count: 0, peak: 0, first: null, last: 0,
                    });
                }
                const e = map.get(nl.namespace);
                e.total += v; e.count += 1;
                if (v > e.peak) e.peak = v;
                if (e.first === null) e.first = v;
                e.last = v;
            }
        }
        return [...map.values()]
            .map(e => ({
                ...e,
                avg:      e.count > 0 ? e.total / e.count : 0,
                trend:    e.first > 0 ? ((e.last - e.first) / e.first) * 100 : 0,
                isSystem: isSystemNs(e.ns),
            }))
            .sort((a, b) => b.avg - a.avg);
    }, [tsPoints, isSystemNs]);

    // ── MTD projection ────────────────────────────────────────────────────
    const mtdProjection = useMemo(() => {
        if (!snapshot) return null;
        const now      = new Date();
        const dayOfMo  = now.getDate();
        const daysInMo = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const mtd      = snapshot.monthToDateUsd || 0;
        const daily    = dayOfMo > 0 ? mtd / dayOfMo : 0;
        return { mtd, daily, projected: daily * daysInMo, dayOfMo, daysInMo };
    }, [snapshot]);

    // ── Cost forecast (linear regression on last ≤24 points) ─────────────
    const forecastSeries = useMemo(() => {
        if (tsTotalSeries.length < 5) return [];
        const recent = tsTotalSeries.slice(-Math.min(24, tsTotalSeries.length));
        const reg    = linReg(recent);
        if (!reg) return [];
        const lastT  = new Date(recent[recent.length - 1].t).getTime();
        return Array.from({ length: 6 }, (_, h) => {
            const x = (lastT - reg.t0) / 3600000 + (h + 1);
            return { t: new Date(lastT + (h + 1) * 3600000).toISOString(), value: Math.max(0, reg.slope * x + reg.intercept) };
        });
    }, [tsTotalSeries]);

    const splitSeries = useMemo(() => [
        { key: "system",   label: "System",   color: "#8b5cf6", points: tsSystemTotalSeries },
        { key: "workload", label: "Workload",  color: "#10b981", points: tsWorkloadTotalSeries },
    ], [tsSystemTotalSeries, tsWorkloadTotalSeries]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Page header ── */}
            <div className="pcp-section pcp-sec-history" style={{ padding: "10px 14px 8px" }}>
                <div className="pcp-section-title" style={{ marginBottom: 0 }}>
                    <LineChart size={15}/> Cost Analysis · Time-Series
                    <span className="pcp-section-sub">
                        — every $/hr tick persisted to MongoDB · pick a window · live up/down graphs
                    </span>
                </div>
            </div>

            {/* ── Filter controls ── */}
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

            {!tsWindow ? (
                <div className="pcp-empty">
                    Select a {tsMode === "date" ? "date" : tsMode === "month" ? "month" : tsMode === "year" ? "year" : "range"} to load data.
                </div>
            ) : tsLoading && tsPoints.length === 0 ? (
                <div className="pcp-empty">Loading time-series…</div>
            ) : tsPoints.length === 0 ? (
                <div className="pcp-empty">
                    No data for this window yet. The engine writes one point every 30 s — newly-deployed clusters take a few ticks to populate.
                </div>
            ) : (
                <>
                    {/* ── Period summary stats ── */}
                    {periodStats && (
                        <div className="pcp-ts-summary">
                            <Stat label={`Avg ${costUnit}`}  value={fmt$(periodStats.avg * costMultiplier)}   icon={<DollarSign size={14}/>} accent="blue"/>
                            <Stat label={`Peak ${costUnit}`} value={fmt$(periodStats.peak * costMultiplier)}  icon={<TrendingUp size={14}/>} accent="amber"/>
                            <Stat label={`Min ${costUnit}`}  value={fmt$(periodStats.min * costMultiplier)}   icon={<DollarSign size={14}/>} accent="green"/>
                            <Stat label="Total spend"        value={fmt$(periodStats.totalSpend)}              icon={<Activity size={14}/>}/>
                            <Stat label="Buckets"            value={`${tsTotalSeries.length} × ${effectiveGranularity}`} icon={<Clock size={14}/>}/>
                        </div>
                    )}

                    {/* ── Cluster total cost trend ── */}
                    <div className="pcp-ts-chart">
                        <div className="pcp-ts-chart-title">
                            Cluster total cost · {effectiveGranularity} buckets
                            <span className="pcp-section-sub" style={{ marginLeft: 8 }}>— Y-axis shows {costUnit === "/hr" ? "$/hr rate" : `actual cost${costUnit}`}</span>
                        </div>
                        <LiveAreaChart
                            points={tsTotalSeries}
                            color="#3b82f6"
                            granularity={effectiveGranularity}
                            valueLabel={costUnit}
                            valueFmt={v => fmt$(v * costMultiplier)}
                            title={`Cluster cost · ${effectiveGranularity} buckets`}
                            currentValue={tsTotalSeries.length ? tsTotalSeries[tsTotalSeries.length - 1].value * costMultiplier : null}
                            height={230}
                        />
                    </div>

                    {/* ── Per-namespace cost graph with dropdown ── */}
                    <div className="pcp-ts-chart" style={{ borderColor: "#e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                            <div className="pcp-ts-chart-title" style={{ marginBottom: 0, flex: "0 0 auto" }}>
                                Namespace cost · select to drill down
                            </div>
                            {/* Namespace dropdown */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 auto" }}>
                                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                                    <select
                                        value={selectedNs}
                                        onChange={e => setSelectedNs(e.target.value)}
                                        style={{
                                            appearance: "none",
                                            padding: "6px 32px 6px 12px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 7,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: selectedNs === "__all__" ? "#64748b" : nsColor(selectedNs),
                                            background: "#fff",
                                            cursor: "pointer",
                                            minWidth: 220,
                                        }}>
                                        <option value="__all__">— pick a namespace —</option>
                                        <optgroup label="Workload namespaces">
                                            {nsOptions.filter(n => !n.isSystem).map(n => (
                                                <option key={n.ns} value={n.ns}>
                                                    {n.ns}  ({fmt$Tiny(n.last * costMultiplier)}{costUnit}  peak {fmt$Tiny(n.peak * costMultiplier)}{costUnit})
                                                </option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="System namespaces">
                                            {nsOptions.filter(n => n.isSystem).map(n => (
                                                <option key={n.ns} value={n.ns}>
                                                    {n.ns}  ({fmt$Tiny(n.last * costMultiplier)}{costUnit}  peak {fmt$Tiny(n.peak * costMultiplier)}{costUnit})
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    <ChevronDown size={14} style={{ position: "absolute", right: 9, color: "#64748b", pointerEvents: "none" }}/>
                                </div>
                                {selectedNs !== "__all__" && selectedNsLive != null && (
                                    <span style={{ fontSize: 12, color: "#64748b" }}>
                                        live: <strong style={{ color: nsColor(selectedNs) }}>{fmt$Tiny(selectedNsLive)}/hr</strong>
                                        {" · "}<span className={`pcp-pill ${isSystemNs(selectedNs) ? "cat-system" : "cat-user-allocated"}`}>
                                            {isSystemNs(selectedNs) ? "system" : "workload"}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {selectedNs === "__all__" ? (
                            <div className="pcp-empty" style={{ height: 80 }}>
                                Select a namespace from the dropdown to see its cost trend.
                            </div>
                        ) : selectedNsSeries.every(p => p.value === 0) ? (
                            <div className="pcp-empty" style={{ height: 80 }}>
                                No cost data for <strong>{selectedNs}</strong> in this time window.
                            </div>
                        ) : (
                            <LiveAreaChart
                                points={selectedNsSeries}
                                color={nsColor(selectedNs)}
                                granularity={effectiveGranularity}
                                valueLabel={costUnit}
                                valueFmt={v => fmt$(v * costMultiplier)}
                                title={`${selectedNs} · cost trend`}
                                currentValue={selectedNsLive != null ? selectedNsLive * costMultiplier : undefined}
                                height={220}
                            />
                        )}
                    </div>

                    {/* ── System vs Workload split ── */}
                    <div className="pcp-ts-chart">
                        <div className="pcp-ts-chart-title">System vs Workload cost split</div>
                        <CostMultiLineChart series={splitSeries} granularity={effectiveGranularity} height={200}
                            valueFmt={v => fmt$(v * costMultiplier)} valueLabel={costUnit}/>
                    </div>

                    {/* ── Per-project cost trends ── */}
                    {tsTopProjectSeries.length > 0 && (
                        <div className="pcp-ts-chart">
                            <div className="pcp-ts-chart-title">Top {tsTopProjectSeries.length} projects · cost trend</div>
                            <CostMultiLineChart series={tsTopProjectSeries} granularity={effectiveGranularity} height={240}
                                valueFmt={v => fmt$(v * costMultiplier)} valueLabel={costUnit}/>
                        </div>
                    )}

                    {/* ── Cost forecast ── */}
                    {forecastSeries.length > 0 && (
                        <div className="pcp-ts-chart" style={{ borderColor: "#fde68a" }}>
                            <div className="pcp-ts-chart-title" style={{ color: "#92400e" }}>
                                <TrendingUp size={12}/> Cost forecast · next 6 h (linear regression on last {Math.min(24, tsTotalSeries.length)} buckets)
                            </div>
                            <div style={{ fontSize: 11, color: "#92400e", marginBottom: 8, background: "#fffbeb", padding: "4px 8px", borderRadius: 6 }}>
                                Indicative only — linear extrapolation from recent ticks, not a financial projection.
                            </div>
                            <CostMultiLineChart
                                series={[
                                    { key: "actual",   label: "Actual",   color: "#3b82f6", points: tsTotalSeries.slice(-Math.min(24, tsTotalSeries.length)) },
                                    { key: "forecast", label: "Forecast", color: "#f59e0b", points: forecastSeries },
                                ]}
                                granularity={effectiveGranularity} height={180}
                                valueFmt={v => fmt$(v * costMultiplier)} valueLabel={costUnit}/>
                        </div>
                    )}
                </>
            )}

            {/* ── Month-to-date analysis (always visible, uses live snapshot) ── */}
            {mtdProjection && (
                <div className="pcp-section" style={{ borderColor: "#fde68a", background: "linear-gradient(180deg,#fffbeb 0%,#fff 60%)" }}>
                    <div className="pcp-section-title">
                        <Calendar size={14}/> Month-to-date analysis
                        <span className="pcp-section-sub">— from live snapshot · day {mtdProjection.dayOfMo} of {mtdProjection.daysInMo}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
                        <div className="pcp-stat amber">
                            <div className="pcp-stat-label"><DollarSign size={12}/> MTD spend</div>
                            <div className="pcp-stat-value">{fmt$(mtdProjection.mtd)}</div>
                        </div>
                        <div className="pcp-stat">
                            <div className="pcp-stat-label"><Clock size={12}/> Daily burn rate</div>
                            <div className="pcp-stat-value">{fmt$(mtdProjection.daily)}/day</div>
                        </div>
                        <div className="pcp-stat" style={{ borderColor: "#fdba74", background: "linear-gradient(180deg,#fff7ed 0%,#fff 100%)" }}>
                            <div className="pcp-stat-label"><TrendingUp size={12}/> Projected month-end</div>
                            <div className="pcp-stat-value">{fmt$(mtdProjection.projected)}</div>
                            <div style={{ fontSize: 10, color: "#92400e", marginTop: 2 }}>at current daily rate × {mtdProjection.daysInMo} days</div>
                        </div>
                        <div className="pcp-stat blue">
                            <div className="pcp-stat-label"><Activity size={12}/> Lifetime total</div>
                            <div className="pcp-stat-value">{fmt$(snapshot?.cumulativeUsd)}</div>
                        </div>
                        <div className="pcp-stat green">
                            <div className="pcp-stat-label"><DollarSign size={12}/> Current $/hr (live)</div>
                            <div className="pcp-stat-value">{fmt$Tiny(totals.hourly)}</div>
                        </div>
                        <div className="pcp-stat">
                            <div className="pcp-stat-label"><Clock size={12}/> Days remaining</div>
                            <div className="pcp-stat-value">{mtdProjection.daysInMo - mtdProjection.dayOfMo} days</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cost efficiency panel ── */}
            {snapshot?.cluster && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Cpu size={14}/> Cost efficiency
                        <span className="pcp-section-sub">— live snapshot · lower idle waste = better bin-packing</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
                        {(() => {
                            const c        = snapshot.cluster;
                            const cpuUtil  = c.totalCpuCores > 0 ? (c.usedCpuCores / c.totalCpuCores) * 100 : 0;
                            const memUtil  = c.totalMemoryGb  > 0 ? (c.usedMemoryGb  / c.totalMemoryGb)  * 100 : 0;
                            const idle     = snapshot.idleHourlyUsd || 0;
                            const wastePct = totals.hourly > 0 ? (idle / totals.hourly) * 100 : 0;
                            const pods     = (snapshot.namespaces || []).reduce((s, n) => s + (n.podCount || 0), 0);
                            return [
                                { label: "CPU utilisation",       value: fmtPct(cpuUtil),                  accent: cpuUtil  < 20 ? "amber" : "green" },
                                { label: "Memory utilisation",    value: fmtPct(memUtil),                  accent: memUtil  < 20 ? "amber" : "green" },
                                { label: "Idle waste $/hr",       value: fmt$Tiny(idle),                   accent: wastePct > 10 ? "amber" : "" },
                                { label: "Idle waste % of bill",  value: fmtPct(wastePct),                 accent: wastePct > 15 ? "amber" : "" },
                                { label: "Cost per pod $/hr",     value: pods > 0 ? fmt$Tiny(totals.hourly / pods) : "—", accent: "" },
                                { label: "Cost per namespace/hr", value: fmt$Tiny(totals.hourly / Math.max(1, snapshot.namespaces?.length || 1)), accent: "" },
                            ].map(item => (
                                <div key={item.label} className={`pcp-stat ${item.accent}`}>
                                    <div className="pcp-stat-label">{item.label}</div>
                                    <div className="pcp-stat-value">{item.value}</div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            )}

            {/* ── Namespace cost ranking table ── */}
            {nsRanking.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <LineChart size={14}/> Namespace cost ranking
                        <span className="pcp-section-sub">— costs shown as {costUnit === "/hr" ? "$/hr rate" : `actual${costUnit}`} · click a row to graph it</span>
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Namespace</th>
                                    <th>Project</th>
                                    <th>Type</th>
                                    <th>Avg{costUnit}</th>
                                    <th>Peak{costUnit}</th>
                                    <th>Last{costUnit}</th>
                                    <th>Data pts</th>
                                    <th>Trend</th>
                                    <th>Est. total</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {nsRanking.map((e, i) => {
                                    const durHr   = periodStats?.durHr || 1;
                                    // estimated total = avg $/hr × actual period hours
                                    const estCost = e.avg * durHr;
                                    const trendUp = e.trend > 5;
                                    const trendDn = e.trend < -5;
                                    const isSelected = selectedNs === e.ns;
                                    return (
                                        <tr key={e.ns}
                                            onClick={() => setSelectedNs(isSelected ? "__all__" : e.ns)}
                                            style={{ cursor: "pointer", background: isSelected ? `${nsColor(e.ns)}10` : undefined }}>
                                            <td className="pcp-mute">{i + 1}</td>
                                            <td>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: nsColor(e.ns), display: "inline-block", flexShrink: 0 }}/>
                                                    <strong>{e.ns}</strong>
                                                </span>
                                            </td>
                                            <td>{e.project || <span className="pcp-mute">—</span>}</td>
                                            <td>
                                                <span className={`pcp-pill ${e.isSystem ? "cat-system" : "cat-user-allocated"}`}>
                                                    {e.isSystem ? "system" : "workload"}
                                                </span>
                                            </td>
                                            <td><strong>{fmt$(e.avg * costMultiplier)}</strong></td>
                                            <td style={{ color: "#dc2626" }}>{fmt$(e.peak * costMultiplier)}</td>
                                            <td>{fmt$(e.last * costMultiplier)}</td>
                                            <td className="pcp-mute">{e.count}</td>
                                            <td>
                                                {trendUp ? (
                                                    <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                                                        <TrendingUp size={12}/> +{fmtNum(e.trend, 1)}%
                                                    </span>
                                                ) : trendDn ? (
                                                    <span style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                                                        <TrendingDown size={12}/> {fmtNum(e.trend, 1)}%
                                                    </span>
                                                ) : (
                                                    <span className="pcp-mute" style={{ fontSize: 11 }}>≈ stable</span>
                                                )}
                                            </td>
                                            <td>{fmt$(estCost)}</td>
                                            <td>
                                                <button
                                                    style={{
                                                        padding: "2px 8px", fontSize: 10, borderRadius: 5, border: "1px solid",
                                                        borderColor: isSelected ? nsColor(e.ns) : "#cbd5e1",
                                                        color:       isSelected ? nsColor(e.ns) : "#64748b",
                                                        background:  isSelected ? `${nsColor(e.ns)}18` : "#fff",
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={ev => { ev.stopPropagation(); setSelectedNs(isSelected ? "__all__" : e.ns); }}>
                                                    {isSelected ? "Clear" : "Graph"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}
