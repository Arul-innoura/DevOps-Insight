import React from "react";
import {
    DollarSign, Clock, TrendingUp, Activity,
    Server, Cpu, Database, Box, Layers,
} from "lucide-react";
import {
    fmt$, fmt$Tiny, fmtNum, fmtPct,
    Stat,
} from "./ClusterCostDashboard";

export default function CcOverviewPage({ ctx }) {
    const { snapshot, totals } = ctx;

    if (!snapshot) return <div className="pcp-empty">No snapshot yet.</div>;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Top-line cost stats ── */}
            <div className="pcp-totals">
                <Stat label="Per hour"          value={fmt$(totals.hourly)}     icon={<DollarSign size={14}/>} accent="green" />
                <Stat label="Per day"           value={fmt$(totals.daily)}      icon={<Clock size={14}/>} />
                <Stat label="Per month"         value={fmt$(totals.monthly)}    icon={<TrendingUp size={14}/>} />
                <Stat label="This month so far" value={fmt$(totals.thisMonth)}  icon={<Clock size={14}/>} accent="amber" />
                <Stat label="Lifetime total"    value={fmt$(totals.lifetime)}   icon={<Activity size={14}/>} accent="blue" />
            </div>

            {/* ── Cluster summary ── */}
            {snapshot.cluster && (
                <div className="pcp-cluster">
                    <div className="pcp-cluster-row">
                        <span><Server size={13}/> {snapshot.cluster.nodeCount} node{snapshot.cluster.nodeCount !== 1 && "s"}</span>
                        <span><Cpu size={13}/> {fmtNum(snapshot.cluster.usedCpuCores,1)}/{fmtNum(snapshot.cluster.totalCpuCores,0)} cores ({fmtPct(snapshot.cluster.cpuUtilPct)})</span>
                        <span><Database size={13}/> {fmtNum(snapshot.cluster.usedMemoryGb,1)}/{fmtNum(snapshot.cluster.totalMemoryGb,0)} GB ({fmtPct(snapshot.cluster.memoryUtilPct)})</span>
                        <span><DollarSign size={13}/> Node hourly: {fmt$Tiny(snapshot.cluster.nodeHourlyUsd)}</span>
                    </div>
                    {snapshot.cluster.vmSkuToHourly && Object.keys(snapshot.cluster.vmSkuToHourly).length > 0 && (
                        <div className="pcp-skus">
                            {Object.entries(snapshot.cluster.vmSkuToHourly).map(([sku, hr]) => (
                                <span key={sku} className="pcp-sku">
                                    <Box size={11}/> {sku} <strong>{fmt$Tiny(hr)}/hr</strong>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── CPU & Memory utilisation ── */}
            {snapshot.cluster && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                    {[
                        { label: "CPU utilisation",    value: fmtPct(snapshot.cluster.cpuUtilPct),    accent: snapshot.cluster.cpuUtilPct > 80 ? "amber" : "green" },
                        { label: "Memory utilisation", value: fmtPct(snapshot.cluster.memoryUtilPct), accent: snapshot.cluster.memoryUtilPct > 80 ? "amber" : "green" },
                        { label: "Namespaces",         value: (snapshot.namespaces?.length || 0) + " total" },
                        { label: "Total pods",         value: (snapshot.namespaces || []).reduce((s, n) => s + (n.podCount || 0), 0) },
                    ].map(item => (
                        <div key={item.label} className={`pcp-stat ${item.accent || ""}`}>
                            <div className="pcp-stat-label">{item.label}</div>
                            <div className="pcp-stat-value">{item.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Where the bill goes ── */}
            {snapshot.cluster?.componentBreakdown?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <DollarSign size={14}/> Where the bill goes
                    </div>
                    <div className="pcp-stackbar">
                        {snapshot.cluster.componentBreakdown.map((c, i) => (
                            <div key={i}
                                 className={`pcp-stackbar-seg cat-${c.category}`}
                                 style={{ width: `${Math.max(0.5, c.percentOfTotal || 0)}%` }}
                                 title={`${c.label}: ${fmt$Tiny(c.hourlyUsd)}/hr · ${fmtPct(c.percentOfTotal)}`}
                            />
                        ))}
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr><th>Component</th><th>$/hr</th><th>$/day</th><th>$/mo</th><th>%</th></tr>
                            </thead>
                            <tbody>
                                {snapshot.cluster.componentBreakdown.map((c, i) => (
                                    <tr key={i}>
                                        <td><span className={`pcp-pill cat-${c.category}`}>{c.label}</span></td>
                                        <td>{fmt$Tiny(c.hourlyUsd)}</td>
                                        <td>{fmt$(c.dailyUsd)}</td>
                                        <td>{fmt$(c.monthlyUsd)}</td>
                                        <td>{fmtPct(c.percentOfTotal)}</td>
                                    </tr>
                                ))}
                                <tr className="pcp-tot">
                                    <td><strong>Total</strong></td>
                                    <td><strong>{fmt$Tiny(totals.hourly)}</strong></td>
                                    <td><strong>{fmt$(totals.daily)}</strong></td>
                                    <td><strong>{fmt$(totals.monthly)}</strong></td>
                                    <td><strong>100%</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Products quick-view (UP / DOWN at a glance) ── */}
            {snapshot.products?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Layers size={14}/> Products
                        <span className="pcp-section-sub">
                            — {snapshot.products.filter(p => p.running).length} UP ·&nbsp;
                              {snapshot.products.filter(p => !p.running).length} DOWN
                        </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {snapshot.products.map(p => (
                            <div key={p.namespace} style={{
                                display: "flex", alignItems: "center", gap: 7,
                                padding: "6px 10px", borderRadius: 8, fontSize: 12,
                                border: `1px solid ${p.running ? "#bbf7d0" : "#fecaca"}`,
                                background: p.running ? "#f0fdf4" : "#fff1f2",
                                minWidth: 140,
                            }}>
                                <span style={{
                                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                                    background: p.running ? "#16a34a" : "#dc2626",
                                }}/>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {p.projectName || p.namespace}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                                        {p.running ? `${fmt$Tiny(p.totalHourlyUsd)}/hr` : "DOWN · " + fmt$Tiny(p.totalHourlyUsd) + "/hr"}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Namespace cost summary ── */}
            {snapshot.namespaces?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Layers size={14}/> Namespace cost summary
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr>
                                    <th>Namespace</th><th>Pods</th>
                                    <th>CPU used/req</th><th>Mem used/req</th>
                                    <th>$/hr</th><th>$/month</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...snapshot.namespaces]
                                    .sort((a, b) => (b.hourlyRateUsd || 0) - (a.hourlyRateUsd || 0))
                                    .map(n => (
                                        <tr key={n.namespace}>
                                            <td><strong>{n.namespace}</strong></td>
                                            <td>{n.podCount ?? 0}</td>
                                            <td>{fmtNum(n.cpuCores,2)}/{fmtNum(n.cpuRequestCores,2)}</td>
                                            <td>{fmtNum(n.memoryGb,1)}/{fmtNum(n.memoryRequestGb,1)} GB</td>
                                            <td>{fmt$Tiny(n.smoothedHourlyUsd ?? n.hourlyRateUsd)}</td>
                                            <td>{fmt$(n.monthlyEstUsd)}</td>
                                        </tr>
                                    ))
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}
