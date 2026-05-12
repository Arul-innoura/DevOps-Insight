/**
 * CostManagementDashboard — capacity-based cost view for DevOps.
 *
 * Renders the per-environment breakdown from NodeCapacityCostService:
 *   - total env cost (nodes + shared infra + shared services)
 *   - per-project share of node capacity + cost
 *   - per-microservice cost inside each project
 *   - node-capacity vs requested-capacity headroom
 *   - savings suggestions when utilisation is low or a project over-reserves
 *
 * Read-only. Auto-refreshes every hour via a setInterval fallback; a manual
 * "Refresh" button triggers an immediate backend recompute.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    RefreshCw, Layers, Server, AlertTriangle, Info, CheckCircle,
    ChevronDown, ChevronRight, TrendingUp, DollarSign, Cpu, Database, AlertCircle,
} from "lucide-react";
import { getCapacityBreakdown } from "../services/costMonitoringService";
import { refreshCloudEnvironmentPrices } from "../services/cloudEnvironmentService";
import { useToast } from "../services/ToastNotification";

const REFRESH_MS = 60 * 60 * 1000; // 1 hour

export default function CostManagementDashboard() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState({});
    const [refreshedAt, setRefreshedAt] = useState(null);
    const timerRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getCapacityBreakdown();
            setRows(Array.isArray(data) ? data : []);
            setRefreshedAt(new Date());
        } catch {
            toast.error("Failed to load cost breakdown");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        timerRef.current = setInterval(load, REFRESH_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [load]);

    const forceRefresh = async () => {
        try {
            await refreshCloudEnvironmentPrices();
            await load();
            toast.success("Prices refreshed");
        } catch {
            toast.error("Refresh failed");
        }
    };

    const grandTotals = useMemo(() => {
        const out = { hourly: 0, monthly: 0, projects: 0, nodeHourly: 0, sharedHourly: 0 };
        for (const r of rows) {
            out.hourly += r.totalHourlyUsd || 0;
            out.monthly += r.projectedMonthlyUsd || 0;
            out.projects += (r.projects || []).length;
            out.nodeHourly += r.nodePoolHourlyUsd || 0;
            out.sharedHourly += (r.sharedInfraHourlyUsd || 0) + (r.sharedServicesHourlyUsd || 0);
        }
        return out;
    }, [rows]);

    return (
        <div style={wrap}>
            <div style={topBar}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
                        <TrendingUp size={20} /> Cost Management
                    </h2>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                        Capacity-based breakdown across all managed Azure environments.
                        {refreshedAt && <> · Refreshed {refreshedAt.toLocaleTimeString()} · auto-refresh every hour</>}
                    </div>
                </div>
                <button onClick={forceRefresh} style={refreshBtn} disabled={loading}>
                    <RefreshCw size={14} /> Refresh now
                </button>
            </div>

            <div style={statGrid}>
                <StatCard icon={<DollarSign size={18} />} label="Total hourly"
                    value={`$${fmt(grandTotals.hourly)}`} />
                <StatCard icon={<DollarSign size={18} />} label="Projected monthly"
                    value={`$${fmt(grandTotals.monthly)}`} />
                <StatCard icon={<Server size={18} />} label="Node spend / hr"
                    value={`$${fmt(grandTotals.nodeHourly)}`} />
                <StatCard icon={<Database size={18} />} label="Shared infra / hr"
                    value={`$${fmt(grandTotals.sharedHourly)}`} />
                <StatCard icon={<Layers size={18} />} label="Environments"
                    value={rows.length} />
                <StatCard icon={<Cpu size={18} />} label="Attached projects"
                    value={grandTotals.projects} />
            </div>

            {loading && <div style={muted}>Loading…</div>}
            {!loading && rows.length === 0 && (
                <div style={emptyCard}>
                    No managed environments have cost data yet. Configure node pools with VM sizes under
                    <strong> Admin → Environments</strong> to start seeing costs here.
                </div>
            )}

            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {rows.map((env) => {
                    const isOpen = expanded[env.environmentId];
                    return (
                        <div key={env.environmentId || env.environmentName} style={envCard}>
                            <div style={envHeader} onClick={() => setExpanded((e) => ({ ...e, [env.environmentId]: !isOpen }))}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <Layers size={16} />
                                    <strong style={{ fontSize: 15 }}>{env.environmentName}</strong>
                                    {env.azureRegion && (
                                        <span style={regionBadge}>{env.azureRegion}</span>
                                    )}
                                </div>
                                <div style={envTotals}>
                                    <span><strong>${fmt(env.totalHourlyUsd)}</strong>/hr</span>
                                    <span style={{ color: "var(--text-muted)" }}>·</span>
                                    <span><strong>${fmt(env.projectedMonthlyUsd)}</strong>/mo</span>
                                </div>
                            </div>

                            <CapacityBar env={env} />

                            {isOpen && (
                                <>
                                    <EnvDetail env={env} />
                                    <ProjectTable env={env} />
                                    <Suggestions env={env} />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value }) {
    return (
        <div style={statCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 12 }}>
                {icon}<span>{label}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 600 }}>{value}</div>
        </div>
    );
}

function CapacityBar({ env }) {
    const util = clamp(env.utilizationPct || 0, 0, 100);
    const color = util >= 90 ? "#dc2626" : util >= 60 ? "#2563eb" : "#059669";
    return (
        <div style={{ padding: "4px 16px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>Capacity used: {fmt(env.requestedVCpu)} / {fmt(env.totalVCpu)} vCPU · {fmt(env.requestedMemoryGb)} / {fmt(env.totalMemoryGb)} GB</span>
                <span>{fmt(util)}%</span>
            </div>
            <div style={{ background: "var(--track-bg, #e5e7eb)", borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${util}%`, background: color, height: "100%" }} />
            </div>
        </div>
    );
}

function EnvDetail({ env }) {
    return (
        <div style={detailRow}>
            <DetailItem label="Node pools /hr" value={`$${fmt(env.nodePoolHourlyUsd)}`} />
            <DetailItem label="Shared infra /hr" value={`$${fmt(env.sharedInfraHourlyUsd)}`} />
            <DetailItem label="Shared svcs /hr" value={`$${fmt(env.sharedServicesHourlyUsd)}`} />
            <DetailItem label="Total vCPU" value={fmt(env.totalVCpu)} />
            <DetailItem label="Total Memory GB" value={fmt(env.totalMemoryGb)} />
            <DetailItem label="Projects attached" value={(env.projects || []).length} />
        </div>
    );
}

function DetailItem({ label, value }) {
    return (
        <div style={{ fontSize: 12 }}>
            <div style={{ color: "var(--text-muted)" }}>{label}</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{value}</div>
        </div>
    );
}

function ProjectTable({ env }) {
    const rows = env.projects || [];
    if (rows.length === 0) {
        return <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 13 }}>No projects attached.</div>;
    }
    return (
        <div style={{ overflow: "auto" }}>
            <table style={table}>
                <thead>
                    <tr>
                        <th style={th}>Project</th>
                        <th style={th}>Requested</th>
                        <th style={th}>Capacity %</th>
                        <th style={th}>Node $/hr</th>
                        <th style={th}>Shared $/hr</th>
                        <th style={th}>Total $/hr</th>
                        <th style={th}>Monthly</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((p) => (
                        <React.Fragment key={p.projectId}>
                            <tr>
                                <td style={td}>
                                    <strong>{p.projectName}</strong>
                                    {p.usingDefaultRequests && (
                                        <span title="No CPU/memory requests set — using minimum fallback (100 mCPU / 128 MB per replica). Set actual requests in Admin → Project config → Microservices for accurate pricing."
                                            style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6, fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 6 }}>
                                            <AlertCircle size={10} /> est.
                                        </span>
                                    )}
                                </td>
                                <td style={td}>{fmt(p.requestedVCpu)} vCPU / {fmt(p.requestedMemoryGb)} GB</td>
                                <td style={td}>{fmt((p.capacityShare || 0) * 100)}%</td>
                                <td style={td}>${fmt(p.nodeCostHourlyUsd)}</td>
                                <td style={td}>${fmt((p.sharedInfraHourlyUsd || 0) + (p.sharedServicesHourlyUsd || 0))}</td>
                                <td style={td}><strong>${fmt(p.totalHourlyUsd)}</strong></td>
                                <td style={td}>${fmt(p.projectedMonthlyUsd)}</td>
                            </tr>
                            {(p.microservices || []).length > 0 && (
                                <tr>
                                    <td colSpan={7} style={{ ...td, padding: "4px 12px 10px" }}>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
                                            {p.microservices.map((ms) => (
                                                <span key={ms.id || ms.name} style={msPill}>
                                                    {ms.name || "?"} × {ms.replicas || 1}
                                                    <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>
                                                        ${fmt(ms.hourlyUsd)}/hr
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Suggestions({ env }) {
    const list = env.suggestions || [];
    if (list.length === 0) {
        return (
            <div style={suggestionRow}>
                <CheckCircle size={14} color="#059669" />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No savings suggestions — looks well-provisioned.</span>
            </div>
        );
    }
    return (
        <div style={{ padding: "10px 16px 14px" }}>
            {list.map((s, i) => (
                <div key={i} style={{
                    ...suggestionRow,
                    borderLeft: `3px solid ${s.severity === "warn" ? "#dc2626" : "#2563eb"}`,
                    background: s.severity === "warn" ? "rgba(220,38,38,0.04)" : "rgba(37,99,235,0.04)",
                }}>
                    {s.severity === "warn" ? <AlertTriangle size={14} color="#dc2626" /> : <Info size={14} color="#2563eb" />}
                    <span style={{ fontSize: 12 }}>
                        <strong>{s.target || env.environmentName}</strong> — {s.message}
                        {s.potentialMonthlyUsd != null && (
                            <span style={{ marginLeft: 6, color: "#059669", fontWeight: 600 }}>
                                saves ~${fmt(s.potentialMonthlyUsd)}/mo
                            </span>
                        )}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Helpers

const fmt = (n) => {
    if (n == null || Number.isNaN(n)) return "0.00";
    const abs = Math.abs(n);
    if (abs >= 1000) return n.toFixed(0);
    if (abs >= 10) return n.toFixed(1);
    return n.toFixed(2);
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Styles

const wrap = { padding: 20 };
const topBar = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12 };
const refreshBtn = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
    border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--card-bg, #fff)",
    color: "var(--text-primary)", cursor: "pointer", fontSize: 13,
};
const statGrid = {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10, marginBottom: 18,
};
const statCard = {
    padding: 12, border: "1px solid var(--border-color)", borderRadius: 8,
    background: "var(--card-bg, #fff)",
};
const envCard = {
    border: "1px solid var(--border-color)", borderRadius: 8, overflow: "hidden",
    background: "var(--card-bg, #fff)",
};
const envHeader = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 16px", cursor: "pointer",
};
const envTotals = { fontSize: 13, display: "flex", gap: 8, alignItems: "center" };
const regionBadge = {
    background: "var(--badge-bg, #eff6ff)", color: "var(--badge-fg, #1d4ed8)",
    padding: "2px 8px", borderRadius: 12, fontSize: 11, fontFamily: "monospace",
};
const detailRow = {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12, padding: "10px 16px", borderTop: "1px solid var(--border-color)",
    background: "var(--card-bg-alt, #fafafa)",
};
const table = {
    width: "100%", borderCollapse: "collapse", fontSize: 13,
    borderTop: "1px solid var(--border-color)",
};
const th = {
    textAlign: "left", padding: "8px 12px", fontSize: 11,
    color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4,
    borderBottom: "1px solid var(--border-color)",
};
const td = {
    padding: "8px 12px", borderBottom: "1px solid var(--border-color)",
};
const msPill = {
    padding: "2px 8px", background: "var(--pill-bg, #f3f4f6)",
    borderRadius: 999, fontSize: 11,
};
const suggestionRow = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", borderRadius: 6, marginTop: 6,
};
const muted = { padding: 16, color: "var(--text-muted)", fontSize: 13 };
const emptyCard = {
    padding: 24, textAlign: "center",
    color: "var(--text-muted)", fontSize: 13,
    border: "1px dashed var(--border-color)", borderRadius: 8, marginTop: 12,
};
