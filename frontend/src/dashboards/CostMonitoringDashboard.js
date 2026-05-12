import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    DollarSign,
    Play,
    Square,
    RefreshCw,
    TrendingUp,
    Share2,
    Clock,
    Filter,
    History,
    ChevronDown,
    ChevronRight,
    BarChart2,
} from "lucide-react";
import {
    getLiveCosts,
    getProjectBreakdown,
    getCostTimeline,
    setServiceCycle,
    forceTick,
} from "../services/costMonitoringService";
import FluctuationChart from "../components/FluctuationChart";
import { useToast } from "../services/ToastNotification";

/**
 * DevOps-only Cost Monitoring section.
 * Shows: totals across all projects, per-project breakdown, live cost
 * timeline per service (e.g. ingress $12.0 → $12.1 → $12.2), and
 * manual cycle controls (start / stop).
 */
export default function CostMonitoringDashboard() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [projectFilter, setProjectFilter] = useState("");
    const [selectedService, setSelectedService] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [projectBreakdown, setProjectBreakdown] = useState(null);
    const [priceUnit, setPriceUnit] = useState("monthly");
    const [showCycleHistory, setShowCycleHistory] = useState(false);
    const [showBreakdown, setShowBreakdown] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getLiveCosts();
            const d = Array.isArray(data) ? data : [];
            setRows(d);
            return d;
        } catch {
            toast.error("Failed to load cost data");
            return null;
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh every 30s while mounted
    useEffect(() => {
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [load]);

    const totals = useMemo(() => {
        const filtered = projectFilter
            ? rows.filter(r => r.projectId === projectFilter)
            : rows;
        const hourly = filtered.reduce((a, r) => a + (r.hourlyRateUsd ?? 0), 0);
        const cycle  = filtered.reduce((a, r) => a + (r.currentCycleUsd ?? 0), 0);
        const lifetime = filtered.reduce((a, r) => a + (r.lifetimeUsd ?? 0), 0);
        const running = filtered.filter(r => r.running).length;
        return {
            hourly, cycle, lifetime, running, total: filtered.length,
            projectedMonthly: hourly * 730,
        };
    }, [rows, projectFilter]);

    const projects = useMemo(() => {
        const map = new Map();
        rows.forEach(r => { if (r.projectId) map.set(r.projectId, r.projectName || r.projectId); });
        return Array.from(map.entries());
    }, [rows]);

    const filteredRows = projectFilter
        ? rows.filter(r => r.projectId === projectFilter)
        : rows;

    const loadTimeline = useCallback(async (row) => {
        setTimelineLoading(true);
        setTimeline([]);
        try {
            const data = await getCostTimeline({
                projectId: row.projectId,
                environment: row.environment,
                cloudServiceId: row.cloudServiceId,
            });
            setTimeline(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load cost timeline");
        } finally {
            setTimelineLoading(false);
        }
    }, [toast]);

    const selectService = async (row) => {
        setSelectedService(row);
        // Auto-expand history when there are completed cycles
        setShowCycleHistory(row.cycleHistory?.length > 0);
        loadTimeline(row);
        try {
            const br = await getProjectBreakdown({ projectId: row.projectId, environment: row.environment });
            setProjectBreakdown(br);
        } catch { /* non-fatal */ }
    };

    const toggleCycle = async (row) => {
        try {
            await setServiceCycle({
                projectId: row.projectId,
                environment: row.environment || "default",
                cloudServiceId: row.cloudServiceId,
                action: row.running ? "stop" : "start",
            });
            toast.success(row.running ? "Cycle stopped" : "Cycle started");
            const freshRows = await load();
            if (freshRows && selectedService?.cloudServiceId === row.cloudServiceId) {
                const updated = freshRows.find(
                    r => r.cloudServiceId === row.cloudServiceId && r.projectId === row.projectId
                );
                if (updated) {
                    setSelectedService(updated);
                    // Auto-expand history once a cycle is stopped (new entry added)
                    if (updated.cycleHistory?.length > 0) setShowCycleHistory(true);
                }
                loadTimeline(row);
            }
        } catch {
            toast.error("Cycle change failed");
        }
    };

    const handleTick = async () => {
        try {
            await forceTick();
            toast.success("Cost tick complete");
            load();
        } catch { toast.error("Tick failed"); }
    };

    const series = useMemo(() => [{
        key: "cost",
        label: selectedService ? `${selectedService.cloudServiceName} (USD)` : "USD",
        color: "#10b981",
        points: (timeline || []).map(p => ({ t: p.capturedAt, v: p.accumulatedUsd })),
    }], [timeline, selectedService]);

    return (
        <div className="cost-monitoring" style={{ display: "grid", gap: 16 }}>
            <header style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", background: "var(--panel-bg)",
                border: "1px solid var(--border-color)", borderRadius: 10,
            }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <DollarSign size={18} /> <strong>Cost Monitoring</strong>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        (DevOps only — real Azure retail prices, refreshed hourly)
                    </span>
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <Filter size={14} />
                        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
                            style={selectStyle}>
                            <option value="">All projects</option>
                            {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                    </div>
                    {/* Unit toggle */}
                    <div style={{ display: "flex", gap: 3 }}>
                        {["hourly","daily","monthly"].map(u => (
                            <button key={u} onClick={() => setPriceUnit(u)} style={{
                                padding: "3px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                                background: priceUnit === u ? "var(--accent-color,#3b82f6)" : "transparent",
                                color: priceUnit === u ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border-color)", fontWeight: 600,
                            }}>{u.charAt(0).toUpperCase() + u.slice(1)}</button>
                        ))}
                    </div>
                    <button style={iconBtn} onClick={handleTick} title="Force cost tick now">
                        <TrendingUp size={14} /> <span style={{ marginLeft: 4 }}>Tick</span>
                    </button>
                    <button style={iconBtn} onClick={load} disabled={loading}>
                        <RefreshCw size={14} className={loading ? "rm-spin" : ""} /> <span style={{ marginLeft: 4 }}>Refresh</span>
                    </button>
                </div>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <Kpi label="Running services" color="#3b82f6" value={`${totals.running} / ${totals.total}`} icon={<Clock size={16} />} />
                <Kpi label={priceUnit === "hourly" ? "Rate (hourly)" : priceUnit === "daily" ? "Rate (daily)" : "Rate (monthly)"}
                    color="#10b981"
                    value={priceUnit === "hourly" ? `$${totals.hourly.toFixed(4)}/h`
                        : priceUnit === "daily" ? `$${(totals.hourly * 24).toFixed(2)}/day`
                        : `$${totals.projectedMonthly.toFixed(2)}/mo`}
                    icon={<DollarSign size={16} />} />
                <Kpi label="Current cycle" color="#6366f1" value={`$${totals.cycle.toFixed(4)}`} icon={<Play size={16} />} />
                <Kpi label="Lifetime total" color="#ef4444" value={`$${totals.lifetime.toFixed(2)}`} icon={<DollarSign size={16} />} />
            </div>

            <section style={panel}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-color)" }}>
                    <strong>Live services</strong>
                </div>
                <div style={{ overflow: "auto" }}>
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={th}>Project</th>
                                <th style={th}>Service</th>
                                <th style={th}>Category</th>
                                <th style={th}>Env</th>
                                <th style={thRight}>Hourly (USD)</th>
                                <th style={thRight}>Cycle USD</th>
                                <th style={thRight}>Lifetime USD</th>
                                <th style={th}>State</th>
                                <th style={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                                    <div style={{ fontWeight: 500, marginBottom: 6 }}>No Azure resources to track</div>
                                    <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                                        This dashboard tracks <strong>project-owned Azure resources</strong> (CosmosDB, Service Bus, Azure SQL, etc.).<br />
                                        To see data: open <strong>Admin → Project config → Azure Resources tab</strong>, add a service and link an Azure price, then press <strong>Start</strong> here to begin cycle tracking.<br />
                                        For environment-level node cost, see the <strong>Cost Management</strong> tab.
                                    </div>
                                </td></tr>
                            )}
                            {filteredRows.map((r) => {
                                const isSelected = selectedService?.cloudServiceId === r.cloudServiceId && selectedService?.projectId === r.projectId;
                                return (
                                    <tr key={`${r.projectId}-${r.cloudServiceId}`}
                                        onClick={() => selectService(r)}
                                        style={{
                                            borderTop: "1px solid var(--border-color)",
                                            cursor: "pointer",
                                            background: isSelected ? "var(--active-bg, rgba(59,130,246,0.12))" : "transparent",
                                        }}>
                                        <td style={td}>{r.projectName || r.projectId}</td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>{r.cloudServiceName}</div>
                                            {r.shared && (
                                                <span style={sharedBadge}>
                                                    <Share2 size={10} /> shared · {(r.shareFraction * 100).toFixed(0)}%
                                                </span>
                                            )}
                                        </td>
                                        <td style={td}>{r.cloudCategory || "–"}</td>
                                        <td style={td}>{r.environment || "–"}</td>
                                        <td style={tdRight}>{r.hourlyRateUsd != null ? `$${r.hourlyRateUsd.toFixed(6)}` : "–"}</td>
                                        <td style={tdRight}>{r.currentCycleUsd != null ? `$${r.currentCycleUsd.toFixed(4)}` : "$0"}</td>
                                        <td style={tdRight}>{r.lifetimeUsd != null ? `$${r.lifetimeUsd.toFixed(2)}` : "$0"}</td>
                                        <td style={td}>
                                            <span style={{
                                                fontSize: 11, padding: "2px 8px", borderRadius: 10,
                                                background: r.running ? "#10b98120" : "rgba(128,128,128,0.18)",
                                                color: r.running ? "#10b981" : "var(--text-secondary)",
                                            }}>{r.running ? "running" : "idle"}</span>
                                        </td>
                                        <td style={td}>
                                            <button style={r.running ? dangerBtn : successBtn}
                                                onClick={(e) => { e.stopPropagation(); toggleCycle(r); }}>
                                                {r.running ? <Square size={11} /> : <Play size={11} />}
                                                <span style={{ marginLeft: 4 }}>{r.running ? "Stop" : "Start"}</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section style={panel}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-color)" }}>
                    <strong>{selectedService ? `${selectedService.cloudServiceName} — real-time timeline` : "Real-time cost timeline"}</strong>
                </div>
                <div style={{ padding: 14 }}>
                    {selectedService ? (
                        timelineLoading
                            ? <div style={{ color: "var(--text-secondary)" }}>Loading timeline…</div>
                            : (
                                <FluctuationChart
                                    series={series}
                                    yLabel="USD (cumulative)"
                                    formatV={(v) => v == null ? "–" : `$${Number(v).toFixed(4)}`}
                                    formatT={(iso) => new Date(iso).toLocaleString()}
                                    emptyHint="No cost samples yet for this service. Start a cycle to begin real-time tracking."
                                />
                            )
                    ) : (
                        <div style={{ color: "var(--text-secondary)" }}>Select a service row to see its real-time cost timeline.</div>
                    )}
                </div>
            </section>

            {/* Cycle History Panel */}
            {selectedService && (
                <section style={panel}>
                    <div style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border-color)",
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <History size={15} />
                        <strong>{selectedService.cloudServiceName} — cycle history</strong>
                        {selectedService.cycleHistory?.length > 0 && (
                            <span style={{ fontSize: 11, background: "#eff6ff", color: "#3b82f6",
                                padding: "1px 6px", borderRadius: 8, marginLeft: 4 }}>
                                {selectedService.cycleHistory.length} completed
                            </span>
                        )}
                        {selectedService.running && (
                            <span style={{ fontSize: 11, background: "#10b98120", color: "#10b981",
                                padding: "1px 6px", borderRadius: 8, marginLeft: 2, fontWeight: 600 }}>
                                ▲ running now
                            </span>
                        )}
                    </div>

                    {/* Always show bar chart when there are completed cycles */}
                    {selectedService.cycleHistory?.length > 0 && (
                        <CycleBarChart
                            cycles={selectedService.cycleHistory}
                            runningNow={selectedService.running}
                            currentCycleUsd={selectedService.currentCycleUsd}
                        />
                    )}

                    {!selectedService.cycleHistory?.length && !selectedService.running && (
                        <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                            No completed cycles yet. Start a cycle, let it run, then stop it — it will appear here.
                        </div>
                    )}

                    {!selectedService.cycleHistory?.length && selectedService.running && (
                        <div style={{ padding: "10px 14px", fontSize: 13, color: "#10b981", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>▲</span> Cycle running — bar will appear after you stop it.
                        </div>
                    )}

                    {/* Collapsible detail table — only when there's history */}
                    {selectedService.cycleHistory?.length > 0 && (
                        <>
                            <button onClick={() => setShowCycleHistory(v => !v)} style={{
                                width: "100%", textAlign: "left", padding: "8px 14px",
                                borderTop: "1px solid var(--border-color)",
                                background: "transparent", border: "none", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 6,
                                color: "var(--text-secondary)", fontSize: 12,
                            }}>
                                {showCycleHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                {showCycleHistory ? "Hide" : "Show"} details
                            </button>
                            {showCycleHistory && (
                                <div style={{ overflow: "auto", borderTop: "1px solid var(--border-color)" }}>
                                    <table style={tableStyle}>
                                        <thead>
                                            <tr>
                                                <th style={th}>#</th>
                                                <th style={th}>Started</th>
                                                <th style={th}>Ended</th>
                                                <th style={th}>Duration</th>
                                                <th style={thRight}>Rate (USD/h)</th>
                                                <th style={thRight}>Total USD</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...selectedService.cycleHistory].reverse().map((c, i) => {
                                                const dur = c.durationSeconds ?? 0;
                                                const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60), s = dur % 60;
                                                const durStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
                                                return (
                                                    <tr key={i} style={{ borderTop: "1px solid var(--border-color)" }}>
                                                        <td style={td}>{selectedService.cycleHistory.length - i}</td>
                                                        <td style={td}>{c.startedAt ? new Date(c.startedAt).toLocaleString() : "–"}</td>
                                                        <td style={td}>{c.endedAt ? new Date(c.endedAt).toLocaleString() : "–"}</td>
                                                        <td style={td}>{durStr}</td>
                                                        <td style={tdRight}>{c.hourlyRateUsd != null ? `$${c.hourlyRateUsd.toFixed(6)}` : "–"}</td>
                                                        <td style={{ ...tdRight, fontWeight: 600, color: "#10b981" }}>
                                                            {c.totalUsd != null ? `$${c.totalUsd.toFixed(4)}` : "–"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}

            {/* Price Breakdown Table */}
            {projectBreakdown && projectBreakdown.services?.length > 0 && (
                <section style={panel}>
                    <button onClick={() => setShowBreakdown(v => !v)} style={{
                        width: "100%", textAlign: "left", padding: "10px 14px",
                        borderBottom: showBreakdown ? "1px solid var(--border-color)" : "none",
                        background: "transparent", border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)",
                    }}>
                        {showBreakdown ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <BarChart2 size={15} />
                        <strong>{projectBreakdown.projectName} — price breakdown</strong>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 4 }}>
                            (real Azure Retail Pricing API)
                        </span>
                    </button>
                    {showBreakdown && (
                        <>
                        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                            <Kpi label="Hourly" color="#10b981" value={`$${(projectBreakdown.hourlyTotalUsd ?? 0).toFixed(4)}/h`} icon={<DollarSign size={14} />} />
                            <Kpi label="Daily" color="#f59e0b" value={`$${((projectBreakdown.hourlyTotalUsd ?? 0) * 24).toFixed(2)}/day`} icon={<TrendingUp size={14} />} />
                            <Kpi label="Projected month" color="#6366f1" value={`$${(projectBreakdown.projectedMonthlyUsd ?? 0).toFixed(2)}/mo`} icon={<TrendingUp size={14} />} />
                            <Kpi label="Lifetime" color="#ef4444" value={`$${(projectBreakdown.lifetimeTotalUsd ?? 0).toFixed(2)}`} icon={<DollarSign size={14} />} />
                        </div>
                        <div style={{ overflow: "auto", borderTop: "1px solid var(--border-color)" }}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={th}>Category</th>
                                        <th style={th}>Service</th>
                                        <th style={th}>SKU / Region</th>
                                        <th style={thRight}>Hourly (USD)</th>
                                        <th style={thRight}>Daily (USD)</th>
                                        <th style={thRight}>Monthly (USD)</th>
                                        <th style={th}>State</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projectBreakdown.services.map(svc => (
                                        <tr key={svc.cloudServiceId} style={{ borderTop: "1px solid var(--border-color)" }}>
                                            <td style={td}>{svc.cloudCategory || "–"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 500 }}>{svc.cloudServiceName}</div>
                                                {svc.azureProductName && (
                                                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                                                        {svc.azureProductName}
                                                    </div>
                                                )}
                                                {svc.shared && (
                                                    <span style={{ fontSize: 10, background: "#fef3c7", color: "#d97706",
                                                        padding: "1px 5px", borderRadius: 4, display: "inline-block", marginTop: 2 }}>
                                                        shared · {((svc.shareFraction ?? 1) * 100).toFixed(0)}%
                                                    </span>
                                                )}
                                            </td>
                                            <td style={td}>
                                                {svc.azureSkuName && <span>{svc.azureSkuName}</span>}
                                                {svc.azureArmRegionName && (
                                                    <span style={{ color: "var(--text-secondary)", marginLeft: 4 }}>
                                                        ({svc.azureArmRegionName})
                                                    </span>
                                                )}
                                                {!svc.azureSkuName && <span style={{ color: "var(--text-secondary)" }}>–</span>}
                                            </td>
                                            <td style={tdRight}>
                                                {svc.hourlyRateUsd != null ? `$${svc.hourlyRateUsd.toFixed(6)}` : "–"}
                                            </td>
                                            <td style={tdRight}>
                                                {svc.hourlyRateUsd != null ? `$${(svc.hourlyRateUsd * 24).toFixed(4)}` : "–"}
                                            </td>
                                            <td style={{ ...tdRight, fontWeight: 600, color: "#10b981" }}>
                                                {svc.monthlyRateUsd != null ? `$${svc.monthlyRateUsd.toFixed(2)}` : "–"}
                                            </td>
                                            <td style={td}>
                                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10,
                                                    background: svc.running ? "#10b98120" : "rgba(128,128,128,0.18)",
                                                    color: svc.running ? "#10b981" : "var(--text-secondary)" }}>
                                                    {svc.running ? "running" : "idle"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Total row */}
                                    <tr style={{ borderTop: "2px solid var(--border-color)", background: "var(--panel-bg-alt,rgba(0,0,0,0.04))" }}>
                                        <td style={td} colSpan={3}><strong>Total</strong></td>
                                        <td style={tdRight}><strong>${(projectBreakdown.hourlyTotalUsd ?? 0).toFixed(6)}</strong></td>
                                        <td style={tdRight}><strong>${((projectBreakdown.hourlyTotalUsd ?? 0) * 24).toFixed(4)}</strong></td>
                                        <td style={{ ...tdRight, fontWeight: 700, color: "#10b981", fontSize: 14 }}>
                                            ${(projectBreakdown.projectedMonthlyUsd ?? 0).toFixed(2)}
                                        </td>
                                        <td style={td} />
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </section>
            )}

            <style>{`
                .rm-spin { animation: rm-spin 1s linear infinite; }
                @keyframes rm-spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

function CycleBarChart({ cycles, runningNow, currentCycleUsd }) {
    if (!cycles?.length) return null;
    const liveCost = runningNow ? (currentCycleUsd || 0) : 0;
    const maxUsd = Math.max(...cycles.map(c => c.totalUsd || 0), liveCost, 0.0001);
    return (
        <div style={{ padding: "14px 14px 4px", borderBottom: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                Cost per cycle (USD)
                {runningNow && (
                    <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                        ▲ current cycle running
                    </span>
                )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, paddingBottom: 4 }}>
                {cycles.map((c, i) => {
                    const pct = Math.max(6, ((c.totalUsd || 0) / maxUsd) * 100);
                    const dur = c.durationSeconds ?? 0;
                    const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60);
                    const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                    return (
                        <div key={i} title={`Cycle ${i + 1}: $${(c.totalUsd || 0).toFixed(4)} · ${durStr}`}
                            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                            <div style={{ fontSize: 9, color: "#10b981", fontWeight: 600 }}>
                                ${(c.totalUsd || 0).toFixed(3)}
                            </div>
                            <div style={{
                                width: "100%", height: `${pct}%`,
                                background: "linear-gradient(to top, #10b981, #34d399)",
                                borderRadius: "3px 3px 0 0", minHeight: 4,
                                transition: "height 0.3s",
                            }} />
                            <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>{i + 1}</div>
                        </div>
                    );
                })}
                {/* Live bar for currently running cycle */}
                {runningNow && (
                    <div title={`Current cycle (running): $${liveCost.toFixed(4)}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                        <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>
                            ${liveCost.toFixed(3)}
                        </div>
                        <div style={{
                            width: "100%", height: `${Math.max(6, (liveCost / maxUsd) * 100)}%`,
                            background: "linear-gradient(to top, #f59e0b, #fbbf24)",
                            borderRadius: "3px 3px 0 0", minHeight: 4,
                            animation: "pulse-bar 1.5s ease-in-out infinite",
                        }} />
                        <div style={{ fontSize: 9, color: "#f59e0b" }}>▲</div>
                    </div>
                )}
            </div>
            <style>{`@keyframes pulse-bar { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
        </div>
    );
}

function Kpi({ label, value, icon, color }) {
    return (
        <div style={{
            padding: "12px 14px", borderRadius: 8,
            background: "var(--panel-bg)", border: "1px solid var(--border-color)",
            display: "flex", gap: 10, alignItems: "center",
        }}>
            <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${color}20`, color,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{icon}</span>
            <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
            </div>
        </div>
    );
}

const panel = {
    background: "var(--panel-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: 10, overflow: "hidden",
};
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 500, background: "var(--panel-bg-alt, rgba(0,0,0,0.04))" };
const thRight = { ...th, textAlign: "right" };
const td = { padding: "8px 10px", verticalAlign: "middle" };
const tdRight = { ...td, textAlign: "right", fontFeatureSettings: "'tnum' 1" };
const iconBtn = {
    display: "inline-flex", alignItems: "center",
    padding: "5px 9px", border: "1px solid var(--border-color)",
    borderRadius: 4, background: "transparent", color: "var(--text-primary)",
    fontSize: 12, cursor: "pointer",
};
const successBtn = { ...iconBtn, background: "#10b981", color: "#fff", border: "none" };
const dangerBtn = { ...iconBtn, background: "#ef4444", color: "#fff", border: "none" };
const selectStyle = {
    fontSize: 12, padding: "4px 8px", borderRadius: 4,
    border: "1px solid var(--border-color)",
    background: "var(--panel-bg)", color: "var(--text-primary)",
};
const sharedBadge = {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 10, padding: "1px 6px", borderRadius: 8,
    background: "#f59e0b20", color: "#f59e0b", marginTop: 2,
};
