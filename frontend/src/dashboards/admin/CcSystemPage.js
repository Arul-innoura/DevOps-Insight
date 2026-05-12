/**
 * CcSystemPage — System / shared-infrastructure namespaces page.
 *
 * Shows: live cost trend graph (purple LiveAreaChart), system namespace
 * table with CPU/mem/cost breakdown, and a brief explanation of how the
 * cost engine splits platform overhead.
 */

import React from "react";
import { DollarSign, Settings, Info } from "lucide-react";
import { fmt$, fmt$Tiny, fmtNum, fmtPct } from "./ClusterCostDashboard";
import { LiveAreaChart } from "../../components/ClusterCostMiniCharts";

export default function CcSystemPage({ ctx }) {
    const {
        snapshot, systemNs, totalSystemHourly, totals,
        tsSystemTotalSeries, effectiveGranularity,
    } = ctx;

    if (!snapshot) return <div className="pcp-empty">No snapshot yet.</div>;
    if (!systemNs.length) return (
        <div className="pcp-empty">
            <Settings size={16}/> No system namespaces detected in this cluster.
        </div>
    );

    const systemShare = totals.hourly > 0 ? (totalSystemHourly / totals.hourly) * 100 : 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Page header strip ── */}
            <div className="pcp-section pcp-sec-system" style={{ padding: "10px 14px 8px" }}>
                <div className="pcp-section-title" style={{ marginBottom: 0 }}>
                    <Settings size={15}/> System / Shared Infrastructure
                    <span className="pcp-section-sub">
                        — platform overhead that cannot be attributed to a single tenant ·
                        {systemNs.length} namespace{systemNs.length !== 1 && "s"}
                    </span>
                    <span className="pcp-sec-total" style={{ marginLeft: "auto" }}>
                        <DollarSign size={11}/> {fmt$Tiny(totalSystemHourly)}/hr
                        <span className="pcp-sec-total-sub">
                            · {fmt$(totalSystemHourly * 24)}/day
                            · {fmt$(totalSystemHourly * 730)}/mo
                            · {fmtPct(systemShare)} of cluster bill
                        </span>
                    </span>
                </div>
            </div>

            {/* ── How cost is allocated ── */}
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "#0c4a6e", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: "#0369a1" }}/>
                <span>
                    System namespace cost is computed as a proportional share of the <strong>system node pool</strong> —
                    VMs, OS disks, and the kube-system overhead — split equally across all system namespaces.
                    Workload namespaces inherit a support overhead share from these costs.
                </span>
            </div>

            {/* ── Live cost trend graph ── */}
            <div className="pcp-live-graph-wrap" style={{ borderColor: "#ddd6fe" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    System cost trend · live up/down · {effectiveGranularity} buckets
                </div>
                <LiveAreaChart
                    points={tsSystemTotalSeries}
                    color="#8b5cf6"
                    granularity={effectiveGranularity}
                    valueLabel="$/hr"
                    valueFmt={v => fmt$Tiny(v)}
                    title={`System namespaces cost · ${effectiveGranularity}`}
                    currentValue={totalSystemHourly}
                    height={200}
                />
            </div>

            {/* ── System namespace table ── */}
            <div className="pcp-section pcp-sec-system">
                <div className="pcp-section-title">
                    System namespace detail
                    <span className="pcp-section-sub">— per-namespace resource usage and cost breakdown</span>
                </div>
                <div className="pcp-table-wrap">
                    <table className="pcp-table">
                        <thead>
                            <tr>
                                <th>Namespace</th>
                                <th>Pods</th>
                                <th>CPU used</th>
                                <th>CPU req</th>
                                <th>Mem used</th>
                                <th>Mem req</th>
                                <th>$/hr</th>
                                <th>$/day</th>
                                <th>$/month</th>
                                <th>MTD</th>
                                <th>% of system</th>
                            </tr>
                        </thead>
                        <tbody>
                            {systemNs
                                .slice()
                                .sort((a, b) => (b.smoothedHourlyUsd ?? b.hourlyRateUsd ?? 0) - (a.smoothedHourlyUsd ?? a.hourlyRateUsd ?? 0))
                                .map(n => {
                                    const hr    = n.smoothedHourlyUsd ?? n.hourlyRateUsd ?? 0;
                                    const share = totalSystemHourly > 0 ? (hr / totalSystemHourly) * 100 : 0;
                                    return (
                                        <tr key={n.namespace}>
                                            <td>
                                                <strong>{n.namespace}</strong>
                                                <span style={{ marginLeft: 6 }}
                                                      className={`pcp-pill cat-system`}>system</span>
                                            </td>
                                            <td>{n.podCount ?? 0}</td>
                                            <td>{fmtNum(n.cpuCores, 3)}</td>
                                            <td>{fmtNum(n.cpuRequestCores, 3)}</td>
                                            <td>{fmtNum(n.memoryGb, 2)} GB</td>
                                            <td>{fmtNum(n.memoryRequestGb, 2)} GB</td>
                                            <td><strong>{fmt$Tiny(hr)}</strong></td>
                                            <td>{fmt$(hr * 24)}</td>
                                            <td>{fmt$(hr * 730)}</td>
                                            <td>{fmt$(n.monthToDateUsd)}</td>
                                            <td>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <div style={{ width: 60, height: 6, background: "#ede9fe", borderRadius: 3, overflow: "hidden" }}>
                                                        <div style={{ width: `${Math.min(100, share)}%`, height: "100%", background: "#8b5cf6", transition: "width 250ms" }}/>
                                                    </div>
                                                    <span style={{ fontSize: 11, color: "#6d28d9", fontWeight: 600 }}>{fmtPct(share)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                        <tfoot>
                            <tr className="pcp-tot">
                                <td><strong>System total</strong></td>
                                <td><strong>{systemNs.reduce((s, n) => s + (n.podCount || 0), 0)}</strong></td>
                                <td><strong>{fmtNum(systemNs.reduce((s, n) => s + (n.cpuCores || 0), 0), 3)}</strong></td>
                                <td><strong>{fmtNum(systemNs.reduce((s, n) => s + (n.cpuRequestCores || 0), 0), 3)}</strong></td>
                                <td><strong>{fmtNum(systemNs.reduce((s, n) => s + (n.memoryGb || 0), 0), 2)} GB</strong></td>
                                <td><strong>{fmtNum(systemNs.reduce((s, n) => s + (n.memoryRequestGb || 0), 0), 2)} GB</strong></td>
                                <td><strong>{fmt$Tiny(totalSystemHourly)}</strong></td>
                                <td><strong>{fmt$(totalSystemHourly * 24)}</strong></td>
                                <td><strong>{fmt$(totalSystemHourly * 730)}</strong></td>
                                <td><strong>{fmt$(systemNs.reduce((s, n) => s + (n.monthToDateUsd || 0), 0))}</strong></td>
                                <td><strong>100%</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* ── System cost vs cluster total comparison ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                {[
                    { label: "System $/hr",   value: fmt$Tiny(totalSystemHourly), accent: "" },
                    { label: "System $/day",  value: fmt$(totalSystemHourly * 24), accent: "" },
                    { label: "System $/mo",   value: fmt$(totalSystemHourly * 730), accent: "" },
                    { label: "System share",  value: fmtPct(systemShare), accent: systemShare > 40 ? "amber" : "" },
                    { label: "System MTD",    value: fmt$(systemNs.reduce((s, n) => s + (n.monthToDateUsd || 0), 0)), accent: "amber" },
                    { label: "Cluster total $/hr", value: fmt$Tiny(totals.hourly), accent: "blue" },
                ].map(item => (
                    <div key={item.label} className={`pcp-stat ${item.accent}`}>
                        <div className="pcp-stat-label">{item.label}</div>
                        <div className="pcp-stat-value">{item.value}</div>
                    </div>
                ))}
            </div>

        </div>
    );
}
