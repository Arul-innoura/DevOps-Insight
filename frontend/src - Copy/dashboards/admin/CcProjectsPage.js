/**
 * CcProjectsPage — Workload / project namespaces page.
 *
 * Shows: live workload cost trend, project cards (one per grouped project),
 * expandable namespace accordion with full service-line breakdown, the
 * Products cost table, and the Cloud services table.
 */

import React, { useState } from "react";
import {
    DollarSign, FolderKanban, ChevronDown, ChevronRight,
    HardDrive, Layers, Network, Clock,
} from "lucide-react";
import {
    fmt$, fmt$Tiny, fmtNum, fmtPct, fmtDuration, shortImage,
} from "./ClusterCostDashboard";
import { LiveAreaChart, CostMultiLineChart } from "../../components/ClusterCostMiniCharts";

export default function CcProjectsPage({ ctx }) {
    const {
        snapshot, mode, projectGroups, workloadNs,
        totalWorkloadHourly, totals,
        tsWorkloadTotalSeries, tsTopProjectSeries,
        effectiveGranularity, tsPoints,
    } = ctx;

    const [openNs, setOpenNs] = useState(null);
    const [openProduct, setOpenProduct] = useState(null);

    if (!snapshot) return <div className="pcp-empty">No snapshot yet.</div>;
    if (!projectGroups.length) return (
        <div className="pcp-empty">
            <FolderKanban size={16}/> No workload namespaces detected in this cluster.
        </div>
    );

    const workloadShare = totals.hourly > 0 ? (totalWorkloadHourly / totals.hourly) * 100 : 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Page header strip ── */}
            <div className="pcp-section pcp-sec-projects" style={{ padding: "10px 14px 8px" }}>
                <div className="pcp-section-title" style={{ marginBottom: 0 }}>
                    <FolderKanban size={15}/> Projects · Workload Namespaces
                    <span className="pcp-section-sub">
                        — grouped by project (matchedProjectName or prefix qa-/ns-/prod-/dev-) ·
                        {projectGroups.length} project{projectGroups.length !== 1 && "s"}
                    </span>
                    <span className="pcp-sec-total" style={{ marginLeft: "auto" }}>
                        <DollarSign size={11}/> {fmt$Tiny(totalWorkloadHourly)}/hr
                        <span className="pcp-sec-total-sub">
                            · {fmt$(totalWorkloadHourly * 24)}/day
                            · {fmt$(totalWorkloadHourly * 730)}/mo
                            · {fmtPct(workloadShare)} of cluster bill
                        </span>
                    </span>
                </div>
            </div>

            {/* ── Live workload cost trend ── */}
            <div className="pcp-live-graph-wrap" style={{ borderColor: "#a7f3d0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Total workload cost trend · live up/down · {effectiveGranularity} buckets
                </div>
                <LiveAreaChart
                    points={tsWorkloadTotalSeries}
                    color="#10b981"
                    granularity={effectiveGranularity}
                    valueLabel="$/hr"
                    valueFmt={v => fmt$Tiny(v)}
                    title={`Workload cost trend · ${effectiveGranularity}`}
                    currentValue={totalWorkloadHourly}
                    height={190}
                />
            </div>

            {/* ── Per-project cost trend (multi-line) ── */}
            {tsTopProjectSeries.length > 0 && (
                <div className="pcp-ts-chart">
                    <div className="pcp-ts-chart-title">
                        <FolderKanban size={12}/> Top {tsTopProjectSeries.length} projects · cost trends (live lines)
                    </div>
                    <CostMultiLineChart series={tsTopProjectSeries} granularity={effectiveGranularity} height={220}/>
                </div>
            )}

            {/* ── Project cards ── */}
            <div className="pcp-section pcp-sec-projects">
                <div className="pcp-section-title">
                    Project cost breakdown
                    <span className="pcp-section-sub">— each card = one project; expand namespaces below for service-level detail</span>
                </div>
                <div className="pcp-projects">
                    {projectGroups.map(g => {
                        const projShare = totalWorkloadHourly > 0 ? (g.hourly / totalWorkloadHourly) * 100 : 0;
                        return (
                            <div key={g.key} className="pcp-proj-card">
                                <div className="pcp-proj-head">
                                    <div>
                                        <div className="pcp-proj-name">
                                            <FolderKanban size={13}/>
                                            {g.key}
                                            <span className="pcp-pill linked">{g.namespaces.length} ns</span>
                                            <span className="pcp-pill">{g.podCount} pods</span>
                                            {g.microserviceCount > 0 && <span className="pcp-pill">{g.microserviceCount} svc</span>}
                                        </div>
                                        <div className="pcp-proj-meta">
                                            {g.namespaces.map(n => (
                                                <span key={n.namespace} className="pcp-proj-ns-chip">
                                                    {n.namespace} <strong>{fmt$Tiny(n.smoothedHourlyUsd ?? n.hourlyRateUsd)}</strong>
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280", display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            <span>CPU used {fmtNum(g.cpuUsed, 2)} / req {fmtNum(g.cpuReq, 2)} cores</span>
                                            <span>Mem used {fmtNum(g.memUsed, 1)} / req {fmtNum(g.memReq, 1)} GB</span>
                                        </div>
                                    </div>
                                    <div className="pcp-proj-totals">
                                        <div className="pcp-proj-hourly">{fmt$Tiny(g.hourly)}<span>/hr</span></div>
                                        <div className="pcp-proj-monthly">{fmt$(g.hourly * 730)}<span>/mo</span></div>
                                        <div className="pcp-proj-mtd">MTD {fmt$(g.mtd)}</div>
                                        <div className="pcp-proj-share">{fmtPct(projShare)} of workload</div>
                                        <div style={{ fontSize: 10, color: "#94a3b8" }}>Lifetime {fmt$(g.cumulative)}</div>
                                    </div>
                                </div>
                                <div className="pcp-proj-bar">
                                    <div className="pcp-proj-bar-fill" style={{ width: `${Math.min(100, projShare)}%` }}/>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Full namespace accordion ── */}
            {mode === "live" && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <HardDrive size={14}/> All workload namespaces ({workloadNs.length})
                        <span className="pcp-section-sub">— expand to see microservice cost lines, PVCs, and service breakdown</span>
                    </div>
                    {!workloadNs.length ? (
                        <div className="pcp-empty">No workload namespaces.</div>
                    ) : (
                        <div className="pcp-namespaces">
                            {workloadNs.map(ns => {
                                const isOpen = openNs === ns.namespace;
                                const hr = ns.smoothedHourlyUsd ?? ns.hourlyRateUsd ?? 0;
                                return (
                                    <div key={ns.namespace} className={`pcp-ns ${isOpen ? "open" : ""}`}>
                                        <button className="pcp-ns-head" onClick={() => setOpenNs(isOpen ? null : ns.namespace)}>
                                            {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                            <strong>{ns.namespace}</strong>
                                            {ns.matchedProjectName && <span className="pcp-pill linked">→ {ns.matchedProjectName}</span>}
                                            <span className="pcp-meta">
                                                {ns.podCount} pods · {ns.microserviceCount} svc ·
                                                {" "}{fmtNum(ns.cpuCores,2)}u/{fmtNum(ns.cpuRequestCores,2)}r cores ·
                                                {" "}{fmtNum(ns.memoryGb,1)}u/{fmtNum(ns.memoryRequestGb,1)}r GB
                                            </span>
                                            <span className="pcp-meta-cost">
                                                {ns.percentOfClusterTotal != null && (
                                                    <span className="pcp-pct">{fmtPct(ns.percentOfClusterTotal)}</span>
                                                )}
                                                <span><DollarSign size={11}/> {fmt$Tiny(hr)}/hr</span>
                                                <span>{fmt$(hr * 24)}/day</span>
                                                <span>{fmt$(ns.monthlyEstUsd)}/mo</span>
                                                <span className="mtd">MTD {fmt$(ns.monthToDateUsd)}</span>
                                                <span className="cum">Lifetime {fmt$(ns.cumulativeUsd)}</span>
                                                <span><Clock size={11}/> {fmtDuration(ns.uptimeSeconds)}</span>
                                            </span>
                                            {(ns.computeHourlyUsd > 0 || ns.memoryHourlyUsd > 0 || ns.storageHourlyUsd > 0) && (
                                                <span className="pcp-split-line">
                                                    Breakdown:
                                                    <span>CPU {fmt$Tiny(ns.computeHourlyUsd)}/hr</span>
                                                    <span>Mem {fmt$Tiny(ns.memoryHourlyUsd)}/hr</span>
                                                    <span>Storage {fmt$Tiny(ns.storageHourlyUsd)}/hr</span>
                                                </span>
                                            )}
                                        </button>
                                        {isOpen && (
                                            <div className="pcp-ns-body">
                                                {ns.serviceLines?.length > 0 && (
                                                    <div className="pcp-substack">
                                                        <div className="pcp-substack-title"><Layers size={12}/> Cost by service</div>
                                                        <div className="pcp-table-wrap">
                                                            <table className="pcp-table">
                                                                <thead><tr><th>Service</th><th>Item</th><th>Qty</th><th>$/hr</th><th>$/day</th><th>$/mo</th><th>Detail</th></tr></thead>
                                                                <tbody>
                                                                    {ns.serviceLines.map((sl, i) => (
                                                                        <tr key={i}>
                                                                            <td><span className={`pcp-pill cat-${sl.category}`}>{sl.category}</span></td>
                                                                            <td><strong>{sl.name}</strong></td>
                                                                            <td>{fmtNum(sl.quantity,2)} {sl.unit}</td>
                                                                            <td>{fmt$Tiny(sl.hourlyUsd)}</td>
                                                                            <td>{fmt$(sl.dailyUsd)}</td>
                                                                            <td>{fmt$(sl.monthlyUsd)}</td>
                                                                            <td className="pcp-detail">{sl.detail||""}</td>
                                                                        </tr>
                                                                    ))}
                                                                    <tr className="pcp-tot">
                                                                        <td colSpan={3}><strong>Total</strong></td>
                                                                        <td><strong>{fmt$Tiny(hr)}</strong></td>
                                                                        <td><strong>{fmt$(hr*24)}</strong></td>
                                                                        <td><strong>{fmt$(ns.monthlyEstUsd)}</strong></td>
                                                                        <td className="pcp-mute">All services in this namespace</td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                                {ns.storage?.length > 0 && (
                                                    <div className="pcp-substack">
                                                        <div className="pcp-substack-title"><HardDrive size={12}/> Storage ({ns.storage.length} PVC{ns.storage.length!==1&&"s"})</div>
                                                        <div className="pcp-table-wrap">
                                                            <table className="pcp-table">
                                                                <thead><tr><th>PVC</th><th>Storage class</th><th>Azure SKU</th><th>Size</th><th>$/hr</th><th>$/day</th><th>$/mo</th></tr></thead>
                                                                <tbody>
                                                                    {ns.storage.map(s => (
                                                                        <tr key={s.pvcName}>
                                                                            <td><strong>{s.pvcName}</strong></td>
                                                                            <td>{s.storageClass||"—"}</td>
                                                                            <td>{s.azureSkuName||"—"}</td>
                                                                            <td>{fmtNum(s.sizeGb,1)} GB</td>
                                                                            <td>{fmt$Tiny(s.hourlyUsd)}</td>
                                                                            <td>{fmt$((s.hourlyUsd||0)*24)}</td>
                                                                            <td>{fmt$(s.monthlyUsd)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                                {ns.microservices?.length > 0 && (
                                                    <div className="pcp-table-wrap">
                                                        <table className="pcp-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Microservice</th><th>Node</th><th>Replicas</th>
                                                                    <th>HPA</th><th>CPU u/r</th><th>Mem u/r</th>
                                                                    <th>Restarts</th><th>$/hr</th><th>CPU $</th>
                                                                    <th>Mem $</th><th>$/mo</th><th>MTD</th><th>Cumulative</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {ns.microservices.map(m => (
                                                                    <tr key={m.name}>
                                                                        <td>
                                                                            <strong>{m.name}</strong>
                                                                            {m.image && <div className="pcp-image" title={m.image}>{shortImage(m.image)}</div>}
                                                                        </td>
                                                                        <td title={m.nodeName||undefined}>
                                                                            {m.nodeVmSize
                                                                                ? <span className={m.nodeIsSpot ? "pcp-spot-badge" : "pcp-vm-size"}>{m.nodeVmSize}</span>
                                                                                : <span className="pcp-mute">—</span>}
                                                                        </td>
                                                                        <td>{m.replicas??0}</td>
                                                                        <td>
                                                                            {m.hpaMaxReplicas != null
                                                                                ? <span className="pcp-hpa">{m.hpaMinReplicas}/{m.hpaCurrentReplicas}/{m.hpaMaxReplicas}</span>
                                                                                : <span className="pcp-mute">—</span>}
                                                                        </td>
                                                                        <td>{fmtNum(m.cpuCores,3)}/{fmtNum(m.cpuRequestCores,3)}</td>
                                                                        <td>{fmtNum(m.memoryGb,2)}/{fmtNum(m.memoryRequestGb,2)} GB</td>
                                                                        <td className={m.restarts>0?"warn":""}>{m.restarts??0}</td>
                                                                        <td>{fmt$Tiny(m.hourlyRateUsd)}</td>
                                                                        <td>{fmt$Tiny(m.computeHourlyUsd)}</td>
                                                                        <td>{fmt$Tiny(m.memoryHourlyUsd)}</td>
                                                                        <td>{fmt$(m.monthlyEstUsd)}</td>
                                                                        <td>{fmt$(m.monthToDateUsd)}</td>
                                                                        <td><strong>{fmt$(m.cumulativeUsd)}</strong></td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                                {!ns.microservices?.length && !ns.storage?.length && !ns.serviceLines?.length && (
                                                    <div className="pcp-empty">No microservices or storage in this namespace.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Products cost table ── */}
            {mode === "live" && snapshot?.products?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <FolderKanban size={14}/> Products ({snapshot.products.length})
                        <span className="pcp-section-sub">— full cost per product including infrastructure overhead share; totals equal cluster bill</span>
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr>
                                    <th></th><th>Product</th>
                                    <th title="CPU + Memory compute">Compute $/hr</th>
                                    <th title="Persistent volumes">Storage $/hr</th>
                                    <th title="Load balancers">Network $/hr</th>
                                    <th title="System pool + registry + egress">Infra $/hr</th>
                                    <th title="System namespace share">Support $/hr</th>
                                    <th className="pcp-th-accent">Total $/hr</th>
                                    <th className="pcp-th-accent">$/day</th>
                                    <th className="pcp-th-accent">$/mo</th>
                                    <th>MTD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshot.products.map(p => {
                                    const isOpen = openProduct === p.namespace;
                                    return (
                                        <React.Fragment key={p.namespace}>
                                            <tr className={isOpen ? "pcp-prod-open" : ""}>
                                                <td style={{ width: 24, cursor: "pointer" }} onClick={() => setOpenProduct(isOpen ? null : p.namespace)}>
                                                    {isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                                                </td>
                                                <td><strong>{p.namespace}</strong></td>
                                                <td>{fmt$Tiny(p.computeHourlyUsd)}</td>
                                                <td>{fmt$Tiny(p.storageHourlyUsd)}</td>
                                                <td>{fmt$Tiny(p.networkHourlyUsd)}</td>
                                                <td>{fmt$Tiny(p.infraShareHourlyUsd)}</td>
                                                <td>{fmt$Tiny(p.supportShareHourlyUsd)}</td>
                                                <td className="pcp-td-accent"><strong>{fmt$Tiny(p.totalHourlyUsd)}</strong></td>
                                                <td className="pcp-td-accent">{fmt$(p.dailyUsd)}</td>
                                                <td className="pcp-td-accent"><strong>{fmt$(p.monthlyUsd)}</strong></td>
                                                <td>{fmt$(p.monthToDateUsd)}</td>
                                            </tr>
                                            {isOpen && p.lines?.length > 0 && (
                                                <tr>
                                                    <td colSpan={11} style={{ padding: 0 }}>
                                                        <table className="pcp-table pcp-prod-detail">
                                                            <thead><tr><th>Component</th><th>$/hr</th><th>$/day</th><th>$/mo</th></tr></thead>
                                                            <tbody>
                                                                {p.lines.map(l => (
                                                                    <tr key={l.label}>
                                                                        <td><span className={`pcp-pill cat-${l.category}`}>{l.category}</span> {l.label}</td>
                                                                        <td>{fmt$Tiny(l.hourlyUsd)}</td>
                                                                        <td>{fmt$(l.dailyUsd)}</td>
                                                                        <td>{fmt$(l.monthlyUsd)}</td>
                                                                    </tr>
                                                                ))}
                                                                <tr className="pcp-tot">
                                                                    <td><strong>Total</strong></td>
                                                                    <td><strong>{fmt$Tiny(p.totalHourlyUsd)}</strong></td>
                                                                    <td><strong>{fmt$(p.dailyUsd)}</strong></td>
                                                                    <td><strong>{fmt$(p.monthlyUsd)}</strong></td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                <tr className="pcp-tot">
                                    <td></td>
                                    <td><strong>Grand Total</strong></td>
                                    <td><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.computeHourlyUsd||0),0))}</strong></td>
                                    <td><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.storageHourlyUsd||0),0))}</strong></td>
                                    <td><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.networkHourlyUsd||0),0))}</strong></td>
                                    <td><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.infraShareHourlyUsd||0),0))}</strong></td>
                                    <td><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.supportShareHourlyUsd||0),0))}</strong></td>
                                    <td className="pcp-td-accent"><strong>{fmt$Tiny(snapshot.products.reduce((s,p)=>s+(p.totalHourlyUsd||0),0))}</strong></td>
                                    <td className="pcp-td-accent"><strong>{fmt$(snapshot.products.reduce((s,p)=>s+(p.dailyUsd||0),0))}</strong></td>
                                    <td className="pcp-td-accent"><strong>{fmt$(snapshot.products.reduce((s,p)=>s+(p.monthlyUsd||0),0))}</strong></td>
                                    <td><strong>{fmt$(snapshot.products.reduce((s,p)=>s+(p.monthToDateUsd||0),0))}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Cloud services ── */}
            {mode === "live" && snapshot.cloudServices?.length > 0 && (
                <div className="pcp-section">
                    <div className="pcp-section-title">
                        <Network size={14}/> Cloud services in use ({snapshot.cloudServices.length})
                        <span className="pcp-section-sub">— auto-discovered, priced live from Azure Retail</span>
                    </div>
                    <div className="pcp-table-wrap">
                        <table className="pcp-table">
                            <thead>
                                <tr>
                                    <th>Service</th><th>Category</th><th>SKU</th><th>Qty</th>
                                    <th>Unit $</th><th>$/hr</th><th>$/mo</th><th>MTD</th><th>Cumulative</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshot.cloudServices.map(s => (
                                    <tr key={s.key}>
                                        <td><strong>{s.name}</strong></td>
                                        <td><span className="pcp-pill">{s.category||"—"}</span></td>
                                        <td>{s.azureSkuName||"—"}</td>
                                        <td>{fmtNum(s.quantity,2)}</td>
                                        <td>{fmt$Tiny(s.azureUnitPriceUsd)}<span className="pcp-uom"> / {s.unitOfMeasure||"unit"}</span></td>
                                        <td>{fmt$Tiny(s.hourlyRateUsd)}</td>
                                        <td>{fmt$(s.monthlyEstUsd)}</td>
                                        <td>{fmt$(s.monthToDateUsd)}</td>
                                        <td><strong>{fmt$(s.cumulativeUsd)}</strong></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}
