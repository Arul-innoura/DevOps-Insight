/**
 * CcOverviewPage — landing page of the cluster cost dashboard.
 *
 * Shows: top-line stat cards, cluster summary, component cost breakdown
 * (stackbar + table), operational metrics, pricing diagnostics, and node
 * detail. Also displays the fixed inventory view when mode="fixed".
 */

import React, { useState } from "react";
import {
    DollarSign, Clock, TrendingUp, Activity, AlertTriangle, Server, Cpu,
    Database, Box, Info, CheckCircle2, XCircle, Layers, Network,
    Package, Lock, Zap, HardDrive, ChevronDown, ChevronRight,
} from "lucide-react";
import {
    fmt$, fmt$Tiny, fmtNum, fmtPct, fmtBytes, fmtDuration,
    Stat, Mini, TopList, shortImage, shortNode, matchClass,
} from "./ClusterCostDashboard";

export default function CcOverviewPage({ ctx }) {
    const {
        snapshot, metrics, totals, mode, showAudit,
        workloadNs,
    } = ctx;
    const [openNs, setOpenNs] = useState(null);

    if (!snapshot) return <div className="pcp-empty">No snapshot yet.</div>;

    const reachable = !!snapshot.prometheusReachable || (snapshot.namespaces?.length > 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Top-line cost stats ── */}
            <div className="pcp-totals">
                <Stat label="Per hour"   value={fmt$(totals.hourly)}     icon={<DollarSign size={14}/>} accent="green"
                      title="Smoothed live $/hr — EMA of recent ticks, no jitter." />
                <Stat label="Per day"    value={fmt$(totals.daily)}      icon={<Clock size={14}/>}
                      title="Hourly rate × 24 — today's projected cost at current usage." />
                <Stat label="Per month"  value={fmt$(totals.monthly)}    icon={<TrendingUp size={14}/>}
                      title="Hourly rate × 730 (avg hrs/month). Forward projection." />
                <Stat label="This month so far" value={fmt$(totals.thisMonth)} icon={<Clock size={14}/>} accent="amber"
                      title="Actual accumulated cost since the 1st of this month. Resets monthly." />
                <Stat label="Lifetime total" value={fmt$(totals.lifetime)} icon={<Activity size={14}/>} accent="blue"
                      title="Cumulative cost since this env was first observed. Never resets." />
                <Stat label="Idle (unused capacity)"
                      value={`${fmt$Tiny(snapshot.idleHourlyUsd)}/hr`}
                      icon={<AlertTriangle size={14}/>}
                      accent={snapshot.idleHourlyUsd > 0.001 ? "amber" : ""}
                      title="Node capacity you're paying for that no namespace claimed via resource.requests." />
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

            {/* ── Cost efficiency summary ── */}
            {snapshot.cluster && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
                    {[
                        { label: "CPU utilisation",   value: fmtPct(snapshot.cluster.cpuUtilPct),    accent: snapshot.cluster.cpuUtilPct > 80 ? "amber" : "green" },
                        { label: "Memory utilisation", value: fmtPct(snapshot.cluster.memoryUtilPct), accent: snapshot.cluster.memoryUtilPct > 80 ? "amber" : "green" },
                        { label: "Idle waste $/hr",    value: fmt$Tiny(snapshot.idleHourlyUsd),       accent: snapshot.idleHourlyUsd > 0.001 ? "amber" : "green" },
                        { label: "Waste % of bill",    value: totals.hourly > 0 ? fmtPct((snapshot.idleHourlyUsd / totals.hourly) * 100) : "—",
                          accent: totals.hourly > 0 && (snapshot.idleHourlyUsd / totals.hourly) > 0.1 ? "amber" : "" },
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

            {/* ── Where the bill goes (component breakdown) ── */}
            {snapshot.cluster?.componentBreakdown?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <DollarSign size={14}/> Where the bill goes
                        <span className="pcp-section-sub">
                            — every component priced live · sums to 100% · idle wastage {fmtPct(snapshot.cluster.userPoolWastagePct)}
                        </span>
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
                                <tr>
                                    <th>Component</th><th>$/hour</th><th>$/day</th><th>$/month</th>
                                    <th>% of total</th><th>Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshot.cluster.componentBreakdown.map((c, i) => (
                                    <tr key={i}>
                                        <td><span className={`pcp-pill cat-${c.category}`}>{c.label}</span></td>
                                        <td>{fmt$Tiny(c.hourlyUsd)}</td>
                                        <td>{fmt$(c.dailyUsd)}</td>
                                        <td>{fmt$(c.monthlyUsd)}</td>
                                        <td>{fmtPct(c.percentOfTotal)}</td>
                                        <td className="pcp-mute">{c.detail || ""}</td>
                                    </tr>
                                ))}
                                <tr className="pcp-tot">
                                    <td><strong>Cluster total</strong></td>
                                    <td><strong>{fmt$Tiny(totals.hourly)}</strong></td>
                                    <td><strong>{fmt$(totals.daily)}</strong></td>
                                    <td><strong>{fmt$(totals.monthly)}</strong></td>
                                    <td><strong>100.0%</strong></td>
                                    <td className="pcp-mute">All components reconcile here</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Pricing diagnostics ── */}
            {snapshot.diagnostics && (
                <div className="pcp-diag">
                    <div className="pcp-diag-row">
                        <span className="pcp-diag-stat"><Server size={12}/> Nodes <strong>{snapshot.diagnostics.nodesTotal}</strong></span>
                        <span className="pcp-diag-stat"><Box size={12}/> SKU labels <strong>{snapshot.diagnostics.nodesWithVmSize}/{snapshot.diagnostics.nodesTotal}</strong></span>
                        <span className="pcp-diag-stat">
                            {snapshot.diagnostics.nodesPriced === snapshot.diagnostics.nodesTotal
                                ? <CheckCircle2 size={12} className="ok"/>
                                : <XCircle size={12} className="bad"/>}
                            Priced <strong>{snapshot.diagnostics.nodesPriced}/{snapshot.diagnostics.nodesTotal}</strong>
                        </span>
                        <span className="pcp-diag-stat"><Layers size={12}/> Pods w/ requests <strong>{snapshot.diagnostics.podsWithRequests}/{snapshot.diagnostics.podsTotal}</strong></span>
                        <span className="pcp-diag-stat"><Info size={12}/> {snapshot.diagnostics.allocationModel}</span>
                    </div>
                    {snapshot.diagnostics.vmSkusUnmatched?.length > 0 && (
                        <div className="pcp-diag-warn"><AlertTriangle size={12}/> Unmatched SKUs: {snapshot.diagnostics.vmSkusUnmatched.join(", ")}</div>
                    )}
                    {snapshot.diagnostics.vmSkusFuzzyMatched?.length > 0 && (
                        <div className="pcp-diag-info"><Info size={12}/> Fuzzy-priced: {snapshot.diagnostics.vmSkusFuzzyMatched.join(", ")}</div>
                    )}
                    {snapshot.diagnostics.warnings?.length > 0 && (
                        <details className="pcp-diag-warnings">
                            <summary>{snapshot.diagnostics.warnings.length} warning{snapshot.diagnostics.warnings.length !== 1 && "s"}</summary>
                            <ul>{snapshot.diagnostics.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </details>
                    )}
                </div>
            )}

            {/* ── Operational metrics ── */}
            {metrics && (
                <div className="pcp-ops">
                    <div className="pcp-ops-title"><Zap size={13}/> Operational metrics</div>
                    <div className="pcp-ops-grid">
                        <Mini label="Req/s"       value={fmtNum(metrics.requestsPerSec, 1)} />
                        <Mini label="Error/s"     value={fmtNum(metrics.errorsPerSec, 2)}   accent={metrics.errorsPerSec > 0 ? "red" : ""} />
                        <Mini label="Error rate"  value={fmtPct(metrics.errorRatePct)}       accent={metrics.errorRatePct > 1 ? "red" : ""} />
                        <Mini label="p50 lat"     value={metrics.p50LatencyMs ? `${fmtNum(metrics.p50LatencyMs,0)}ms` : "—"} />
                        <Mini label="p95 lat"     value={metrics.p95LatencyMs ? `${fmtNum(metrics.p95LatencyMs,0)}ms` : "—"} />
                        <Mini label="p99 lat"     value={metrics.p99LatencyMs ? `${fmtNum(metrics.p99LatencyMs,0)}ms` : "—"} />
                        <Mini label="Restarts"    value={metrics.totalRestarts ?? 0}         accent={metrics.totalRestarts > 0 ? "amber" : ""} />
                        <Mini label="CrashLoop"   value={metrics.crashLoopingPods ?? 0}      accent={metrics.crashLoopingPods > 0 ? "red" : ""} />
                        <Mini label="Pending"     value={metrics.pendingPods ?? 0} />
                        <Mini label="Ready"       value={metrics.readyPods ?? 0}              accent="green" />
                        <Mini label="Net rx"      value={fmtBytes(metrics.networkRxBytesPerSec) + "/s"} />
                        <Mini label="Net tx"      value={fmtBytes(metrics.networkTxBytesPerSec) + "/s"} />
                    </div>
                </div>
            )}

            {/* ── Top CPU / memory consumers ── */}
            {metrics?.topCpuConsumers?.length > 0 && (
                <div className="pcp-twocol">
                    <TopList title="Top CPU consumers"    rows={metrics.topCpuConsumers}    unit="cores" />
                    <TopList title="Top memory consumers" rows={metrics.topMemoryConsumers} unit="GB" />
                </div>
            )}

            {/* ── Node detail ── */}
            {snapshot.nodes?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Server size={14}/> Node detail ({snapshot.nodes.length})
                        <span className="pcp-section-sub">— SKU + live Azure price + namespace shares</span>
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr>
                                    <th>Node</th><th>SKU</th><th>Region</th><th>Pool/Role</th>
                                    <th>Capacity</th><th>CPU req%</th><th>Mem req%</th>
                                    <th>$/hr</th><th>Namespaces on this node</th><th>Match</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshot.nodes.map(n => (
                                    <tr key={n.name}>
                                        <td title={n.name}><strong>{shortNode(n.name)}</strong></td>
                                        <td>{n.vmSize || <span className="pcp-mute">—</span>}</td>
                                        <td>{n.region || "—"}</td>
                                        <td>{n.agentPool || "—"}{n.role ? ` · ${n.role}` : ""}</td>
                                        <td>{fmtNum(n.cpuCores,0)} cores · {fmtNum(n.memoryGb,0)} GB</td>
                                        <td className={n.cpuRequestedPct > 90 ? "warn" : ""}>{fmtPct(n.cpuRequestedPct)}</td>
                                        <td className={n.memoryRequestedPct > 90 ? "warn" : ""}>{fmtPct(n.memoryRequestedPct)}</td>
                                        <td>{fmt$Tiny(n.hourlyUsd)}</td>
                                        <td>
                                            {n.namespaceShares?.length > 0 ? (
                                                <div className="pcp-node-ns">
                                                    {n.namespaceShares.map((s, j) => (
                                                        <span key={j} className="pcp-node-ns-chip"
                                                              title={`${fmtNum(s.cpuRequestCores,2)} cores · ${fmtNum(s.memoryRequestGb,2)} GB · ${fmt$Tiny(s.hourlyUsd)}/hr`}>
                                                            <strong>{s.namespace}</strong>
                                                            <span>{fmtPct(s.sharePct)}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : <span className="pcp-mute">unused</span>}
                                        </td>
                                        <td><span className={`pcp-pill ${matchClass(n.pricingMatch)}`}>{n.pricingMatch}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Fixed inventory view ── */}
            {mode === "fixed" && snapshot.inventory && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Lock size={14}/> Fixed infrastructure cost (provisioned)
                        <span className="pcp-section-sub">— what Azure bills regardless of pod activity, priced live from Retail API</span>
                    </div>
                    {snapshot.inventory.groups?.map(g => (
                        <div key={g.category} className="pcp-inv-group">
                            <div className="pcp-inv-group-head">
                                <span><Package size={12}/> <strong>{g.label}</strong></span>
                                <span className="pcp-inv-subtotal">
                                    Subtotal: <strong>{fmt$(g.subtotalDailyUsd)}/day</strong> · {fmt$(g.subtotalMonthlyUsd)}/month
                                </span>
                            </div>
                            <div className="pcp-table-wrap">
                                <table className="pcp-table">
                                    <thead><tr><th>Item</th><th>SKU</th><th>Count</th><th>Unit $/day</th><th>$/day</th><th>$/month</th><th>Detail</th></tr></thead>
                                    <tbody>
                                        {g.items?.map((it, i) => (
                                            <tr key={i}>
                                                <td><strong>{it.name}</strong></td>
                                                <td>{it.sku || "—"}</td>
                                                <td>{it.count} {it.unit}{it.count !== 1 ? "s" : ""}</td>
                                                <td>{fmt$(it.unitDailyUsd)}</td>
                                                <td>{fmt$(it.dailyUsd)}</td>
                                                <td>{fmt$(it.monthlyUsd)}</td>
                                                <td className="pcp-mute">{it.detail || ""}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                    <div className="pcp-inv-grand">
                        Total provisioned: <strong>{fmt$(snapshot.inventory.totalDailyUsd)}/day</strong>
                        · {fmt$(snapshot.inventory.totalMonthlyUsd)}/month
                    </div>
                </div>
            )}

            {/* ── Pricing audit ── */}
            {showAudit && (
                <div className="pcp-section pcp-audit">
                    <div className="pcp-section-title">
                        <Info size={14}/> Pricing Audit
                        <span className="pcp-section-sub">— every Azure Retail price fetched this tick + exact formula</span>
                    </div>
                    <div className="pcp-audit-formula">
                        <strong>Allocation model:</strong> {snapshot.diagnostics?.allocationModel || "—"}<br/>
                        <strong>System pool + control plane</strong> → equal split ÷ N namespaces &nbsp;
                        <strong>User pool</strong> → CPU dim: (ns_cpu_req / cluster_cpu_req) × userPool×0.5 + RAM dim: (ns_mem_req / cluster_mem_req) × userPool×0.5
                    </div>
                    {snapshot.nodes?.length > 0 && (
                        <div className="pcp-substack" style={{ marginTop: 10 }}>
                            <div className="pcp-substack-title"><Server size={12}/> Node pricing (VM + OS disk)</div>
                            <div className="pcp-table-wrap">
                                <table className="pcp-table">
                                    <thead><tr>
                                        <th>Node</th><th>Pool</th><th>VM SKU</th>
                                        <th>VM $/hr</th><th>Match</th>
                                        <th>OS Disk</th><th>Disk GB</th><th>Disk $/hr</th>
                                        <th>Total $/hr</th><th>Total $/mo</th>
                                    </tr></thead>
                                    <tbody>
                                        {snapshot.nodes.map(n => {
                                            const vmOnly = (n.hourlyUsd||0) - (n.osDiskHourlyUsd||0);
                                            return (
                                                <tr key={n.name}>
                                                    <td><strong>{n.name}</strong></td>
                                                    <td><span className="pcp-pill">{n.agentPool || n.role || "—"}</span></td>
                                                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{n.vmSize || "—"}</td>
                                                    <td>{fmt$Tiny(vmOnly)}</td>
                                                    <td><span className={`pcp-pill ${matchClass(n.pricingMatch)}`}>{n.pricingMatch||"—"}</span></td>
                                                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                                                        {n.osDiskTierSku === "Ephemeral" ? <span className="pcp-pill ok">Ephemeral (free)</span> : (n.osDiskTierSku || "P10 LRS est.")}
                                                    </td>
                                                    <td>{n.osDiskSizeGb ? `${n.osDiskSizeGb} GB` : "128 GB est."}</td>
                                                    <td>{fmt$Tiny(n.osDiskHourlyUsd)}</td>
                                                    <td><strong>{fmt$Tiny(n.hourlyUsd)}</strong></td>
                                                    <td><strong>{fmt$((n.hourlyUsd||0)*730)}</strong></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {snapshot.cloudServices?.length > 0 && (
                        <div className="pcp-substack" style={{ marginTop: 10 }}>
                            <div className="pcp-substack-title"><Zap size={12}/> Shared services (split equally across all namespaces)</div>
                            <div className="pcp-table-wrap">
                                <table className="pcp-table">
                                    <thead><tr>
                                        <th>Service</th><th>Category</th><th>Azure SKU</th>
                                        <th>Qty</th><th>Unit price</th><th>Unit</th>
                                        <th>$/hr total</th><th>$/mo total</th>
                                        <th>÷ {snapshot.namespaces?.length||1} ns = $/mo each</th>
                                    </tr></thead>
                                    <tbody>
                                        {snapshot.cloudServices.map(s => (
                                            <tr key={s.key}>
                                                <td><strong>{s.name}</strong></td>
                                                <td><span className="pcp-pill">{s.category}</span></td>
                                                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{s.azureSkuName||"—"}</td>
                                                <td>{fmtNum(s.quantity,2)}</td>
                                                <td>{fmt$Tiny(s.azureUnitPriceUsd)}</td>
                                                <td className="pcp-mute">{s.unitOfMeasure||"—"}</td>
                                                <td>{fmt$Tiny(s.hourlyRateUsd)}</td>
                                                <td>{fmt$(s.monthlyEstUsd)}</td>
                                                <td>{fmt$((s.monthlyEstUsd||0)/(snapshot.namespaces?.length||1))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
