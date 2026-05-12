// DevOps-only "Cost per cycle" panel.
// Reads each project's bill from /api/billing/live and the legacy
// /api/cost-monitoring/projects/{id}/breakdown for per-cycle history.
// Shows: per-project totals + a per-cycle table (start/stop/duration/$).

import React, { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Clock, DollarSign } from "lucide-react";
import { getLiveBills } from "../../services/billingService";
import { apiRequest } from "../../services/apiClient";

const fmt$ = (v) => (v == null || isNaN(v)) ? "$0.00" : `$${Number(v).toFixed(2)}`;
const fmtSmall$ = (v) => (v == null || isNaN(v)) ? "—" : `$${Number(v).toFixed(4)}`;
const fmtDuration = (sec) => {
    if (!sec || sec < 0) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
};
const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
};

export default function DevOpsCycleCostPanel() {
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [openProjectId, setOpenProjectId] = useState(null);
    const [cycleData, setCycleData] = useState({});

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const data = await getLiveBills();
            const arr = Array.isArray(data) ? data : [];
            setBills(arr);
            if (!openProjectId && arr.length) setOpenProjectId(arr[0].projectId);
        } catch {
            setBills([]);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [openProjectId]);

    useEffect(() => { void load(); }, [load]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const t = setInterval(() => void load(), 30000);
        return () => clearInterval(t);
    }, [load]);

    const loadCycles = useCallback(async (projectId) => {
        if (!projectId) return;
        try {
            const data = await apiRequest(`/cost-monitoring/projects/${encodeURIComponent(projectId)}/breakdown`);
            setCycleData(prev => ({ ...prev, [projectId]: data }));
        } catch {
            setCycleData(prev => ({ ...prev, [projectId]: { services: [] } }));
        }
    }, []);

    useEffect(() => {
        if (openProjectId && !cycleData[openProjectId]) void loadCycles(openProjectId);
    }, [openProjectId, cycleData, loadCycles]);

    return (
        <div className="dops-cycle-panel">
            <style>{cssBlock}</style>

            <div className="dcp-toolbar">
                <div className="dcp-title">
                    <Activity size={16} />
                    <strong>Cost per cycle</strong>
                    <span className="dcp-sub">Per-project run cost — live month-to-date and per-cycle history</span>
                </div>
                <button className="dcp-btn" onClick={load} disabled={refreshing}>
                    <RefreshCw size={14} /> {refreshing ? "…" : "Refresh"}
                </button>
            </div>

            {loading ? (
                <div className="dcp-empty">Loading…</div>
            ) : bills.length === 0 ? (
                <div className="dcp-empty">No projects with bills yet.</div>
            ) : (
                <div className="dcp-projects">
                    {bills.map(b => {
                        const open = b.projectId === openProjectId;
                        const breakdown = cycleData[b.projectId];
                        return (
                            <div key={b.projectId} className={`dcp-project ${open ? "open" : ""}`}>
                                <button className="dcp-head" onClick={() => setOpenProjectId(open ? null : b.projectId)}>
                                    <strong>{b.projectName}</strong>
                                    <div className="dcp-head-meta">
                                        <span title="Effective hourly"><DollarSign size={11} />{fmtSmall$(b.totalHourlyUsd)}/hr</span>
                                        <span title="Projected monthly">{fmt$(b.totalMonthlyUsd)}/mo</span>
                                        <span title="Month-to-date" className="mtd"><Clock size={11} />MTD {fmt$(b.totalMonthToDateUsd)}</span>
                                    </div>
                                </button>
                                {open && (
                                    <div className="dcp-cycles">
                                        {!breakdown ? (
                                            <div className="dcp-empty">Loading cycles…</div>
                                        ) : !breakdown.services?.length ? (
                                            <div className="dcp-empty">No service runs recorded.</div>
                                        ) : (
                                            breakdown.services.map(svc => (
                                                <div key={svc.cloudServiceId} className="dcp-svc">
                                                    <div className="dcp-svc-head">
                                                        <strong>{svc.cloudServiceName}</strong>
                                                        <span className="dcp-pill">{svc.cloudCategory || "—"}</span>
                                                        <div className="grow" />
                                                        <span>Lifetime <strong>{fmt$(svc.lifetimeUsd)}</strong></span>
                                                        {svc.running && <span className="dcp-pill running">RUNNING</span>}
                                                    </div>
                                                    <table className="dcp-cycle-table">
                                                        <thead>
                                                            <tr>
                                                                <th>#</th>
                                                                <th>Started</th>
                                                                <th>Ended</th>
                                                                <th>Duration</th>
                                                                <th>$/hr</th>
                                                                <th>Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(svc.cycleHistory || []).map((c, idx) => (
                                                                <tr key={idx}>
                                                                    <td>{idx + 1}</td>
                                                                    <td>{fmtTime(c.startedAt)}</td>
                                                                    <td>{fmtTime(c.endedAt)}</td>
                                                                    <td>{fmtDuration(c.durationSeconds)}</td>
                                                                    <td>{fmtSmall$(c.hourlyRateUsd)}</td>
                                                                    <td><strong>{fmt$(c.totalUsd)}</strong></td>
                                                                </tr>
                                                            ))}
                                                            {svc.running && (
                                                                <tr className="dcp-current">
                                                                    <td>{(svc.cycleHistory || []).length + 1}</td>
                                                                    <td>{fmtTime(svc.cycleStartedAt)}</td>
                                                                    <td>—</td>
                                                                    <td>in progress</td>
                                                                    <td>{fmtSmall$(svc.hourlyRateUsd)}</td>
                                                                    <td><strong>{fmt$(svc.currentCycleUsd)}</strong></td>
                                                                </tr>
                                                            )}
                                                            {(svc.cycleHistory || []).length === 0 && !svc.running && (
                                                                <tr><td colSpan={6} className="dcp-empty">No cycles recorded.</td></tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const cssBlock = `
.dops-cycle-panel { display:flex; flex-direction:column; gap:14px; padding: 6px; }
.dcp-toolbar { display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background:#f8f9fc; border:1px solid #e6e9f0; border-radius:9px; }
.dcp-title { display:flex; align-items:center; gap:8px; }
.dcp-sub { color:#6b7280; font-size:12px; margin-left: 6px; }
.dcp-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px; cursor:pointer; color:#374151; }
.dcp-empty { text-align:center; padding:14px; color:#6b7280; font-size:13px; }
.dcp-projects { display:flex; flex-direction:column; gap:8px; }
.dcp-project { background:#fff; border:1px solid #e2e6ee; border-radius:9px; overflow:hidden; }
.dcp-head { width:100%; display:flex; align-items:center; justify-content:space-between; padding:11px 14px; background:#f8f9fc; border:none; cursor:pointer; font-size:14px; gap:10px; }
.dcp-head:hover { background:#eef1f7; }
.dcp-head-meta { display:flex; gap:10px; font-size:12px; color:#475569; }
.dcp-head-meta .mtd { color:#92400e; font-weight:600; display:inline-flex; gap:4px; align-items:center; }
.dcp-head-meta span { display:inline-flex; gap:4px; align-items:center; }
.dcp-cycles { padding:10px 14px 14px; }
.dcp-svc { background:#fafbfd; border:1px solid #eef1f6; border-radius:7px; padding:8px 12px; margin-bottom:8px; }
.dcp-svc-head { display:flex; align-items:center; gap:8px; padding-bottom:6px; border-bottom:1px dashed #e2e6ee; margin-bottom:6px; }
.dcp-pill { padding:1px 7px; border-radius:999px; background:#eef0f6; color:#475066; font-size:10px; font-weight:600; }
.dcp-pill.running { background:#dcfce7; color:#166534; }
.dcp-cycle-table { width:100%; border-collapse:collapse; font-size:12px; }
.dcp-cycle-table th { text-align:left; padding:5px 6px; color:#64748b; text-transform:uppercase; font-size:10px; border-bottom:1px solid #eef1f6; }
.dcp-cycle-table td { padding:5px 6px; border-bottom:1px dashed #eef1f6; }
.dcp-current td { background:#fffbeb; }
.grow { flex:1 1 auto; }
`;
