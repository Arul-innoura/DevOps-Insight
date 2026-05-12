/**
 * ClusterCostDashboard — multi-page container for the Prometheus-driven
 * live cluster cost feature.
 *
 * Owns all shared state (env, snapshot, time-series, filters, derived data)
 * and routes between 5 dedicated pages via an in-app tab navigation.
 * Page components live in Cc*Page.js files in the same directory.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Activity, RefreshCw, Info, AlertTriangle, ToggleLeft, ToggleRight,
    DollarSign, Clock, TrendingUp, Server, Cpu, Database, Layers,
    HardDrive, Settings, FolderKanban, LineChart, ChevronRight, ChevronDown,
    Package, Network, Lock, Zap, Box, CheckCircle2, XCircle,
} from "lucide-react";
import {
    getPrometheusEnvs, getPrometheusLive, getPrometheusMetrics, getPrometheusTimeseries,
} from "../../services/billingService";
import CcOverviewPage    from "./CcOverviewPage";
import CcSystemPage      from "./CcSystemPage";
import CcProjectsPage    from "./CcProjectsPage";
import CcResourcesPage   from "./CcResourcesPage";
import CcCostHistoryPage from "./CcCostHistoryPage";

// ── shared formatters ────────────────────────────────────────────────────────
export const fmt$      = (v) => (v == null || isNaN(v)) ? "$0.00" : `$${Number(v).toFixed(2)}`;
export const fmt$Tiny  = (v) => (v == null || isNaN(v)) ? "$0.0000" : `$${Number(v).toFixed(4)}`;
export const fmtNum    = (v, d = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);
export const fmtPct    = (v) => (v == null || isNaN(v)) ? "—" : `${Number(v).toFixed(1)}%`;
export const fmtBytes  = (b) => {
    if (!b || isNaN(b)) return "—";
    if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b > 1e6) return `${(b / 1e6).toFixed(2)} MB`;
    if (b > 1e3) return `${(b / 1e3).toFixed(2)} KB`;
    return `${b.toFixed(0)} B`;
};
export const fmtDuration = (sec) => {
    if (!sec || sec < 0) return "—";
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};
export const shortImage = (image) => { if (!image) return ""; const p = image.split("/"); return p[p.length - 1]; };
export const shortNode  = (name)  => { if (!name) return ""; if (name.length <= 28) return name; return name.slice(0, 12) + "…" + name.slice(-12); };
export const matchClass = (m) => {
    if (m === "exact" || m === "exact-spot") return "ok";
    if (m === "exact-spot-proxy" || m === "fuzzy-cores-mem" || m === "fuzzy-spot") return "warn";
    return "bad";
};

// ── shared micro-components ──────────────────────────────────────────────────
export const Stat = React.memo(function Stat({ label, value, icon, accent = "", title }) {
    return (
        <div className={`pcp-stat ${accent}`} title={title}>
            <div className="pcp-stat-label">{icon} {label}</div>
            <div className="pcp-stat-value">{value}</div>
        </div>
    );
});

export const Mini = React.memo(function Mini({ label, value, accent = "" }) {
    return (
        <div className={`pcp-mini ${accent}`}>
            <div className="pcp-mini-label">{label}</div>
            <div className="pcp-mini-value">{value}</div>
        </div>
    );
});

export function TopList({ title, rows, unit }) {
    return (
        <div className="pcp-toplist">
            <div className="pcp-toplist-title">{title}</div>
            {!rows?.length ? <div className="pcp-empty">—</div> : (
                <ol>
                    {rows.map((r, i) => (
                        <li key={`${r.namespace}/${r.name}/${i}`}>
                            <span className="pcp-tl-name" title={`${r.namespace}/${r.name}`}>
                                <strong>{r.name}</strong>
                                <span className="pcp-tl-ns">{r.namespace}</span>
                            </span>
                            <span className="pcp-tl-val">{fmtNum(r.value, 2)} {unit}</span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

// ── constants ────────────────────────────────────────────────────────────────
const REFRESH_MS = 30_000;

const PAGES = [
    { id: "overview",   label: "Overview",      Icon: Activity,      color: "#0f172a" },
    { id: "system",     label: "System",         Icon: Settings,      color: "#8b5cf6" },
    { id: "projects",   label: "Projects",       Icon: FolderKanban,  color: "#10b981" },
    { id: "resources",  label: "Resources",      Icon: Cpu,           color: "#f97316" },
    { id: "cost",       label: "Cost Analysis",  Icon: LineChart,     color: "#3b82f6" },
];

// ── main component ───────────────────────────────────────────────────────────
export default function ClusterCostDashboard({ embedded = false }) {
    // ── env / snapshot state ──────────────────────────────────────────────
    const [envs,       setEnvs]       = useState([]);
    const [env,        setEnv]        = useState("");
    const [snapshot,   setSnapshot]   = useState(null);
    const [metrics,    setMetrics]    = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState("");
    const [mode,       setMode]       = useState("live");   // "live" | "fixed"
    const [showAudit,  setShowAudit]  = useState(false);
    const [activePage, setActivePage] = useState("overview");
    const intervalRef = useRef(null);

    // ── time-series filter state ──────────────────────────────────────────
    const [tsMode,        setTsMode]        = useState("live");
    const [tsLiveWindow,  setTsLiveWindow]  = useState("60m");
    const [tsDate,        setTsDate]        = useState("");
    const [tsMonth,       setTsMonth]       = useState("");
    const [tsYear,        setTsYear]        = useState("");
    const [tsCustomFrom,  setTsCustomFrom]  = useState("");
    const [tsCustomTo,    setTsCustomTo]    = useState("");
    const [tsGranularity, setTsGranularity] = useState("auto");
    const [tsPoints,      setTsPoints]      = useState([]);
    const [tsLoading,     setTsLoading]     = useState(false);
    const [tsError,       setTsError]       = useState("");

    // ── system / workload classification ─────────────────────────────────
    const SYSTEM_NS_EXACT = useMemo(() => new Set([
        "default", "monitoring", "ingress-nginx", "cert-manager", "linkerd",
        "istio-system", "external-dns", "metallb-system", "traefik", "keda",
        "argocd", "argo", "velero", "prometheus", "fluent-bit", "datadog",
        "vault", "consul",
    ]), []);
    const SYSTEM_NS_PREFIX = useMemo(() => [
        "kube-", "gatekeeper-", "calico-", "tigera-", "open-policy-",
        "cert-manager-", "linkerd-", "istio-",
    ], []);
    const isSystemNs = useCallback((name) => {
        if (!name) return true;
        if (SYSTEM_NS_EXACT.has(name)) return true;
        return SYSTEM_NS_PREFIX.some(p => name.startsWith(p));
    }, [SYSTEM_NS_EXACT, SYSTEM_NS_PREFIX]);
    const projectGroupKey = useCallback((ns) => {
        if (ns.matchedProjectName) return ns.matchedProjectName;
        const dash = ns.namespace.indexOf("-");
        if (dash > 0) return ns.namespace.slice(0, dash).toUpperCase();
        return ns.namespace;
    }, []);

    // ── derived namespace data ────────────────────────────────────────────
    const { systemNs, workloadNs, projectGroups, totalSystemHourly, totalWorkloadHourly } = useMemo(() => {
        const all  = snapshot?.namespaces || [];
        const sys  = all.filter(n =>  isSystemNs(n.namespace));
        const work = all.filter(n => !isSystemNs(n.namespace));
        const groups = new Map();
        for (const ns of work) {
            const k = projectGroupKey(ns);
            if (!groups.has(k)) groups.set(k, { key: k, namespaces: [], hourly: 0, mtd: 0, cumulative: 0, podCount: 0, microserviceCount: 0, cpuUsed: 0, cpuReq: 0, memUsed: 0, memReq: 0 });
            const g = groups.get(k);
            g.namespaces.push(ns);
            g.hourly          += ns.smoothedHourlyUsd ?? ns.hourlyRateUsd ?? 0;
            g.mtd             += ns.monthToDateUsd    || 0;
            g.cumulative      += ns.cumulativeUsd     || 0;
            g.podCount        += ns.podCount          || 0;
            g.microserviceCount += ns.microserviceCount || 0;
            g.cpuUsed         += ns.cpuCores          || 0;
            g.cpuReq          += ns.cpuRequestCores   || 0;
            g.memUsed         += ns.memoryGb          || 0;
            g.memReq          += ns.memoryRequestGb   || 0;
        }
        const arr       = [...groups.values()].sort((a, b) => b.hourly - a.hourly);
        const sysTotal  = sys.reduce((s, n)  => s + (n.smoothedHourlyUsd ?? n.hourlyRateUsd ?? 0), 0);
        const workTotal = work.reduce((s, n) => s + (n.smoothedHourlyUsd ?? n.hourlyRateUsd ?? 0), 0);
        return { systemNs: sys, workloadNs: work, projectGroups: arr, totalSystemHourly: sysTotal, totalWorkloadHourly: workTotal };
    }, [snapshot, isSystemNs, projectGroupKey]);

    // ── top-line totals ───────────────────────────────────────────────────
    const totals = useMemo(() => {
        const hourly = snapshot?.smoothedHourlyUsd ?? snapshot?.totalHourlyUsd ?? 0;
        return {
            hourly,
            daily:     snapshot?.dailyEstUsd    ?? hourly * 24,
            monthly:   snapshot?.monthlyEstUsd  ?? hourly * 730,
            thisMonth: snapshot?.monthToDateUsd || 0,
            lifetime:  snapshot?.cumulativeUsd  || 0,
        };
    }, [snapshot]);

    // ── filter window → (from, to, suggested granularity) ────────────────
    const tsWindow = useMemo(() => {
        const now = new Date();
        switch (tsMode) {
            case "live": {
                const to = new Date(now), from = new Date(now);
                let suggested = "minute";
                switch (tsLiveWindow) {
                    case "30m": from.setMinutes(from.getMinutes() - 30);  suggested = "minute"; break;
                    case "6h":  from.setHours(from.getHours() - 6);       suggested = "minute"; break;
                    case "24h": from.setHours(from.getHours() - 24);      suggested = "hour";   break;
                    case "7d":  from.setDate(from.getDate() - 7);         suggested = "hour";   break;
                    default:    from.setMinutes(from.getMinutes() - 60);  suggested = "minute"; break;
                }
                return { from: from.toISOString(), to: to.toISOString(), suggested };
            }
            case "date": {
                if (!tsDate) return null;
                const [y, m, d] = tsDate.split("-").map(Number);
                if (!y || !m || !d) return null;
                return { from: new Date(y, m-1, d, 0, 0, 0, 0).toISOString(), to: new Date(y, m-1, d, 23, 59, 59, 999).toISOString(), suggested: "hour" };
            }
            case "month": {
                if (!tsMonth) return null;
                const [y, m] = tsMonth.split("-").map(Number);
                if (!y || !m) return null;
                return { from: new Date(y, m-1, 1, 0, 0, 0, 0).toISOString(), to: new Date(y, m, 0, 23, 59, 59, 999).toISOString(), suggested: "day" };
            }
            case "year": {
                const y = Number(tsYear);
                if (!y) return null;
                return { from: new Date(y, 0, 1, 0, 0, 0, 0).toISOString(), to: new Date(y, 11, 31, 23, 59, 59, 999).toISOString(), suggested: "month" };
            }
            case "range": {
                const f = tsCustomFrom ? new Date(tsCustomFrom) : null;
                const t = tsCustomTo   ? new Date(tsCustomTo)   : null;
                if (!f || !t || isNaN(f) || isNaN(t)) return null;
                const days = (t - f) / 86400000;
                const suggested = days <= 1 ? "minute" : days <= 14 ? "hour" : days <= 90 ? "day" : "month";
                return { from: f.toISOString(), to: t.toISOString(), suggested };
            }
            default: return null;
        }
    }, [tsMode, tsLiveWindow, tsDate, tsMonth, tsYear, tsCustomFrom, tsCustomTo]);

    const effectiveGranularity = tsGranularity === "auto" ? (tsWindow?.suggested || "hour") : tsGranularity;

    // ── derived time-series ───────────────────────────────────────────────
    const tsTotalSeries         = useMemo(() => tsPoints.map(p => ({ t: p.t, value: p.smoothedHourlyUsd || p.totalHourlyUsd || 0 })), [tsPoints]);
    const tsCpuUsedSeries       = useMemo(() => tsPoints.map(p => ({ t: p.t, value: p.usedCpuCores  || 0 })), [tsPoints]);
    const tsCpuTotalSeries      = useMemo(() => tsPoints.map(p => ({ t: p.t, value: p.totalCpuCores || 0 })), [tsPoints]);
    const tsMemUsedSeries       = useMemo(() => tsPoints.map(p => ({ t: p.t, value: p.usedMemoryGb  || 0 })), [tsPoints]);
    const tsMemTotalSeries      = useMemo(() => tsPoints.map(p => ({ t: p.t, value: p.totalMemoryGb || 0 })), [tsPoints]);
    const tsSystemTotalSeries   = useMemo(() => tsPoints.map(p => {
        const v = (p.namespaces || []).filter(n => isSystemNs(n.namespace)).reduce((s, n) => s + (n.hourlyUsd || 0), 0);
        return { t: p.t, value: v };
    }), [tsPoints, isSystemNs]);
    const tsWorkloadTotalSeries = useMemo(() => tsPoints.map(p => {
        const v = (p.namespaces || []).filter(n => !isSystemNs(n.namespace)).reduce((s, n) => s + (n.hourlyUsd || 0), 0);
        return { t: p.t, value: v };
    }), [tsPoints, isSystemNs]);
    const tsTopProjectSeries    = useMemo(() => {
        if (!tsPoints.length) return [];
        const projTotal = new Map();
        for (const p of tsPoints) {
            for (const nl of (p.namespaces || [])) {
                if (isSystemNs(nl.namespace)) continue;
                const k = nl.matchedProjectName
                    || (nl.namespace.indexOf("-") > 0 ? nl.namespace.slice(0, nl.namespace.indexOf("-")).toUpperCase() : nl.namespace);
                projTotal.set(k, (projTotal.get(k) || 0) + (nl.hourlyUsd || 0));
            }
        }
        const top     = [...projTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
        const palette = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444"];
        return top.map((projKey, i) => ({
            key: projKey, label: projKey, color: palette[i % palette.length],
            points: tsPoints.map(p => {
                const rows = (p.namespaces || []).filter(nl => {
                    if (isSystemNs(nl.namespace)) return false;
                    const k = nl.matchedProjectName
                        || (nl.namespace.indexOf("-") > 0 ? nl.namespace.slice(0, nl.namespace.indexOf("-")).toUpperCase() : nl.namespace);
                    return k === projKey;
                });
                return { t: p.t, value: rows.reduce((s, n) => s + (n.hourlyUsd || 0), 0) };
            }),
        }));
    }, [tsPoints, isSystemNs]);

    // ── data loading ──────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        getPrometheusEnvs()
            .then(d => {
                if (cancelled) return;
                const list = Array.isArray(d?.envs) ? d.envs : [];
                setEnvs(list);
                if (list.length && !env) setEnv(list[0]);
                if (!list.length) { setError("No Prometheus endpoints configured."); setLoading(false); }
            })
            .catch(e => { if (!cancelled) { setError(`Failed to load envs: ${e?.message || e}`); setLoading(false); } });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pullSnapshot = useCallback(async () => {
        if (!env) return;
        setRefreshing(true);
        try {
            const [snap, met] = await Promise.all([getPrometheusLive(env), getPrometheusMetrics(env)]);
            setSnapshot((prev) => {
                if (!snap) return prev;
                if (!prev || prev.env !== snap.env) return snap;
                const newHourly  = snap.smoothedHourlyUsd  || snap.totalHourlyUsd || 0;
                const prevHourly = prev.smoothedHourlyUsd  || prev.totalHourlyUsd || 0;
                if ((snap.prometheusReachable === false || newHourly === 0) && prevHourly > 0)
                    return { ...prev, capturedAt: snap.capturedAt, diagnostics: snap.diagnostics || prev.diagnostics };
                return {
                    ...snap,
                    cluster:       snap.cluster       ?? prev.cluster,
                    inventory:     snap.inventory     ?? prev.inventory,
                    nodes:         (snap.nodes?.length        > 0) ? snap.nodes        : (prev.nodes?.length        > 0 ? prev.nodes        : snap.nodes),
                    namespaces:    (snap.namespaces?.length   > 0) ? snap.namespaces   : (prev.namespaces?.length   > 0 ? prev.namespaces   : snap.namespaces),
                    cloudServices: (snap.cloudServices?.length > 0) ? snap.cloudServices : (prev.cloudServices?.length > 0 ? prev.cloudServices : snap.cloudServices),
                };
            });
            if (met) setMetrics(met);
            setError("");
        } catch (e) {
            setError(`Refresh failed (keeping last snapshot): ${e?.message || e}`);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [env]);

    useEffect(() => {
        if (!env) return;
        if (!snapshot || snapshot.env !== env) setLoading(true);
        void pullSnapshot();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => void pullSnapshot(), REFRESH_MS);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [env, pullSnapshot]);

    useEffect(() => {
        if (!env || !tsWindow) { setTsPoints([]); return; }
        let cancelled = false;
        setTsLoading(true); setTsError("");
        getPrometheusTimeseries(env, tsWindow.from, tsWindow.to, effectiveGranularity)
            .then(d => { if (!cancelled) setTsPoints(Array.isArray(d?.points) ? d.points : []); })
            .catch(e => { if (!cancelled) setTsError(e?.message || String(e)); })
            .finally(() => { if (!cancelled) setTsLoading(false); });
        return () => { cancelled = true; };
    }, [env, tsWindow, effectiveGranularity, snapshot?.capturedAt]);

    // ── build context object passed to all pages ──────────────────────────
    const ctx = useMemo(() => ({
        env, envs, snapshot, metrics, loading, refreshing, error,
        pullSnapshot, mode, setMode, showAudit, setShowAudit,
        tsMode, setTsMode, tsLiveWindow, setTsLiveWindow,
        tsDate, setTsDate, tsMonth, setTsMonth, tsYear, setTsYear,
        tsCustomFrom, setTsCustomFrom, tsCustomTo, setTsCustomTo,
        tsGranularity, setTsGranularity, effectiveGranularity, tsWindow,
        tsPoints, tsLoading, tsError,
        systemNs, workloadNs, projectGroups, totalSystemHourly, totalWorkloadHourly,
        totals, isSystemNs,
        tsTotalSeries, tsCpuUsedSeries, tsCpuTotalSeries,
        tsMemUsedSeries, tsMemTotalSeries,
        tsSystemTotalSeries, tsWorkloadTotalSeries, tsTopProjectSeries,
    }), [
        env, envs, snapshot, metrics, loading, refreshing, error,
        pullSnapshot, mode, setMode, showAudit, setShowAudit,
        tsMode, tsLiveWindow, tsDate, tsMonth, tsYear, tsCustomFrom, tsCustomTo,
        tsGranularity, effectiveGranularity, tsWindow,
        tsPoints, tsLoading, tsError,
        systemNs, workloadNs, projectGroups, totalSystemHourly, totalWorkloadHourly,
        totals, isSystemNs,
        tsTotalSeries, tsCpuUsedSeries, tsCpuTotalSeries,
        tsMemUsedSeries, tsMemTotalSeries,
        tsSystemTotalSeries, tsWorkloadTotalSeries, tsTopProjectSeries,
    ]);

    const reachable = !!snapshot?.prometheusReachable || (snapshot?.namespaces?.length > 0);
    const isStale   = snapshot?.diagnostics?.warnings?.some(w => w.startsWith("[STALE"));

    return (
        <div className={`ccd-shell ${embedded ? "embedded" : ""}`}>
            <style>{CSS_BLOCK}</style>

            {/* ── Global header ── */}
            <div className="ccd-header">
                <div className="ccd-header-left">
                    <Activity size={18} className="ccd-header-icon" />
                    <strong className="ccd-header-title">Live Cluster Cost</strong>
                    <span className="ccd-header-sub">Prometheus · Azure Retail Pricing · auto-refresh 30 s</span>
                    {refreshing && <span className="ccd-badge updating">Updating…</span>}
                    {!refreshing && isStale && <span className="ccd-badge stale">Stale data</span>}
                </div>
                <div className="ccd-header-right">
                    <button className={`pcp-mode ${mode === "fixed" ? "on" : ""}`}
                            onClick={() => setMode(mode === "fixed" ? "live" : "fixed")}
                            title={mode === "fixed" ? "Showing fixed inventory view. Click for live workload." : "Showing live workload view. Click for fixed inventory."}>
                        {mode === "fixed" ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {mode === "fixed" ? "Fixed cost" : "Live usage"}
                    </button>
                    {envs.length > 0 && (
                        <select className="pcp-env" value={env} onChange={e => setEnv(e.target.value)}>
                            {envs.map(e => <option key={e} value={e}>{e.toUpperCase()}</option>)}
                        </select>
                    )}
                    <button className="pcp-btn" onClick={() => pullSnapshot()} disabled={refreshing || !env}>
                        <RefreshCw size={14} className={refreshing ? "spin" : ""} />
                        {refreshing ? "…" : "Refresh"}
                    </button>
                    <button className={`pcp-btn ${showAudit ? "pcp-btn-active" : ""}`}
                            onClick={() => setShowAudit(v => !v)}
                            title="Toggle full pricing audit — every Azure price fetched and the exact formula per cost line">
                        <Info size={14} />
                        {showAudit ? "Hide audit" : "Audit"}
                    </button>
                </div>
            </div>

            {error && <div className="pcp-warn" style={{ margin: "0 0 4px" }}>{error}</div>}

            {/* ── Page navigation tabs ── */}
            <div className="ccd-nav">
                {PAGES.map(({ id, label, Icon, color }) => (
                    <button key={id}
                            className={`ccd-nav-btn ${activePage === id ? "active" : ""}`}
                            style={activePage === id ? { color, borderBottomColor: color, background: `${color}10` } : {}}
                            onClick={() => setActivePage(id)}>
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Page content ── */}
            {loading && !snapshot ? (
                <div className="pcp-empty">Loading live cluster snapshot…</div>
            ) : !reachable && activePage !== "cost" ? (
                <div className="pcp-empty">
                    <AlertTriangle size={16} />
                    Prometheus endpoint for <strong>{env || "—"}</strong> not reachable or returned no metrics.
                </div>
            ) : (
                <div className="ccd-page">
                    {activePage === "overview"  && <CcOverviewPage    ctx={ctx} />}
                    {activePage === "system"    && <CcSystemPage      ctx={ctx} />}
                    {activePage === "projects"  && <CcProjectsPage    ctx={ctx} />}
                    {activePage === "resources" && <CcResourcesPage   ctx={ctx} />}
                    {activePage === "cost"      && <CcCostHistoryPage ctx={ctx} />}
                </div>
            )}
        </div>
    );
}

// ── CSS ──────────────────────────────────────────────────────────────────────
const CSS_BLOCK = `
/* === Shell === */
.ccd-shell { display:flex; flex-direction:column; gap:12px; padding:6px; }
.ccd-shell.embedded { padding:0; }

/* === Header === */
.ccd-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;
  padding:10px 14px; background:#fff; border:1px solid #e2e6ee; border-radius:10px; }
.ccd-header-left  { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ccd-header-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ccd-header-icon  { color:#0f172a; flex-shrink:0; }
.ccd-header-title { font-size:15px; font-weight:700; color:#0f172a; }
.ccd-header-sub   { font-size:11px; color:#6b7280; }
.ccd-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px;
  font-size:10px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; }
.ccd-badge.updating { background:#dbeafe; color:#1d4ed8; animation: pcp-pulse 1.6s ease-in-out infinite; }
.ccd-badge.stale    { background:#fef3c7; color:#92400e; border:1px solid #fde68a; }

/* === Nav tabs === */
.ccd-nav { display:flex; flex-wrap:wrap; gap:4px; padding:6px 8px;
  background:#f8fafc; border:1px solid #e2e6ee; border-radius:10px; }
.ccd-nav-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 16px;
  background:transparent; border:1px solid transparent; border-bottom:2px solid transparent;
  border-radius:7px; font-size:13px; font-weight:600; color:#64748b; cursor:pointer;
  transition: all 150ms ease; white-space:nowrap; }
.ccd-nav-btn:hover { background:#eef1f6; color:#374151; }
.ccd-nav-btn.active { font-weight:700; }

/* === Page wrapper === */
.ccd-page { display:flex; flex-direction:column; gap:14px; }

/* === Shared section card === */
.pcp-section { background:#fff; border:1px solid #e2e6ee; border-radius:10px; padding:14px 16px; }
.pcp-section-title { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700;
  color:#1f2937; margin-bottom:12px; flex-wrap:wrap; }
.pcp-section-sub { color:#6b7280; font-size:11px; font-weight:400; }

/* === Stats grid === */
.pcp-totals { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
.pcp-stat { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:11px 14px; }
.pcp-stat.green { background:linear-gradient(180deg,#f0fdf4 0%,#fff 100%); border-color:#bbf7d0; }
.pcp-stat.amber { background:linear-gradient(180deg,#fffbeb 0%,#fff 100%); border-color:#fde68a; }
.pcp-stat.blue  { background:linear-gradient(180deg,#eff6ff 0%,#fff 100%); border-color:#bfdbfe; }
.pcp-stat-label { display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b;
  text-transform:uppercase; letter-spacing:0.04em; }
.pcp-stat-value { margin-top:4px; font-size:20px; font-weight:700; color:#0f172a;
  font-variant-numeric:tabular-nums; }

/* === Table === */
.pcp-table-wrap { overflow-x:auto; }
.pcp-table { width:100%; border-collapse:collapse; font-size:12px; }
.pcp-table th { text-align:left; padding:6px 8px; color:#64748b; text-transform:uppercase;
  font-size:10px; border-bottom:1px solid #eef1f6; background:#fafbfd; }
.pcp-table td { padding:6px 8px; border-bottom:1px dashed #eef1f6; font-variant-numeric:tabular-nums; }
.pcp-table td.warn { color:#b45309; font-weight:600; }
.pcp-tot td { background:#f8fafc; border-top:1px solid #cbd5e1; }
.pcp-th-accent { background:#f0f9ff !important; color:#0369a1 !important; }
.pcp-td-accent { background:#f0f9ff; color:#0369a1; font-weight:600; }
.pcp-uom { color:#94a3b8; font-size:10px; }

/* === Pills === */
.pcp-pill { padding:1px 7px; border-radius:999px; background:#eef0f6; color:#475066; font-size:10px; font-weight:600; text-transform:uppercase; }
.pcp-pill.linked { background:#dbeafe; color:#1d4ed8; }
.pcp-pill.ok     { background:#dcfce7; color:#166534; }
.pcp-pill.warn   { background:#fef3c7; color:#92400e; }
.pcp-pill.bad    { background:#fee2e2; color:#991b1b; }
.pcp-pill.cat-compute  { background:#e0e7ff; color:#3730a3; }
.pcp-pill.cat-memory   { background:#fce7f3; color:#9d174d; }
.pcp-pill.cat-storage  { background:#fef3c7; color:#92400e; }
.pcp-pill.cat-network  { background:#dcfce7; color:#166534; }
.pcp-pill.cat-registry { background:#ede9fe; color:#5b21b6; }
.pcp-pill.cat-database { background:#cffafe; color:#155e75; }
.pcp-pill.cat-other    { background:#e2e8f0; color:#334155; }
.pcp-pill.cat-system   { background:#e0e7ff; color:#3730a3; }
.pcp-pill.cat-support  { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
.pcp-pill.cat-control-plane  { background:#e0e7ff; color:#3730a3; }
.pcp-pill.cat-system-vms     { background:#e0e7ff; color:#312e81; }
.pcp-pill.cat-system-osdisks { background:#ede9fe; color:#4338ca; }
.pcp-pill.cat-user-allocated { background:#dcfce7; color:#166534; }
.pcp-pill.cat-user-vms       { background:#dcfce7; color:#14532d; }
.pcp-pill.cat-user-osdisks   { background:#f0fdf4; color:#166534; }
.pcp-pill.cat-spot-vms       { background:#fff7ed; color:#9a3412; }
.pcp-pill.cat-spot-osdisks   { background:#fff7ed; color:#c2410c; }
.pcp-pill.cat-user-wastage   { background:#fee2e2; color:#991b1b; }
.pcp-pill.cat-egress         { background:#ffedd5; color:#9a3412; }

/* === Misc shared === */
.pcp-mute   { color:#94a3b8; }
.pcp-detail { color:#374151; font-size:11px; max-width:360px; word-break:break-word; }
.pcp-warn   { background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:8px 12px;
  border-radius:8px; font-size:12px; }
.pcp-empty  { display:flex; align-items:center; gap:8px; justify-content:center; padding:20px;
  color:#6b7280; font-size:13px; background:#f8f9fc; border:1px dashed #e2e6ee; border-radius:8px; }
.pcp-mode { display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
  border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px; cursor:pointer;
  color:#374151; font-weight:600; }
.pcp-mode.on { background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%); border-color:#93c5fd; color:#1d4ed8; }
.pcp-env { padding:6px 10px; border:1px solid #d4d8e0; border-radius:7px; background:#fff;
  font-size:13px; font-weight:600; text-transform:uppercase; cursor:pointer; }
.pcp-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
  border:1px solid #d4d8e0; background:#fff; border-radius:7px; font-size:13px;
  cursor:pointer; color:#374151; }
.pcp-btn:disabled { opacity:0.6; cursor:not-allowed; }
.pcp-btn .spin { animation:pcp-spin 1s linear infinite; }
.pcp-btn-active { background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%); border-color:#93c5fd; color:#1d4ed8; }
@keyframes pcp-spin  { to { transform:rotate(360deg); } }
@keyframes pcp-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

/* === Cluster row === */
.pcp-cluster { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:10px 14px; }
.pcp-cluster-row { display:flex; flex-wrap:wrap; gap:18px; font-size:13px; color:#334155; }
.pcp-cluster-row span { display:inline-flex; align-items:center; gap:5px; }
.pcp-skus { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
.pcp-sku { display:inline-flex; gap:4px; align-items:center; padding:3px 8px; background:#f1f5f9; border-radius:999px; font-size:11px; color:#475569; }

/* === Operational metrics === */
.pcp-ops { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:10px 14px; }
.pcp-ops-title { display:flex; align-items:center; gap:6px; font-size:12px; color:#475569; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.pcp-ops-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:6px; }
.pcp-mini { padding:7px 10px; background:#f8fafc; border:1px solid #eef1f6; border-radius:6px; }
.pcp-mini-label { font-size:10px; color:#64748b; text-transform:uppercase; }
.pcp-mini-value { font-size:14px; font-weight:600; color:#0f172a; margin-top:2px; font-variant-numeric:tabular-nums; }
.pcp-mini.red   { background:#fef2f2; border-color:#fecaca; }
.pcp-mini.red   .pcp-mini-value { color:#991b1b; }
.pcp-mini.amber { background:#fffbeb; border-color:#fde68a; }
.pcp-mini.amber .pcp-mini-value { color:#92400e; }
.pcp-mini.green { background:#f0fdf4; border-color:#bbf7d0; }
.pcp-mini.green .pcp-mini-value { color:#166534; }

/* === Diagnostics === */
.pcp-diag { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:9px 13px; }
.pcp-diag-row { display:flex; flex-wrap:wrap; gap:14px; font-size:12px; color:#475569; }
.pcp-diag-stat { display:inline-flex; align-items:center; gap:5px; }
.pcp-diag-stat .ok  { color:#16a34a; }
.pcp-diag-stat .bad { color:#dc2626; }
.pcp-diag-warn { margin-top:6px; padding:5px 8px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:11px; display:flex; align-items:center; gap:4px; }
.pcp-diag-info { margin-top:6px; padding:5px 8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; font-size:11px; display:flex; align-items:center; gap:4px; }
.pcp-diag-warnings { margin-top:6px; font-size:11px; }
.pcp-diag-warnings summary { cursor:pointer; color:#64748b; }
.pcp-diag-warnings ul { margin:6px 0 0 18px; padding:0; }
.pcp-diag-warnings li { color:#475569; padding:2px 0; }

/* === Node-ns chips === */
.pcp-node-ns { display:flex; flex-wrap:wrap; gap:4px; max-width:280px; }
.pcp-node-ns-chip { display:inline-flex; gap:5px; align-items:center; padding:2px 6px; background:#f1f5f9; border-radius:6px; font-size:10px; }
.pcp-node-ns-chip strong { color:#0f172a; }
.pcp-node-ns-chip span   { color:#64748b; font-weight:600; }
.pcp-pct { padding:1px 7px; background:#fef3c7; color:#92400e; border-radius:999px; font-size:11px; font-weight:700; }

/* === Top list === */
.pcp-toplist { background:#fff; border:1px solid #eef1f6; border-radius:7px; padding:10px 12px; }
.pcp-toplist-title { font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }
.pcp-toplist ol { padding-left:18px; margin:0; font-size:12px; }
.pcp-toplist li { display:flex; justify-content:space-between; gap:10px; padding:3px 0; }
.pcp-tl-name { display:flex; flex-direction:column; min-width:0; }
.pcp-tl-name strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pcp-tl-ns  { font-size:10px; color:#94a3b8; }
.pcp-tl-val { color:#0f172a; font-weight:600; }

/* === Stackbar === */
.pcp-stackbar { display:flex; height:18px; width:100%; border-radius:6px; overflow:hidden; margin-bottom:10px; box-shadow:inset 0 0 0 1px #e2e6ee; }
.pcp-stackbar-seg { height:100%; transition:width 220ms ease; }
.pcp-stackbar-seg.cat-system         { background:#e0e7ff; }
.pcp-stackbar-seg.cat-control-plane  { background:#6366f1; }
.pcp-stackbar-seg.cat-system-vms     { background:#818cf8; }
.pcp-stackbar-seg.cat-system-osdisks { background:#a5b4fc; }
.pcp-stackbar-seg.cat-user-allocated { background:#86efac; }
.pcp-stackbar-seg.cat-user-vms       { background:#4ade80; }
.pcp-stackbar-seg.cat-user-osdisks   { background:#86efac; }
.pcp-stackbar-seg.cat-spot-vms       { background:#fb923c; }
.pcp-stackbar-seg.cat-spot-osdisks   { background:#fdba74; }
.pcp-stackbar-seg.cat-user-wastage   { background:#fca5a5; }
.pcp-stackbar-seg.cat-storage        { background:#fde68a; }
.pcp-stackbar-seg.cat-network        { background:#bfdbfe; }
.pcp-stackbar-seg.cat-registry       { background:#ddd6fe; }
.pcp-stackbar-seg.cat-egress         { background:#fed7aa; }

/* === Section accents === */
.pcp-sec-system   { border-left:4px solid #8b5cf6; background:linear-gradient(180deg,#faf5ff 0%,#fff 60%); }
.pcp-sec-projects { border-left:4px solid #10b981; background:linear-gradient(180deg,#f0fdf4 0%,#fff 60%); }
.pcp-sec-resource { border-left:4px solid #f97316; background:linear-gradient(180deg,#fff7ed 0%,#fff 60%); }
.pcp-sec-history  { border-left:4px solid #3b82f6; background:linear-gradient(180deg,#eff6ff 0%,#fff 60%); }

/* === Inline elements === */
.pcp-substack { margin-bottom:10px; }
.pcp-substack-title { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:0.04em; padding:0 0 5px 4px; }
.pcp-split-line { display:flex; gap:10px; flex-wrap:wrap; font-size:10px; color:#64748b; padding:4px 0 0 22px; width:100%; }
.pcp-split-line span { display:inline-flex; gap:3px; align-items:center; }
.pcp-image { font-size:10px; color:#94a3b8; margin-top:1px; }
.pcp-hpa { display:inline-block; padding:1px 7px; background:#ecfeff; color:#155e75; border-radius:6px; font-size:10px; font-weight:600; }
.pcp-vm-size { display:inline-block; padding:1px 6px; background:#f1f5f9; color:#334155; border-radius:5px; font-size:10px; font-weight:600; font-family:monospace; }
.pcp-spot-badge { display:inline-block; padding:1px 6px; background:#fef3c7; color:#92400e; border-radius:5px; font-size:10px; font-weight:700; font-family:monospace; border:1px solid #fbbf24; }
.pcp-meta { color:#64748b; font-size:11px; flex:1 1 auto; }
.pcp-meta-cost { display:flex; gap:10px; font-size:11px; flex-wrap:wrap; }
.pcp-meta-cost span { display:inline-flex; gap:3px; align-items:center; }
.pcp-meta-cost .mtd { color:#92400e; font-weight:600; }
.pcp-meta-cost .cum { color:#1d4ed8;  font-weight:600; }

/* === Fixed / inventory === */
.pcp-inv-group { background:#fff; border:1px solid #eef1f6; border-radius:7px; padding:10px 12px; margin-bottom:10px; }
.pcp-inv-group-head { display:flex; justify-content:space-between; align-items:center; padding-bottom:6px; border-bottom:1px dashed #e2e6ee; margin-bottom:6px; font-size:13px; }
.pcp-inv-subtotal { color:#475569; font-size:11px; }
.pcp-inv-grand { text-align:right; padding:10px 14px; background:linear-gradient(180deg,#f0fdf4 0%,#fff 100%); border:1px solid #bbf7d0; border-radius:8px; font-size:14px; color:#166534; }

/* === Audit === */
.pcp-audit { border-color:#93c5fd; background:linear-gradient(180deg,#eff6ff 0%,#fff 60%); }
.pcp-audit-formula { font-size:11px; color:#334155; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:7px 10px; line-height:1.7; }

/* === Namespaces accordion === */
.pcp-namespaces { display:flex; flex-direction:column; gap:6px; }
.pcp-ns { background:#fafbfd; border:1px solid #eef1f6; border-radius:7px; overflow:hidden; }
.pcp-ns-head { width:100%; display:flex; align-items:center; gap:8px; padding:9px 11px; background:#fafbfd; border:none; cursor:pointer; font-size:13px; flex-wrap:wrap; text-align:left; }
.pcp-ns-head:hover { background:#eef1f7; }
.pcp-ns-body { padding:8px 11px 12px; background:#fff; border-top:1px solid #eef1f6; }

/* === Products table === */
.pcp-prod-open > td { background:#fafbff; }
.pcp-prod-detail { margin:0; border-radius:0; background:#fafbff; }
.pcp-prod-detail td, .pcp-prod-detail th { padding:4px 10px; font-size:11px; }

/* === Project cards === */
.pcp-projects { display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:10px; }
.pcp-proj-card { background:#fff; border:1px solid #d1fae5; border-radius:9px; padding:10px 12px; }
.pcp-proj-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
.pcp-proj-name { display:flex; align-items:center; gap:6px; font-size:14px; font-weight:700; color:#065f46; flex-wrap:wrap; }
.pcp-proj-meta { margin-top:6px; display:flex; flex-wrap:wrap; gap:5px; }
.pcp-proj-ns-chip { display:inline-flex; gap:5px; align-items:center; padding:2px 8px; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:6px; font-size:11px; }
.pcp-proj-ns-chip strong { color:#065f46; }
.pcp-proj-totals { text-align:right; min-width:130px; }
.pcp-proj-hourly  { font-size:18px; font-weight:800; color:#065f46; font-variant-numeric:tabular-nums; }
.pcp-proj-hourly  span { font-size:11px; color:#64748b; font-weight:500; }
.pcp-proj-monthly { font-size:13px; font-weight:600; color:#374151; font-variant-numeric:tabular-nums; }
.pcp-proj-monthly span { font-size:10px; color:#94a3b8; font-weight:500; }
.pcp-proj-mtd   { font-size:11px; color:#92400e; font-weight:600; }
.pcp-proj-share { font-size:10px; color:#475569; }
.pcp-proj-bar { margin-top:8px; height:6px; background:#ecfdf5; border-radius:3px; overflow:hidden; }
.pcp-proj-bar-fill { height:100%; background:linear-gradient(90deg,#10b981 0%,#059669 100%); transition:width 250ms ease; }

/* === Resource grid === */
.pcp-resource-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.pcp-resource-card { background:#fff; border:1px solid #fed7aa; border-radius:9px; padding:11px 13px; }
.pcp-resource-card-wide { grid-column:1 / -1; }
.pcp-resource-card-title { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:#9a3412; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:9px; }
@media (max-width:800px) { .pcp-resource-grid { grid-template-columns:1fr; } .pcp-resource-card-wide { grid-column:auto; } }

/* === Time-series controls === */
.pcp-ts-controls { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:10px; }
.pcp-ts-ranges { display:flex; flex-wrap:wrap; gap:5px; }
.pcp-ts-range-btn { padding:5px 11px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; font-size:12px; cursor:pointer; color:#475569; font-weight:500; }
.pcp-ts-range-btn:hover { background:#f1f5f9; }
.pcp-ts-range-btn.on { background:linear-gradient(180deg,#dbeafe 0%,#bfdbfe 100%); border-color:#3b82f6; color:#1e40af; font-weight:700; }
.pcp-ts-custom { display:flex; align-items:center; gap:6px; font-size:12px; color:#475569; padding:4px 8px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; }
.pcp-ts-custom input { border:none; outline:none; font-size:12px; padding:2px 4px; background:transparent; }
.pcp-ts-mini-btn { padding:3px 9px; border:1px solid #cbd5e1; background:#fff; border-radius:5px; font-size:11px; cursor:pointer; color:#475569; font-weight:500; }
.pcp-ts-mini-btn.on { background:linear-gradient(180deg,#dbeafe 0%,#bfdbfe 100%); border-color:#3b82f6; color:#1e40af; font-weight:700; }
.pcp-ts-gran { display:flex; align-items:center; gap:6px; font-size:12px; color:#64748b; }
.pcp-ts-gran select { padding:4px 8px; border:1px solid #cbd5e1; border-radius:5px; font-size:12px; background:#fff; cursor:pointer; }
.pcp-ts-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-bottom:12px; }
.pcp-ts-chart { background:#fff; border:1px solid #bfdbfe; border-radius:9px; padding:11px 13px; margin-top:10px; }
.pcp-ts-chart-title { font-size:11px; font-weight:600; color:#1e40af; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.pcp-live-graph-wrap { background:#fff; border:1px solid #e2e6ee; border-radius:9px; padding:10px 12px; margin-bottom:10px; }

/* === Sec-total badge === */
.pcp-sec-total { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; background:#fff; border:1px solid #e2e6ee; border-radius:999px; font-size:12px; font-weight:700; color:#0f172a; }
.pcp-sec-total-sub { color:#64748b; font-weight:500; font-size:11px; margin-left:5px; }

/* === Two-col === */
.pcp-twocol { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:800px) { .pcp-twocol { grid-template-columns:1fr; } }

/* === Animations === */
.ccd-page { animation: pcp-fadein 180ms ease both; }
@keyframes pcp-fadein { from{opacity:0.8;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
`;
