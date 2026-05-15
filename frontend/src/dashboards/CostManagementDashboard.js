/**
 * CostManagementDashboard — single unified Cost view for DevOps and Admin.
 *
 * One page, one tab. Filters on top, content below. No sub-tabs.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ENV pills   ·  Product/Namespace dropdown    ·    Date range    │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  6 KPI cards                                                     │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Overview (default) — env split donut, category donut,           │
 *   │  per-env bars, top namespaces                                    │
 *   │  OR                                                              │
 *   │  Scope view — 9 category tiles, click any to expand 20+ metrics  │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Namespace table (always visible at bottom)                      │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Data sources (UNCHANGED — cost calc lives in the backend):
 *   • getPrometheusEnvs()        → list of envs with Prometheus configured
 *   • getPrometheusLive(env)     → snapshot per env (parallel fetch)
 *   • getPrometheusMetrics(env,ns) → ops metrics for the selected namespace
 *   • getPrometheusTimeseries()  → history for the selected date range
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DollarSign, Cpu, Database, HardDrive, Activity, Layers,
    TrendingUp, RefreshCw, Calendar, Gauge, Boxes, Package,
    ChevronDown, ChevronRight, X, AlertTriangle, Clock, Box,
    PieChart, Check, GitCommit, Search,
} from "lucide-react";
import {
    getPrometheusEnvs, getPrometheusLive, getPrometheusMetrics, getPrometheusTimeseries,
} from "../services/billingService";

/* ─── constants ──────────────────────────────────────────────────────── */
const REFRESH_MS = 60_000;
const HOURS_PER_MONTH = 730;

const ENV_COLOURS = {
    dev: "#10b981", qa: "#3b82f6", test: "#0ea5e9", uat: "#f59e0b",
    stage: "#a855f7", staging: "#a855f7", preprod: "#ec4899",
    prod: "#ef4444", production: "#ef4444", sandbox: "#14b8a6",
};
const FALLBACK_PALETTE = ["#0ea5e9","#22c55e","#f97316","#8b5cf6","#06b6d4","#eab308","#f43f5e"];
const envColour = (env, idx = 0) => {
    if (!env) return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
    return ENV_COLOURS[env.toLowerCase()] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
};

const CATEGORIES = [
    { id: "cost",    label: "Cost Overview",       Icon: DollarSign, colour: "#10b981" },
    { id: "compute", label: "Compute",             Icon: Cpu,        colour: "#3b82f6" },
    { id: "storage", label: "Storage & Network",   Icon: HardDrive,  colour: "#f59e0b" },
    { id: "health",  label: "Health & Efficiency", Icon: Gauge,      colour: "#84cc16" },
];

const DATE_PRESETS = [
    { id: "live",   label: "Live",   icon: "⚡" },
    { id: "today",  label: "Day",    icon: "📅" },
    { id: "7d",     label: "7 Days", icon: "📆" },
    { id: "30d",    label: "Month",  icon: "🗓" },
    { id: "ytd",    label: "Year",   icon: "📊" },
    { id: "custom", label: "Custom", icon: "✂" },
];

const SYSTEM_NS_EXACT = new Set([
    "default","monitoring","ingress-nginx","cert-manager","linkerd","istio-system",
    "external-dns","metallb-system","traefik","keda","argocd","argo","velero",
    "prometheus","fluent-bit","datadog","vault","consul",
]);
const SYSTEM_NS_PREFIX = ["kube-","gatekeeper-","calico-","tigera-","open-policy-","cert-manager-","linkerd-","istio-"];
const ENV_PREFIXES = new Set(["qa","dev","prod","production","stage","staging","uat","sit","pre","preprod","sandbox","test","perf","hotfix"]);

const isSystemNs = (ns) => {
    if (!ns) return true;
    if (SYSTEM_NS_EXACT.has(ns)) return true;
    return SYSTEM_NS_PREFIX.some(p => ns.startsWith(p));
};
const productKey = (ns) => {
    if (ns.matchedProjectName) return ns.matchedProjectName.toUpperCase();
    const parts = (ns.namespace || "").split("-");
    const start = parts.length > 1 && ENV_PREFIXES.has(parts[0].toLowerCase()) ? 1 : 0;
    const name = parts.slice(start).join("-") || ns.namespace;
    return (name || "UNCLASSIFIED").toUpperCase();
};

/* ─── formatters ─────────────────────────────────────────────────────── */
const f$  = (v) => (v == null || isNaN(v)) ? "$0.00" : `$${Number(v).toFixed(2)}`;
const f$4 = (v) => (v == null || isNaN(v)) ? "$0.0000" : `$${Number(v).toFixed(4)}`;
const f$big = (v) => {
    if (v == null || isNaN(v)) return "$0";
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v/1_000_000).toFixed(2)}M`;
    if (a >= 1_000)     return `$${(v/1_000).toFixed(2)}K`;
    return `$${v.toFixed(2)}`;
};
const fN  = (v, d=2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);
const fPct= (v) => (v == null || isNaN(v)) ? "—" : `${Number(v).toFixed(1)}%`;
const fI  = (v) => (v == null || isNaN(v)) ? "0"  : Math.round(Number(v)).toLocaleString();

/* ════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                */
/* ════════════════════════════════════════════════════════════════════ */

export default function CostManagementDashboard() {
    // env list + snapshots
    const [envs,       setEnvs]       = useState([]);
    const [snapshots,  setSnapshots]  = useState({});
    const [loadedAt,   setLoadedAt]   = useState(null);
    const [bootLoading,setBootLoading]= useState(true);   // first load only
    const [refreshing, setRefreshing] = useState(false);
    const [errorMsg,   setErrorMsg]   = useState("");

    // filters
    const [selectedEnvs, setSelectedEnvs] = useState([]);     // [] == all
    const [scope, setScope] = useState({ type: "all" });
    const [showTimeline, setShowTimeline] = useState(false);
    const [datePreset, setDatePreset] = useState("30d");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo,   setCustomTo]   = useState("");
    const [search, setSearch] = useState("");
    const [nsSort, setNsSort] = useState({ key: "hourly", dir: "desc" });
    const [expandedCat, setExpandedCat] = useState(null);

    // previous month cost (fetched separately, per env + total)
    const [prevMonthCost,  setPrevMonthCost]  = useState(null);
    const [prevMonthByEnv, setPrevMonthByEnv] = useState({});
    const [prevMonthPts,   setPrevMonthPts]   = useState({}); // raw pts per env for prev month
    const [todayTsByEnv,     setTodayTsByEnv]     = useState({}); // real today pts per env
    const [yesterdayTsByEnv, setYesterdayTsByEnv] = useState({}); // real yesterday pts per env

    // drill-down extras
    const [opsMetrics, setOpsMetrics] = useState(null);
    const [tsByEnv,    setTsByEnv]    = useState({});

    const intervalRef = useRef(null);

    /* ── boot: load env list ─────────────────────────────────────── */
    useEffect(() => {
        let dead = false;
        getPrometheusEnvs()
            .then(d => {
                if (dead) return;
                const list = Array.isArray(d?.envs) ? d.envs : [];
                setEnvs(list);
                if (list.length === 0) setBootLoading(false);
            })
            .catch(e => {
                if (dead) return;
                setErrorMsg(`Could not load environments: ${e?.message || e}`);
                setBootLoading(false);
            });
        return () => { dead = true; };
    }, []);

    /* ── load live snapshots for every env (parallel) ───────────── */
    const loadSnapshots = useCallback(async () => {
        if (envs.length === 0) { setBootLoading(false); return; }
        setRefreshing(true);
        try {
            const results = await Promise.all(envs.map(e =>
                getPrometheusLive(e)
                    .then(snap => [e, snap])
                    .catch(() => [e, null])
            ));
            const next = {};
            for (const [e, s] of results) if (s) next[e] = s;
            setSnapshots(next);
            setLoadedAt(new Date());
            setErrorMsg("");
        } catch (e) {
            setErrorMsg(`Refresh failed: ${e?.message || e}`);
        } finally {
            setRefreshing(false);
            setBootLoading(false);
        }
    }, [envs]);

    useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => void loadSnapshots(), REFRESH_MS);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [loadSnapshots]);

    /* ── date range → time-series per env ───────────────────────── */
    const tsWindow = useMemo(() => {
        const now = new Date();
        if (datePreset === "live")  {
            const f = new Date(now); f.setHours(f.getHours() - 6);
            return { from: f.toISOString(), to: now.toISOString(), gran: "minute" };
        }
        if (datePreset === "today") { const f = new Date(now); f.setHours(0,0,0,0); return { from: f.toISOString(), to: now.toISOString(), gran: "hour"  }; }
        if (datePreset === "7d")    { const f = new Date(now); f.setDate(f.getDate() - 7);  return { from: f.toISOString(), to: now.toISOString(), gran: "hour"  }; }
        if (datePreset === "30d")   { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: f.toISOString(), to: now.toISOString(), gran: "day"   }; }
        if (datePreset === "ytd")   { const f = new Date(now.getFullYear(), 0, 1);           return { from: f.toISOString(), to: now.toISOString(), gran: "day"   }; }
        if (datePreset === "custom" && customFrom && customTo) {
            const f = new Date(customFrom), t = new Date(customTo);
            if (isNaN(f) || isNaN(t)) return null;
            const days = (t - f) / 86_400_000;
            return { from: f.toISOString(), to: t.toISOString(),
                gran: days <= 1 ? "minute" : days <= 14 ? "hour" : days <= 90 ? "day" : "month" };
        }
        return null;
    }, [datePreset, customFrom, customTo]);

    const activeEnvs = useMemo(() =>
        selectedEnvs.length === 0 ? envs : envs.filter(e => selectedEnvs.includes(e)),
    [envs, selectedEnvs]);

    useEffect(() => {
        if (!tsWindow || activeEnvs.length === 0) { setTsByEnv({}); return; }
        let dead = false;
        Promise.all(activeEnvs.map(env =>
            getPrometheusTimeseries(env, tsWindow.from, tsWindow.to, tsWindow.gran)
                .then(d => [env, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [env, []])
        )).then(rows => {
            if (dead) return;
            const next = {};
            for (const [e, pts] of rows) next[e] = pts;
            setTsByEnv(next);
        });
        return () => { dead = true; };
    }, [tsWindow, activeEnvs]);

    /* ── today timeseries (real hourly pts from DB) — refreshed with live data ── */
    useEffect(() => {
        if (activeEnvs.length === 0) return;
        let dead = false;
        const now = new Date();
        const f = new Date(now); f.setHours(0, 0, 0, 0);
        Promise.all(activeEnvs.map(e =>
            getPrometheusTimeseries(e, f.toISOString(), now.toISOString(), "hour")
                .then(d => [e, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [e, []])
        )).then(rows => {
            if (dead) return;
            const next = {};
            for (const [e, pts] of rows) next[e] = pts;
            setTodayTsByEnv(next);
        });
        return () => { dead = true; };
    }, [activeEnvs, loadedAt]); // re-fetch whenever live data refreshes

    /* ── yesterday timeseries (stable — fetched once per mount / env change) ── */
    useEffect(() => {
        if (activeEnvs.length === 0) return;
        let dead = false;
        const now = new Date();
        const f = new Date(now); f.setDate(f.getDate() - 1); f.setHours(0, 0, 0, 0);
        const t = new Date(now); t.setHours(0, 0, 0, 0);
        Promise.all(activeEnvs.map(e =>
            getPrometheusTimeseries(e, f.toISOString(), t.toISOString(), "hour")
                .then(d => [e, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [e, []])
        )).then(rows => {
            if (dead) return;
            const next = {};
            for (const [e, pts] of rows) next[e] = pts;
            setYesterdayTsByEnv(next);
        });
        return () => { dead = true; };
    }, [activeEnvs]);

    /* ── previous month: total + per-env + raw pts for product breakdown ── */
    useEffect(() => {
        if (envs.length === 0) return;
        let dead = false;
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const to   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        Promise.all(envs.map(e =>
            getPrometheusTimeseries(e, from, to, "day")
                .then(d => [e, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [e, []])
        )).then(rows => {
            if (dead) return;
            let total = 0;
            const byEnv = {};
            const rawPts = {};
            for (const [env, pts] of rows) {
                rawPts[env] = pts;
                let envTotal = 0;
                for (const p of pts) envTotal += (p.smoothedHourlyUsd || p.totalHourlyUsd || 0) * 24;
                byEnv[env] = envTotal;
                total += envTotal;
            }
            setPrevMonthPts(rawPts);
            setPrevMonthByEnv(byEnv);
            setPrevMonthCost(total);
        });
        return () => { dead = true; };
    }, [envs]);


    /* ── filtered snapshots ─────────────────────────────────────── */
    const filtered = useMemo(() => {
        const out = {};
        for (const e of activeEnvs) if (snapshots[e]) out[e] = snapshots[e];
        return out;
    }, [snapshots, activeEnvs]);

    /* ── ops metrics: namespace scope = one ns; product scope = aggregate per env ── */
    useEffect(() => {
        let dead = false;
        if (scope.type === "namespace") {
            getPrometheusMetrics(scope.env, scope.namespace)
                .then(r => { if (!dead) setOpsMetrics(r); })
                .catch(() => { if (!dead) setOpsMetrics(null); });
        } else if (scope.type === "product") {
            const envList = Object.keys(filtered).filter(env =>
                (filtered[env]?.namespaces || []).some(ns => productKey(ns) === scope.key)
            );
            if (envList.length === 0) { setOpsMetrics(null); return; }
            Promise.all(envList.map(env => getPrometheusMetrics(env, null).catch(() => null)))
                .then(results => {
                    if (dead) return;
                    const ok = results.filter(Boolean);
                    if (!ok.length) { setOpsMetrics(null); return; }
                    setOpsMetrics({
                        requestsPerSec:       ok.reduce((s,r)=>s+(r.requestsPerSec||0),0),
                        errorRatePct:         ok.reduce((s,r)=>s+(r.errorRatePct||0),0)/ok.length,
                        p50LatencyMs:         Math.max(...ok.map(r=>r.p50LatencyMs||0)),
                        p95LatencyMs:         Math.max(...ok.map(r=>r.p95LatencyMs||0)),
                        p99LatencyMs:         Math.max(...ok.map(r=>r.p99LatencyMs||0)),
                        readyPods:            ok.reduce((s,r)=>s+(r.readyPods||0),0),
                        crashLoopingPods:     ok.reduce((s,r)=>s+(r.crashLoopingPods||0),0),
                        networkRxBytesPerSec: ok.reduce((s,r)=>s+(r.networkRxBytesPerSec||0),0),
                        networkTxBytesPerSec: ok.reduce((s,r)=>s+(r.networkTxBytesPerSec||0),0),
                        totalRestarts:        ok.reduce((s,r)=>s+(r.totalRestarts||0),0),
                        throttlePct:          ok.reduce((s,r)=>s+(r.throttlePct||0),0)/ok.length,
                    });
                });
        } else {
            setOpsMetrics(null);
        }
        return () => { dead = true; };
    }, [scope.type, scope.env, scope.namespace, scope.key, filtered]);

    /* ── catalogue (products + namespaces flat list) ────────────── */
    const catalogue = useMemo(() => buildCatalogue(filtered, selectedEnvs), [filtered, selectedEnvs]);

    /* ── env aggregates ─────────────────────────────────────────── */
    const envAgg = useMemo(() => buildEnvAgg(filtered), [filtered]);

    /* ── totals ──────────────────────────────────────────────────── */
    const totals = useMemo(() => {
        const t = { hourly:0, daily:0, monthly:0, mtd:0, cumulative:0,
                    pods:0, nsCount:0, nodes:0, envCount: envAgg.length };
        for (const e of envAgg) {
            t.hourly    += e.hourly;
            t.daily     += e.daily;
            t.monthly   += e.monthly;
            t.mtd       += e.mtd;
            t.cumulative+= e.cumulative;
            t.pods      += e.podCount;
            t.nsCount   += e.nsCount;
            t.nodes     += e.nodeCount;
        }
        return t;
    }, [envAgg]);

    /* ── period cost from timeseries (updates when date range changes) ── */
    const periodCost = useMemo(() => {
        if (Object.keys(tsByEnv).length === 0) return null;
        /* granularity multiplier: each point's smoothedHourlyUsd × mult = cost for that bucket */
        const mult = tsWindow?.gran === "minute" ? (1/60)
                   : tsWindow?.gran === "day"    ? 24
                   : tsWindow?.gran === "month"  ? 730
                   : 1; /* hour default */
        let totalCost = 0;
        const byEnv = {};
        for (const [env, pts] of Object.entries(tsByEnv)) {
            let c = 0;
            for (const p of pts) c += (p.smoothedHourlyUsd || p.totalHourlyUsd || 0) * mult;
            byEnv[env] = c;
            totalCost += c;
        }
        const hours = tsWindow ? Math.max(1, (new Date(tsWindow.to) - new Date(tsWindow.from)) / 3_600_000) : 730;
        return { totalCost, byEnv, avgHourly: totalCost / hours, hours };
    }, [tsByEnv, tsWindow]);

    /* ── per-product sparklines from timeseries ── */
    const productSparklines = useMemo(() => {
        const buckets = {};
        for (const [, pts] of Object.entries(tsByEnv)) {
            for (const p of pts) {
                for (const ns of (p.namespaces || [])) {
                    const pk = productKey({ namespace: ns.namespace });
                    if (!buckets[pk]) buckets[pk] = new Map();
                    buckets[pk].set(p.t, (buckets[pk].get(p.t) || 0) + (ns.hourlyUsd || 0));
                }
            }
        }
        const out = {};
        for (const [pk, m] of Object.entries(buckets)) {
            out[pk] = [...m.entries()].sort(([a],[b]) => new Date(a)-new Date(b)).map(([t,v]) => ({t,v}));
        }
        return out;
    }, [tsByEnv]);

    /* ── scope data + scope metrics ─────────────────────────────── */
    const scopeData = useMemo(() => {
        if (scope.type === "all") return null;
        if (scope.type === "product") {
            const p = catalogue.products.find(x => x.key === scope.key);
            return p ? { kind: "product", data: p, name: p.key } : null;
        }
        if (scope.type === "namespace") {
            const n = catalogue.namespaces.find(x => x.env === scope.env && x.namespace === scope.namespace);
            return n ? { kind: "namespace", data: n, name: n.namespace, env: n.env } : null;
        }
        return null;
    }, [scope, catalogue]);

    const scopeMetrics = useMemo(() => scopeData ? buildScopeMetrics(scopeData, opsMetrics) : null, [scopeData, opsMetrics]);

    /* ── filter actions ──────────────────────────────────────────── */
    const toggleEnv = (e) => {
        setExpandedCat(null);
        setSelectedEnvs(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
    };
    const selectAllEnvs = () => setSelectedEnvs([]);
    const removeEnv = (e) => setSelectedEnvs(prev => prev.filter(x => x !== e));
    const clearScope = () => { setScope({ type:"all" }); setExpandedCat(null); };
    const clearDate  = () => setDatePreset("30d");
    const resetAll = () => {
        setSelectedEnvs([]); setScope({ type:"all" }); setSearch("");
        setExpandedCat(null); setDatePreset("30d");
    };

    /* ── render ──────────────────────────────────────────────────── */
    return (
        <>
        <div className="cm-shell">
            <style>{CSS_BLOCK}</style>

            {/* ─── FILTER BAR ─── */}
            <FilterBar
                envs={envs}
                selectedEnvs={selectedEnvs}
                onToggleEnv={toggleEnv}
                onAllEnvs={selectAllEnvs}
                onRemoveEnv={removeEnv}
                scope={scope} onScope={setScope}
                onClearScope={clearScope}
                catalogue={catalogue}
                datePreset={datePreset} onDatePreset={(p) => { setDatePreset(p); }}
                onClearDate={clearDate}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
                refreshing={refreshing} loadedAt={loadedAt}
                onRefresh={loadSnapshots} onReset={resetAll}
            />

            {/* ─── BODY ─── */}
            {bootLoading ? (
                <SkeletonBoot />
            ) : envs.length === 0 ? (
                <Notice
                    icon={<AlertTriangle size={18} />}
                    title="No environments configured"
                    body="Cost data needs a Prometheus endpoint per environment. Ask an admin to wire one up under Admin → Environments." />
            ) : Object.keys(filtered).length === 0 ? (
                <Notice
                    icon={<AlertTriangle size={18} />}
                    title="No data for the selected filters"
                    body="Either nothing has been scraped yet or every selected environment is unreachable. Try refreshing or clearing the filter." />
            ) : (
                <>
                    {errorMsg && (
                        <div className="cm-banner">
                            <AlertTriangle size={14} /> {errorMsg}
                        </div>
                    )}

                    {/* KPI strip + timeline trigger */}
                    <div className="cm-kpi-strip-row">
                        <KpiStrip
                            totals={totals} envAgg={envAgg}
                            activeEnvs={activeEnvs} scope={scope}
                            catalogue={catalogue}
                            todayTsByEnv={todayTsByEnv}
                            yesterdayTsByEnv={yesterdayTsByEnv}
                            prevMonthPts={prevMonthPts}
                            prevMonthByEnv={prevMonthByEnv}
                            prevMonthCost={prevMonthCost}
                        />
                        {(activeEnvs.length < envs.length || scope.type !== "all") && (
                            <button
                                className={`cm-tl-trigger${showTimeline ? " active" : ""}`}
                                onClick={() => setShowTimeline(true)}
                                title="Open price history timeline">
                                <GitCommit size={15} />
                                <span>Timeline</span>
                            </button>
                        )}
                    </div>

                    {/* Overview OR scope drill-down */}
                    {!scopeData ? (
                        <Overview
                            envAgg={envAgg}
                            catalogue={catalogue}
                            totals={totals}
                            tsByEnv={tsByEnv}
                            datePreset={datePreset}
                            selectedEnvs={selectedEnvs}
                            periodCost={periodCost}
                            tsWindow={tsWindow}
                            productSparklines={productSparklines}
                            snapshots={filtered}
                            onPickProduct={(k) => { setScope({ type:"product", key:k }); setExpandedCat(null); }}
                            onPickNamespace={(env, ns) => { setScope({ type:"namespace", env, namespace:ns }); setExpandedCat(null); }}
                        />
                    ) : (
                        <ScopeView
                            scopeData={scopeData}
                            metrics={scopeMetrics}
                            opsMetrics={opsMetrics}
                            tsByEnv={tsByEnv}
                            tsWindow={tsWindow}
                            datePreset={datePreset}
                            expandedCat={expandedCat}
                            onExpand={(id) => setExpandedCat(expandedCat === id ? null : id)}
                            onClearScope={() => { setScope({ type:"all" }); setExpandedCat(null); }}
                            onPickNamespace={(env, ns) => { setScope({ type:"namespace", env, namespace:ns }); setExpandedCat(null); }}
                        />
                    )}

                </>
            )}
        </div>

        {/* Price Timeline full-screen modal */}
        {showTimeline && (activeEnvs.length < envs.length || scope.type !== "all") && (
            <PriceTimelineModal
                activeEnvs={activeEnvs}
                envAgg={envAgg}
                scope={scope}
                onClose={() => setShowTimeline(false)}
            />
        )}
        </>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  ENV MULTI-SELECT DROPDOWN                                           */
/* ════════════════════════════════════════════════════════════════════ */

function EnvMultiDropdown({ envs, selectedEnvs, onToggleEnv, onAllEnvs }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const allSelected = selectedEnvs.length === 0;
    const label = allSelected
        ? "All Environments"
        : selectedEnvs.length === 1
            ? selectedEnvs[0].toUpperCase()
            : `${selectedEnvs.length} selected`;

    return (
        <div className="cm-env-dd" ref={ref}>
            <button className="cm-env-dd-trigger" onClick={() => setOpen(o => !o)}>
                <span className="cm-env-dd-dots">
                    {allSelected
                        ? <span className="cm-dot" style={{ background: "#0f172a" }} />
                        : selectedEnvs.slice(0, 3).map((e, i) => (
                            <span key={e} className="cm-dot" style={{ background: envColour(e, i), marginRight: -3, border: "1px solid #fff" }} />
                        ))
                    }
                </span>
                <span className="cm-env-dd-label">{label}</span>
                <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
            </button>
            {open && (
                <div className="cm-env-dd-panel">
                    <div
                        className={`cm-env-dd-row ${allSelected ? "checked" : ""}`}
                        onClick={() => { onAllEnvs(); setOpen(false); }}
                        role="menuitemcheckbox"
                        aria-checked={allSelected}>
                        <span className={`cm-env-dd-checkbox ${allSelected ? "is-on is-all" : ""}`} aria-hidden>
                            {allSelected ? <Check className="cm-env-dd-tick" size={11} strokeWidth={2.8} /> : null}
                        </span>
                        <span className="cm-dot" style={{ background: "#0f172a" }} />
                        <span className="cm-env-dd-name">All Environments</span>
                    </div>
                    <div className="cm-env-dd-sep" />
                    {envs.map((e, i) => {
                        const on = selectedEnvs.includes(e);
                        const col = envColour(e, i);
                        return (
                            <div key={e}
                                className={`cm-env-dd-row ${on ? "checked" : ""}`}
                                onClick={() => onToggleEnv(e)}
                                role="menuitemcheckbox"
                                aria-checked={on}>
                                <span
                                    className={`cm-env-dd-checkbox ${on ? "is-on" : ""}`}
                                    style={on ? { borderColor: col, background: col, color: "#fff" } : undefined}
                                    aria-hidden>
                                    {on ? <Check className="cm-env-dd-tick" size={11} strokeWidth={2.8} /> : null}
                                </span>
                                <span className="cm-dot" style={{ background: col }} />
                                <span className="cm-env-dd-name" style={{ color: on ? col : undefined, fontWeight: on ? 700 : 500 }}>
                                    {e.toUpperCase()}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  FILTER BAR                                                          */
/* ════════════════════════════════════════════════════════════════════ */

function FilterBar({
    envs, selectedEnvs, onToggleEnv, onAllEnvs, onRemoveEnv,
    scope, onScope, onClearScope, catalogue,
    datePreset, onDatePreset, onClearDate, customFrom, setCustomFrom, customTo, setCustomTo,
    refreshing, loadedAt, onRefresh, onReset,
}) {
    const [showCal,      setShowCal]      = useState(false);
    const [draftFrom,    setDraftFrom]    = useState("");
    const [draftTo,      setDraftTo]      = useState("");
    const [calPhase,     setCalPhase]     = useState(0);
    const [viewYear,     setViewYear]     = useState(new Date().getFullYear());
    const [viewMonth,    setViewMonth]    = useState(new Date().getMonth());
    const [showScopeDD,  setShowScopeDD]  = useState(false);
    const [scopeSearch,  setScopeSearch]  = useState("");
    const calRef   = useRef(null);
    const scopeRef = useRef(null);

    useEffect(() => {
        if (!showCal) return;
        const fn = e => { if (calRef.current && !calRef.current.contains(e.target)) setShowCal(false); };
        document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, [showCal]);

    const scopeKey = scope.type === "product"   ? `p:${scope.key}`
                   : scope.type === "namespace" ? `n:${scope.env}/${scope.namespace}`
                   : "all";
    const onScopeChange = (val) => {
        if (val === "all") return onScope({ type: "all" });
        if (val.startsWith("p:")) return onScope({ type: "product", key: val.slice(2) });
        if (val.startsWith("n:")) {
            const idx = val.indexOf("/");
            return onScope({ type: "namespace", env: val.slice(2, idx), namespace: val.slice(idx + 1) });
        }
    };

    // Close scope dropdown on outside click
    useEffect(() => {
        if (!showScopeDD) return;
        const fn = e => { if (scopeRef.current && !scopeRef.current.contains(e.target)) setShowScopeDD(false); };
        document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, [showScopeDD]);

    // Set exactly one env active (used when clicking a product/ns in a specific env)
    const setOnlyEnv = (targetEnv) => {
        onAllEnvs(); // reset to [] (all)
        onToggleEnv(targetEnv); // add targetEnv → [targetEnv]
    };

    const allDropProducts = catalogue.products.filter(p => p.key !== "SYSTEM");
    const allDropNs = [...catalogue.namespaces].filter(n => !n.isSystem).sort((a,b)=>b.smoothed-a.smoothed);
    const q = scopeSearch.trim().toLowerCase();
    const dropProducts = q ? allDropProducts.filter(p => p.key.toLowerCase().includes(q)) : allDropProducts;
    const dropNs = q ? allDropNs.filter(n => n.namespace.toLowerCase().includes(q) || n.env.toLowerCase().includes(q)) : allDropNs;
    const hasFilters = selectedEnvs.length > 0 || scope.type !== "all" || datePreset !== "30d";

    const openCal = () => {
        const now = new Date();
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth());
        setCalPhase(0);
        if (datePreset === "custom" && customFrom) {
            setDraftFrom(customFrom.slice(0, 10));
            setDraftTo((customTo || "").slice(0, 10));
        } else {
            setDraftFrom(""); setDraftTo("");
        }
        setShowCal(true);
    };

    const applyQuick = (preset) => {
        const now = new Date();
        if (preset === "today") { onDatePreset("today"); }
        else if (preset === "yesterday") {
            const f = new Date(now); f.setDate(f.getDate() - 1); f.setHours(0,0,0,0);
            const t = new Date(now); t.setDate(t.getDate() - 1); t.setHours(23,59,59,999);
            setCustomFrom(f.toISOString().slice(0, 16));
            setCustomTo(t.toISOString().slice(0, 16));
            onDatePreset("custom");
        } else if (preset === "7d")  { onDatePreset("7d");  }
        else if (preset === "30d") { onDatePreset("30d"); }
        else if (preset === "month") {
            const f = new Date(now.getFullYear(), now.getMonth(), 1);
            setCustomFrom(f.toISOString().slice(0, 16));
            setCustomTo(now.toISOString().slice(0, 16));
            onDatePreset("custom");
        } else if (preset === "prevMonth") {
            const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const t = new Date(now.getFullYear(), now.getMonth(), 1);
            setCustomFrom(f.toISOString().slice(0, 16));
            setCustomTo(t.toISOString().slice(0, 16));
            onDatePreset("custom");
        }
        setShowCal(false);
    };

    const applyCustom = () => {
        if (!draftFrom || !draftTo) return;
        setCustomFrom(draftFrom + "T00:00");
        setCustomTo(draftTo + "T23:59");
        onDatePreset("custom");
        setShowCal(false);
    };

    const pickCalDay = (dayStr) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (dayStr > todayStr) return; // no future dates
        if (calPhase === 0 || (draftFrom && dayStr < draftFrom)) {
            setDraftFrom(dayStr); setDraftTo(""); setCalPhase(1);
        } else {
            if (dayStr === draftFrom) { // single day
                setDraftTo(dayStr); setCalPhase(0);
            } else {
                setDraftTo(dayStr); setCalPhase(0);
            }
        }
    };

    const calPrevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const calNextMonth = () => {
        const now = new Date();
        if (viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth())) return;
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const rangeLabel = () => {
        if (datePreset === "today") return "Today";
        if (datePreset === "7d")    return "Last 7 days";
        if (datePreset === "30d")   return "Last 30 days";
        if (datePreset === "ytd")   return "This year";
        if (datePreset === "custom" && customFrom && customTo) {
            const f = new Date(customFrom), t = new Date(customTo);
            const fStr = f.toLocaleDateString("en-US", { month:"short", day:"numeric" });
            const tStr = t.toLocaleDateString("en-US", { month:"short", day:"numeric" });
            if (fStr === tStr) return fStr; // single day
            return `${fStr} → ${tStr}`;
        }
        return "Last 30 days";
    };

    return (
        <div className="cm-filterbar">
            <div className="cm-filter-row">
                {/* Environment */}
                <div className="cm-filter-step">
                    <div className="cm-step-tag">1</div>
                    <div className="cm-filter-block">
                        <div className="cm-filter-label"><Layers size={11} /> Environment</div>
                        <EnvMultiDropdown envs={envs} selectedEnvs={selectedEnvs} onToggleEnv={onToggleEnv} onAllEnvs={onAllEnvs} />
                    </div>
                </div>

                <ChevronRight size={16} className="cm-arrow" />

                {/* Product / Namespace */}
                <div className="cm-filter-step">
                    <div className="cm-step-tag">2</div>
                    <div className="cm-filter-block">
                        <div className="cm-filter-label"><Package size={11} /> Product or Namespace</div>
                        <div className="cm-scope-wrap" ref={scopeRef}>
                            {/* Trigger button */}
                            <button className={`cm-scope-btn${scope.type!=="all"?" active":""}`}
                                onClick={()=>{ setScopeSearch(""); setShowScopeDD(v=>!v); }}>
                                <Package size={11}/>
                                <span className="cm-scope-btn-label">
                                    {scope.type==="all" ? "All Products / Namespaces"
                                    : scope.type==="product" ? scope.key
                                    : `${scope.env.toUpperCase()} · ${scope.namespace}`}
                                </span>
                                <ChevronDown size={10} style={{opacity:.5}}/>
                            </button>

                            {showScopeDD && (
                                <div className="cm-scope-dd">
                                    {/* Search */}
                                    <div className="cm-scope-search-row">
                                        <Search size={12} className="cm-scope-search-icon"/>
                                        <input autoFocus className="cm-scope-search"
                                            placeholder="Search products or namespaces…"
                                            value={scopeSearch} onChange={e=>setScopeSearch(e.target.value)}/>
                                        {scopeSearch && <button className="cm-scope-search-clr" onClick={()=>setScopeSearch("")}>×</button>}
                                    </div>

                                    {/* All option */}
                                    <button className={`cm-scope-item cm-scope-all${scope.type==="all"?" sel":""}`}
                                        onClick={()=>{ onScope({type:"all"}); setShowScopeDD(false); }}>
                                        <span>All Products / Namespaces</span>
                                    </button>

                                    <div className="cm-scope-list">
                                    {/* Products */}
                                    {dropProducts.length > 0 && (
                                        <>
                                        <div className="cm-scope-group-hdr">Products</div>
                                        {dropProducts.map(p => {
                                            const pEnvs = Object.keys(p.byEnv).sort();
                                            const isSel = scope.type==="product" && scope.key===p.key;
                                            if (pEnvs.length === 1) {
                                                // single env — direct click
                                                return (
                                                    <button key={p.key}
                                                        className={`cm-scope-item${isSel?" sel":""}`}
                                                        onClick={()=>{ onScope({type:"product",key:p.key}); setOnlyEnv(pEnvs[0]); setShowScopeDD(false); }}>
                                                        <span className="cm-scope-env-chip">{pEnvs[0].toUpperCase()}</span>
                                                        <span className="cm-scope-name">{p.key}</span>
                                                    </button>
                                                );
                                            }
                                            // multi-env — show env chips
                                            return (
                                                <div key={p.key} className={`cm-scope-item cm-scope-multi${isSel?" sel":""}`}>
                                                    <span className="cm-scope-name">{p.key}</span>
                                                    <div className="cm-scope-env-chips">
                                                        {pEnvs.map(env=>(
                                                            <button key={env}
                                                                className="cm-scope-env-chip cm-scope-env-chip-btn"
                                                                onClick={()=>{ onScope({type:"product",key:p.key}); setOnlyEnv(env); setShowScopeDD(false); }}>
                                                                {env.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </>
                                    )}

                                    {/* Namespaces */}
                                    {dropNs.length > 0 && (
                                        <>
                                        <div className="cm-scope-group-hdr">Namespaces</div>
                                        {dropNs.map(n => {
                                            const isSel = scope.type==="namespace" && scope.env===n.env && scope.namespace===n.namespace;
                                            return (
                                                <button key={n.env+"/"+n.namespace}
                                                    className={`cm-scope-item${isSel?" sel":""}`}
                                                    onClick={()=>{ onScope({type:"namespace",env:n.env,namespace:n.namespace}); setOnlyEnv(n.env); setShowScopeDD(false); }}>
                                                    <span className="cm-scope-env-chip">{n.env.toUpperCase()}</span>
                                                    <span className="cm-scope-name">{n.namespace}</span>
                                                </button>
                                            );
                                        })}
                                        </>
                                    )}

                                    {dropProducts.length===0 && dropNs.length===0 && (
                                        <div className="cm-scope-empty">No results for "{scopeSearch}"</div>
                                    )}
                                    </div>{/* end cm-scope-list */}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="cm-spacer" />

                {/* Calendar date range */}
                <div className="cm-filter-block" ref={calRef} style={{ position: "relative" }}>
                    <div className="cm-filter-label"><Calendar size={11} /> Date range</div>
                    <button className="cm-cal-btn" onClick={openCal}>
                        <Calendar size={13} />
                        <span>{rangeLabel()}</span>
                        <ChevronDown size={12} style={{ opacity: 0.6 }} />
                    </button>
                    {showCal && (() => {
                        const daysInView = new Date(viewYear, viewMonth + 1, 0).getDate();
                        const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
                        const todayStr   = new Date().toISOString().slice(0, 10);
                        const canGoNext  = !(viewYear === new Date().getFullYear() && viewMonth >= new Date().getMonth());
                        return (
                        <div className="cm-cal-panel">
                            {/* Quick presets */}
                            <div className="cm-cal-title">Quick select</div>
                            <div className="cm-cal-quick">
                                {[
                                    { id:"today",     label:"Today"       },
                                    { id:"yesterday", label:"Yesterday"   },
                                    { id:"7d",        label:"Last 7 days" },
                                    { id:"30d",       label:"Last 30 days"},
                                    { id:"month",     label:"This month"  },
                                    { id:"prevMonth", label:"Last month"  },
                                ].map(q => (
                                    <button key={q.id} className="cm-cal-quick-btn" onClick={() => applyQuick(q.id)}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div className="cm-cal-divider">Pick date range</div>
                            <div className="cm-cal-month-nav">
                                <button className="cm-cal-nav-btn" onClick={calPrevMonth}>‹</button>
                                <span className="cm-cal-month-lbl">
                                    {new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                </span>
                                <button className="cm-cal-nav-btn" onClick={calNextMonth} disabled={!canGoNext} style={canGoNext?{}:{opacity:.3}}>›</button>
                            </div>
                            <div className="cm-cal-grid">
                                {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d, i) => (
                                    <div key={i} className="cm-cal-dow">{d}</div>
                                ))}
                                {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                                {Array.from({ length: daysInView }).map((_, i) => {
                                    const day = i + 1;
                                    const dayStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                                    const isFuture  = dayStr > todayStr;
                                    const isFrom    = draftFrom === dayStr;
                                    const isTo      = draftTo   === dayStr;
                                    const inRange   = draftFrom && draftTo && dayStr > draftFrom && dayStr < draftTo;
                                    const isToday   = dayStr === todayStr;
                                    return (
                                        <div key={day}
                                            className={`cm-cal-day${isFrom||isTo?" sel":""}${inRange?" in-range":""}${isToday&&!isFrom&&!isTo?" today":""}`}
                                            style={isFuture ? { opacity: 0.25, cursor: "not-allowed" } : { cursor: "pointer" }}
                                            onClick={() => pickCalDay(dayStr)}>
                                            {day}
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Selection display + apply */}
                            <div className="cm-cal-sel-row">
                                <span className="cm-cal-sel-label">
                                    {draftFrom || "—"} {" → "} {draftTo || (calPhase===1 ? "pick end…" : "—")}
                                </span>
                                {(draftFrom || draftTo) && (
                                    <button className="cm-cal-clear-btn" onClick={() => { setDraftFrom(""); setDraftTo(""); setCalPhase(0); }}>✕</button>
                                )}
                            </div>
                            <button className="cm-btn" style={{ width:"100%", justifyContent:"center", marginTop:4 }}
                                onClick={applyCustom} disabled={!draftFrom || !draftTo}>
                                Apply range
                            </button>
                        </div>
                        );
                    })()}
                </div>

                {/* Actions */}
                <div className="cm-filter-actions">
                    <button className="cm-btn" onClick={onRefresh} disabled={refreshing}>
                        <RefreshCw size={13} className={refreshing ? "spin" : ""} /> Refresh
                    </button>
                    <button className="cm-btn ghost" onClick={onReset}>
                        <X size={13} /> Reset
                    </button>
                </div>
            </div>

            {/* Active filter chips + last-updated */}
            {(loadedAt || hasFilters) && (
                <div className="cm-status">
                    {loadedAt && (
                        <span className="cm-status-line">
                            <Clock size={11} /> Updated {loadedAt.toLocaleTimeString()} · auto-refresh 60 s
                        </span>
                    )}
                    {hasFilters && <span className="cm-mute" style={{ fontSize:10 }}>Active filters:</span>}
                    {selectedEnvs.map((e, i) => (
                        <button key={e} className="cm-active-chip dismissible"
                            style={{ background: envColour(e,i)+"18", color: envColour(e,i), borderColor: envColour(e,i)+"50" }}
                            onClick={() => onRemoveEnv(e)}>
                            <span className="cm-dot" style={{ background: envColour(e,i) }} />
                            {e.toUpperCase()} <X size={10} />
                        </button>
                    ))}
                    {scope.type === "product" && (
                        <button className="cm-active-chip dismissible" onClick={onClearScope}>
                            <Package size={10}/> Product: {scope.key} <X size={10}/>
                        </button>
                    )}
                    {scope.type === "namespace" && (
                        <button className="cm-active-chip dismissible" onClick={onClearScope}>
                            <Box size={10}/> {scope.env.toUpperCase()}/{scope.namespace} <X size={10}/>
                        </button>
                    )}
                    {datePreset !== "30d" && (
                        <button className="cm-active-chip dismissible warn" onClick={onClearDate}>
                            <Calendar size={10}/> {rangeLabel()} <X size={10}/>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  MONTH PROGRESS RING                                                   */
/* ════════════════════════════════════════════════════════════════════ */
/*  PRICE HISTORY TIMELINE — full-screen modal                           */
/* ════════════════════════════════════════════════════════════════════ */

function PriceTimelineModal({ activeEnvs, envAgg, scope, onClose }) {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Calendar state — default to current month
    const [calFrom, setCalFrom] = useState(() => {
        const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
    });
    const [calTo,    setCalTo]    = useState(todayStr);
    const [calPhase, setCalPhase] = useState(2); // 0=fresh,1=picking-end,2=done
    const [hoverDay, setHoverDay] = useState(null);
    const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
    const [viewMonth,setViewMonth]= useState(() => new Date().getMonth());

    // Timeseries state
    const [pts,     setPts]     = useState({});
    const [loading, setLoading] = useState(false);

    // Hover tooltip state
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const [tipPos,     setTipPos]     = useState({ x: 0, y: 0 });
    const [pinnedIdx,  setPinnedIdx]  = useState(null);
    const [zoom,       setZoom]       = useState(1);
    const [darkMode,   setDarkMode]   = useState(false); // default: light theme

    const isProduct  = scope?.type === "product";
    const productKey_= isProduct ? scope.key : null;

    // Strip env prefix from namespace for display
    const nsDisplayName = (namespace) => {
        const parts = (namespace || "").split("-");
        if (parts.length > 1 && ENV_PREFIXES.has(parts[0].toLowerCase())) return parts.slice(1).join("-");
        return namespace;
    };

    // Compute granularity: hourly for ≤14 days, daily otherwise
    const daysDiff = useMemo(() => {
        if (!calFrom || !calTo) return 0;
        return Math.ceil((new Date(calTo) - new Date(calFrom)) / 86400000) + 1;
    }, [calFrom, calTo]);
    const gran   = daysDiff <= 14 ? "hour" : "day";
    const fromISO = calFrom ? new Date(calFrom + "T00:00:00").toISOString() : null;
    const toISO   = calTo   ? new Date(calTo   + "T23:59:59").toISOString() : null;

    // Fetch timeseries when range changes
    useEffect(() => {
        if (!fromISO || !toISO) return;
        setLoading(true);
        let dead = false;
        Promise.all(activeEnvs.map(env =>
            getPrometheusTimeseries(env, fromISO, toISO, gran)
                .then(d => [env, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [env, []])
        )).then(rows => {
            if (dead) return;
            const next = {};
            for (const [e, p] of rows) next[e] = p;
            setPts(next);
            setLoading(false);
        });
        return () => { dead = true; };
    }, [activeEnvs, fromISO, toISO, gran]);

    // Build detailed timeline with cumulative + change diffs
    const timeline = useMemo(() => {
        if (Object.keys(pts).length === 0) return [];
        const mult = gran === "hour" ? 1 : 24;

        const timeMap = new Map();
        for (const [env, points] of Object.entries(pts)) {
            for (const p of points) {
                if (!timeMap.has(p.t)) timeMap.set(p.t, { t: p.t, hourlyTotal: 0, envSnaps: {} });
                const b = timeMap.get(p.t);
                b.envSnaps[env] = p;
                if (productKey_) {
                    for (const ns of (p.namespaces || [])) {
                        if (productKey({ namespace: ns.namespace }) === productKey_)
                            b.hourlyTotal += ns.hourlyUsd || 0;
                    }
                } else {
                    b.hourlyTotal += p.smoothedHourlyUsd || p.totalHourlyUsd || 0;
                }
            }
        }

        const sorted = [...timeMap.values()].sort((a, b) => new Date(a.t) - new Date(b.t));
        let cumulative = 0;
        return sorted.map((b, i) => {
            const periodCost = b.hourlyTotal * mult;
            cumulative += periodCost;

            // Namespace breakdown for tooltip
            const nsMap = new Map();
            for (const [env, p] of Object.entries(b.envSnaps)) {
                for (const ns of (p.namespaces || [])) {
                    if (productKey_ && productKey({ namespace: ns.namespace }) !== productKey_) continue;
                    nsMap.set(`${env}/${ns.namespace}`, {
                        env, namespace: ns.namespace,
                        hourlyUsd: ns.hourlyUsd || 0,
                        cpuRequestCores: ns.cpuRequestCores || 0,
                        memoryRequestGb: ns.memoryRequestGb || 0,
                        podCount: ns.podCount || 0,
                    });
                }
            }
            const nsBreakdown = [...nsMap.values()].sort((a, z) => z.hourlyUsd - a.hourlyUsd);

            // Detect change vs previous bucket
            let changeKind = null, changeNote = "", changeDiffs = [];
            if (i > 0) {
                const prev = sorted[i - 1];
                const delta = b.hourlyTotal - prev.hourlyTotal;
                const pct = prev.hourlyTotal > 1e-6 ? Math.abs(delta / prev.hourlyTotal) * 100 : 0;
                const pctThreshold = 0.5; // catch even tiny changes across all granularities
                const absThreshold = 0.001;
                if (pct >= pctThreshold && Math.abs(delta) >= absThreshold) {
                    outer: for (const env of activeEnvs) {
                        const curP = b.envSnaps[env]; const preP = prev.envSnaps[env];
                        if (!curP || !preP) continue;
                        // detect new/removed namespaces as spec changes
                        for (const ns of (curP.namespaces || [])) {
                            if (productKey_ && productKey({ namespace: ns.namespace }) !== productKey_) continue;
                            const pNs = (preP.namespaces || []).find(n => n.namespace === ns.namespace);
                            if (!pNs) {
                                changeDiffs.push({
                                    env, namespace: ns.namespace,
                                    cpuBefore:0, cpuAfter: ns.cpuRequestCores||0, cpuDelta: ns.cpuRequestCores||0,
                                    memBefore:0, memAfter: ns.memoryRequestGb||0,  memDelta: ns.memoryRequestGb||0,
                                    podBefore:0, podAfter: ns.podCount||0, podDelta: ns.podCount||0,
                                    costBefore:0, costAfter: ns.hourlyUsd||0, costDelta: ns.hourlyUsd||0,
                                });
                                continue;
                            }
                            const cpuD = Math.abs((ns.cpuRequestCores||0) - (pNs.cpuRequestCores||0));
                            const memD = Math.abs((ns.memoryRequestGb||0)  - (pNs.memoryRequestGb||0));
                            if (cpuD > 0.01 || memD > 0.02) {
                                changeDiffs.push({
                                    env, namespace: ns.namespace,
                                    cpuBefore: pNs.cpuRequestCores||0, cpuAfter: ns.cpuRequestCores||0,
                                    cpuDelta: (ns.cpuRequestCores||0)-(pNs.cpuRequestCores||0),
                                    memBefore: pNs.memoryRequestGb||0,  memAfter: ns.memoryRequestGb||0,
                                    memDelta: (ns.memoryRequestGb||0)-(pNs.memoryRequestGb||0),
                                    podBefore: pNs.podCount||0, podAfter: ns.podCount||0,
                                    podDelta: (ns.podCount||0)-(pNs.podCount||0),
                                    costBefore: pNs.hourlyUsd||0, costAfter: ns.hourlyUsd||0,
                                    costDelta: (ns.hourlyUsd||0)-(pNs.hourlyUsd||0),
                                });
                            }
                        }
                    }
                    const isSpec = changeDiffs.length > 0;
                    changeKind = isSpec ? (delta > 0 ? "spec-up" : "spec-down") : (delta > 0 ? "price-up" : "price-down");
                    changeNote = isSpec ? (delta > 0 ? "Spec Upgrade" : "Spec Downgrade") : (delta > 0 ? "Cloud Price ▲" : "Cloud Price ▼");
                }
            }

            return {
                t: b.t, hourlyTotal: b.hourlyTotal, periodCost, cumulative,
                nsBreakdown, changeKind, changeNote, changeDiffs,
                prevHourly: i > 0 ? sorted[i-1].hourlyTotal : null,
            };
        });
    }, [pts, gran, activeEnvs, productKey_]);

    const rangeTotal  = timeline.length > 0 ? timeline[timeline.length - 1].cumulative : 0;
    const changeCount = timeline.filter(p => p.changeKind).length;

    // Calendar helpers
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
    const padDay = (d) => `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

    const applyPreset = (preset) => {
        const now = new Date(); const td = now.toISOString().slice(0, 10);
        if (preset === "today") { setCalFrom(td); setCalTo(td); setCalPhase(2); }
        else if (preset === "yesterday") {
            const y = new Date(now); y.setDate(y.getDate()-1); const ys = y.toISOString().slice(0,10);
            setCalFrom(ys); setCalTo(ys); setCalPhase(2);
        } else if (preset === "7d") {
            const f = new Date(now); f.setDate(f.getDate()-6);
            setCalFrom(f.toISOString().slice(0,10)); setCalTo(td); setCalPhase(2);
        } else if (preset === "month") {
            setCalFrom(new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10));
            setCalTo(td); setCalPhase(2);
        } else if (preset === "lastMonth") {
            setCalFrom(new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,10));
            setCalTo(new Date(now.getFullYear(),now.getMonth(),0).toISOString().slice(0,10)); setCalPhase(2);
        }
    };

    const pickDay = (ds) => {
        if (ds > todayStr) return;
        if (calPhase !== 1) { setCalFrom(ds); setCalTo(ds); setCalPhase(1); }
        else { setCalTo(ds < calFrom ? calFrom : ds); setCalFrom(ds < calFrom ? ds : calFrom); setCalPhase(2); }
    };

    // Effective range (includes hover preview while picking end)
    const effFrom = calPhase === 1 && hoverDay ? Math.min(calFrom, hoverDay) : calFrom;
    const effTo   = calPhase === 1 && hoverDay ? Math.max(calFrom, hoverDay) : calTo;

    // Label formatters
    const fmtTlLabel = (t) => {
        const d = new Date(t);
        if (gran === "hour") return d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false});
        return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    };
    const fmtFull = (t) => new Date(t).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});

    const CC = { "spec-up":"#ef4444","spec-down":"#10b981","price-up":"#f59e0b","price-down":"#0ea5e9" };
    const CI = { "spec-up":"⬆","spec-down":"⬇","price-up":"▲","price-down":"▼" };
    const PW = (gran === "hour" ? 90 : 120) * zoom;
    const scopeLabel = productKey_ ? productKey_ : activeEnvs.map(e=>e.toUpperCase()).join(" + ");

    return (
        <div className={`pth-overlay${darkMode ? "" : " pth-light"}`}>
            <div className="pth-window">
                {/* ── Header ── */}
                <div className="pth-header">
                    <GitCommit size={15} style={{color:"#6366f1"}}/>
                    <span className="pth-title">Price History Timeline</span>
                    <span className="pth-scope-badge">{scopeLabel}</span>
                    <span className="pth-gran-pill">{gran === "hour" ? "Hourly" : "Daily"} · {daysDiff}d</span>
                    <div className="pth-zoom-ctrl">
                        <button className="pth-zoom-btn" onClick={()=>setZoom(z=>Math.max(0.4,+(z-0.2).toFixed(1)))} title="Zoom out">−</button>
                        <span className="pth-zoom-val">{Math.round(zoom*100)}%</span>
                        <button className="pth-zoom-btn" onClick={()=>setZoom(z=>Math.min(3,+(z+0.2).toFixed(1)))} title="Zoom in">+</button>
                    </div>
                    <button className="pth-theme-btn" onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Switch to Light":"Switch to Dark"}>
                        {darkMode ? "☀" : "🌙"}
                    </button>
                    <button className="pth-close" onClick={onClose}><X size={15}/></button>
                </div>

                <div className="pth-body">
                    {/* ── Left: calendar sidebar ── */}
                    <div className="pth-sidebar">
                        {/* Quick presets */}
                        <div className="pth-presets">
                            {[["today","Today"],["yesterday","Yesterday"],["7d","Last 7 days"],["month","This Month"],["lastMonth","Last Month"]].map(([id,lbl])=>(
                                <button key={id} className="pth-preset-btn" onClick={()=>applyPreset(id)}>{lbl}</button>
                            ))}
                        </div>

                        {/* Calendar */}
                        <div className="pth-cal">
                            <div className="pth-cal-nav">
                                <button onClick={()=>{const d=new Date(viewYear,viewMonth-1,1);setViewYear(d.getFullYear());setViewMonth(d.getMonth());}}>‹</button>
                                <span>{new Date(viewYear,viewMonth).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
                                <button onClick={()=>{const d=new Date(viewYear,viewMonth+1,1);setViewYear(d.getFullYear());setViewMonth(d.getMonth());}}>›</button>
                            </div>
                            <div className="pth-cal-grid">
                                {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} className="pth-cal-dow">{d}</div>)}
                                {Array.from({length:firstDow},(_,i)=><div key={`e${i}`} className="pth-cal-empty"/>)}
                                {Array.from({length:daysInMonth},(_,i)=>{
                                    const ds = padDay(i+1);
                                    const isFut = ds > todayStr;
                                    const isSel = ds === calFrom || ds === calTo;
                                    const inRng = effFrom && effTo && ds > effFrom && ds < effTo;
                                    const isTod = ds === todayStr;
                                    return (
                                        <div key={i} onClick={()=>pickDay(ds)}
                                            onMouseEnter={()=>calPhase===1&&setHoverDay(ds)}
                                            onMouseLeave={()=>setHoverDay(null)}
                                            className={`pth-cal-day${isSel?" sel":""}${inRng?" in-range":""}${isTod?" today":""}${isFut?" future":""}`}>
                                            {i+1}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="pth-cal-info">
                                {calPhase===1 ? <span className="pth-cal-hint">Click end date</span>
                                    : calFrom && calTo ? <span>{calFrom === calTo ? calFrom : `${calFrom} → ${calTo}`}</span>
                                    : <span className="pth-cal-hint">Click to select</span>}
                            </div>
                        </div>

                        {/* Range stats */}
                        {timeline.length > 0 && (
                            <div className="pth-stats-box">
                                <div className="pth-stat-row"><span className="pth-stat-lbl">Total Cost</span><span className="pth-stat-val">{f$big(rangeTotal)}</span></div>
                                <div className="pth-stat-row"><span className="pth-stat-lbl">Data points</span><span className="pth-stat-val">{timeline.length}</span></div>
                                <div className="pth-stat-row"><span className="pth-stat-lbl">Events</span><span className="pth-stat-val" style={{color:changeCount>0?"#f59e0b":"#10b981"}}>{changeCount}</span></div>
                                <div className="pth-stat-row"><span className="pth-stat-lbl">Avg/hr</span><span className="pth-stat-val">{f$(timeline.reduce((s,p)=>s+p.hourlyTotal,0)/Math.max(timeline.length,1))}</span></div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className="pth-legend">
                            {[["spec-up","⬆ Spec upgrade"],["spec-down","⬇ Spec downgrade"],["price-up","▲ Cloud price ▲"],["price-down","▼ Cloud price ▼"]].map(([k,lbl])=>(
                                <div key={k} className="pth-leg-row" style={{color:CC[k]}}>{lbl}</div>
                            ))}
                        </div>
                    </div>

                    {/* ── Right: timeline track ── */}
                    <div className="pth-main">
                        {loading ? (
                            <div className="pth-center"><RefreshCw size={16} className="spin" style={{marginRight:8}}/>Loading timeline…</div>
                        ) : timeline.length === 0 ? (
                            <div className="pth-center">{calFrom && calTo ? "No data for this period." : "← Select a date range"}</div>
                        ) : (
                            <div className="pth-tl-scroll">
                                <div className="pth-tl-inner" style={{width: timeline.length*PW + 80}}>

                                    {/* ── SVG Sparkline area chart ── */}
                                    {(()=>{
                                        const SH=90, SW=timeline.length*PW+80;
                                        const maxC=Math.max(...timeline.map(p=>p.hourlyTotal),0.001);
                                        const minC=Math.min(...timeline.map(p=>p.hourlyTotal),0);
                                        const rng=maxC-minC||maxC;
                                        const xp=(i)=>40+i*PW+PW/2;
                                        const yp=(v)=>SH-10-((v-minC)/rng)*(SH-24);
                                        const linePts=timeline.map((p,i)=>`${xp(i)},${yp(p.hourlyTotal)}`).join(" ");
                                        const areaD=`M${xp(0)},${SH} ${timeline.map((p,i)=>`L${xp(i)},${yp(p.hourlyTotal)}`).join(" ")} L${xp(timeline.length-1)},${SH} Z`;
                                        return (
                                            <svg className="pth-sparkline" width={SW} height={SH}>
                                                <defs>
                                                    <linearGradient id="pth-ag" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28"/>
                                                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02"/>
                                                    </linearGradient>
                                                    <linearGradient id="pth-lg" x1="0" y1="0" x2="1" y2="0">
                                                        <stop offset="0%" stopColor="#818cf8"/>
                                                        <stop offset="100%" stopColor="#6366f1"/>
                                                    </linearGradient>
                                                    <filter id="pth-glow">
                                                        <feGaussianBlur stdDeviation="2" result="blur"/>
                                                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                                    </filter>
                                                </defs>
                                                {/* Y gridlines */}
                                                {[0.25,0.5,0.75].map(f=>(
                                                    <line key={f} x1={40} x2={SW-20}
                                                        y1={SH-10-(f*(SH-24))} y2={SH-10-(f*(SH-24))}
                                                        stroke={darkMode?"#1e2d4a":"#e2e8f0"} strokeWidth="0.8" strokeDasharray="3,4"/>
                                                ))}
                                                {/* Area */}
                                                <path d={areaD} fill="url(#pth-ag)"/>
                                                {/* Glow line */}
                                                <polyline points={linePts} fill="none" stroke="#6366f140" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"/>
                                                {/* Main line */}
                                                <polyline points={linePts} fill="none" stroke="url(#pth-lg)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
                                                {/* Event dots on sparkline */}
                                                {timeline.map((pt,i)=>pt.changeKind?(
                                                    <g key={i}>
                                                        <circle cx={xp(i)} cy={yp(pt.hourlyTotal)} r="5" fill={CC[pt.changeKind]} opacity="0.25"/>
                                                        <circle cx={xp(i)} cy={yp(pt.hourlyTotal)} r="3" fill={CC[pt.changeKind]} stroke={darkMode?"#0f1728":"#fff"} strokeWidth="1.5" filter="url(#pth-glow)"/>
                                                    </g>
                                                ):null)}
                                                {/* Hover crosshair */}
                                                {hoveredIdx!==null&&(
                                                    <line x1={xp(hoveredIdx)} x2={xp(hoveredIdx)} y1={4} y2={SH}
                                                        stroke="#6366f1" strokeWidth="1" strokeDasharray="3,3" opacity="0.6"/>
                                                )}
                                                {pinnedIdx!==null&&(
                                                    <line x1={xp(pinnedIdx)} x2={xp(pinnedIdx)} y1={4} y2={SH}
                                                        stroke="#6366f1" strokeWidth="1.5" opacity="0.9"/>
                                                )}
                                                {/* Y-axis labels */}
                                                <text x="2" y="14" fontSize="7.5" fill={darkMode?"#94a3b8":"#64748b"} fontWeight="600">{f$(maxC)}</text>
                                                <text x="2" y={SH-2} fontSize="7.5" fill={darkMode?"#94a3b8":"#64748b"} fontWeight="600">{f$(minC)}</text>
                                            </svg>
                                        );
                                    })()}

                                    {/* ── Event flags with vertical connector ── */}
                                    <div className="pth-tl-events">
                                        {timeline.map((pt,i)=>(
                                            <div key={i} className="pth-tl-ev-cell" style={{width:PW}}>
                                                {pt.changeKind&&(
                                                    <div className="pth-ev-flag-wrap">
                                                        <div className="pth-ev-flag" style={{color:CC[pt.changeKind],borderColor:CC[pt.changeKind],background:CC[pt.changeKind]+"20"}}
                                                            title={`${pt.changeNote} — hover dot for details`}>
                                                            {CI[pt.changeKind]}
                                                        </div>
                                                        <div className="pth-ev-connector" style={{background:`linear-gradient(to bottom,${CC[pt.changeKind]},${CC[pt.changeKind]}00)`}}/>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* ── Track line + dots ── */}
                                    <div className="pth-tl-line">
                                        {timeline.map((pt,i)=>{
                                            const col=pt.changeKind?CC[pt.changeKind]:"#6366f1";
                                            const isPinned=pinnedIdx===i;
                                            const isHov=hoveredIdx===i;
                                            return (
                                                <div key={i}
                                                    className={`pth-dot-wrap${isHov?" hovered":""}${isPinned?" pinned":""}${pt.changeKind?" has-event":""}`}
                                                    style={{width:PW}}
                                                    onMouseEnter={e=>{setHoveredIdx(i);const r=e.currentTarget.getBoundingClientRect();setTipPos({x:r.left,y:r.top});}}
                                                    onMouseLeave={()=>setHoveredIdx(null)}
                                                    onClick={()=>setPinnedIdx(isPinned?null:i)}>
                                                    {pt.changeKind&&<div className="pth-dot-pulse" style={{"--pc":col}}/>}
                                                    {isPinned&&<div className="pth-dot-pin-ring" style={{"--pc":col}}/>}
                                                    <div className="pth-dot" style={{
                                                        background:col,
                                                        width: isPinned?14:pt.changeKind?12:8,
                                                        height: isPinned?14:pt.changeKind?12:8,
                                                        boxShadow: isPinned
                                                            ?`0 0 0 3px #fff,0 0 0 7px ${col}55,0 0 12px ${col}40`
                                                            :isHov?`0 0 0 3px ${col}40,0 0 8px ${col}30`
                                                            :pt.changeKind?`0 0 0 2px ${col}30`:undefined,
                                                    }}/>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ── Mini cost bars ── */}
                                    {(()=>{
                                        const maxB=Math.max(...timeline.map(p=>p.periodCost),0.001);
                                        return (
                                            <div className="pth-tl-bars">
                                                {timeline.map((pt,i)=>{
                                                    const col=pt.changeKind?CC[pt.changeKind]:"#6366f1";
                                                    const h=Math.max(2,Math.round((pt.periodCost/maxB)*30));
                                                    const isPinned=pinnedIdx===i;
                                                    const isHov=hoveredIdx===i;
                                                    return (
                                                        <div key={i} className="pth-bar-cell" style={{width:PW}}>
                                                            <div className="pth-bar" style={{
                                                                height:h,
                                                                background:isHov||isPinned?col:col+"70",
                                                                boxShadow:isHov||isPinned?`0 0 6px ${col}60`:undefined,
                                                                transition:"all .2s",
                                                            }}/>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    {/* ── Labels ── */}
                                    <div className="pth-tl-labels">
                                        {timeline.map((pt,i)=>(
                                            <div key={i}
                                                className={`pth-lbl-cell${hoveredIdx===i||pinnedIdx===i?" active":""}`}
                                                style={{width:PW}}>
                                                <div className="pth-lbl-time">{fmtTlLabel(pt.t)}</div>
                                                <div className="pth-lbl-period" style={{color:pt.changeKind?CC[pt.changeKind]:undefined}}>{f$(pt.periodCost)}</div>
                                                <div className="pth-lbl-cum">Σ {f$big(pt.cumulative)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Pinned detail panel (click-to-pin) ── */}
                        {pinnedIdx!==null&&timeline[pinnedIdx]&&(()=>{
                            const pt=timeline[pinnedIdx];
                            const maxNsC=Math.max(...pt.nsBreakdown.map(n=>n.hourlyUsd),0.001);
                            return (
                                <div className="pth-pin-panel">
                                    <div className="pth-pin-header">
                                        <span className="pth-pin-time">{fmtFull(pt.t)}</span>
                                        <div className="pth-pin-kpis">
                                            <span><b>{f$(pt.hourlyTotal)}</b>/hr</span>
                                            <span>Period: <b>{f$(pt.periodCost)}</b></span>
                                            <span>Σ Cumulative: <b style={{color:"#6366f1"}}>{f$big(pt.cumulative)}</b></span>
                                        </div>
                                        {pt.changeKind&&(
                                            <span className="pth-pin-evt" style={{color:CC[pt.changeKind]}}>
                                                {CI[pt.changeKind]} {pt.changeNote}
                                                {" "}({pt.hourlyTotal>(pt.prevHourly||0)?"+":""}{f$((pt.hourlyTotal-(pt.prevHourly||0)))}/hr)
                                            </span>
                                        )}
                                        <button className="pth-pin-close" onClick={()=>setPinnedIdx(null)}><X size={12}/></button>
                                    </div>
                                    <div className="pth-pin-body">
                                        {pt.changeDiffs.length>0&&(
                                            <div className="pth-pin-diffs">
                                                {pt.changeDiffs.map((d,di)=>(
                                                    <div key={di} className="pth-tip-diff">
                                                        <div className="pth-tip-diff-ns">{d.env.toUpperCase()} / {nsDisplayName(d.namespace)}</div>
                                                        {Math.abs(d.cpuDelta)>0.01&&<div className="pth-tip-diff-row">CPU: <b>{fN(d.cpuBefore,2)}c</b> → <b>{fN(d.cpuAfter,2)}c</b> <span style={{color:d.cpuDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.cpuDelta>0?"+":""}{fN(d.cpuDelta,2)}c)</span></div>}
                                                        {Math.abs(d.memDelta)>0.05&&<div className="pth-tip-diff-row">Mem: <b>{fN(d.memBefore,1)} GB</b> → <b>{fN(d.memAfter,1)} GB</b> <span style={{color:d.memDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.memDelta>0?"+":""}{fN(d.memDelta,1)} GB)</span></div>}
                                                        {d.podDelta!==0&&<div className="pth-tip-diff-row">Pods: <b>{d.podBefore}</b> → <b>{d.podAfter}</b> <span style={{color:d.podDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.podDelta>0?"+":""}{d.podDelta})</span></div>}
                                                        <div className="pth-tip-diff-row">Cost: <b>{f$(d.costBefore)}/hr</b> → <b>{f$(d.costAfter)}/hr</b> <span style={{color:d.costDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.costDelta>0?"+":""}{f$(d.costDelta)}/hr)</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="pth-pin-ns">
                                            {pt.nsBreakdown.map((ns,ni)=>(
                                                <div key={ni} className="pth-tip-ns-row">
                                                    <div className="pth-tip-ns-name">{ns.env.toUpperCase()} / {nsDisplayName(ns.namespace)}</div>
                                                    <div className="pth-tip-ns-bar-wrap"><div className="pth-tip-ns-bar" style={{width:`${(ns.hourlyUsd/maxNsC)*100}%`}}/></div>
                                                    <div className="pth-tip-ns-vals">
                                                        <span>{f$(ns.hourlyUsd)}/hr</span>
                                                        <span>{fN(ns.cpuRequestCores,1)}c CPU</span>
                                                        <span>{fN(ns.memoryRequestGb,1)} GB</span>
                                                        <span>{ns.podCount} pods</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Hover tooltip ── */}
                        {hoveredIdx!==null&&timeline[hoveredIdx]&&(()=>{
                            const pt=timeline[hoveredIdx];
                            const maxNsC=Math.max(...pt.nsBreakdown.map(n=>n.hourlyUsd),0.001);
                            return (
                                <div className="pth-tooltip" style={{
                                    position:"fixed",
                                    left:Math.min(tipPos.x+16,window.innerWidth-320),
                                    top:Math.max(tipPos.y-220,60),
                                }}>
                                    <div className="pth-tip-time">{fmtFull(pt.t)}</div>
                                    <div className="pth-tip-kpis">
                                        <div><span className="pth-tip-lbl">$/hr</span><span className="pth-tip-val">{f$(pt.hourlyTotal)}</span></div>
                                        <div><span className="pth-tip-lbl">Period</span><span className="pth-tip-val">{f$(pt.periodCost)}</span></div>
                                        <div><span className="pth-tip-lbl">Σ Total</span><span className="pth-tip-val" style={{color:"#6366f1",fontWeight:800}}>{f$big(pt.cumulative)}</span></div>
                                    </div>

                                    {pt.changeKind&&(
                                        <div className="pth-tip-evt" style={{borderColor:CC[pt.changeKind]+"50",background:CC[pt.changeKind]+"08"}}>
                                            <div className="pth-tip-evt-title" style={{color:CC[pt.changeKind]}}>
                                                {CI[pt.changeKind]} {pt.changeNote}
                                                <span style={{marginLeft:6}}>
                                                    ({pt.hourlyTotal>(pt.prevHourly||0)?"+":""}{f$((pt.hourlyTotal-(pt.prevHourly||0)))}/hr)
                                                </span>
                                            </div>
                                            {pt.changeDiffs.length===0&&(
                                                <div className="pth-tip-diff-row">
                                                    Rate: {f$(pt.prevHourly||0)}/hr → {f$(pt.hourlyTotal)}/hr
                                                </div>
                                            )}
                                            {pt.changeDiffs.map((d,di)=>(
                                                <div key={di} className="pth-tip-diff">
                                                    <div className="pth-tip-diff-ns">{d.env.toUpperCase()} / {nsDisplayName(d.namespace)}</div>
                                                    {Math.abs(d.cpuDelta)>0.01&&<div className="pth-tip-diff-row">CPU: <b>{fN(d.cpuBefore,2)}c</b> → <b>{fN(d.cpuAfter,2)}c</b> <span style={{color:d.cpuDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.cpuDelta>0?"+":""}{fN(d.cpuDelta,2)}c)</span></div>}
                                                    {Math.abs(d.memDelta)>0.05&&<div className="pth-tip-diff-row">Mem: <b>{fN(d.memBefore,1)} GB</b> → <b>{fN(d.memAfter,1)} GB</b> <span style={{color:d.memDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.memDelta>0?"+":""}{fN(d.memDelta,1)} GB)</span></div>}
                                                    {d.podDelta!==0&&<div className="pth-tip-diff-row">Pods: <b>{d.podBefore}</b> → <b>{d.podAfter}</b> <span style={{color:d.podDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.podDelta>0?"+":""}{d.podDelta})</span></div>}
                                                    <div className="pth-tip-diff-row">Cost: <b>{f$(d.costBefore)}/hr</b> → <b>{f$(d.costAfter)}/hr</b> <span style={{color:d.costDelta>0?"#ef4444":"#10b981",fontWeight:700}}>({d.costDelta>0?"+":""}{f$(d.costDelta)}/hr)</span></div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {pt.nsBreakdown.length>0&&(
                                        <div className="pth-tip-ns">
                                            <div className="pth-tip-ns-hdr">Namespace Breakdown</div>
                                            {pt.nsBreakdown.slice(0,6).map((ns,ni)=>(
                                                <div key={ni} className="pth-tip-ns-row">
                                                    <div className="pth-tip-ns-name">{ns.env.toUpperCase()} / {nsDisplayName(ns.namespace)}</div>
                                                    <div className="pth-tip-ns-bar-wrap"><div className="pth-tip-ns-bar" style={{width:`${(ns.hourlyUsd/maxNsC)*100}%`}}/></div>
                                                    <div className="pth-tip-ns-vals">
                                                        <span>{f$(ns.hourlyUsd)}/hr</span>
                                                        <span>{fN(ns.cpuRequestCores,1)}c CPU</span>
                                                        <span>{fN(ns.memoryRequestGb,1)} GB</span>
                                                        <span>{ns.podCount} pods</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  KPI STRIP — Today / This Month / Last Month                          */
/* ════════════════════════════════════════════════════════════════════ */

function KpiStrip({ totals, envAgg, activeEnvs, scope, catalogue,
                    todayTsByEnv, yesterdayTsByEnv, prevMonthPts,
                    prevMonthByEnv, prevMonthCost }) {
    const [modal,      setModal]      = useState(null);

    // Per-card custom selection: null = live default
    const [c0Date,  setC0Date]  = useState(null); // "YYYY-MM-DD" for card 0 (Today)
    const [c1Date,  setC1Date]  = useState(null); // "YYYY-MM-DD" for card 1 (Yesterday)
    const [c2MRef,  setC2MRef]  = useState(null); // {year,month} for card 2 (This Month)
    const [c3MRef,  setC3MRef]  = useState(null); // {year,month} for card 3 (Last Month)

    // Per-card fetched timeseries (null = use live data)
    const [c0Ts,      setC0Ts]      = useState(null);
    const [c1Ts,      setC1Ts]      = useState(null);
    const [c2Ts,      setC2Ts]      = useState(null);
    const [c3Ts,      setC3Ts]      = useState(null);
    const [c0Loading, setC0Loading] = useState(false);
    const [c1Loading, setC1Loading] = useState(false);
    const [c2Loading, setC2Loading] = useState(false);
    const [c3Loading, setC3Loading] = useState(false);

    // Picker UI state (only one open at a time)
    const [openPicker,   setOpenPicker]   = useState(null); // null|0|1|2|3
    const [calNavYear,   setCalNavYear]   = useState(() => new Date().getFullYear());
    const [calNavMonth,  setCalNavMonth]  = useState(() => new Date().getMonth());
    const pickerRef = useRef(null);

    const now = new Date();
    const todayStr_  = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const prevMN     = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const thisMN     = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const yest       = new Date(now); yest.setDate(yest.getDate() - 1);
    const yestStr_   = yest.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const isProduct   = scope?.type === "product";
    const productKey_ = isProduct ? scope.key : null;

    /* ── Close picker on outside click ── */
    useEffect(() => {
        const h = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) setOpenPicker(null);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    /* ── Fetch helpers for per-card timeseries ── */
    const fetchDayTs = useCallback((dateStr, setTs, setLoading) => {
        if (!dateStr) { setTs(null); return; }
        setLoading(true);
        const D = new Date(dateStr + "T00:00:00");
        const from = D.toISOString();
        const to   = new Date(D.getFullYear(), D.getMonth(), D.getDate(), 23, 59, 59).toISOString();
        let dead = false;
        Promise.all(activeEnvs.map(env =>
            getPrometheusTimeseries(env, from, to, "hour")
                .then(d => [env, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [env, []])
        )).then(rows => {
            if (dead) return;
            const tsByEnv = {};
            for (const [e, pts] of rows) tsByEnv[e] = pts;
            setTs(tsByEnv);
            setLoading(false);
        });
        return () => { dead = true; };
    }, [activeEnvs]);

    const fetchMonthTs = useCallback((mref, setTs, setLoading) => {
        if (!mref) { setTs(null); return; }
        setLoading(true);
        const mS   = new Date(mref.year, mref.month, 1);
        const isCur = mref.year === now.getFullYear() && mref.month === now.getMonth();
        const mE   = isCur ? now : new Date(mref.year, mref.month + 1, 1);
        const from = mS.toISOString();
        const to   = mE.toISOString();
        let dead = false;
        Promise.all(activeEnvs.map(env =>
            getPrometheusTimeseries(env, from, to, "day")
                .then(d => [env, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [env, []])
        )).then(rows => {
            if (dead) return;
            const tsByEnv = {};
            for (const [e, pts] of rows) tsByEnv[e] = pts;
            setTs(tsByEnv);
            setLoading(false);
        });
        return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeEnvs]);

    /* ── Per-card fetch effects ── */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => fetchDayTs(c0Date, setC0Ts, setC0Loading),   [c0Date, activeEnvs]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => fetchDayTs(c1Date, setC1Ts, setC1Loading),   [c1Date, activeEnvs]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => fetchMonthTs(c2MRef, setC2Ts, setC2Loading), [c2MRef, activeEnvs]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => fetchMonthTs(c3MRef, setC3Ts, setC3Loading), [c3MRef, activeEnvs]);

    /* ── Helper: sum timeseries pts → {total, byEnv} ── */
    const sumTs = useCallback((tsByEnv, pkFilter, mult = 1) => {
        const byEnv = {};
        let total = 0;
        for (const env of activeEnvs) {
            const pts = tsByEnv[env] || [];
            let cost = 0;
            for (const p of pts) {
                if (pkFilter) {
                    for (const ns of (p.namespaces || [])) {
                        if (productKey({ namespace: ns.namespace }) === pkFilter) cost += (ns.hourlyUsd || 0) * mult;
                    }
                } else {
                    cost += (p.smoothedHourlyUsd || p.totalHourlyUsd || 0) * mult;
                }
            }
            byEnv[env] = cost;
            total += cost;
        }
        return { total, byEnv };
    }, [activeEnvs]);

    const slotCost = useCallback((slot) =>
        slot ? sumTs(slot.tsByEnv, productKey_, slot.mult) : { total: 0, byEnv: {} },
    [sumTs, productKey_]);

    /* ── Live data (default mode) ── */
    const todayC     = useMemo(() => sumTs(todayTsByEnv,     productKey_, 1), [sumTs, todayTsByEnv,     productKey_]);
    const yesterdayC = useMemo(() => sumTs(yesterdayTsByEnv, productKey_, 1), [sumTs, yesterdayTsByEnv, productKey_]);
    const prevMonthC = useMemo(() => {
        const byEnv = {}; let total = 0;
        for (const env of activeEnvs) {
            const pts = prevMonthPts[env] || []; let cost = 0;
            for (const p of pts) {
                if (productKey_) { for (const ns of (p.namespaces||[])) { if (productKey({namespace:ns.namespace})===productKey_) cost+=(ns.hourlyUsd||0)*24; } }
                else { cost += (p.smoothedHourlyUsd||p.totalHourlyUsd||0)*24; }
            }
            byEnv[env] = cost; total += cost;
        }
        return { total, byEnv };
    }, [activeEnvs, prevMonthPts, productKey_]);

    const mtdTotal = useMemo(() => {
        if (productKey_) { const p = catalogue.products.find(x=>x.key===productKey_); return p?p.totalMtd:0; }
        return totals.mtd;
    }, [productKey_, catalogue, totals]);
    const mtdByEnv = useMemo(() => {
        const out = {};
        if (productKey_) { const p = catalogue.products.find(x=>x.key===productKey_); for (const env of activeEnvs) { const ns=(p?.namespaces||[]).filter(n=>n.env===env); out[env]=ns.reduce((s,n)=>s+(n.monthToDateUsd||0),0); } }
        else { for (const e of envAgg) out[e.env]=e.mtd; }
        return out;
    }, [productKey_, catalogue, envAgg, activeEnvs]);

    const monthVsPrev = (prevMonthC.total>0&&mtdTotal>0) ? ((mtdTotal-prevMonthC.total)/prevMonthC.total)*100 : null;

    /* ── Smart relative date label ── */
    const smartDateLabel = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr + "T00:00:00");
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dMid     = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.round((todayMid - dMid) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        if (diff === 2) return "Day Before Yesterday";
        if (diff <= 7)  return "Last " + d.toLocaleDateString("en-US", { weekday: "long" });
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    };

    /* ── 4 card data — per-card custom or live ── */
    const cards = useMemo(() => {
        const c0Cost = c0Ts ? sumTs(c0Ts, productKey_, 1)  : todayC;
        const c1Cost = c1Ts ? sumTs(c1Ts, productKey_, 1)  : yesterdayC;
        const c2Cost = c2Ts ? sumTs(c2Ts, productKey_, 24) : { total: mtdTotal, byEnv: mtdByEnv };
        const c3Cost = c3Ts ? sumTs(c3Ts, productKey_, 24) : prevMonthC;

        // Smart labels (Today / Yesterday / Day Before Yesterday / Last Thursday / actual date)
        const c0Lbl = c0Date ? smartDateLabel(c0Date) : "Today";
        const c1Lbl = c1Date ? smartDateLabel(c1Date) : "Yesterday";
        const c2Lbl = c2MRef ? new Date(c2MRef.year,c2MRef.month).toLocaleDateString("en-US",{month:"long",year:"numeric"}) : thisMN;
        const c3Lbl = c3MRef ? new Date(c3MRef.year,c3MRef.month).toLocaleDateString("en-US",{month:"long",year:"numeric"}) : prevMN;

        // Actual date shown as secondary line in each card
        const fmtDay = (iso) => new Date(iso+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
        const c0DateStr = c0Date ? fmtDay(c0Date) : todayStr_;
        const c1DateStr = c1Date ? fmtDay(c1Date) : yestStr_;
        const c2DateStr = null; // month cards don't need a date sub-line
        const c3DateStr = null;

        return [
            { cost: c0Cost, label: c0Lbl, dateStr: c0DateStr, badge: null,              color: "#10b981", isCustom: !!c0Date, loading: c0Loading },
            { cost: c1Cost, label: c1Lbl, dateStr: c1DateStr, badge: null,              color: "#0ea5e9", isCustom: !!c1Date, loading: c1Loading },
            { cost: c2Cost, label: c2Lbl, dateStr: c2DateStr, badge: c2MRef?null:"MTD", color: "#6366f1", isCustom: !!c2MRef, loading: c2Loading },
            { cost: c3Cost, label: c3Lbl, dateStr: c3DateStr, badge: null,              color: "#475569", isCustom: !!c3MRef, loading: c3Loading },
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [c0Ts,c1Ts,c2Ts,c3Ts,c0Loading,c1Loading,c2Loading,c3Loading,c0Date,c1Date,c2MRef,c3MRef,todayC,yesterdayC,mtdTotal,mtdByEnv,prevMonthC,productKey_]);

    const scopeLabel = isProduct ? ` · ${productKey_}` : "";

    /* ── Modal period info ── */
    const modalPeriod = (idx) => {
        if (idx === 0 && c0Date) {
            const D = new Date(c0Date+"T00:00:00");
            return { period:"custom", from:D, to:new Date(D.getFullYear(),D.getMonth(),D.getDate(),23,59,59), gran:"hour" };
        }
        if (idx === 1 && c1Date) {
            const D = new Date(c1Date+"T00:00:00");
            return { period:"custom", from:D, to:new Date(D.getFullYear(),D.getMonth(),D.getDate(),23,59,59), gran:"hour" };
        }
        if (idx === 2 && c2MRef) {
            const mS = new Date(c2MRef.year,c2MRef.month,1);
            const isCur = c2MRef.year===now.getFullYear()&&c2MRef.month===now.getMonth();
            return { period:"custom", from:mS, to:isCur?now:new Date(c2MRef.year,c2MRef.month+1,1), gran:"day" };
        }
        if (idx === 3 && c3MRef) {
            const mS = new Date(c3MRef.year,c3MRef.month,1);
            const isCur = c3MRef.year===now.getFullYear()&&c3MRef.month===now.getMonth();
            return { period:"custom", from:mS, to:isCur?now:new Date(c3MRef.year,c3MRef.month+1,1), gran:"day" };
        }
        return { period:["today","yesterday","month","prevMonth"][idx], from:null, to:null, gran:null };
    };

    const todayISO = now.toISOString().slice(0,10);

    // Calendar nav helpers (for currently-open picker)
    const calDaysInMonth = new Date(calNavYear, calNavMonth+1, 0).getDate();
    const calFirstDow    = new Date(calNavYear, calNavMonth, 1).getDay();
    const padDay = (d) => `${calNavYear}-${String(calNavMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

    const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    /* ── Open picker for a card ── */
    const openPickerFor = (idx) => {
        if (openPicker === idx) { setOpenPicker(null); return; }
        // Navigate calendar to the card's current custom selection, or today
        if (idx < 2) {
            const sel = idx===0 ? c0Date : c1Date;
            const d = sel ? new Date(sel+"T00:00:00") : now;
            setCalNavYear(d.getFullYear()); setCalNavMonth(d.getMonth());
        } else {
            const sel = idx===2 ? c2MRef : c3MRef;
            if (sel) { setCalNavYear(sel.year); }
            else { setCalNavYear(now.getFullYear()); }
        }
        setOpenPicker(idx);
    };

    /* ── Reset a card to live default ── */
    const resetCard = (idx) => {
        if (idx===0) { setC0Date(null); setC0Ts(null); }
        if (idx===1) { setC1Date(null); setC1Ts(null); }
        if (idx===2) { setC2MRef(null); setC2Ts(null); }
        if (idx===3) { setC3MRef(null); setC3Ts(null); }
        setOpenPicker(null);
    };

    const EnvPills = ({ byEnvCost }) => {
        if (envAgg.length < 2) return null;
        return (
            <div className="cm-kpi-env-pills">
                {envAgg.filter(e => activeEnvs.includes(e.env)).map(e => (
                    <div key={e.env} className="cm-kpi-env-pill" style={{ borderColor:e.colour+"50", background:e.colour+"0d" }}>
                        <span className="cm-dot" style={{ background:e.colour }}/>
                        <span style={{ color:e.colour, fontWeight:700 }}>{e.env.toUpperCase()}</span>
                        <span style={{ color:"#475569" }}> {f$big(byEnvCost[e.env]||0)}</span>
                    </div>
                ))}
            </div>
        );
    };

    const CardIcon = ({ idx }) => {
        const I = [Calendar, Clock, TrendingUp, Activity]; const T = I[idx]; return <T size={11}/>;
    };

    /* ── Per-card picker dropdown renderer ── */
    const renderPicker = (idx) => {
        const isDay = idx < 2;
        const selDate = idx===0 ? c0Date : c1Date;
        const selMRef = idx===2 ? c2MRef : c3MRef;
        const cardColor = cards[idx]?.color || "#6366f1";

        if (isDay) {
            return (
                <div className="cm-kpi-picker-dd" ref={pickerRef} onClick={e=>e.stopPropagation()}>
                    <div className="cm-kpi-picker-hdr">
                        <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em"}}>Pick a Day</span>
                        {selDate && <button className="cm-kpi-picker-reset" onClick={()=>resetCard(idx)}>↺ Default</button>}
                    </div>
                    <div className="cm-kpi-picker-cal-nav">
                        <button onClick={()=>{const d=new Date(calNavYear,calNavMonth-1,1);setCalNavYear(d.getFullYear());setCalNavMonth(d.getMonth());}}>‹</button>
                        <span>{new Date(calNavYear,calNavMonth).toLocaleDateString("en-US",{month:"short",year:"numeric"})}</span>
                        <button onClick={()=>{
                            const d=new Date(calNavYear,calNavMonth+1,1);
                            if(d<=now){setCalNavYear(d.getFullYear());setCalNavMonth(d.getMonth());}
                        }}>›</button>
                    </div>
                    <div className="cm-kpi-picker-cal-grid">
                        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} className="cm-kpi-picker-cal-dow">{d}</div>)}
                        {Array.from({length:calFirstDow},(_,i)=><div key={`e${i}`}/>)}
                        {Array.from({length:calDaysInMonth},(_,i)=>{
                            const ds=padDay(i+1); const isFut=ds>todayISO; const isSel=selDate===ds; const isTod=ds===todayISO;
                            return (
                                <button key={i} disabled={isFut}
                                    className={`cm-kpi-picker-cal-day${isSel?" sel":""}${isTod?" today":""}${isFut?" future":""}`}
                                    style={isSel?{background:cardColor,borderColor:cardColor}:{}}
                                    onClick={()=>{
                                        if(isFut) return;
                                        if(idx===0){setC0Date(ds);}else{setC1Date(ds);}
                                        setOpenPicker(null);
                                    }}>
                                    {i+1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Month picker for cards 2 & 3
        return (
            <div className="cm-kpi-picker-dd" ref={pickerRef} onClick={e=>e.stopPropagation()}>
                <div className="cm-kpi-picker-hdr">
                    <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em"}}>Pick a Month</span>
                    {selMRef && <button className="cm-kpi-picker-reset" onClick={()=>resetCard(idx)}>↺ Default</button>}
                </div>
                <div className="cm-kpi-picker-cal-nav">
                    <button onClick={()=>setCalNavYear(y=>y-1)}>‹</button>
                    <span>{calNavYear}</span>
                    <button onClick={()=>setCalNavYear(y=>Math.min(now.getFullYear(),y+1))}>›</button>
                </div>
                <div className="cm-kpi-picker-months-grid">
                    {MONTHS_SHORT.map((m,mi)=>{
                        const isFut = calNavYear>now.getFullYear()||(calNavYear===now.getFullYear()&&mi>now.getMonth());
                        const isAct = selMRef?.year===calNavYear && selMRef?.month===mi;
                        return (
                            <button key={m} disabled={isFut}
                                className={`cm-kpi-picker-mo-btn${isAct?" active":""}${isFut?" future":""}`}
                                style={isAct?{background:cardColor,borderColor:cardColor,color:"#fff"}:{}}
                                onClick={()=>{
                                    if(isFut) return;
                                    if(idx===2){setC2MRef({year:calNavYear,month:mi});}else{setC3MRef({year:calNavYear,month:mi});}
                                    setOpenPicker(null);
                                }}>
                                {m}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <>
        <div className="cm-kpi-v3">
            {/* ── 4 cards each with per-card calendar icon ── */}
            {cards.map((card, idx) => {
                const mp = modalPeriod(idx);
                const isLoading = card.loading || (idx===1 && !c1Date && Object.keys(yesterdayTsByEnv).length===0) || (idx===3 && !c3MRef && prevMonthCost===null);
                const trend = idx===3 && !c3MRef && monthVsPrev!==null ? (
                    <span style={{ color:monthVsPrev>0?"#ef4444":"#10b981", fontWeight:700 }}>
                        {monthVsPrev>0?"▲":"▼"} {Math.abs(monthVsPrev).toFixed(1)}% vs this month
                    </span>
                ) : null;
                return (
                    <React.Fragment key={idx}>
                        {idx > 0 && <div className="cm-kpi-v3-sep"/>}
                        <div className="cm-kpi-v3-card-wrap">
                            <div className={`cm-kpi-v3-card${idx===2&&!c2MRef?" primary":""}`}
                                role="button" onClick={() => setModal(idx)}>
                                <div className="cm-kpi-v3-label-row">
                                    <div className="cm-kpi-v3-label">
                                        <CardIcon idx={idx}/> {card.label}{scopeLabel}
                                        {card.badge && <span className="cm-kpi-v3-badge">{card.badge}</span>}
                                        {card.isCustom && <span className="cm-kpi-v3-custom-dot" style={{background:card.color}}/>}
                                    </div>
                                    <button
                                        className={`cm-kpi-v3-cal-btn${card.isCustom?" active":""}`}
                                        style={card.isCustom?{color:card.color,borderColor:card.color+"40",background:card.color+"12"}:{}}
                                        title="Pick custom period"
                                        onClick={e=>{e.stopPropagation();openPickerFor(idx);}}>
                                        <Calendar size={11}/>
                                    </button>
                                </div>
                                {card.dateStr && <div className="cm-kpi-v3-date">{card.dateStr}</div>}
                                <div className="cm-kpi-v3-value" style={{ color: card.color }}>
                                    {isLoading ? <span className="cm-mute" style={{fontSize:16}}>Loading…</span> : f$big(card.cost.total)}
                                </div>
                                <div className="cm-kpi-v3-sub">{trend || (idx===2&&!c2MRef ? "month-to-date · real usage" : idx<2 ? "actual · reserved quota" : "monthly total")}</div>
                                <EnvPills byEnvCost={card.cost.byEnv}/>
                                <div className="cm-kpi-v3-hint">click · breakdown ↗</div>
                            </div>
                            {openPicker === idx && renderPicker(idx)}
                        </div>
                    </React.Fragment>
                );
            })}

            {/* ── Right cluster: metrics ── */}
            <div className="cm-kpi-v3-metrics">
                <div className="cm-kpi-v3-metric">
                    <div className="cm-kpi-v3-metric-label"><Layers size={11}/> Environments</div>
                    <div className="cm-kpi-v3-metric-value">{totals.envCount}</div>
                    <div className="cm-kpi-v3-metric-sub">{envAgg.map(e=>e.env.toUpperCase()).join(" · ")}</div>
                </div>
                <div className="cm-kpi-v3-metric">
                    <div className="cm-kpi-v3-metric-label"><Boxes size={11}/> Pods / NS</div>
                    <div className="cm-kpi-v3-metric-value">{fI(totals.pods)}</div>
                    <div className="cm-kpi-v3-metric-sub">{fI(totals.nsCount)} namespaces</div>
                </div>
                <div className="cm-kpi-v3-metric">
                    <div className="cm-kpi-v3-metric-label"><Activity size={11}/> Nodes</div>
                    <div className="cm-kpi-v3-metric-value">{fI(totals.nodes)}</div>
                    <div className="cm-kpi-v3-metric-sub">across all envs</div>
                </div>
            </div>
        </div>

        {modal !== null && (()=>{
            const idx = typeof modal === "number" ? modal : ["today","yesterday","month","prevMonth"].indexOf(modal);
            const safeIdx = idx >= 0 ? idx : 0;
            const mp = modalPeriod(safeIdx);
            const card = cards[safeIdx] || cards[0];
            return (
                <CostBreakdownModal
                    period={mp.period}
                    periodLabel={card.label + (card.badge ? ` · ${card.badge}` : "")}
                    activeEnvs={activeEnvs}
                    envAgg={envAgg}
                    scope={scope}
                    catalogue={catalogue}
                    prevMonthByEnv={prevMonthByEnv}
                    customFrom={mp.from}
                    customTo={mp.to}
                    customGran={mp.gran}
                    onClose={() => setModal(null)}
                />
            );
        })()}
        </>
    );
}

function Kpi({ icon, label, value, sub, colour, badge }) {
    return (
        <div className="cm-kpi" style={{ borderTopColor: colour }}>
            <div className="cm-kpi-head">
                <span className="cm-kpi-icon" style={{ background: colour+"20", color: colour }}>{icon}</span>
                <span className="cm-kpi-label">{label}</span>
                {badge && <span className="cm-kpi-badge" style={{ background: colour+"20", color: colour }}>{badge}</span>}
            </div>
            <div className="cm-kpi-value">{value}</div>
            {sub && <div className="cm-kpi-sub">{sub}</div>}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  COST BREAKDOWN MODAL — per-env + per-product breakdown with trend    */
/* ════════════════════════════════════════════════════════════════════ */

function CostBreakdownModal({ period, periodLabel, activeEnvs, envAgg, scope, catalogue, prevMonthByEnv, customFrom, customTo, customGran, onClose }) {
    const [pts, setPts]       = useState({});
    const [loading, setLoading] = useState(true);

    const isProduct   = scope?.type === "product";
    const productKey_ = isProduct ? scope.key : null;

    const { from, to, gran } = useMemo(() => {
        const now = new Date();
        if (period === "today") {
            const f = new Date(now); f.setHours(0,0,0,0);
            return { from: f, to: now, gran: "hour" };
        }
        if (period === "yesterday") {
            const f = new Date(now); f.setDate(f.getDate()-1); f.setHours(0,0,0,0);
            const t = new Date(now); t.setHours(0,0,0,0);
            return { from: f, to: t, gran: "hour" };
        }
        if (period === "month") {
            const f = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: f, to: now, gran: "day" };
        }
        if (period === "prevMonth") {
            const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const t = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: f, to: t, gran: "day" };
        }
        if (period === "custom" && customFrom && customTo) {
            return { from: customFrom, to: customTo, gran: customGran || "day" };
        }
        return { from: new Date(), to: new Date(), gran: "day" };
    }, [period, customFrom, customTo, customGran]);

    useEffect(() => {
        setLoading(true);
        let dead = false;
        Promise.all(activeEnvs.map(env =>
            getPrometheusTimeseries(env, from.toISOString(), to.toISOString(), gran)
                .then(d => [env, Array.isArray(d?.points) ? d.points : []])
                .catch(() => [env, []])
        )).then(rows => {
            if (dead) return;
            const next = {};
            for (const [e, p] of rows) next[e] = p;
            setPts(next);
            setLoading(false);
        });
        return () => { dead = true; };
    }, [activeEnvs, from, to, gran]);

    /* ── Per-env total cost for this period (optionally filtered to a product) ── */
    const envTotals = useMemo(() => {
        const mult = gran === "day" ? 24 : gran === "minute" ? 1/60 : 1;
        return activeEnvs.map(env => {
            const points = pts[env] || [];
            let total = 0;
            for (const p of points) {
                if (productKey_) {
                    for (const ns of (p.namespaces || [])) {
                        if (productKey({ namespace: ns.namespace }) === productKey_) {
                            total += (ns.hourlyUsd || 0) * mult;
                        }
                    }
                } else {
                    total += (p.smoothedHourlyUsd || p.totalHourlyUsd || 0) * mult;
                }
            }
            const agg = envAgg.find(e => e.env === env);
            return { env, total, colour: agg?.colour || "#6366f1" };
        }).sort((a,b) => b.total - a.total);
    }, [pts, activeEnvs, envAgg, gran, productKey_]);

    /* ── Per-product total cost (hidden when already in product scope) ── */
    const productTotals = useMemo(() => {
        if (productKey_) return []; // already filtered to one product
        const mult = gran === "day" ? 24 : gran === "minute" ? 1/60 : 1;
        const map = new Map();
        for (const points of Object.values(pts)) {
            for (const p of points) {
                for (const ns of (p.namespaces || [])) {
                    const pk = productKey({ namespace: ns.namespace });
                    map.set(pk, (map.get(pk) || 0) + (ns.hourlyUsd || 0) * mult);
                }
            }
        }
        return [...map.entries()]
            .filter(([k]) => k !== "SYSTEM")
            .map(([key, total]) => ({ key, total }))
            .sort((a,b) => b.total - a.total)
            .slice(0, 12);
    }, [pts, gran, productKey_]);

    /* ── Per-env timeseries for trend chart, optionally filtered to product ── */
    const envSeries = useMemo(() => {
        const timeSet = new Set();
        for (const points of Object.values(pts)) for (const p of points) timeSet.add(p.t);
        const times = [...timeSet].sort();
        return activeEnvs.map(env => {
            const agg  = envAgg.find(e => e.env === env);
            const byT  = new Map();
            for (const p of (pts[env] || [])) {
                if (productKey_) {
                    let v = 0;
                    for (const ns of (p.namespaces || [])) {
                        if (productKey({ namespace: ns.namespace }) === productKey_) v += ns.hourlyUsd || 0;
                    }
                    byT.set(p.t, v);
                } else {
                    byT.set(p.t, p.smoothedHourlyUsd || p.totalHourlyUsd || 0);
                }
            }
            return {
                key: env, label: env.toUpperCase(), colour: agg?.colour || "#6366f1",
                pts: times.map(t => ({ t, v: byT.get(t) || 0 })),
            };
        }).filter(s => s.pts.some(p => p.v > 0));
    }, [pts, activeEnvs, envAgg, productKey_]);

    /* ── Grand total ── */
    const grandTotal = useMemo(() => envTotals.reduce((s, e) => s + e.total, 0), [envTotals]);
    const maxEnvCost = envTotals.reduce((m, e) => Math.max(m, e.total), 0.001);
    const maxProdCost = productTotals.reduce((m, p) => Math.max(m, p.total), 0.001);

    const PROD_COLOURS = ["#6366f1","#10b981","#f59e0b","#0ea5e9","#ec4899","#8b5cf6","#14b8a6","#f97316","#64748b","#a3e635","#fb923c","#818cf8"];
    const dateStr = `${from.toLocaleDateString("en-US",{month:"short",day:"numeric"})} → ${to.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;

    return (
        <FullViewModal
            title={`Cost Breakdown · ${periodLabel}${productKey_ ? ` · ${productKey_}` : ""}`}
            sub={`${dateStr} · reserved quota · actual DB data`}
            onClose={onClose}>
            {loading ? (
                <div className="cm-empty-mini" style={{ padding: 40 }}>
                    <RefreshCw size={14} className="spin" style={{ marginRight: 8 }} />
                    Loading cost breakdown…
                </div>
            ) : (
                <div className="cbd-shell">
                    {/* ── Grand total banner ── */}
                    <div className="cbd-grand">
                        <span className="cbd-grand-label">Period Total</span>
                        <span className="cbd-grand-value">{f$big(grandTotal)}</span>
                        <span className="cbd-grand-sub">{dateStr} · {gran} granularity</span>
                    </div>

                    {/* ── Two-column: envs + products ── */}
                    <div className="cbd-cols">
                        {/* Per-environment breakdown */}
                        <div className="cbd-col">
                            <div className="cbd-col-title"><Layers size={12}/> By Environment</div>
                            {envTotals.length === 0 ? (
                                <div className="cm-empty-mini">No data</div>
                            ) : envTotals.map(e => (
                                <div key={e.env} className="cbd-bar-row">
                                    <div className="cbd-bar-label">
                                        <span className="cm-dot" style={{ background: e.colour }} />
                                        <span style={{ fontWeight: 700, color: e.colour }}>{e.env.toUpperCase()}</span>
                                    </div>
                                    <div className="cbd-bar-track">
                                        <div className="cbd-bar-fill"
                                            style={{ width: `${(e.total / maxEnvCost) * 100}%`, background: e.colour }} />
                                    </div>
                                    <div className="cbd-bar-val">{f$big(e.total)}</div>
                                    <div className="cbd-bar-pct">
                                        {grandTotal > 0 ? `${Math.round((e.total/grandTotal)*100)}%` : "—"}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Per-product breakdown */}
                        <div className="cbd-col">
                            <div className="cbd-col-title"><Package size={12}/> By Product</div>
                            {productTotals.length === 0 ? (
                                <div className="cm-empty-mini">No product data</div>
                            ) : productTotals.map((p, i) => (
                                <div key={p.key} className="cbd-bar-row">
                                    <div className="cbd-bar-label">
                                        <span className="cm-dot" style={{ background: PROD_COLOURS[i % PROD_COLOURS.length] }} />
                                        <span style={{ fontWeight: 600, color: "#334155" }}>{p.key}</span>
                                    </div>
                                    <div className="cbd-bar-track">
                                        <div className="cbd-bar-fill"
                                            style={{ width: `${(p.total / maxProdCost) * 100}%`, background: PROD_COLOURS[i % PROD_COLOURS.length] + "cc" }} />
                                    </div>
                                    <div className="cbd-bar-val">{f$big(p.total)}</div>
                                    <div className="cbd-bar-pct">
                                        {grandTotal > 0 ? `${Math.round((p.total/grandTotal)*100)}%` : "—"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Cost trend per env ── */}
                    {envSeries.length > 0 && (
                        <div className="cbd-trend">
                            <div className="cbd-col-title" style={{ marginBottom: 8 }}><TrendingUp size={12}/> Cost Trend — per environment</div>
                            <MultiNsCostChart
                                series={envSeries}
                                gran={gran}
                                height={160}
                            />
                        </div>
                    )}
                </div>
            )}
        </FullViewModal>
    );
}


/* ════════════════════════════════════════════════════════════════════ */
/*  OVERVIEW (default — no specific product/ns chosen)                  */
/* ════════════════════════════════════════════════════════════════════ */

function Overview({ envAgg, catalogue, totals, tsByEnv, datePreset, onPickProduct, onPickNamespace, selectedEnvs, periodCost, tsWindow, productSparklines, snapshots }) {
    const isLive = datePreset === "live";

    /* component breakdown summed across envs */
    const componentRoll = useMemo(() => {
        const m = new Map();
        for (const e of envAgg) for (const c of e.components) {
            if (!c.category) continue;
            m.set(c.category, (m.get(c.category) || 0) + (c.hourlyUsd || 0));
        }
        return [...m.entries()].map(([k,v]) => ({ category:k, hourly:v }))
            .sort((a,b) => b.hourly - a.hourly);
    }, [envAgg]);

    const topProducts = catalogue.products.filter(p => p.key !== "SYSTEM").slice(0, 10);
    const topNamespaces = [...catalogue.namespaces]
        .filter(n => !n.isSystem)
        .sort((a,b)=>b.smoothed-a.smoothed).slice(0, 10);

    /* single env selected — show focused hero */
    const singleEnv = selectedEnvs.length === 1 ? envAgg.find(e => e.env === selectedEnvs[0]) : null;

    /* period env breakdown for donut when non-live */
    const periodEnvSlices = useMemo(() => {
        if (isLive || !periodCost) return null;
        return envAgg.map(e => ({
            key: e.env, label: e.env.toUpperCase(), colour: e.colour,
            value: periodCost.byEnv[e.env] || 0,
            tooltip: [
                e.env.toUpperCase(),
                `Period total: ${f$big(periodCost.byEnv[e.env] || 0)}`,
                `Avg hourly: ${f$(periodCost.avgHourly)}`,
                `Share: ${((periodCost.byEnv[e.env]||0) / Math.max(periodCost.totalCost,1e-9) * 100).toFixed(1)}%`,
            ].join("\n"),
        }));
    }, [isLive, periodCost, envAgg]);

    return (
        <>
            {/* === SINGLE ENV HERO === */}
            {singleEnv && <SingleEnvHero env={singleEnv} isLive={isLive} periodCost={periodCost} snapshot={snapshots?.[singleEnv.env]} />}
            {/* === ROW 1 : split donuts === */}
            <div className="cm-grid-3">
                <Card
                    title={isLive ? "Cost split by environment" : `Cost split — ${DATE_PRESETS.find(d=>d.id===datePreset)?.label}`}
                    sub={isLive ? "live hourly · hover slice for details" : `total for period · ${f$big(periodCost?.totalCost||0)} combined`}
                    Icon={PieChart}>
                    {!isLive && periodCost && (
                        <div className="cm-period-banner">
                            <TrendingUp size={12}/> Period total: <strong>{f$big(periodCost.totalCost)}</strong>
                            &nbsp;·&nbsp;avg <strong>{f$(periodCost.avgHourly)}/hr</strong>
                            &nbsp;·&nbsp;over {fN(periodCost.hours,0)} hours
                        </div>
                    )}
                    <Donut
                        slices={(periodEnvSlices || envAgg.map(e => ({
                            key: e.env, label: e.env.toUpperCase(),
                            value: e.hourly, colour: e.colour,
                            tooltip: [
                                `${e.env.toUpperCase()}`,
                                `Hourly: ${f$(e.hourly)}`,
                                `Daily: ${f$(e.daily)}`,
                                `Monthly: ${f$big(e.monthly)}`,
                                `MTD: ${f$big(e.mtd)}`,
                                `Pods: ${fI(e.podCount)} · Nodes: ${fI(e.nodeCount)}`,
                                `CPU util: ${fPct(e.cpuUtilPct)}`,
                                `Mem util: ${fPct(e.memUtilPct)}`,
                            ].join("\n"),
                        })))}
                        total={isLive ? totals.hourly : (periodCost?.totalCost || totals.hourly)}
                        unit={isLive ? "/hr" : "total"}
                    />
                    <Legend items={envAgg.map(e => {
                        const val = isLive ? e.hourly : (periodCost?.byEnv[e.env] || 0);
                        const total = isLive ? totals.hourly : (periodCost?.totalCost || 1);
                        return {
                            label: e.env.toUpperCase(), colour: e.colour,
                            value: total > 0 ? `${((val/total)*100).toFixed(1)}%` : "0%",
                            extra: isLive ? f$big(e.monthly)+"/mo" : f$big(val)+" total",
                        };
                    })} />
                </Card>

                <Card title="Cost by category" sub="compute / memory / storage / network…" Icon={Boxes}>
                    <Donut
                        slices={componentRoll.slice(0, 8).map(c => ({
                            key: c.category, label: prettyCat(c.category),
                            value: c.hourly, colour: catColour(c.category),
                            tooltip: [
                                prettyCat(c.category),
                                `Hourly: ${f$(c.hourly)}`,
                                `Monthly: ${f$big(c.hourly * HOURS_PER_MONTH)}`,
                                `Share: ${((c.hourly / Math.max(totals.hourly, 1e-9)) * 100).toFixed(1)}%`,
                            ].join("\n"),
                        }))}
                        total={totals.hourly}
                        unit="/hr"
                    />
                    <Legend items={componentRoll.slice(0,6).map(c => ({
                        label: prettyCat(c.category), colour: catColour(c.category),
                        value: totals.hourly > 0 ? `${((c.hourly/totals.hourly)*100).toFixed(1)}%` : "0%",
                        extra: f$(c.hourly) + "/hr",
                    }))} />
                </Card>

                <Card title="Resource utilisation" sub="CPU / Memory per env" Icon={Gauge}>
                    <div className="cm-util-cards">
                        {envAgg.map(e => (
                            <div key={e.env} className="cm-util-card" style={{ borderColor: e.colour + "40", background: e.colour + "08" }}>
                                <div className="cm-util-head">
                                    <span className="cm-env-tag" style={{ background: e.colour+"20", color: e.colour, borderColor: e.colour+"40" }}>
                                        <span className="cm-dot" style={{ background: e.colour }} />{e.env.toUpperCase()}
                                    </span>
                                    <span className="cm-util-cost">{f$(e.hourly)}/hr</span>
                                </div>
                                <UtilLine icon={<Cpu size={11}/>} label="CPU" pct={e.cpuUtilPct}
                                    sub={`${fN(e.usedCpu,1)} / ${fN(e.totalCpu,0)} cores`} colour="#3b82f6" />
                                <UtilLine icon={<Database size={11}/>} label="Memory" pct={e.memUtilPct}
                                    sub={`${fN(e.usedMem,1)} / ${fN(e.totalMem,0)} GB`} colour="#a855f7" />
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* === ROW 2 : products + namespaces quick picks === */}
            <div className="cm-grid-2">
                <Card
                    title="Products by cost"
                    sub={`${topProducts.length} products · ${isLive ? "live hourly" : DATE_PRESETS.find(d=>d.id===datePreset)?.label+" period"} · click to drill in`}
                    Icon={Package}>
                    {topProducts.length === 0 ? (
                        <div className="cm-empty-mini">No products found{selectedEnvs.length > 0 ? ` matching ${selectedEnvs.map(e=>e.toUpperCase()+"-*").join(", ")}` : ""}.</div>
                    ) : (
                        <div className="cm-product-spark-list">
                            {topProducts.map(p => {
                                const sparkPts = productSparklines[p.key] || [];
                                const periodVal = isLive ? p.totalHourly
                                    : sparkPts.reduce((a,pt) => {
                                        const mult = tsWindow?.gran==="minute"?1/60:tsWindow?.gran==="day"?24:tsWindow?.gran==="month"?730:1;
                                        return a + pt.v * mult;
                                    }, 0);
                                return (
                                    <div key={p.key} className="cm-product-spark-row" onClick={() => onPickProduct(p.key)}>
                                        <div className="cm-product-spark-info">
                                            <div className="cm-product-spark-name">{p.key}</div>
                                            <div className="cm-product-spark-envs">
                                                {Object.keys(p.byEnv).map((e,i) => (
                                                    <span key={e} className="cm-env-tag inline"
                                                        style={{ background:envColour(e,i)+"20", color:envColour(e,i), borderColor:envColour(e,i)+"40" }}>
                                                        <span className="cm-dot" style={{ background:envColour(e,i) }} />{e.toUpperCase()}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="cm-product-spark-meta">
                                                {fI(p.pods)} pods · {fI(p.microservices)} services
                                            </div>
                                        </div>
                                        <div className="cm-product-spark-chart">
                                            {sparkPts.length > 1
                                                ? <MiniSpark points={sparkPts} colour="#0ea5e9" />
                                                : <div className="cm-empty-mini" style={{ fontSize:10, padding:"4px 8px" }}>Live</div>}
                                        </div>
                                        <div className="cm-product-spark-cost">
                                            <div className="cm-product-spark-value">{isLive ? f$(p.totalHourly)+"/hr" : f$big(periodVal)}</div>
                                            <div className="cm-product-spark-sub">{isLive ? f$big(p.totalHourly*HOURS_PER_MONTH)+"/mo" : "period total"}</div>
                                            <div className={`cm-status-pill ${p.isUp?"up":"down"} sm`} style={{ marginTop:3 }}>
                                                <span className={`cm-status-dot ${p.isUp?"up":"down"}`} />
                                                {p.isUp?"UP":"DOWN"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card title="Namespaces by cost" sub={isLive ? "live hourly · click to drill in" : `${DATE_PRESETS.find(d=>d.id===datePreset)?.label} period · click to drill in`} Icon={Layers}>
                    {topNamespaces.length === 0 ? (
                        <div className="cm-empty-mini">No namespaces found{selectedEnvs.length > 0 ? ` matching ${selectedEnvs.map(e=>e.toUpperCase()+"-*").join(", ")}` : ""}.</div>
                    ) : (
                        <BarList
                            rows={topNamespaces.map((n, i) => ({
                                key: n.env + "/" + n.namespace,
                                label: (
                                    <>
                                        <span className="cm-env-tag inline" style={{
                                            background: envColour(n.env, i)+"20",
                                            color: envColour(n.env, i),
                                            borderColor: envColour(n.env, i)+"40",
                                        }}>{n.env.toUpperCase()}</span>
                                        {" "}{n.namespace}
                                    </>
                                ),
                                value: n.smoothed,
                                colour: envColour(n.env, i),
                                tip: [
                                    `Namespace: ${n.env.toUpperCase()}/${n.namespace}`,
                                    `Product: ${n.productKey}`,
                                    `Hourly: ${f$(n.smoothed)}`,
                                    `Monthly: ${f$big(n.smoothed * HOURS_PER_MONTH)}`,
                                    `MTD: ${f$big(n.monthToDateUsd)}`,
                                    `Pods: ${fI(n.podCount)} · Microservices: ${fI(n.microserviceCount)}`,
                                    `CPU: ${fN(n.cpuCores,2)} c · Mem: ${fN(n.memoryGb,1)} GB`,
                                    "",
                                    "Click for full drilldown ↗",
                                ].join("\n"),
                            }))}
                            onPick={(k) => {
                                const idx = k.indexOf("/");
                                onPickNamespace(k.slice(0, idx), k.slice(idx + 1));
                            }}
                        />
                    )}
                </Card>
            </div>

            {/* === Per-day cost chart (real timeseries) === */}
            <Card
                title="Cost per day"
                sub={datePreset === "live" ? "rolling last 6 hours · day-equivalent" : `over selected range · ${datePreset}`}
                Icon={Calendar}>
                <PerDayBars tsByEnv={tsByEnv} envAgg={envAgg} />
            </Card>

            {/* === Env summary table === */}
            <Card title="Environment summary" sub="quick side-by-side comparison" Icon={Layers}>
                <div className="cm-tbl-wrap">
                    <table className="cm-tbl">
                        <thead>
                            <tr>
                                <th>Environment</th>
                                <th className="r">Hourly</th>
                                <th className="r">Daily</th>
                                <th className="r">Monthly</th>
                                <th className="r">MTD</th>
                                <th className="r">Nodes</th>
                                <th>CPU util</th>
                                <th>Mem util</th>
                                <th className="r">Pods</th>
                                <th className="r">Namespaces</th>
                                <th className="r">% of total</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {envAgg.map(e => (
                                <EnvTableRow key={e.env} e={e} totals={totals} snapshot={snapshots?.[e.env]} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  SINGLE ENV HERO — shown when exactly one env is selected             */
/* ════════════════════════════════════════════════════════════════════ */

function SingleEnvHero({ env, isLive, periodCost, snapshot }) {
    const [showCluster, setShowCluster] = useState(false);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1)
        .toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const monthPct = Math.round((dayOfMonth / daysInMonth) * 100);

    return (
        <div className="cm-env-hero" style={{ borderTopColor: env.colour }}>
            {/* PRIMARY — current month MTD */}
            <div className="cm-env-hero-primary">
                <div className="cm-env-hero-env">
                    <span className="cm-env-tag" style={{ background: env.colour+"20", color: env.colour, borderColor: env.colour+"40", fontSize: 13, padding: "3px 10px" }}>
                        <span className="cm-dot" style={{ background: env.colour, width: 10, height: 10 }} />
                        {env.env.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Environment Overview</span>
                </div>
                <div className="cm-env-hero-money">
                    <div className="cm-env-hero-block main">
                        <div className="cm-env-hero-label">Current Month <span className="cm-kpi-date-badge">{startStr} → today</span></div>
                        <div className="cm-env-hero-value" style={{ color: env.colour }}>{f$big(env.mtd)}</div>
                        <div className="cm-env-hero-sub">{dayOfMonth} of {daysInMonth} days · run-rate {f$big(env.monthly)}/mo</div>
                    </div>
                    {/* month progress bar — day of month only, no estimated */}
                    <div className="cm-env-hero-progress">
                        <div className="cm-env-hero-progress-label">
                            <span>Month elapsed</span>
                            <span>{monthPct}% of {daysInMonth} days</span>
                        </div>
                        <div className="cm-env-hero-track">
                            <div className="cm-env-hero-fill" style={{
                                width: `${monthPct}%`,
                                background: env.colour,
                            }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* SECONDARY — smaller metrics on right */}
            <div className="cm-env-hero-secondary">
                <div className="cm-env-hero-sec-card">
                    <div className="cm-env-hero-sec-label"><Cpu size={11}/> CPU</div>
                    <div className="cm-env-hero-sec-value">{fPct(env.cpuUtilPct)}</div>
                    <div className="cm-env-hero-sec-sub">{fN(env.usedCpu,1)} / {fN(env.totalCpu,0)} cores</div>
                    <UtilBar pct={env.cpuUtilPct} colour="#3b82f6" />
                </div>
                <div className="cm-env-hero-sec-card">
                    <div className="cm-env-hero-sec-label"><Database size={11}/> Memory</div>
                    <div className="cm-env-hero-sec-value">{fPct(env.memUtilPct)}</div>
                    <div className="cm-env-hero-sec-sub">{fN(env.usedMem,1)} / {fN(env.totalMem,0)} GB</div>
                    <UtilBar pct={env.memUtilPct} colour="#a855f7" />
                </div>
                <div className="cm-env-hero-sec-card">
                    <div className="cm-env-hero-sec-label"><Boxes size={11}/> Pods</div>
                    <div className="cm-env-hero-sec-value">{fI(env.podCount)}</div>
                    <div className="cm-env-hero-sec-sub">{fI(env.nsCount)} namespaces</div>
                </div>
                <div className="cm-env-hero-sec-card" style={{ cursor: "pointer" }} onClick={() => setShowCluster(true)}>
                    <div className="cm-env-hero-sec-label" style={{ justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Activity size={11}/> Nodes</span>
                        <span className="cm-cluster-icon-btn" title="View cluster details">⬡</span>
                    </div>
                    <div className="cm-env-hero-sec-value">{fI(env.nodeCount)}</div>
                    <div className="cm-env-hero-sec-sub" style={{ color: "#0ea5e9" }}>click to inspect ↗</div>
                </div>
            </div>
            {showCluster && snapshot && (
                <NodeDetailModal
                    env={env.env}
                    nodes={snapshot.nodes || []}
                    namespaces={snapshot.namespaces || []}
                    onClose={() => setShowCluster(false)}
                />
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  ENV TABLE ROW — one row of the env summary table with cluster icon   */
/* ════════════════════════════════════════════════════════════════════ */

function EnvTableRow({ e, totals, snapshot }) {
    const [showCluster, setShowCluster] = useState(false);
    return (
        <>
            <tr>
                <td><EnvTag env={e.env} colour={e.colour} /></td>
                <td className="r"><strong>{f$(e.hourly)}</strong></td>
                <td className="r">{f$(e.daily)}</td>
                <td className="r">{f$big(e.monthly)}</td>
                <td className="r">{f$big(e.mtd)}</td>
                <td className="r">{fI(e.nodeCount)}</td>
                <td><UtilBar pct={e.cpuUtilPct} colour="#3b82f6" /></td>
                <td><UtilBar pct={e.memUtilPct} colour="#a855f7" /></td>
                <td className="r">{fI(e.podCount)}</td>
                <td className="r">{fI(e.nsCount)}</td>
                <td className="r"><strong style={{ color: e.colour }}>{totals.hourly > 0 ? ((e.hourly/totals.hourly)*100).toFixed(1) : "0"}%</strong></td>
                <td className="r">
                    <button className="cm-cluster-btn" onClick={() => setShowCluster(true)} title="View cluster node details">
                        ⬡ Cluster
                    </button>
                </td>
            </tr>
            {showCluster && snapshot && (
                <NodeDetailModal
                    env={e.env}
                    nodes={snapshot.nodes || []}
                    namespaces={snapshot.namespaces || []}
                    onClose={() => setShowCluster(false)}
                />
            )}
        </>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  NODE DETAIL MODAL — cluster nodes + specs + pods                     */
/* ════════════════════════════════════════════════════════════════════ */

function NodeDetailModal({ env, nodes, namespaces, onClose }) {
    const [openNodes, setOpenNodes] = useState(new Set());
    const toggleNode = (name) => setOpenNodes(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });

    /* Build a lookup: nodeName → list of pods (microservices) */
    const podsByNode = useMemo(() => {
        const map = new Map();
        for (const ns of namespaces) {
            for (const ms of (ns.microservices || [])) {
                const key = ms.nodeName || "unknown";
                if (!map.has(key)) map.set(key, []);
                map.get(key).push({ ...ms, namespace: ns.namespace });
            }
        }
        return map;
    }, [namespaces]);

    /* Group nodes by agentPool (node pool) */
    const pools = useMemo(() => {
        const map = new Map();
        for (const n of nodes) {
            const pool = n.agentPool || n.role || "default";
            if (!map.has(pool)) map.set(pool, []);
            map.get(pool).push(n);
        }
        return [...map.entries()].map(([pool, poolNodes]) => ({
            pool,
            nodes: poolNodes.sort((a, b) => (b.hourlyUsd || 0) - (a.hourlyUsd || 0)),
            totalHourly: poolNodes.reduce((s, n) => s + (n.hourlyUsd || 0), 0),
            vmSize: poolNodes[0]?.vmSize || "—",
            cpuCores: poolNodes[0]?.cpuCores || 0,
            memGb: poolNodes[0]?.memoryGb || 0,
        })).sort((a, b) => b.totalHourly - a.totalHourly);
    }, [nodes]);

    const totalHourly = nodes.reduce((s, n) => s + (n.hourlyUsd || 0), 0);

    return (
        <FullViewModal
            title={`⬡ Cluster · ${env.toUpperCase()}`}
            sub={`${nodes.length} nodes · ${f$(totalHourly)}/hr total · ${f$big(totalHourly * HOURS_PER_MONTH)}/mo est.`}
            onClose={onClose}>
            <div className="ndm-shell">
                {/* Cluster summary row */}
                <div className="ndm-summary">
                    <div className="ndm-sum-card">
                        <div className="ndm-sum-label">Total nodes</div>
                        <div className="ndm-sum-value">{nodes.length}</div>
                    </div>
                    <div className="ndm-sum-card">
                        <div className="ndm-sum-label">Pools</div>
                        <div className="ndm-sum-value">{pools.length}</div>
                    </div>
                    <div className="ndm-sum-card accent">
                        <div className="ndm-sum-label">Node cost/hr</div>
                        <div className="ndm-sum-value">{f$(totalHourly)}</div>
                    </div>
                    <div className="ndm-sum-card">
                        <div className="ndm-sum-label">Monthly est.</div>
                        <div className="ndm-sum-value">{f$big(totalHourly * HOURS_PER_MONTH)}</div>
                    </div>
                    <div className="ndm-sum-card">
                        <div className="ndm-sum-label">Total CPU</div>
                        <div className="ndm-sum-value">{fN(nodes.reduce((s, n) => s + (n.cpuCores || 0), 0), 0)} c</div>
                    </div>
                    <div className="ndm-sum-card">
                        <div className="ndm-sum-label">Total Memory</div>
                        <div className="ndm-sum-value">{fN(nodes.reduce((s, n) => s + (n.memoryGb || 0), 0), 0)} GB</div>
                    </div>
                </div>

                {/* Node pools */}
                {pools.map(pool => (
                    <div key={pool.pool} className="ndm-pool">
                        {/* Pool header */}
                        <div className="ndm-pool-head">
                            <div className="ndm-pool-title">
                                <span className="ndm-pool-tag">{pool.pool}</span>
                                <span className="ndm-pool-sku">{pool.vmSize}</span>
                                <span className="ndm-pool-spec">
                                    {fN(pool.cpuCores, 0)} vCPU · {fN(pool.memGb, 0)} GB RAM
                                </span>
                            </div>
                            <div className="ndm-pool-meta">
                                <span>{pool.nodes.length} node{pool.nodes.length > 1 ? "s" : ""}</span>
                                <span className="ndm-pool-cost">{f$(pool.totalHourly)}/hr · {f$big(pool.totalHourly * HOURS_PER_MONTH)}/mo</span>
                            </div>
                        </div>

                        {/* Individual nodes */}
                        <div className="ndm-nodes">
                            {pool.nodes.map(node => {
                                const isOpen = openNodes.has(node.name);
                                const pods = podsByNode.get(node.name) || [];
                                const cpuPct = node.cpuCores > 0 ? ((node.cpuRequestedCores || 0) / node.cpuCores * 100) : 0;
                                const memPct = node.memoryGb > 0 ? ((node.memoryRequestedGb || 0) / node.memoryGb * 100) : 0;
                                return (
                                    <div key={node.name} className={`ndm-node ${isOpen ? "open" : ""}`}>
                                        {/* Node row */}
                                        <div className="ndm-node-row" onClick={() => toggleNode(node.name)}>
                                            <span className="ndm-node-arrow">{isOpen ? "▼" : "▶"}</span>
                                            <div className="ndm-node-name">
                                                <span className="ndm-node-hostname" title={node.name}>
                                                    {node.name.length > 28 ? node.name.slice(0, 12) + "…" + node.name.slice(-10) : node.name}
                                                </span>
                                                {node.zone && <span className="ndm-node-zone">{node.zone}</span>}
                                            </div>
                                            <div className="ndm-node-spec">
                                                <span>{fN(node.cpuCores, 0)} vCPU</span>
                                                <span>{fN(node.memoryGb, 0)} GB</span>
                                            </div>
                                            <div className="ndm-node-util">
                                                <div className="ndm-util-bar" title={`CPU: ${cpuPct.toFixed(0)}% requested`}>
                                                    <div className="ndm-util-fill cpu" style={{ width: `${Math.min(cpuPct, 100)}%` }} />
                                                </div>
                                                <div className="ndm-util-bar" title={`Memory: ${memPct.toFixed(0)}% requested`}>
                                                    <div className="ndm-util-fill mem" style={{ width: `${Math.min(memPct, 100)}%` }} />
                                                </div>
                                            </div>
                                            <div className="ndm-node-cost">
                                                <span className="ndm-node-hr">{f$(node.hourlyUsd)}/hr</span>
                                                <span className="ndm-node-mo">{f$big((node.hourlyUsd || 0) * HOURS_PER_MONTH)}/mo</span>
                                            </div>
                                            <div className="ndm-node-pods">
                                                <span>{pods.length} pod{pods.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            {node.osDiskTierSku && (
                                                <span className="ndm-disk-tag">{node.osDiskTierSku} {node.osDiskSizeGb}GB</span>
                                            )}
                                        </div>
                                        {/* Expanded: pod list */}
                                        {isOpen && (
                                            <div className="ndm-pod-list">
                                                {pods.length === 0 ? (
                                                    <div className="cm-empty-mini" style={{ padding: "8px 14px" }}>No pods tracked on this node</div>
                                                ) : (
                                                    <table className="cm-tbl ndm-pod-tbl">
                                                        <thead>
                                                            <tr>
                                                                <th>Pod / Service</th>
                                                                <th>Namespace</th>
                                                                <th className="r">Replicas</th>
                                                                <th className="r">CPU used</th>
                                                                <th className="r">CPU req</th>
                                                                <th className="r">Mem used</th>
                                                                <th className="r">Mem req</th>
                                                                <th className="r">Cost/hr</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {pods.map((p, i) => (
                                                                <tr key={p.name + i}>
                                                                    <td>
                                                                        <div className="ndm-pod-name">{p.name}</div>
                                                                        {p.image && <div className="ndm-pod-image">{p.image.split("/").pop()}</div>}
                                                                    </td>
                                                                    <td><span className="cm-env-tag inline" style={{ background: "#e0f2fe", color: "#0369a1", borderColor: "#bae6fd" }}>{p.namespace}</span></td>
                                                                    <td className="r">{p.replicas ?? "—"}</td>
                                                                    <td className="r">{fN(p.cpuCores, 3)} c</td>
                                                                    <td className="r">{fN(p.cpuRequestCores, 3)} c</td>
                                                                    <td className="r">{fN(p.memoryGb, 2)} GB</td>
                                                                    <td className="r">{fN(p.memoryRequestGb, 2)} GB</td>
                                                                    <td className="r"><strong>{f$(p.smoothedHourlyUsd ?? p.hourlyRateUsd)}</strong></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                                {/* Node pricing detail */}
                                                <div className="ndm-node-pricing">
                                                    <span>Pricing match: <strong>{node.pricingMatch || "—"}</strong></span>
                                                    {node.azureSkuName && <span>SKU: <strong>{node.azureSkuName}</strong></span>}
                                                    {node.osDiskHourlyUsd > 0 && <span>OS disk: <strong>{f$(node.osDiskHourlyUsd)}/hr</strong></span>}
                                                    {node.cpuPerCoreHourlyUsd > 0 && <span>$/vCPU/hr: <strong>{f$(node.cpuPerCoreHourlyUsd)}</strong></span>}
                                                    {node.memoryPerGbHourlyUsd > 0 && <span>$/GB/hr: <strong>{f$(node.memoryPerGbHourlyUsd)}</strong></span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {nodes.length === 0 && (
                    <div className="cm-empty-mini">No node detail data available. Nodes are discovered by the Prometheus cost engine on the next tick.</div>
                )}
            </div>
        </FullViewModal>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  PRODUCTS TABLE — expandable rows with UP/DOWN + component breakdown */
/* ════════════════════════════════════════════════════════════════════ */

function ProductsTable({ products, onPickProduct, onPickNamespace }) {
    const [open, setOpen] = useState(new Set());
    const toggle = (k) => setOpen(prev => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        return next;
    });
    const max = Math.max(...products.map(p => p.totalHourly), 1e-9);

    if (products.length === 0) return <div className="cm-empty-mini">No products discovered yet.</div>;

    return (
        <div className="cm-tbl-wrap">
            <table className="cm-tbl cm-prod-tbl">
                <thead>
                    <tr>
                        <th style={{ width: 24 }}></th>
                        <th>Status</th>
                        <th>Product</th>
                        <th className="r">Pods (running)</th>
                        <th className="r">Microservices</th>
                        <th>Hourly cost · share</th>
                        <th className="r">Daily</th>
                        <th className="r">Monthly</th>
                        <th className="r">MTD</th>
                        <th style={{ width: 80 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {products.map(p => {
                        const isOpen = open.has(p.key);
                        const pct = (p.totalHourly / max) * 100;
                        return (
                            <React.Fragment key={p.key}>
                                <tr className="cm-prod-row" onClick={() => toggle(p.key)}>
                                    <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                    <td>
                                        <span className={`cm-status-pill ${p.isUp ? "up" : "down"}`}
                                            title={p.isUp ? `Running · ${p.runningPods} replica${p.runningPods===1?"":"s"}` : "No running pods"}>
                                            <span className={`cm-status-dot ${p.isUp ? "up" : "down"}`} />
                                            {p.isUp ? "UP" : "DOWN"}
                                        </span>
                                    </td>
                                    <td>
                                        <strong>{p.key}</strong>
                                        <div className="cm-prod-envs">
                                            {Object.keys(p.byEnv).map((e, i) => (
                                                <EnvTag key={e} env={e} colour={envColour(e, i)} />
                                            ))}
                                        </div>
                                    </td>
                                    <td className="r">
                                        <strong>{fI(p.pods)}</strong>
                                        <div className="cm-mute small">({fI(p.runningPods)} running)</div>
                                    </td>
                                    <td className="r">{fI(p.microservices)}</td>
                                    <td>
                                        <div className="cm-bar-track" style={{ height: 18 }}>
                                            <div className="cm-bar-fill" style={{ width: `${pct}%`, background: "#0ea5e9" }} />
                                        </div>
                                        <div className="cm-prod-cost-line">
                                            <strong>{f$(p.totalHourly)}/hr</strong>
                                        </div>
                                    </td>
                                    <td className="r">{f$(p.totalHourly * 24)}</td>
                                    <td className="r">{f$big(p.totalHourly * HOURS_PER_MONTH)}</td>
                                    <td className="r">{f$big(p.totalMtd)}</td>
                                    <td className="r">
                                        <button className="cm-btn ghost sm"
                                            onClick={(e) => { e.stopPropagation(); onPickProduct(p.key); }}>
                                            Drill in →
                                        </button>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr className="cm-prod-detail-row">
                                        <td colSpan={10}>
                                            <ProductDetail product={p} onPickNamespace={onPickNamespace} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ProductDetail({ product: p, onPickNamespace }) {
    const segs = [
        { value: p.compute,  colour: "#3b82f6", label: "Compute"  },
        { value: p.memory,   colour: "#a855f7", label: "Memory"   },
        { value: p.storage,  colour: "#f59e0b", label: "Storage"  },
        { value: p.network,  colour: "#ec4899", label: "Network"  },
        { value: p.overhead, colour: "#94a3b8", label: "Overhead" },
    ];
    return (
        <div className="cm-prod-detail">
            {/* component cost cards */}
            <div className="cm-prod-comp-grid">
                {segs.map(s => (
                    <div key={s.label} className="cm-prod-comp" title={`${s.label} · ${f$(s.value)}/hr`}>
                        <span className="cm-pill-dot" style={{ background: s.colour }} />
                        <div>
                            <div className="cm-prod-comp-label">{s.label}</div>
                            <div className="cm-prod-comp-value">{f$(s.value)}<span className="cm-mute small">/hr</span></div>
                            <div className="cm-mute small">{f$big(s.value * HOURS_PER_MONTH)}/mo</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* stacked composition bar */}
            <div style={{ marginTop: 10 }}>
                <div className="cm-mini-title">Where this product's money goes</div>
                <Stack segments={segs} />
            </div>

            {/* namespaces inside product */}
            <div style={{ marginTop: 14 }}>
                <div className="cm-mini-title">Namespaces ({p.namespaces.length})</div>
                <div className="cm-tbl-wrap">
                    <table className="cm-tbl">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Env</th>
                                <th>Namespace</th>
                                <th className="r">Pods</th>
                                <th className="r">CPU</th>
                                <th className="r">Mem</th>
                                <th className="r">Hourly</th>
                                <th className="r">Monthly</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {p.namespaces.slice().sort((a, b) => b.smoothed - a.smoothed).map((n, i) => (
                                <tr key={n.env + "/" + n.namespace}>
                                    <td>
                                        <span className={`cm-status-pill ${n.isUp ? "up" : "down"} sm`}>
                                            <span className={`cm-status-dot ${n.isUp ? "up" : "down"}`} />
                                            {n.isUp ? "UP" : "DOWN"}
                                        </span>
                                    </td>
                                    <td><EnvTag env={n.env} colour={envColour(n.env, i)} /></td>
                                    <td>{n.namespace}</td>
                                    <td className="r">{fI(n.podCount)}</td>
                                    <td className="r">{fN(n.cpuCores, 2)} c</td>
                                    <td className="r">{fN(n.memoryGb, 1)} GB</td>
                                    <td className="r"><strong>{f$(n.smoothed)}</strong></td>
                                    <td className="r">{f$big(n.smoothed * HOURS_PER_MONTH)}</td>
                                    <td className="r">
                                        <button className="cm-btn ghost sm" onClick={() => onPickNamespace(n.env, n.namespace)}>
                                            View →
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  PER-DAY COST BARS                                                   */
/* ════════════════════════════════════════════════════════════════════ */

function PerDayBars({ tsByEnv, envAgg }) {
    /* bucket every series by YYYY-MM-DD, sum to daily $, then split per env */
    const { perEnvDay } = useMemo(() => {
        const all = new Map();           // dateKey → { total, byEnv: {env: $} }
        const envs = Object.keys(tsByEnv);
        for (const env of envs) {
            const points = tsByEnv[env] || [];
            /* points are bucketed hourly/min. Approximate per-day $ by averaging
             * hourly rate within the day, then multiplying by 24. */
            const dayBuckets = new Map();
            for (const p of points) {
                const d = new Date(p.t);
                const key = d.toISOString().slice(0, 10);
                if (!dayBuckets.has(key)) dayBuckets.set(key, { sum: 0, n: 0 });
                const b = dayBuckets.get(key);
                b.sum += p.smoothedHourlyUsd || p.totalHourlyUsd || 0;
                b.n   += 1;
            }
            for (const [k, b] of dayBuckets.entries()) {
                const avgHourly = b.n > 0 ? b.sum / b.n : 0;
                const dailyCost = avgHourly * 24;
                if (!all.has(k)) all.set(k, { total: 0, byEnv: {} });
                all.get(k).byEnv[env] = (all.get(k).byEnv[env] || 0) + dailyCost;
                all.get(k).total    += dailyCost;
            }
        }
        const perEnvDay = [...all.keys()].sort().map(k => ({ day: k, ...all.get(k) }));
        return { perEnvDay };
    }, [tsByEnv]);

    if (perEnvDay.length === 0) {
        return <div className="cm-empty-mini">No daily history yet. Pick a wider date range to see trend.</div>;
    }

    const maxDay = Math.max(...perEnvDay.map(d => d.total), 1e-9);
    const sumDays = perEnvDay.reduce((a, d) => a + d.total, 0);
    const avgDay = sumDays / perEnvDay.length;
    const maxBar = perEnvDay.reduce((m, d) => d.total > m.total ? d : m, perEnvDay[0]);
    const minBar = perEnvDay.reduce((m, d) => d.total < m.total ? d : m, perEnvDay[0]);

    return (
        <>
            <div className="cm-perday-summary">
                <div className="cm-perday-stat"><div className="cm-perday-stat-label">Avg / day</div><div className="cm-perday-stat-val">{f$(avgDay)}</div></div>
                <div className="cm-perday-stat"><div className="cm-perday-stat-label">Max / day</div><div className="cm-perday-stat-val">{f$(maxBar.total)}<span className="cm-mute small"> · {maxBar.day}</span></div></div>
                <div className="cm-perday-stat"><div className="cm-perday-stat-label">Min / day</div><div className="cm-perday-stat-val">{f$(minBar.total)}<span className="cm-mute small"> · {minBar.day}</span></div></div>
                <div className="cm-perday-stat"><div className="cm-perday-stat-label">Range total</div><div className="cm-perday-stat-val">{f$big(sumDays)}</div></div>
            </div>
            <div className="cm-perday-bars">
                {perEnvDay.map(d => {
                    const pct = (d.total / maxDay) * 100;
                    return (
                        <div key={d.day} className="cm-perday-bar"
                            title={[
                                `${d.day}`,
                                `Total: ${f$(d.total)}`,
                                ...Object.entries(d.byEnv).map(([e, v]) => `${e.toUpperCase()}: ${f$(v)}`),
                            ].join("\n")}>
                            <div className="cm-perday-bar-val">{f$(d.total)}</div>
                            <div className="cm-perday-bar-track" style={{ height: `${Math.max(6, pct)}%` }}>
                                {envAgg.map((env, i) => {
                                    const v = d.byEnv[env.env] || 0;
                                    if (v <= 0) return null;
                                    return <div key={env.env}
                                        className="cm-perday-bar-seg"
                                        style={{ flex: v, background: envColour(env.env, i) }}
                                        title={`${env.env.toUpperCase()} · ${f$(v)}`} />;
                                })}
                            </div>
                            <div className="cm-perday-bar-day">{d.day.slice(5)}</div>
                        </div>
                    );
                })}
            </div>
            <div className="cm-spark-legend" style={{ marginTop: 10 }}>
                {envAgg.map(e => (
                    <span key={e.env}>
                        <span className="cm-dot" style={{ background: e.colour }} />
                        {e.env.toUpperCase()}
                    </span>
                ))}
            </div>
        </>
    );
}

function UtilLine({ icon, label, pct, sub, colour }) {
    return (
        <div className="cm-util-line">
            <div className="cm-util-row">
                <span className="cm-util-name">{icon} {label}</span>
                <span className="cm-util-sub">{sub}</span>
            </div>
            <UtilBar pct={pct} colour={colour} full />
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  SCOPE VIEW (product or namespace selected)                          */
/* ════════════════════════════════════════════════════════════════════ */

function ScopeView({ scopeData, metrics, opsMetrics, tsByEnv, tsWindow, datePreset, expandedCat, onExpand, onClearScope, onPickNamespace }) {
    const { kind, data, name, env } = scopeData;

    const pgpRangeLabel = (() => {
        if (!tsWindow) return "Last 30 days";
        if (datePreset === "today") return "Today";
        if (datePreset === "7d")    return "Last 7 days";
        if (datePreset === "30d")   return "Last 30 days";
        if (datePreset === "ytd")   return "This year";
        if (datePreset === "custom") {
            const f = new Date(tsWindow.from), t = new Date(tsWindow.to);
            return `${f.toLocaleDateString("en-US",{month:"short",day:"numeric"})} → ${t.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
        }
        return "Selected range";
    })();
    const cost = metrics.cost;
    const seg = cost.segments;
    const annual = cost.monthly * 12;

    /* sparkline points — namespace = own series; product = sum across its envs */
    const trendPoints = useMemo(() => {
        const buckets = new Map();
        if (kind === "namespace") {
            for (const p of (tsByEnv[env] || [])) {
                const n = (p.namespaces || []).find(n => n.namespace === name);
                if (n) buckets.set(p.t, (buckets.get(p.t) || 0) + (n.hourlyUsd || 0));
            }
        } else {
            const nsNames = new Set(data.namespaces.map(n => n.namespace));
            for (const e of Object.keys(tsByEnv)) {
                for (const p of (tsByEnv[e] || [])) {
                    for (const n of (p.namespaces || [])) {
                        if (nsNames.has(n.namespace)) buckets.set(p.t, (buckets.get(p.t) || 0) + (n.hourlyUsd || 0));
                    }
                }
            }
        }
        return [...buckets.entries()].sort(([a], [b]) => new Date(a) - new Date(b))
            .map(([t, v]) => ({ t, v }));
    }, [tsByEnv, kind, env, name, data]);

    return (
        <>
            {/* ─── VISUAL HERO ─── */}
            <section className="cm-card cm-hero" style={{ borderTopColor: "#0ea5e9" }}>
                <header className="cm-card-head">
                    <div>
                        <span className="cm-card-title">
                            {kind === "product" ? <Package size={14}/> : <Box size={14}/>}
                            {kind === "product" ? ` Product · ${name}` : ` Namespace · ${env?.toUpperCase()} / ${name}`}
                        </span>
                        <span className="cm-card-sub">
                            {" · "}
                            {kind === "product"
                                ? `${data.namespaces.length} ns · ${Object.keys(data.byEnv).length} env · ${fI(data.pods)} pods`
                                : `pod count ${fI(data.podCount)} · product ${data.productKey}`}
                        </span>
                    </div>
                    <button className="cm-btn ghost sm" onClick={onClearScope}>
                        <X size={11}/> Clear scope
                    </button>
                </header>

                <div className="cm-hero-body">
                    {/* LEFT — donut + composition legend */}
                    <div className="cm-hero-donut">
                        <Donut
                            slices={[
                                { key:"compute",  value: seg.compute,  colour:"#3b82f6", label:"Compute",
                                  tooltip: `Compute · ${f$(seg.compute)}/hr · ${pctOf(seg.compute, cost.hourly)}` },
                                { key:"memory",   value: seg.memory,   colour:"#a855f7", label:"Memory",
                                  tooltip: `Memory · ${f$(seg.memory)}/hr · ${pctOf(seg.memory, cost.hourly)}` },
                                { key:"storage",  value: seg.storage,  colour:"#f59e0b", label:"Storage",
                                  tooltip: `Storage · ${f$(seg.storage)}/hr · ${pctOf(seg.storage, cost.hourly)}` },
                                { key:"network",  value: seg.network,  colour:"#ec4899", label:"Network",
                                  tooltip: `Network · ${f$(seg.network)}/hr · ${pctOf(seg.network, cost.hourly)}` },
                                { key:"overhead", value: seg.overhead, colour:"#94a3b8", label:"Overhead",
                                  tooltip: `Overhead · ${f$(seg.overhead)}/hr · ${pctOf(seg.overhead, cost.hourly)}` },
                            ].filter(s => s.value > 0)}
                            total={cost.hourly}
                            unit="/hr"
                        />
                        <Legend items={[
                            { label:"Compute",  colour:"#3b82f6", value:`${(seg.compute/(cost.hourly||1)*100).toFixed(0)}%`, extra:f$(seg.compute) },
                            { label:"Memory",   colour:"#a855f7", value:`${(seg.memory/(cost.hourly||1)*100).toFixed(0)}%`,  extra:f$(seg.memory) },
                            { label:"Storage",  colour:"#f59e0b", value:`${(seg.storage/(cost.hourly||1)*100).toFixed(0)}%`, extra:f$(seg.storage) },
                            { label:"Network",  colour:"#ec4899", value:`${(seg.network/(cost.hourly||1)*100).toFixed(0)}%`, extra:f$(seg.network) },
                            { label:"Overhead", colour:"#94a3b8", value:`${(seg.overhead/(cost.hourly||1)*100).toFixed(0)}%`,extra:f$(seg.overhead) },
                        ]}/>
                    </div>

                    {/* CENTRE — big cost cards */}
                    <div className="cm-hero-money">
                        <CostHero label="Current rate" value={f$4(cost.hourly)} unit="per hour" colour="#10b981"
                            icon={<DollarSign size={18}/>} big sub={`${f$(cost.daily)}/day · reserved quota`} />
                        <CostHero label="This month" value={f$big(cost.mtd)} unit="month to date" colour="#6366f1"
                            icon={<Activity size={18}/>} sub={`run-rate ${f$big(cost.monthly)}/mo`} />
                        <CostHero label="Daily" value={f$(cost.daily)} unit="per day" colour="#3b82f6"
                            icon={<Clock size={18}/>} sub={`${fN(cost.daily/Math.max(cost.podCount,1),2)} $ / pod`} />
                        <CostHero label="Lifetime" value={f$big(cost.cumulative)} unit="cumulative" colour="#ef4444"
                            icon={<TrendingUp size={18}/>} sub={`${fI(cost.podCount)} pods · ${fI(cost.microserviceCount)} ms`} />
                    </div>
                </div>

                {/* TREND — wide sparkline */}
                <div className="cm-hero-trend">
                    <div className="cm-mini-title">
                        <TrendingUp size={11} style={{ verticalAlign: "middle" }} /> Hourly cost trend · live
                    </div>
                    {trendPoints.length > 0
                        ? <Spark points={trendPoints} colour="#10b981" tall />
                        : <div className="cm-empty-mini">Waiting for time-series points… try a wider date range.</div>}
                </div>
            </section>

            {/* ─── MULTI-GRAPH PANEL (cost, CPU, mem, live ops) ─── */}
            <ProductGraphsPanel
                scopeData={scopeData}
                opsMetrics={opsMetrics}
                tsByEnv={tsByEnv}
                tsWindow={tsWindow}
                rangeLabel={pgpRangeLabel}
            />

            {/* ─── CATEGORY ACCORDION ─── */}
            <Card title="Metric categories" sub="click any row to expand the full set" Icon={Boxes}>
                <div className="cm-accordion">
                    {CATEGORIES.map(c => (
                        <CategoryAccordion key={c.id}
                            cat={c}
                            headline={categoryHeadline(c.id, metrics[c.id])}
                            expanded={expandedCat === c.id}
                            onClick={() => onExpand(c.id)}
                            metrics={metrics}
                            scopeData={scopeData}
                            opsMetrics={opsMetrics}
                            tsByEnv={tsByEnv} />
                    ))}
                </div>
            </Card>

            {/* ─── Microservices / Pod details ─── */}
            {kind === "namespace" && (data.microservices || []).length > 0 && (
                <Card
                    title={`Pods & Microservices (${data.microservices.length})`}
                    sub="live replicas · CPU/Mem efficiency · cost · expand each row for full spec"
                    Icon={Box}>
                    <PodList microservices={data.microservices} />
                </Card>
            )}
            {kind === "product" && (() => {
                const allMs = data.namespaces.flatMap(n => (n.microservices||[]).map(ms => ({ ...ms, env: n.env, namespace: n.namespace })));
                return allMs.length > 0 ? (
                    <Card
                        title={`All Pods & Microservices in ${name} (${allMs.length})`}
                        sub="across all envs and namespaces · expand row for full spec"
                        Icon={Box}>
                        <PodList microservices={allMs} />
                    </Card>
                ) : null;
            })()}

            {/* ─── Namespaces in this product (product scope) ─── */}
            {kind === "product" && (
                <Card title="Namespaces in this product" sub={`${data.namespaces.length} total · click any to drill in`} Icon={Layers}>
                    <div className="cm-tbl-wrap">
                        <table className="cm-tbl">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Env</th>
                                    <th>Namespace</th>
                                    <th className="r">Pods</th>
                                    <th className="r">CPU used</th>
                                    <th className="r">Mem used</th>
                                    <th>Hourly · share</th>
                                    <th className="r">Monthly</th>
                                    <th className="r">MTD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const sorted = [...data.namespaces].sort((a, b) => b.smoothed - a.smoothed);
                                    const max = Math.max(...sorted.map(n => n.smoothed), 1e-9);
                                    return sorted.map((n, i) => (
                                        <tr key={n.env + "/" + n.namespace}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => onPickNamespace && onPickNamespace(n.env, n.namespace)}>
                                            <td>
                                                <span className={`cm-status-pill ${n.isUp ? "up" : "down"} sm`}>
                                                    <span className={`cm-status-dot ${n.isUp ? "up" : "down"}`} />
                                                    {n.isUp ? "UP" : "DOWN"}
                                                </span>
                                            </td>
                                            <td><EnvTag env={n.env} colour={envColour(n.env, i)} /></td>
                                            <td><strong>{n.namespace}</strong></td>
                                            <td className="r">{fI(n.podCount)}</td>
                                            <td className="r">{fN(n.cpuCores, 2)} c</td>
                                            <td className="r">{fN(n.memoryGb, 1)} GB</td>
                                            <td>
                                                <div className="cm-bar-track" style={{ height: 14 }}>
                                                    <div className="cm-bar-fill" style={{
                                                        width: `${(n.smoothed/max)*100}%`,
                                                        background: envColour(n.env, i),
                                                    }} />
                                                </div>
                                                <div className="cm-prod-cost-line"><strong>{f$(n.smoothed)}/hr</strong></div>
                                            </td>
                                            <td className="r">{f$big(n.smoothed * HOURS_PER_MONTH)}</td>
                                            <td className="r">{f$big(n.monthToDateUsd)}</td>
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  POD LIST — full microservice / pod-level details                    */
/* ════════════════════════════════════════════════════════════════════ */

function PodList({ microservices }) {
    const [expanded, setExpanded] = useState(new Set());
    const toggle = (k) => setExpanded(prev => {
        const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
    });
    /* sort by hourly desc */
    const rows = [...microservices].sort((a, b) =>
        (b.smoothedHourlyUsd || b.hourlyRateUsd || 0) - (a.smoothedHourlyUsd || a.hourlyRateUsd || 0)
    );
    const max = Math.max(...rows.map(r => r.smoothedHourlyUsd || r.hourlyRateUsd || 0), 1e-9);

    return (
        <div className="cm-tbl-wrap">
            <table className="cm-tbl cm-pod-tbl">
                <thead>
                    <tr>
                        <th style={{ width: 24 }}></th>
                        <th>Microservice</th>
                        <th className="r">Replicas</th>
                        <th>HPA</th>
                        <th className="r">CPU used / req</th>
                        <th className="r">Mem used / req</th>
                        <th>Node · SKU</th>
                        <th>Hourly · share</th>
                        <th className="r">Monthly</th>
                        <th className="r">Restarts</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((ms, i) => {
                        const k = ms.name + "/" + i;
                        const isOpen = expanded.has(k);
                        const hourly = ms.smoothedHourlyUsd ?? ms.hourlyRateUsd ?? 0;
                        const pct = (hourly / max) * 100;
                        const cpuPct = ms.cpuRequestCores > 0 ? (ms.cpuCores / ms.cpuRequestCores) * 100 : 0;
                        const memPct = ms.memoryRequestGb > 0 ? (ms.memoryGb / ms.memoryRequestGb) * 100 : 0;
                        const hpaState = (ms.hpaMaxReplicas != null)
                            ? `${ms.hpaCurrentReplicas ?? "?"} / ${ms.hpaMaxReplicas} (min ${ms.hpaMinReplicas ?? 0})`
                            : "—";
                        return (
                            <React.Fragment key={k}>
                                <tr style={{ cursor: "pointer" }} onClick={() => toggle(k)}>
                                    <td>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                                    <td>
                                        <strong>{ms.name || "—"}</strong>
                                        {ms.nodeIsSpot && <span className="cm-spot-tag">SPOT</span>}
                                    </td>
                                    <td className="r">
                                        <strong>{fI(ms.replicas)}</strong>
                                    </td>
                                    <td><span className="cm-hpa-tag">{hpaState}</span></td>
                                    <td className="r">
                                        <div className="cm-pod-bicol">
                                            <UtilBar pct={cpuPct} colour="#3b82f6" />
                                            <span className="cm-mute small">{fN(ms.cpuCores, 2)}/{fN(ms.cpuRequestCores, 2)}c</span>
                                        </div>
                                    </td>
                                    <td className="r">
                                        <div className="cm-pod-bicol">
                                            <UtilBar pct={memPct} colour="#a855f7" />
                                            <span className="cm-mute small">{fN(ms.memoryGb, 1)}/{fN(ms.memoryRequestGb, 1)}GB</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="cm-mute small" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {ms.nodeName ? shortHostName(ms.nodeName) : "—"}
                                        </div>
                                        {ms.nodeVmSize && <span className="cm-vm-tag">{ms.nodeVmSize}</span>}
                                    </td>
                                    <td>
                                        <div className="cm-bar-track" style={{ height: 12 }}>
                                            <div className="cm-bar-fill" style={{ width: `${pct}%`, background: "#10b981" }} />
                                        </div>
                                        <div className="cm-prod-cost-line"><strong>{f$4(hourly)}/hr</strong></div>
                                    </td>
                                    <td className="r">{f$(hourly * HOURS_PER_MONTH)}</td>
                                    <td className="r">
                                        <span className={ms.restarts > 5 ? "cm-warn-tag" : ""}>{fI(ms.restarts)}</span>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr className="cm-pod-detail-row">
                                        <td colSpan={10}>
                                            <div className="cm-pod-detail">
                                                <div className="cm-pod-detail-grid">
                                                    <PodSpec label="Image" value={ms.image || "—"} mono full />
                                                    <PodSpec label="Node" value={ms.nodeName || "—"} mono />
                                                    <PodSpec label="VM SKU" value={ms.nodeVmSize || "—"} />
                                                    <PodSpec label="Spot instance" value={ms.nodeIsSpot ? "Yes" : "No"} colour={ms.nodeIsSpot ? "#f59e0b" : undefined} />
                                                    <PodSpec label="Replicas" value={fI(ms.replicas)} />
                                                    <PodSpec label="HPA min / cur / max"
                                                        value={ms.hpaMaxReplicas != null
                                                            ? `${ms.hpaMinReplicas ?? 0} / ${ms.hpaCurrentReplicas ?? "?"} / ${ms.hpaMaxReplicas}`
                                                            : "Not configured"} />
                                                    <PodSpec label="CPU used" value={`${fN(ms.cpuCores, 3)} cores`} colour="#3b82f6" />
                                                    <PodSpec label="CPU request" value={`${fN(ms.cpuRequestCores, 3)} cores`} />
                                                    <PodSpec label="Memory used" value={`${fN(ms.memoryGb, 2)} GB`} colour="#a855f7" />
                                                    <PodSpec label="Memory request" value={`${fN(ms.memoryRequestGb, 2)} GB`} />
                                                    <PodSpec label="CPU efficiency" value={fPct(cpuPct)}
                                                        colour={cpuPct < 30 ? "#ef4444" : cpuPct > 80 ? "#f59e0b" : "#10b981"} />
                                                    <PodSpec label="Memory efficiency" value={fPct(memPct)}
                                                        colour={memPct < 30 ? "#ef4444" : memPct > 80 ? "#f59e0b" : "#10b981"} />
                                                    <PodSpec label="Hourly cost" value={f$4(hourly)} colour="#10b981" />
                                                    <PodSpec label="Compute $/hr" value={f$4(ms.computeHourlyUsd || 0)} />
                                                    <PodSpec label="Memory $/hr" value={f$4(ms.memoryHourlyUsd || 0)} />
                                                    <PodSpec label="Daily est." value={f$(hourly * 24)} />
                                                    <PodSpec label="Monthly est." value={f$(hourly * HOURS_PER_MONTH)} colour="#3b82f6" />
                                                    <PodSpec label="Month-to-date" value={f$(ms.monthToDateUsd || 0)} colour="#6366f1" />
                                                    <PodSpec label="Cumulative" value={f$(ms.cumulativeUsd || 0)} />
                                                    <PodSpec label="Uptime"
                                                        value={ms.uptimeSeconds ? fmtSec(ms.uptimeSeconds) : "—"} />
                                                    <PodSpec label="Restarts" value={fI(ms.restarts)}
                                                        colour={ms.restarts > 5 ? "#ef4444" : ms.restarts > 0 ? "#f59e0b" : undefined} />
                                                    <PodSpec label="Cost / replica · hr"
                                                        value={f$4(hourly / Math.max(ms.replicas, 1))} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function PodSpec({ label, value, sub, colour, mono, full }) {
    return (
        <div className={`cm-pod-spec ${full ? "full" : ""}`}>
            <div className="cm-pod-spec-label">{label}</div>
            <div className={`cm-pod-spec-value ${mono ? "mono" : ""}`} style={colour ? { color: colour } : {}}>
                {value}
            </div>
            {sub && <div className="cm-pod-spec-sub">{sub}</div>}
        </div>
    );
}

function shortHostName(name) {
    if (!name) return "";
    if (name.length <= 36) return name;
    return name.slice(0, 12) + "…" + name.slice(-12);
}
function fmtSec(s) {
    if (!s || s < 0) return "—";
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/* ─── BIG COST HERO CARD ─── */
function CostHero({ label, value, unit, sub, colour, icon, big }) {
    return (
        <div className={`cm-cost-hero ${big ? "big" : ""}`} style={{ borderTopColor: colour }}>
            <div className="cm-cost-hero-head" style={{ color: colour }}>
                <span className="cm-cost-hero-icon" style={{ background: colour+"20" }}>{icon}</span>
                <span className="cm-cost-hero-label">{label}</span>
            </div>
            <div className="cm-cost-hero-value">{value}</div>
            <div className="cm-cost-hero-unit">{unit}</div>
            {sub && <div className="cm-cost-hero-sub">{sub}</div>}
        </div>
    );
}

/* ─── CATEGORY ACCORDION ROW ─── */
function CategoryAccordion({ cat, headline, expanded, onClick, metrics, scopeData, opsMetrics, tsByEnv }) {
    const { Icon } = cat;
    return (
        <div className={`cm-acc ${expanded ? "open" : ""}`} style={expanded ? { borderColor: cat.colour } : {}}>
            <button className="cm-acc-bar" onClick={onClick}>
                <span className="cm-acc-icon" style={{ background: cat.colour + "20", color: cat.colour }}>
                    <Icon size={16}/>
                </span>
                <span className="cm-acc-title">{cat.label}</span>
                <span className="cm-acc-headline">
                    {headline.map((h, i) => (
                        <span key={i} className="cm-acc-headline-item">
                            <span className="cm-acc-h-label">{h.label}</span>
                            <span className="cm-acc-h-value" style={{ color: cat.colour }}>{h.value}</span>
                        </span>
                    ))}
                </span>
                <span className="cm-acc-chev">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
            </button>
            {expanded && (
                <div className="cm-acc-body">
                    <CategoryBody
                        catId={cat.id}
                        metrics={metrics}
                        scopeData={scopeData}
                        opsMetrics={opsMetrics}
                        tsByEnv={tsByEnv} />
                </div>
            )}
        </div>
    );
}

function CategoryBody({ catId, metrics, scopeData, opsMetrics, tsByEnv }) {
    switch (catId) {
        case "cost":    return <CostBody    m={metrics.cost}     scope={scopeData} tsByEnv={tsByEnv} />;
        case "compute": return <ComputeBody cpu={metrics.cpu}    mem={metrics.memory} ops={opsMetrics} />;
        case "storage": return <StorageNetBody storage={metrics.storage} network={metrics.network} ops={opsMetrics} />;
        case "health":  return <HealthBody  eff={metrics.efficiency} perf={metrics.performance} ops={opsMetrics} cost={metrics.cost} scope={scopeData} />;
        default: return null;
    }
}

/* ════════════════════════════════════════════════════════════════════ */
/*  CATEGORY DETAIL (20+ small metrics)                                  */
/* ════════════════════════════════════════════════════════════════════ */

function MGrid({ children }) { return <div className="cm-mgrid">{children}</div>; }
function MTile({ label, value, sub, colour }) {
    return (
        <div className="cm-mtile">
            <div className="cm-mtile-label">{label}</div>
            <div className="cm-mtile-value" style={colour ? { color: colour } : {}}>{value}</div>
            {sub && <div className="cm-mtile-sub">{sub}</div>}
        </div>
    );
}

function CostBody({ m, scope, tsByEnv }) {
    const seg = m.segments;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const daysElapsed = Math.max(1, (now - startOfMonth) / 86_400_000);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mtdPerDay = m.mtd / daysElapsed;
    const projectedFromMtd = mtdPerDay * daysInMonth;

    const trendPoints = (() => {
        if (!tsByEnv) return [];
        if (scope.kind === "namespace") {
            return (tsByEnv[scope.env] || []).map(p => ({
                t: p.t, v: (p.namespaces || []).find(n => n.namespace === scope.data.namespace)?.hourlyUsd || 0,
            }));
        }
        const nsNames = new Set(scope.data.namespaces.map(n => n.namespace));
        const buckets = new Map();
        for (const e of Object.keys(tsByEnv)) {
            for (const p of (tsByEnv[e] || [])) {
                for (const n of (p.namespaces || [])) {
                    if (nsNames.has(n.namespace)) buckets.set(p.t, (buckets.get(p.t) || 0) + (n.hourlyUsd || 0));
                }
            }
        }
        return [...buckets.entries()].sort(([a], [b]) => new Date(a) - new Date(b)).map(([t, v]) => ({ t, v }));
    })();

    return (
        <>
            {/* ── Cost period cards ── */}
            <div className="cm-cost-period-grid">
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Right now</div>
                    <div className="cm-cost-period-value" style={{ color:"#10b981" }}>{f$4(m.hourly)}</div>
                    <div className="cm-cost-period-unit">per hour (live)</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Today (est.)</div>
                    <div className="cm-cost-period-value" style={{ color:"#3b82f6" }}>{f$(m.daily)}</div>
                    <div className="cm-cost-period-unit">per day</div>
                </div>
                <div className="cm-cost-period accent">
                    <div className="cm-cost-period-label">MTD  <span className="cm-cost-period-date">from {startOfMonthStr}</span></div>
                    <div className="cm-cost-period-value" style={{ color:"#6366f1" }}>{f$big(m.mtd)}</div>
                    <div className="cm-cost-period-unit">{fN(daysElapsed, 0)} of {daysInMonth} days · avg {f$(mtdPerDay)}/day</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">This month (projected)</div>
                    <div className="cm-cost-period-value" style={{ color:"#a855f7" }}>{f$big(projectedFromMtd)}</div>
                    <div className="cm-cost-period-unit">based on MTD spend rate</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Run-rate monthly</div>
                    <div className="cm-cost-period-value">{f$big(m.monthly)}</div>
                    <div className="cm-cost-period-unit">at current hourly rate × 730</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Annual run-rate</div>
                    <div className="cm-cost-period-value" style={{ color:"#ef4444" }}>{f$big(m.monthly * 12)}</div>
                    <div className="cm-cost-period-unit">yearly projection</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Lifetime (cumulative)</div>
                    <div className="cm-cost-period-value">{f$big(m.cumulative)}</div>
                    <div className="cm-cost-period-unit">all time total</div>
                </div>
                <div className="cm-cost-period">
                    <div className="cm-cost-period-label">Cost per pod / hr</div>
                    <div className="cm-cost-period-value">{f$4(m.perPod)}</div>
                    <div className="cm-cost-period-unit">{fI(m.podCount)} pods · {fI(m.microserviceCount)} services</div>
                </div>
            </div>

            {/* ── Composition ── */}
            <div className="cm-viz-row" style={{ marginTop:12 }}>
                <div className="cm-viz-block">
                    <div className="cm-mini-title">Cost breakdown</div>
                    <Donut
                        slices={[
                            { key:"compute",  value: seg.compute,  colour:"#3b82f6", label:"Compute",  tooltip:`Compute · ${f$(seg.compute)}/hr · ${pctOf(seg.compute, m.hourly)}` },
                            { key:"memory",   value: seg.memory,   colour:"#a855f7", label:"Memory",   tooltip:`Memory · ${f$(seg.memory)}/hr · ${pctOf(seg.memory, m.hourly)}` },
                            { key:"storage",  value: seg.storage,  colour:"#f59e0b", label:"Storage",  tooltip:`Storage · ${f$(seg.storage)}/hr · ${pctOf(seg.storage, m.hourly)}` },
                            { key:"network",  value: seg.network,  colour:"#ec4899", label:"Network",  tooltip:`Network · ${f$(seg.network)}/hr · ${pctOf(seg.network, m.hourly)}` },
                            { key:"overhead", value: seg.overhead, colour:"#94a3b8", label:"Overhead", tooltip:`Overhead · ${f$(seg.overhead)}/hr · ${pctOf(seg.overhead, m.hourly)}` },
                        ].filter(s => s.value > 0)}
                        total={m.hourly}
                        unit="/hr"
                    />
                </div>
                <div className="cm-viz-block grow">
                    <div className="cm-mini-title">Where each $1/hr goes</div>
                    <Stack segments={[
                        { value: seg.compute,  colour: "#3b82f6", label: "Compute"  },
                        { value: seg.memory,   colour: "#a855f7", label: "Memory"   },
                        { value: seg.storage,  colour: "#f59e0b", label: "Storage"  },
                        { value: seg.network,  colour: "#ec4899", label: "Network"  },
                        { value: seg.overhead, colour: "#94a3b8", label: "Overhead" },
                    ]} />
                    <div style={{ marginTop: 14 }}>
                        <div className="cm-mini-title">Hourly cost trend</div>
                        {trendPoints.length > 0
                            ? <Spark points={trendPoints} colour="#10b981" tall />
                            : <div className="cm-empty-mini">No trend yet — select a wider date range above.</div>}
                    </div>
                </div>
            </div>
        </>
    );
}

/* ── COMPUTE (CPU + Memory combined) ── */
function ComputeBody({ cpu, mem, ops }) {
    const cpuEff = cpu.usageVsRequest;
    const memEff = mem?.usageVsRequest || 0;
    const cpuColour = cpuEff < 30 ? "#ef4444" : cpuEff > 90 ? "#f59e0b" : "#10b981";
    const memColour = memEff < 30 ? "#ef4444" : memEff > 90 ? "#f59e0b" : "#10b981";
    return (
        <>
            <div className="cm-viz-row">
                <div className="cm-viz-block grow">
                    <div className="cm-mini-title">CPU — used vs reserved</div>
                    <UtilBar pct={cpuEff} colour={cpuColour} full />
                    <div className="cm-mute small" style={{ marginTop:5 }}>
                        {fN(cpu.usedCores,2)} cores used · {fN(cpu.requestedCores,2)} reserved · efficiency {fPct(cpuEff)}
                    </div>
                    {ops?.topCpuConsumers?.length > 0 && (
                        <div style={{ marginTop:10 }}>
                            <div className="cm-mini-title">Top CPU consumers</div>
                            <BarList rows={ops.topCpuConsumers.slice(0,5).map((c,i) => ({
                                key: c.name+i, label: c.name, value: c.value, colour: "#3b82f6",
                                tip: `${c.namespace}/${c.name}\n${fN(c.value,3)} cores`,
                            }))} formatValue={(v) => `${fN(v,2)}c`} />
                        </div>
                    )}
                </div>
                <div className="cm-viz-block grow">
                    <div className="cm-mini-title">Memory — used vs reserved</div>
                    <UtilBar pct={memEff} colour={memColour} full />
                    <div className="cm-mute small" style={{ marginTop:5 }}>
                        {fN(mem?.usedGb,2)} GB used · {fN(mem?.requestedGb,2)} GB reserved · efficiency {fPct(memEff)}
                    </div>
                    {ops?.topMemoryConsumers?.length > 0 && (
                        <div style={{ marginTop:10 }}>
                            <div className="cm-mini-title">Top memory consumers</div>
                            <BarList rows={ops.topMemoryConsumers.slice(0,5).map((c,i) => ({
                                key: c.name+i, label: c.name, value: c.value, colour: "#a855f7",
                                tip: `${c.namespace}/${c.name}\n${fN(c.value,2)} GB`,
                            }))} formatValue={(v) => `${fN(v,2)} GB`} />
                        </div>
                    )}
                </div>
            </div>
            <MGrid>
                <MTile label="CPU used (cores)"    value={fN(cpu.usedCores,2)}        colour="#3b82f6" sub="live" />
                <MTile label="CPU reserved"        value={fN(cpu.requestedCores,2)}   sub="requests" />
                <MTile label="CPU efficiency"      value={fPct(cpuEff)}               colour={cpuColour} sub="used ÷ reserved" />
                <MTile label="CPU cost / hr"       value={f$4(cpu.cpuCostHourly)}     colour="#10b981" />
                <MTile label="CPU overprovision"   value={`${fN(cpu.overProvisionRatio,2)}×`} />
                <MTile label="CPU headroom"        value={`${fN(Math.max(0,cpu.requestedCores-cpu.usedCores),2)} c`} sub="unused reservations" />
                <MTile label="Memory used (GB)"    value={fN(mem?.usedGb,2)}          colour="#a855f7" sub="live" />
                <MTile label="Memory reserved"     value={fN(mem?.requestedGb,2)}     sub="requests" />
                <MTile label="Memory efficiency"   value={fPct(memEff)}               colour={memColour} sub="used ÷ reserved" />
                <MTile label="Memory cost / hr"    value={f$4(mem?.memCostHourly||0)} colour="#10b981" />
                <MTile label="Mem overprovision"   value={`${fN(mem?.overProvisionRatio||0,2)}×`} />
                <MTile label="Throttle"            value={ops?.throttlePct != null ? fPct(ops.throttlePct) : "—"} />
            </MGrid>
        </>
    );
}

/* ── STORAGE + NETWORK combined ── */
function StorageNetBody({ storage: s, network: n, ops }) {
    const byClass = (() => {
        const map = new Map();
        for (const p of (s.pvcs || [])) {
            const k = p.storageClass || "default";
            map.set(k, (map.get(k) || 0) + (p.sizeGb || 0));
        }
        const palette = ["#f59e0b","#a855f7","#3b82f6","#10b981","#ef4444","#06b6d4"];
        return [...map.entries()].map(([k, v], i) => ({
            key: k, label: k, value: v, colour: palette[i % palette.length],
            tooltip: `${k} · ${fN(v,1)} GB`,
        }));
    })();
    const errPct = Math.min(100, ops?.errorRatePct || 0);
    return (
        <>
            <div className="cm-viz-row">
                <div className="cm-viz-block">
                    <div className="cm-mini-title">Storage by class</div>
                    {byClass.length > 0
                        ? <Donut slices={byClass} total={s.totalGb} unit="GB" />
                        : <div className="cm-empty-mini">No PVCs found.</div>}
                </div>
                <div className="cm-viz-block grow">
                    {(s.pvcs||[]).length > 0 ? (
                        <>
                            <div className="cm-mini-title">PVCs by size</div>
                            <BarList rows={(s.pvcs||[]).slice(0,8).map((p,i) => ({
                                key: p.pvcName+i, label: p.pvcName, value: p.sizeGb,
                                colour: "#f59e0b",
                                tip: `${p.pvcName}\n${p.storageClass}\n${fN(p.sizeGb,1)} GB · ${f$(p.monthlyUsd)}/mo`,
                            }))} formatValue={(v) => `${fN(v,1)} GB`} />
                        </>
                    ) : (
                        <div>
                            <div className="cm-mini-title">Network traffic</div>
                            <div className="cm-twin">
                                <div>
                                    <div className="cm-twin-label">Error rate</div>
                                    <UtilBar pct={errPct} colour={errPct > 1 ? "#ef4444" : "#10b981"} full />
                                    <div className="cm-mute small" style={{ marginTop:4 }}>{fPct(ops?.errorRatePct)}</div>
                                </div>
                                <div>
                                    <div className="cm-twin-label">Requests / sec</div>
                                    <div style={{ fontSize:26, fontWeight:700, color:"#10b981" }}>{fN(ops?.requestsPerSec,1)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <MGrid>
                <MTile label="PVC count"           value={fI(s.pvcCount)}            colour="#f59e0b" />
                <MTile label="Storage total"       value={`${fN(s.totalGb,1)} GB`} />
                <MTile label="Storage cost / hr"   value={f$4(s.hourly)}             colour="#10b981" />
                <MTile label="Storage cost / mo"   value={f$(s.monthly)} />
                <MTile label="Avg $/GB·mo"         value={f$4(s.avgPerGbMonth)} />
                <MTile label="Largest PVC"         value={`${fN(s.largestGb,1)} GB`} sub={s.largestName||"—"} />
                <MTile label="Storage classes"     value={fI(s.classCount)}           sub={(s.classNames||[]).slice(0,2).join(", ")||"—"} />
                <MTile label="Load balancers"      value={fI(n?.lbCount||0)} />
                <MTile label="Ingress rules"       value={fI(n?.ingressCount||0)} />
                <MTile label="Network cost / hr"   value={f$4(n?.hourly||0)}          colour="#10b981" />
                <MTile label="Network cost / mo"   value={f$(n?.monthly||0)} />
                <MTile label="Requests / sec"      value={fN(ops?.requestsPerSec,1)}  colour="#10b981" />
                <MTile label="Error rate"          value={fPct(ops?.errorRatePct)}
                    colour={ops?.errorRatePct > 1 ? "#ef4444" : undefined} />
                <MTile label="RX / TX"             value={`${fmtB(ops?.networkRxBytesPerSec)} / ${fmtB(ops?.networkTxBytesPerSec)}`} />
            </MGrid>
            {(s.pvcs||[]).length > 0 && (
                <div className="cm-wide" style={{ marginTop:12 }}>
                    <div className="cm-mini-title">PVC details</div>
                    <div className="cm-tbl-wrap">
                        <table className="cm-tbl">
                            <thead><tr><th>PVC</th><th>Class</th><th className="r">Size</th><th className="r">$/hr</th><th className="r">$/mo</th><th>SKU</th></tr></thead>
                            <tbody>
                                {s.pvcs.map((p,i) => (
                                    <tr key={p.pvcName+i}>
                                        <td>{p.pvcName}</td>
                                        <td>{p.storageClass}</td>
                                        <td className="r">{fN(p.sizeGb,1)} GB</td>
                                        <td className="r">{f$4(p.hourlyUsd)}</td>
                                        <td className="r">{f$(p.monthlyUsd)}</td>
                                        <td>{p.azureSkuName||"—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    );
}

/* ── HEALTH & EFFICIENCY (was 3 separate categories) ── */
function HealthBody({ eff, perf, ops, cost, scope }) {
    const cpuColour = eff.cpuEffPct < 30 ? "#ef4444" : eff.cpuEffPct > 80 ? "#f59e0b" : "#10b981";
    const memColour = eff.memEffPct < 30 ? "#ef4444" : eff.memEffPct > 80 ? "#f59e0b" : "#10b981";
    const healthColour = eff.healthScore < 40 ? "#ef4444" : eff.healthScore < 70 ? "#f59e0b" : "#10b981";
    const lat = [
        { key:"p50", value: ops?.p50LatencyMs || 0, colour:"#10b981", label:"p50 (normal)" },
        { key:"p95", value: ops?.p95LatencyMs || 0, colour:"#f59e0b", label:"p95 (tail)" },
        { key:"p99", value: ops?.p99LatencyMs || 0, colour:"#ef4444", label:"p99 (worst)" },
    ];
    return (
        <>
            {/* health score + efficiency bars */}
            <div className="cm-viz-row">
                <div className="cm-viz-block" style={{ alignItems:"center" }}>
                    <div className="cm-mini-title">Overall health score</div>
                    <div style={{ fontSize:56, fontWeight:800, color:healthColour, lineHeight:1, fontVariantNumeric:"tabular-nums", marginTop:4 }}>
                        {eff.healthScore}
                    </div>
                    <div className="cm-mute small" style={{ marginTop:4 }}>out of 100</div>
                    <div style={{ marginTop:12, fontSize:12, fontWeight:600, color: healthColour }}>
                        {eff.suggestion}
                    </div>
                </div>
                <div className="cm-viz-block grow">
                    <div className="cm-mini-title">CPU efficiency — target 40–80%</div>
                    <UtilBar pct={eff.cpuEffPct} colour={cpuColour} full />
                    <div className="cm-mute small" style={{ marginTop:5 }}>
                        {fN(eff.cpuWasteCores,2)} cores wasted (reserved but unused)
                    </div>
                    <div style={{ marginTop:12 }}>
                        <div className="cm-mini-title">Memory efficiency — target 40–80%</div>
                        <UtilBar pct={eff.memEffPct} colour={memColour} full />
                        <div className="cm-mute small" style={{ marginTop:5 }}>
                            {fN(eff.memWasteGb,2)} GB wasted (reserved but unused)
                        </div>
                    </div>
                </div>
                {lat[0].value > 0 && (
                    <div className="cm-viz-block grow">
                        <div className="cm-mini-title">Response latency (ms)</div>
                        <BarList rows={lat.map(l => ({
                            key: l.key, label: l.label, value: l.value, colour: l.colour,
                            tip: `${l.label}: ${fN(l.value,1)} ms`,
                        }))} formatValue={(v) => `${fN(v,1)} ms`} />
                    </div>
                )}
            </div>
            <MGrid>
                <MTile label="Health score"        value={`${eff.healthScore}/100`}   colour={healthColour} />
                <MTile label="CPU efficiency"      value={fPct(eff.cpuEffPct)}        colour={cpuColour} />
                <MTile label="Memory efficiency"   value={fPct(eff.memEffPct)}        colour={memColour} />
                <MTile label="Money wasted / hr"   value={f$4(eff.wasteHourly)}       colour="#ef4444" sub="over-provisioned resources" />
                <MTile label="Money wasted / mo"   value={f$(eff.wasteMonthly)}       colour="#ef4444" />
                <MTile label="CPU cores wasted"    value={`${fN(eff.cpuWasteCores,2)} c`} sub="reserved but unused" />
                <MTile label="Memory wasted"       value={`${fN(eff.memWasteGb,2)} GB`} sub="reserved but unused" />
                <MTile label="Pods running"        value={fI(eff.podCount)} />
                <MTile label="Restarts"            value={fI(eff.restarts)}           colour={eff.restarts > 5 ? "#ef4444" : undefined} />
                <MTile label="Ready pods"          value={fI(ops?.readyPods)}         colour="#10b981" />
                <MTile label="CrashLoop pods"      value={fI(ops?.crashLoopingPods)}  colour={ops?.crashLoopingPods > 0 ? "#ef4444" : undefined} />
                <MTile label="Requests / sec"      value={fN(ops?.requestsPerSec,1)}  colour="#10b981" />
                <MTile label="Error rate"          value={fPct(ops?.errorRatePct)}    colour={ops?.errorRatePct > 1 ? "#ef4444" : undefined} />
                <MTile label="Cost per request"    value={ops?.requestsPerSec > 0 ? f$4(cost.hourly / (ops.requestsPerSec * 3600)) : "—"} sub="$/req" />
            </MGrid>
        </>
    );
}

/* Inline mini stat block for viz rows */
function Stat({ label, value, colour }) {
    return (
        <div>
            <div className="cm-twin-label">{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colour || "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                {value}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  NAMESPACE TABLE                                                      */
/* ════════════════════════════════════════════════════════════════════ */

function NamespaceTable({ rows, search, nsSort, setNsSort, onPickNamespace }) {
    const { key, dir } = nsSort;
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const f = q ? rows.filter(n =>
            (n.namespace || "").toLowerCase().includes(q) ||
            (n.matchedProjectName || "").toLowerCase().includes(q) ||
            (n.productKey || "").toLowerCase().includes(q) ||
            (n.env || "").toLowerCase().includes(q)
        ) : rows;
        const valOf = (n) => {
            switch (key) {
                case "hourly":  return n.smoothed;
                case "monthly": return n.smoothed * HOURS_PER_MONTH;
                case "mtd":     return n.monthToDateUsd || 0;
                case "pods":    return n.podCount || 0;
                case "cpu":     return n.cpuCores || 0;
                case "mem":     return n.memoryGb || 0;
                case "ns":      return n.namespace;
                case "env":     return n.env;
                case "product": return n.productKey;
                default:        return n.smoothed;
            }
        };
        return [...f].sort((a, b) => {
            const va = valOf(a), vb = valOf(b);
            if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === "asc" ? va - vb : vb - va;
        });
    }, [rows, search, key, dir]);

    const head = (k, label, right = false) => (
        <th className={right ? "r" : ""}
            onClick={() => setNsSort({ key: k, dir: key === k && dir === "desc" ? "asc" : "desc" })}
            style={{ cursor: "pointer", userSelect: "none" }}>
            {label} {key === k && (dir === "asc" ? "▲" : "▼")}
        </th>
    );

    return (
        <Card title={`Namespaces (${filtered.length})`} sub="click any row to drill in" Icon={Layers}>
            <div className="cm-tbl-wrap">
                <table className="cm-tbl">
                    <thead>
                        <tr>
                            {head("env", "Env")}
                            {head("ns", "Namespace")}
                            {head("product", "Product")}
                            {head("pods", "Pods", true)}
                            {head("cpu", "CPU used", true)}
                            {head("mem", "Mem used", true)}
                            {head("hourly", "Cost/hr (reserved)", true)}
                            {head("monthly", "Monthly", true)}
                            {head("mtd", "MTD", true)}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={9} className="cm-empty-mini">
                                {search ? "No rows match the filter." : "No namespaces loaded."}
                            </td></tr>
                        )}
                        {filtered.map((n, i) => (
                            <tr key={n.env + "/" + n.namespace + "/" + i}
                                className={n.isSystem ? "cm-row-sys" : ""}
                                onClick={() => onPickNamespace(n.env, n.namespace)}
                                style={{ cursor: "pointer" }}>
                                <td><EnvTag env={n.env} colour={envColour(n.env)} /></td>
                                <td>
                                    <strong>{n.namespace}</strong>
                                    {n.isSystem && <span className="cm-sys-tag">system</span>}
                                </td>
                                <td>{n.productKey === "SYSTEM" ? <span className="cm-mute">—</span> : <span className="cm-prod-tag">{n.productKey}</span>}</td>
                                <td className="r">{fI(n.podCount)}</td>
                                <td className="r">{fN(n.cpuCores, 2)}</td>
                                <td className="r">{fN(n.memoryGb, 1)} GB</td>
                                <td className="r"><strong>{f$(n.smoothed)}</strong></td>
                                <td className="r">{f$big(n.smoothed * HOURS_PER_MONTH)}</td>
                                <td className="r">{f$big(n.monthToDateUsd)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  SHARED PIECES                                                        */
/* ════════════════════════════════════════════════════════════════════ */

function Card({ title, sub, Icon, accent, action, children }) {
    return (
        <section className="cm-card" style={accent ? { borderTopColor: accent } : {}}>
            <header className="cm-card-head">
                <div>
                    <span className="cm-card-title">{Icon && <Icon size={14}/>} {title}</span>
                    {sub && <span className="cm-card-sub"> · {sub}</span>}
                </div>
                {action && <div>{action}</div>}
            </header>
            <div className="cm-card-body">{children}</div>
        </section>
    );
}

function EnvTag({ env, colour }) {
    return (
        <span className="cm-env-tag" style={{ background: colour+"20", color: colour, borderColor: colour+"40" }}>
            <span className="cm-dot" style={{ background: colour }} />{(env || "").toUpperCase()}
        </span>
    );
}

function Notice({ icon, title, body }) {
    return (
        <div className="cm-notice">
            <div className="cm-notice-icon">{icon}</div>
            <div>
                <div className="cm-notice-title">{title}</div>
                <div className="cm-notice-body">{body}</div>
            </div>
        </div>
    );
}

function SkeletonBoot() {
    return (
        <div className="cm-skel">
            <div className="cm-skel-strip">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="cm-skel-kpi" />)}
            </div>
            <div className="cm-skel-row">
                <div className="cm-skel-chart" />
                <div className="cm-skel-chart" />
                <div className="cm-skel-chart" />
            </div>
            <div className="cm-skel-table" />
        </div>
    );
}

function UtilBar({ pct, colour, full }) {
    const p = Math.max(0, Math.min(100, pct || 0));
    const danger = p > 90;
    return (
        <div className={`cm-utbar ${full ? "full" : ""}`} title={`${fPct(p)} used`}>
            <div className="cm-utbar-fill" style={{ width: `${p}%`, background: danger ? "#ef4444" : colour }} />
            <span className="cm-utbar-text">{fPct(p)}</span>
        </div>
    );
}

function Legend({ items }) {
    return (
        <div className="cm-legend">
            {items.map((it, i) => (
                <div key={i} className="cm-legend-row">
                    <span className="cm-dot" style={{ background: it.colour }} />
                    <span className="cm-legend-label">{it.label}</span>
                    <span className="cm-legend-val">{it.value}</span>
                    {it.extra && <span className="cm-legend-extra">{it.extra}</span>}
                </div>
            ))}
        </div>
    );
}

/* ─── Donut chart with hover tooltip ─── */
function Donut({ slices, total, unit = "" }) {
    const usable = slices.filter(s => s.value > 0);
    const sum = usable.reduce((a, s) => a + s.value, 0) || 1;
    const r = 56, cx = 80, cy = 80, sw = 22;
    let acc = 0;
    return (
        <svg className="cm-donut" viewBox="0 0 160 160" width="160" height="160">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={sw} />
            {usable.map((s, i) => {
                const frac = s.value / sum;
                const len = 2 * Math.PI * r;
                const dash = len * frac;
                const rot = (acc / sum) * 360 - 90;
                acc += s.value;
                return (
                    <circle key={s.key + i} cx={cx} cy={cy} r={r} fill="none"
                        stroke={s.colour} strokeWidth={sw}
                        strokeDasharray={`${dash} ${len - dash}`}
                        transform={`rotate(${rot} ${cx} ${cy})`}>
                        <title>{`${s.label} · ${((s.value/sum)*100).toFixed(1)}%\n${s.tooltip}`}</title>
                    </circle>
                );
            })}
            <text x={cx} y={cy - 3} textAnchor="middle" className="cm-donut-num">{f$big(total)}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="cm-donut-cap">{unit}</text>
        </svg>
    );
}

/* ─── Horizontal bar list (with optional segments + click) ─── */
function BarList({ rows, formatValue, onPick }) {
    const max = Math.max(...rows.map(r => r.value), 1e-9);
    const fmt = formatValue || ((v) => f$(v));
    return (
        <div className="cm-bar">
            {rows.map(r => (
                <div key={r.key}
                    className={`cm-bar-row ${onPick ? "click" : ""}`}
                    onClick={onPick ? () => onPick(r.key) : undefined}
                    title={r.tip || `${typeof r.label === "string" ? r.label : ""}: ${fmt(r.value)}`}>
                    <div className="cm-bar-label">{r.label}</div>
                    <div className="cm-bar-track">
                        {r.segments
                            ? <div className="cm-bar-stack" style={{ width: `${(r.value/max)*100}%` }}>
                                {r.segments.map((s, i) => (
                                    <div key={i} style={{ flex: s.value, background: s.colour }}
                                        title={`${s.label}: ${f$(s.value)}`} />
                                ))}
                              </div>
                            : <div className="cm-bar-fill" style={{ width: `${(r.value/max)*100}%`, background: r.colour }} />}
                    </div>
                    <div className="cm-bar-val">{fmt(r.value)}</div>
                </div>
            ))}
        </div>
    );
}

function Stack({ segments }) {
    const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
    return (
        <div>
            <div className="cm-stack">
                {segments.map((s, i) => (
                    <div key={i} style={{ flex: s.value || 0, background: s.colour }}
                        title={`${s.label}: ${f$(s.value)} (${((s.value/total)*100).toFixed(1)}%)`} />
                ))}
            </div>
            <div className="cm-stack-legend">
                {segments.map((s, i) => (
                    <span key={i}>
                        <span className="cm-dot" style={{ background: s.colour }} />
                        {s.label} <strong>{((s.value/total)*100).toFixed(1)}%</strong>
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  PRODUCT GRAPHS PANEL                                                 */
/*  Shown when a product or namespace is selected. Has its own local    */
/*  date-range tabs (Live / Day / 7 Days / Month / Year / Custom) and   */
/*  renders 4 charts:                                                    */
/*    1. Cost trend with spike annotation                                */
/*    2. CPU — request vs live usage                                     */
/*    3. Memory — request vs live usage                                  */
/*    4. Request rate + error-rate (ops metrics)                         */
/* ════════════════════════════════════════════════════════════════════ */

function ProductGraphsPanel({ scopeData, opsMetrics, tsByEnv, tsWindow, rangeLabel }) {
    const [expandChart, setExpandChart] = useState(null);

    /* ── Data computations (from global tsByEnv, filtered for current scope) ── */
    const { kind, data, name, env: nsEnv } = scopeData;
    const nsNames = useMemo(() =>
        kind === "product" ? new Set((data.namespaces || []).map(n => n.namespace)) : null
    , [kind, data]);

    /* Helper: iterate all matching namespace entries in tsByEnv */
    const forEachNs = useCallback((fn) => {
        if (kind === "namespace") {
            for (const p of (tsByEnv[nsEnv] || [])) {
                const ns = (p.namespaces || []).find(n => n.namespace === name);
                if (ns) fn(p, ns);
            }
        } else {
            for (const e of Object.keys(tsByEnv)) {
                for (const p of (tsByEnv[e] || [])) {
                    for (const ns of (p.namespaces || [])) {
                        if (nsNames.has(ns.namespace)) fn(p, ns);
                    }
                }
            }
        }
    }, [tsByEnv, kind, nsEnv, name, nsNames]);

    /* Cost trend */
    const costPoints = useMemo(() => {
        const buckets = new Map();
        forEachNs((p, ns) => buckets.set(p.t, (buckets.get(p.t)||0) + (ns.hourlyUsd||0)));
        return [...buckets.entries()].sort(([a],[b]) => new Date(a)-new Date(b)).map(([t,v]) => ({t,v}));
    }, [forEachNs]);

    /* Spike detection */
    const spikes = useMemo(() => {
        if (costPoints.length < 4) return [];
        const vals = costPoints.map(p => p.v);
        const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
        const std  = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
        return costPoints.filter(p => p.v > mean + 2*std);
    }, [costPoints]);

    /* CPU + Memory request vs usage */
    const { cpuPts, memPts } = useMemo(() => {
        const cu=new Map(),cr=new Map(),mu=new Map(),mr=new Map();
        forEachNs((p,ns) => {
            cu.set(p.t,(cu.get(p.t)||0)+(ns.cpuUsedCores||0));
            cr.set(p.t,(cr.get(p.t)||0)+(ns.cpuRequestCores||0));
            mu.set(p.t,(mu.get(p.t)||0)+(ns.memoryUsedGb||0));
            mr.set(p.t,(mr.get(p.t)||0)+(ns.memoryRequestGb||0));
        });
        const keys=[...cu.keys()].sort((a,b)=>new Date(a)-new Date(b));
        return {
            cpuPts: keys.map(t=>({t,used:cu.get(t)||0,req:cr.get(t)||0})),
            memPts: keys.map(t=>({t,used:mu.get(t)||0,req:mr.get(t)||0})),
        };
    }, [forEachNs]);

    /* Pod count over time */
    const podPts = useMemo(() => {
        const b=new Map();
        forEachNs((p,ns) => b.set(p.t,(b.get(p.t)||0)+(ns.podCount||0)));
        return [...b.entries()].sort(([a],[b])=>new Date(a)-new Date(b)).map(([t,v])=>({t,v}));
    }, [forEachNs]);

    /* Cost by component (stacked) */
    const compPts = useMemo(() => {
        const cmp=new Map(),mem=new Map(),sto=new Map(),net=new Map();
        forEachNs((p,ns) => {
            cmp.set(p.t,(cmp.get(p.t)||0)+(ns.computeHourlyUsd||0));
            mem.set(p.t,(mem.get(p.t)||0)+(ns.memoryHourlyUsd||0));
            sto.set(p.t,(sto.get(p.t)||0)+(ns.storageHourlyUsd||0));
            net.set(p.t,(net.get(p.t)||0)+(ns.networkHourlyUsd||0));
        });
        const keys=[...cmp.keys()].sort((a,b)=>new Date(a)-new Date(b));
        return keys.map(t=>({t,compute:cmp.get(t)||0,memory:mem.get(t)||0,storage:sto.get(t)||0,network:net.get(t)||0}));
    }, [forEachNs]);

    /* Namespace cost breakdown (product scope only) */
    const nsByCost = useMemo(() => {
        if (kind !== "product") return [];
        return (data.namespaces||[]).slice().sort((a,b)=>b.smoothed-a.smoothed).slice(0,8)
            .map(n => ({ name:n.namespace, env:n.env, value:n.smoothed }));
    }, [kind, data]);

    /* Per-namespace time series for multi-line chart */
    const nsSeries = useMemo(() => {
        const map = new Map(); // namespace -> [{t, v, cpu, cpuReq, mem, memReq, pods}]
        if (kind === "namespace") {
            for (const p of (tsByEnv[nsEnv] || [])) {
                const ns = (p.namespaces || []).find(n => n.namespace === name);
                if (!ns) continue;
                if (!map.has(name)) map.set(name, []);
                map.get(name).push({ t: p.t, v: ns.hourlyUsd||0, cpu: ns.cpuUsedCores||0, cpuReq: ns.cpuRequestCores||0, mem: ns.memoryUsedGb||0, memReq: ns.memoryRequestGb||0, pods: ns.podCount||0 });
            }
        } else {
            for (const e of Object.keys(tsByEnv)) {
                for (const p of (tsByEnv[e] || [])) {
                    for (const ns of (p.namespaces || [])) {
                        if (!nsNames.has(ns.namespace)) continue;
                        if (!map.has(ns.namespace)) map.set(ns.namespace, []);
                        map.get(ns.namespace).push({ t: p.t, v: ns.hourlyUsd||0, cpu: ns.cpuUsedCores||0, cpuReq: ns.cpuRequestCores||0, mem: ns.memoryUsedGb||0, memReq: ns.memoryRequestGb||0, pods: ns.podCount||0 });
                    }
                }
            }
        }
        for (const [, pts] of map) pts.sort((a,b) => new Date(a.t)-new Date(b.t));
        const ranked = [...map.entries()].map(([ns, pts]) => ({ ns, pts, latest: pts.at(-1)?.v || 0 }))
            .sort((a,b) => b.latest - a.latest).slice(0, 8);
        return ranked;
    }, [tsByEnv, kind, nsEnv, name, nsNames]);

    const gran = tsWindow?.gran || "day";

    const COST_LAYERS = [
        { key:"compute", label:"Compute",  colour:"#3b82f6" },
        { key:"memory",  label:"Memory",   colour:"#a855f7" },
        { key:"storage", label:"Storage",  colour:"#f59e0b" },
        { key:"network", label:"Network",  colour:"#ec4899" },
    ];

    const EMPTY = <div className="cm-empty-mini">No data for this range. Try a wider window.</div>;

    /* Reusable chart card with expand button */
    const ChartCard = ({ id, title, sub, accent, children }) => (
        <div className="pgp-chart-card" style={accent ? { borderTop: `2px solid ${accent}` } : {}}>
            <div className="pgp-chart-head">
                <span className="pgp-chart-title">{title}</span>
                <span className="pgp-chart-sub">{sub}</span>
                <button className="pgp-expand-btn" title="Full view" onClick={() => setExpandChart(id)}>⛶</button>
            </div>
            {children}
        </div>
    );

    return (
        <>
        <div className="pgp-shell">
            {/* ── Range label — controlled by the global date filter above ── */}
            <div className="pgp-tabbar">
                <span className="pgp-tab-label">Cost history —</span>
                <span className="pgp-tab-live-badge">{rangeLabel}</span>
                <span className="cm-mute" style={{ fontSize:10, marginLeft:4 }}>· adjust using the date filter above</span>
            </div>

            {/* ── Chart grid ── */}
            <div className="pgp-charts">

                {/* 1. Cost Trend — request-based, per namespace/product lines */}
                <ChartCard id="cost" title="💰 Cost Trend (request-based)"
                    sub={`${rangeLabel} · $/hr · cost = reserved quota · each line = namespace · hover for details${spikes.length > 0 ? ` · ⚠ ${spikes.length} spike${spikes.length>1?"s":""}` : ""}`}
                    accent="#10b981">
                    {nsSeries.length > 0 && nsSeries[0].pts.length > 1
                        ? <MultiNsCostChart series={nsSeries} gran={gran} scopeData={scopeData} />
                        : costPoints.length > 1
                            ? <SpikeChart points={costPoints} spikes={spikes} colour="#10b981" unit="/hr" formatter={f$4} gran={gran} />
                            : EMPTY}
                </ChartCard>

                {/* 2. Cost by component stacked */}
                <ChartCard id="stack" title="📊 Cost by Component"
                    sub={`${rangeLabel} · Compute / Memory / Storage / Network`}
                    accent="#6366f1">
                    {compPts.length > 1
                        ? <StackedAreaChart points={compPts} layers={COST_LAYERS} gran={gran} />
                        : EMPTY}
                </ChartCard>

                {/* 3. CPU reserved (drives cost) vs live usage */}
                <ChartCard id="cpu" title="🖥 CPU · Reserved vs Live Usage" sub={`${rangeLabel} · cores · cost billed on reserved (grey line)`} accent="#3b82f6">
                    {cpuPts.length > 1
                        ? <DualLineChart points={cpuPts}
                            lineA={{ key:"req",  label:"Reserved (billed)", colour:"#94a3b8" }}
                            lineB={{ key:"used", label:"Live usage",         colour:"#3b82f6" }}
                            formatter={v => `${fN(v,2)} c`} gran={gran} />
                        : EMPTY}
                </ChartCard>

                {/* 4. Memory reserved (drives cost) vs live usage */}
                <ChartCard id="mem" title="🧠 Memory · Reserved vs Live Usage" sub={`${rangeLabel} · GB · cost billed on reserved (grey line)`} accent="#a855f7">
                    {memPts.length > 1
                        ? <DualLineChart points={memPts}
                            lineA={{ key:"req",  label:"Reserved (billed)", colour:"#94a3b8" }}
                            lineB={{ key:"used", label:"Live usage",         colour:"#a855f7" }}
                            formatter={v => `${fN(v,2)} GB`} gran={gran} />
                        : EMPTY}
                </ChartCard>

                {/* 5. Pod count over time */}
                <ChartCard id="pods" title="🪄 Pod Count" sub={`${rangeLabel} · running replicas`} accent="#f59e0b">
                    {podPts.length > 1
                        ? <SpikeChart points={podPts} spikes={[]} colour="#f59e0b" unit=" pods"
                            formatter={v => Math.round(v).toString()} gran={gran} />
                        : EMPTY}
                </ChartCard>

                {/* 6. Namespace breakdown (product scope only) */}
                {kind === "product" && nsByCost.length > 0 && (
                    <ChartCard id="ns" title="📦 Cost by Namespace" sub="live hourly · top 8" accent="#0ea5e9">
                        <BarList
                            rows={nsByCost.map((n, i) => ({
                                key: n.env + "/" + n.name,
                                label: (
                                    <>
                                        <span className="cm-env-tag inline"
                                            style={{ background:envColour(n.env,i)+"20", color:envColour(n.env,i), borderColor:envColour(n.env,i)+"40" }}>
                                            {n.env.toUpperCase()}
                                        </span>{" "}{n.name}
                                    </>
                                ),
                                value: n.value, colour: envColour(n.env, i),
                                tip: `${n.env.toUpperCase()}/${n.name}\n${f$(n.value)}/hr · ${f$big(n.value*HOURS_PER_MONTH)}/mo`,
                            }))}
                            formatValue={f$}
                        />
                    </ChartCard>
                )}

                {/* 7. Live ops */}
                <div className="pgp-chart-card pgp-live-card">
                    <div className="pgp-chart-head">
                        <span className="pgp-chart-title">⚡ Live Ops</span>
                        <span className="pgp-chart-sub">from Prometheus</span>
                        <span className="pgp-live-dot" title="Live" />
                    </div>
                    {opsMetrics ? (
                        <div className="pgp-ops-grid">
                            <OpsKpi label="Req/sec"   value={fN(opsMetrics.requestsPerSec,1)}    colour="#10b981" icon="🚦" />
                            <OpsKpi label="Error rate" value={fPct(opsMetrics.errorRatePct)}
                                colour={opsMetrics.errorRatePct>1?"#ef4444":"#10b981"}
                                icon={opsMetrics.errorRatePct>1?"🔴":"🟢"} />
                            <OpsKpi label="p50 ms"    value={opsMetrics.p50LatencyMs?`${fN(opsMetrics.p50LatencyMs,1)}`:"—"} colour="#3b82f6" icon="⏱" />
                            <OpsKpi label="p95 ms"    value={opsMetrics.p95LatencyMs?`${fN(opsMetrics.p95LatencyMs,1)}`:"—"} colour="#f59e0b" icon="⏱" />
                            <OpsKpi label="p99 ms"    value={opsMetrics.p99LatencyMs?`${fN(opsMetrics.p99LatencyMs,1)}`:"—"} colour="#ef4444" icon="⏱" />
                            <OpsKpi label="Ready pods" value={fI(opsMetrics.readyPods)}           colour="#10b981" icon="✅" />
                            <OpsKpi label="CrashLoop"  value={fI(opsMetrics.crashLoopingPods)}
                                colour={opsMetrics.crashLoopingPods>0?"#ef4444":"#10b981"} icon="💥" />
                            <OpsKpi label="RX"         value={fmtB(opsMetrics.networkRxBytesPerSec)} colour="#0ea5e9" icon="⬇" />
                            <OpsKpi label="TX"         value={fmtB(opsMetrics.networkTxBytesPerSec)} colour="#0ea5e9" icon="⬆" />
                        </div>
                    ) : (
                        <div className="cm-empty-mini">
                            Fetching live metrics…{" "}
                            <span className="cm-mute" style={{fontSize:10}}>
                                (namespace scope: instant · product scope: aggregated by env)
                            </span>
                        </div>
                    )}
                </div>

            </div>
        </div>

        {/* ── Full-view modals ── */}
        {expandChart === "cost" && (
            <FullViewModal title="💰 Cost Trend" sub={rangeLabel} onClose={() => setExpandChart(null)}>
                {costPoints.length > 1
                    ? <SpikeChart points={costPoints} spikes={spikes} colour="#10b981" unit="/hr" formatter={f$4} gran={gran} />
                    : EMPTY}
            </FullViewModal>
        )}
        {expandChart === "stack" && (
            <FullViewModal title="📊 Cost by Component" sub={rangeLabel} onClose={() => setExpandChart(null)}>
                {compPts.length > 1 ? <StackedAreaChart points={compPts} layers={COST_LAYERS} gran={gran} /> : EMPTY}
            </FullViewModal>
        )}
        {expandChart === "cpu" && (
            <FullViewModal title="🖥 CPU · Request vs Usage" sub={rangeLabel} onClose={() => setExpandChart(null)}>
                {cpuPts.length > 1
                    ? <DualLineChart points={cpuPts}
                        lineA={{ key:"req",  label:"Requested", colour:"#94a3b8" }}
                        lineB={{ key:"used", label:"Used",      colour:"#3b82f6" }}
                        formatter={v => `${fN(v,2)} c`} gran={gran} />
                    : EMPTY}
            </FullViewModal>
        )}
        {expandChart === "mem" && (
            <FullViewModal title="🧠 Memory · Request vs Usage" sub={rangeLabel} onClose={() => setExpandChart(null)}>
                {memPts.length > 1
                    ? <DualLineChart points={memPts}
                        lineA={{ key:"req",  label:"Requested", colour:"#94a3b8" }}
                        lineB={{ key:"used", label:"Used",      colour:"#a855f7" }}
                        formatter={v => `${fN(v,2)} GB`} gran={gran} />
                    : EMPTY}
            </FullViewModal>
        )}
        {expandChart === "pods" && (
            <FullViewModal title="🪄 Pod Count" sub={rangeLabel} onClose={() => setExpandChart(null)}>
                {podPts.length > 1
                    ? <SpikeChart points={podPts} spikes={[]} colour="#f59e0b" unit=" pods"
                        formatter={v => Math.round(v).toString()} gran={gran} />
                    : EMPTY}
            </FullViewModal>
        )}
        </>
    );
}

function OpsKpi({ label, value, colour, icon }) {
    return (
        <div className="pgp-ops-kpi" style={{ borderTopColor: colour }}>
            <div className="pgp-ops-kpi-icon">{icon}</div>
            <div className="pgp-ops-kpi-value" style={{ color: colour }}>{value}</div>
            <div className="pgp-ops-kpi-label">{label}</div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  MULTI-NS COST CHART — one line per namespace with rich hover tooltip  */
/* ════════════════════════════════════════════════════════════════════ */

const NS_PALETTE = ["#10b981","#3b82f6","#a855f7","#f59e0b","#ec4899","#0ea5e9","#f97316","#14b8a6"];

function MultiNsCostChart({ series, gran, scopeData }) {
    const svgRef = useRef(null);
    const [tip, setTip] = useState(null);

    const w = 800, h = 210, padL = 60, padR = 14, padT = 16, padB = 42;

    /* Compute axis bounds across all series */
    const allTs = useMemo(() => {
        const s = new Set();
        for (const { pts } of series) for (const p of pts) s.add(p.t);
        return [...s].sort((a, b) => new Date(a) - new Date(b));
    }, [series]);

    const minT = allTs.length ? new Date(allTs[0]).getTime() : 0;
    const maxT = allTs.length ? new Date(allTs[allTs.length - 1]).getTime() : 1;
    const maxV = useMemo(() => Math.max(...series.flatMap(s => s.pts.map(p => p.v)), 1e-9) * 1.12, [series]);

    const xp = (t) => padL + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - padL - padR);
    const yp = (v) => padT + (1 - v / maxV) * (h - padT - padB);

    const xTicks = useMemo(() => {
        if (allTs.length < 2) return [];
        const step = Math.max(1, Math.floor(allTs.length / 5));
        return allTs.filter((_, i) => i % step === 0 || i === allTs.length - 1);
    }, [allTs]);

    const yTicks = [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV];

    const handleMouse = (e) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const t = new Date(minT + relX * (maxT - minT)).toISOString();
        /* find closest time across all series */
        let bestTs = allTs[0];
        let bestDist = Infinity;
        for (const ts of allTs) {
            const dist = Math.abs(new Date(ts).getTime() - new Date(t).getTime());
            if (dist < bestDist) { bestDist = dist; bestTs = ts; }
        }
        /* collect data for that time from all series */
        const rows = series.map(({ ns, pts }, i) => {
            const pt = pts.find(p => p.t === bestTs) || null;
            return { ns, colour: NS_PALETTE[i % NS_PALETTE.length], pt };
        });
        setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ts: bestTs, rows });
    };

    return (
        <div style={{ position: "relative" }}>
            {/* Up/Down legend */}
            <div className="mnc-legend">
                {series.map(({ ns, pts }, i) => {
                    const last = pts.at(-1);
                    const prev = pts.length > 3 ? pts[pts.length - 3] : pts[0];
                    const up = last && last.v > 0 && (last.pods ?? 1) > 0;
                    const trend = last && prev ? (last.v > prev.v ? "↑" : last.v < prev.v ? "↓" : "→") : "—";
                    const colour = NS_PALETTE[i % NS_PALETTE.length];
                    return (
                        <div key={ns} className="mnc-legend-item">
                            <span className="mnc-dot" style={{ background: colour }} />
                            <span className="mnc-ns-label">{ns}</span>
                            <span className={`mnc-updown ${up ? "up" : "down"}`}>{up ? "UP" : "DOWN"}</span>
                            <span className="mnc-trend" style={{ color: trend === "↑" ? "#ef4444" : trend === "↓" ? "#10b981" : "#94a3b8" }}>{trend}</span>
                            <span className="mnc-cost">{f$(last?.v)}/hr</span>
                        </div>
                    );
                })}
            </div>

            {/* SVG chart */}
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
                style={{ width: "100%", height: 240, cursor: "crosshair" }}
                onMouseMove={handleMouse} onMouseLeave={() => setTip(null)}>
                {/* Y-axis grid + labels */}
                {yTicks.map((v, i) => (
                    <g key={i}>
                        <line x1={padL} y1={yp(v)} x2={w - padR} y2={yp(v)}
                            stroke="#f1f5f9" strokeWidth={1} />
                        <text x={padL - 4} y={yp(v) + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
                            {f$(v)}
                        </text>
                    </g>
                ))}
                {/* X-axis labels */}
                {xTicks.map((ts, i) => (
                    <text key={i} x={xp(ts)} y={h - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
                        {fmtXLabel(new Date(ts).getTime(), gran)}
                    </text>
                ))}
                {/* Lines per namespace */}
                {series.map(({ ns, pts }, i) => {
                    if (pts.length < 2) return null;
                    const colour = NS_PALETTE[i % NS_PALETTE.length];
                    const d = pts.map((p, j) => `${j === 0 ? "M" : "L"} ${xp(p.t).toFixed(1)} ${yp(p.v).toFixed(1)}`).join(" ");
                    return (
                        <g key={ns}>
                            <path d={d} fill="none" stroke={colour} strokeWidth={1.8} strokeLinejoin="round" opacity={0.9} />
                            {/* End dot */}
                            <circle cx={xp(pts.at(-1).t)} cy={yp(pts.at(-1).v)} r={3} fill={colour} />
                        </g>
                    );
                })}
                {/* Hover crosshair */}
                {tip && (
                    <line x1={xp(tip.ts)} y1={padT} x2={xp(tip.ts)} y2={h - padB}
                        stroke="#0f172a" strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
                )}
            </svg>

            {/* Rich hover tooltip */}
            {tip && (
                <div className="mnc-tip" style={{
                    left: tip.x > 500 ? tip.x - 240 : tip.x + 14,
                }}>
                    <div className="mnc-tip-time">
                        {new Date(tip.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </div>
                    {tip.rows.filter(r => r.pt).map((r, i) => (
                        <div key={r.ns} className="mnc-tip-row">
                            <span className="mnc-dot sm" style={{ background: r.colour }} />
                            <span className="mnc-tip-ns">{r.ns}</span>
                            <div className="mnc-tip-details">
                                <span className="mnc-tip-cost">{f$(r.pt.v)}/hr</span>
                                <span className="mnc-tip-detail" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: 9 }}>cost = reserved quota</span>
                                <span className="mnc-tip-detail">Reserved: CPU {fN(r.pt.cpuReq, 2)}c · Mem {fN(r.pt.memReq, 1)} GB</span>
                                <span className="mnc-tip-detail">Live use: CPU {fN(r.pt.cpu, 2)}c · Mem {fN(r.pt.mem, 1)} GB</span>
                                <span className="mnc-tip-detail">Pods: {r.pt.pods ?? "—"}</span>
                                {r.pt.cpuReq > 0 && r.pt.cpu < r.pt.cpuReq * 0.3 && <span className="mnc-tip-warn">⚠ CPU &lt;30% utilized — over-provisioned?</span>}
                                {r.pt.memReq > 0 && r.pt.mem < r.pt.memReq * 0.3 && <span className="mnc-tip-warn">⚠ Mem &lt;30% utilized — over-provisioned?</span>}
                            </div>
                        </div>
                    ))}
                    {tip.rows.filter(r => r.pt).length > 1 && (
                        <div className="mnc-tip-total">
                            Total: <strong>{f$(tip.rows.reduce((s, r) => s + (r.pt?.v || 0), 0))}/hr</strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  AXIS HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════════ */

function axisXTicks(minT, maxT, n = 6) {
    const step = (maxT - minT) / Math.max(n - 1, 1);
    return Array.from({ length: n }, (_, i) => minT + step * i);
}
function fmtXLabel(t, gran) {
    const d = new Date(t);
    if (gran === "minute") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    if (gran === "hour")   return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", hour12: false });
    if (gran === "day")    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (gran === "month")  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function axisYTicks(minV, maxV, n = 4) {
    const step = (maxV - minV) / Math.max(n - 1, 1);
    return Array.from({ length: n }, (_, i) => minV + step * i);
}

/* ── Full-view modal overlay ── */
function FullViewModal({ title, sub, onClose, children }) {
    useEffect(() => {
        const fn = e => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", fn);
        return () => document.removeEventListener("keydown", fn);
    }, [onClose]);
    return (
        <div className="fvm-overlay" onClick={onClose}>
            <div className="fvm-box" onClick={e => e.stopPropagation()}>
                <div className="fvm-header">
                    <div>
                        <span className="fvm-title">{title}</span>
                        {sub && <span className="fvm-sub"> · {sub}</span>}
                    </div>
                    <button className="cm-btn ghost sm" onClick={onClose}><X size={12}/> Close</button>
                </div>
                <div className="fvm-body">{children}</div>
            </div>
        </div>
    );
}

/* ── Spike-annotated sparkline with proper axes ── */
function SpikeChart({ points, spikes, colour, unit, formatter, gran, compact }) {
    const [tip, setTip] = useState(null);
    const svgRef = useRef(null);
    const spikeSet = useMemo(() => new Set((spikes||[]).map(s => s.t)), [spikes]);
    const gradId = useRef(`sc-grad-${Math.random().toString(36).slice(2)}`).current;

    const w = 800, h = compact ? 130 : 190, padL = 60, padR = 12, padT = 16, padB = compact ? 28 : 42;
    const xs = points.map(p => new Date(p.t).getTime());
    const vs = points.map(p => p.v);
    const minT = Math.min(...xs), maxT = Math.max(...xs);
    const rawMax = Math.max(...vs) || 1e-9;
    const rawMin = Math.min(...vs);
    const maxV = rawMax * 1.1;
    const minV = Math.max(0, rawMin * 0.9);
    const xp = t => padL + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - padL - padR);
    const yp = v => padT + (1 - (v - minV) / Math.max(maxV - minV, 1e-9)) * (h - padT - padB);
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xp(p.t).toFixed(1)} ${yp(p.v).toFixed(1)}`).join(" ");
    const last = points[points.length - 1], first = points[0];
    const fmt = formatter || f$;

    const xTicks = axisXTicks(minT, maxT, compact ? 4 : 6);
    const yTicks = axisYTicks(minV, maxV, compact ? 3 : 4);

    const handleMouse = e => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const t = minT + relX * (maxT - minT);
        let closest = points[0], best = Infinity;
        for (const p of points) {
            const dist = Math.abs(new Date(p.t).getTime() - t);
            if (dist < best) { best = dist; closest = p; }
        }
        /* store relX (0‒1) so tooltip can flip side on narrow viewports */
        setTip({ relX, pt: closest });
    };

    return (
        <div style={{ position: "relative" }}>
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
                style={{ width: "100%", height: compact ? 150 : 210, cursor: "crosshair" }}
                onMouseMove={handleMouse} onMouseLeave={() => setTip(null)}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={colour} stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                {/* Y-axis grid + labels */}
                {yTicks.map((v, i) => (
                    <g key={i}>
                        <line x1={padL} y1={yp(v)} x2={w - padR} y2={yp(v)}
                            stroke={i === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={1} />
                        <text x={padL - 6} y={yp(v) + 3.5} fontSize={9} fill="#94a3b8" textAnchor="end">
                            {fmt(v)}
                        </text>
                    </g>
                ))}
                {/* X-axis ticks + labels */}
                {!compact && xTicks.map((t, i) => (
                    <g key={i}>
                        <line x1={xp(t)} y1={h - padB} x2={xp(t)} y2={h - padB + 5} stroke="#e2e8f0" strokeWidth={1} />
                        <text x={xp(t)} y={h - padB + 16} fontSize={9} fill="#94a3b8" textAnchor="middle">
                            {fmtXLabel(t, gran || "hour")}
                        </text>
                    </g>
                ))}
                {compact && (
                    <>
                        <text x={padL} y={h - 8} fontSize={9} fill="#94a3b8">{fmtXLabel(first.t, gran||"hour")}</text>
                        <text x={w - padR} y={h - 8} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtXLabel(last.t, gran||"hour")}</text>
                    </>
                )}
                {/* Axis lines */}
                <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#e2e8f0" strokeWidth={1} />
                <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#e2e8f0" strokeWidth={1} />
                {/* fill + line */}
                <path d={`${d} L ${xp(last.t)} ${h - padB} L ${xp(first.t)} ${h - padB} Z`}
                    fill={`url(#${gradId})`} />
                <path d={d} fill="none" stroke={colour} strokeWidth={2.5} strokeLinejoin="round" />
                {/* spike markers */}
                {(spikes||[]).map((s, i) => (
                    <g key={i}>
                        <line x1={xp(s.t)} y1={padT} x2={xp(s.t)} y2={yp(s.v) - 8}
                            stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3,2" />
                        <circle cx={xp(s.t)} cy={yp(s.v)} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                        <text x={xp(s.t)} y={padT - 3} fontSize={8} fill="#ef4444" textAnchor="middle">⚠</text>
                    </g>
                ))}
                {/* hover crosshair + dot */}
                {tip && (
                    <>
                        <line x1={xp(tip.pt.t)} y1={padT} x2={xp(tip.pt.t)} y2={h - padB}
                            stroke={colour} strokeWidth={1} strokeDasharray="3,3" />
                        <circle cx={xp(tip.pt.t)} cy={yp(tip.pt.v)} r={5}
                            fill={spikeSet.has(tip.pt.t) ? "#ef4444" : colour}
                            stroke="#fff" strokeWidth={2} />
                    </>
                )}
            </svg>
            {tip && (
                <div className="cm-spark-tip" style={{
                    left: tip.relX > 0.72 ? "auto" : `${tip.relX * 100 + 2}%`,
                    right: tip.relX > 0.72 ? `${(1 - tip.relX) * 100 + 2}%` : "auto",
                    top: 8,
                }}>
                    <div className="cm-spark-tip-val" style={{ color: spikeSet.has(tip.pt.t) ? "#ef4444" : colour }}>
                        {fmt(tip.pt.v)}{unit}
                        {spikeSet.has(tip.pt.t) && <span className="pgp-spike-inline"> ⚠ SPIKE</span>}
                    </div>
                    <div className="cm-spark-tip-daily">{f$(tip.pt.v * 24)} / day est.</div>
                    <div className="cm-spark-tip-time">{new Date(tip.pt.t).toLocaleString("en-US", {
                        month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
                    })}</div>
                </div>
            )}
        </div>
    );
}

/* ── Dual-line chart (request vs usage) with proper axes ── */
function DualLineChart({ points, lineA, lineB, formatter, gran, compact }) {
    const [tip, setTip] = useState(null);
    const svgRef = useRef(null);

    const w = 800, h = compact ? 130 : 190, padL = 60, padR = 12, padT = 16, padB = compact ? 28 : 42;
    const xs = points.map(p => new Date(p.t).getTime());
    const minT = Math.min(...xs), maxT = Math.max(...xs);
    const allVals = points.flatMap(p => [p[lineA.key] || 0, p[lineB.key] || 0]);
    const rawMax = Math.max(...allVals) || 1e-9;
    const maxV = rawMax * 1.1;
    const minV = 0;
    const xp = t => padL + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - padL - padR);
    const yp = v => padT + (1 - (v - minV) / Math.max(maxV - minV, 1e-9)) * (h - padT - padB);
    const path = key => points.map((p, i) =>
        `${i === 0 ? "M" : "L"} ${xp(p.t).toFixed(1)} ${yp(p[key] || 0).toFixed(1)}`
    ).join(" ");
    const first = points[0], last = points[points.length - 1];
    const fmt = formatter || (v => fN(v, 2));

    const xTicks = axisXTicks(minT, maxT, compact ? 4 : 6);
    const yTicks = axisYTicks(minV, maxV, compact ? 3 : 4);

    const handleMouse = e => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const t = minT + relX * (maxT - minT);
        let closest = points[0], best = Infinity;
        for (const p of points) {
            const dist = Math.abs(new Date(p.t).getTime() - t);
            if (dist < best) { best = dist; closest = p; }
        }
        setTip({ relX, pt: closest });
    };

    return (
        <div style={{ position: "relative" }}>
            <div className="pgp-dual-legend">
                <span style={{ color: lineA.colour }}>── {lineA.label}</span>
                <span style={{ color: lineB.colour }}>—— {lineB.label}</span>
            </div>
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
                style={{ width: "100%", height: compact ? 150 : 210, cursor: "crosshair" }}
                onMouseMove={handleMouse} onMouseLeave={() => setTip(null)}>
                {/* Y-axis grid + labels */}
                {yTicks.map((v, i) => (
                    <g key={i}>
                        <line x1={padL} y1={yp(v)} x2={w - padR} y2={yp(v)}
                            stroke={i === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={1} />
                        <text x={padL - 6} y={yp(v) + 3.5} fontSize={9} fill="#94a3b8" textAnchor="end">
                            {fmt(v)}
                        </text>
                    </g>
                ))}
                {/* X-axis ticks + labels */}
                {!compact && xTicks.map((t, i) => (
                    <g key={i}>
                        <line x1={xp(t)} y1={h - padB} x2={xp(t)} y2={h - padB + 5} stroke="#e2e8f0" strokeWidth={1} />
                        <text x={xp(t)} y={h - padB + 16} fontSize={9} fill="#94a3b8" textAnchor="middle">
                            {fmtXLabel(t, gran || "hour")}
                        </text>
                    </g>
                ))}
                {compact && (
                    <>
                        <text x={padL} y={h - 8} fontSize={9} fill="#94a3b8">{fmtXLabel(first.t, gran||"hour")}</text>
                        <text x={w - padR} y={h - 8} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtXLabel(last.t, gran||"hour")}</text>
                    </>
                )}
                {/* Axis lines */}
                <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#e2e8f0" strokeWidth={1} />
                <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#e2e8f0" strokeWidth={1} />
                {/* lines */}
                <path d={path(lineA.key)} fill="none" stroke={lineA.colour} strokeWidth={2}
                    strokeDasharray="5,3" strokeLinejoin="round" opacity={0.75} />
                <path d={path(lineB.key)} fill="none" stroke={lineB.colour} strokeWidth={2.5}
                    strokeLinejoin="round" />
                {/* hover */}
                {tip && (
                    <>
                        <line x1={xp(tip.pt.t)} y1={padT} x2={xp(tip.pt.t)} y2={h - padB}
                            stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" />
                        <circle cx={xp(tip.pt.t)} cy={yp(tip.pt[lineA.key] || 0)} r={4}
                            fill={lineA.colour} stroke="#fff" strokeWidth={2} />
                        <circle cx={xp(tip.pt.t)} cy={yp(tip.pt[lineB.key] || 0)} r={4}
                            fill={lineB.colour} stroke="#fff" strokeWidth={2} />
                    </>
                )}
            </svg>
            {tip && (
                <div className="cm-spark-tip" style={{
                    left: tip.relX > 0.72 ? "auto" : `${tip.relX * 100 + 2}%`,
                    right: tip.relX > 0.72 ? `${(1 - tip.relX) * 100 + 2}%` : "auto",
                    top: 28,
                }}>
                    <div style={{ color: lineA.colour, fontSize: 11, fontWeight: 700 }}>
                        {lineA.label}: {fmt(tip.pt[lineA.key] || 0)}
                    </div>
                    <div style={{ color: lineB.colour, fontSize: 11, fontWeight: 700 }}>
                        {lineB.label}: {fmt(tip.pt[lineB.key] || 0)}
                    </div>
                    <div className="cm-spark-tip-time">{new Date(tip.pt.t).toLocaleString("en-US",{
                        month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"
                    })}</div>
                </div>
            )}
        </div>
    );
}

/* ── Stacked area chart (cost by component) ── */
function StackedAreaChart({ points, layers, gran, compact }) {
    const [tip, setTip] = useState(null);
    const svgRef = useRef(null);

    const w = 800, h = compact ? 130 : 190, padL = 60, padR = 12, padT = 16, padB = compact ? 28 : 42;
    if (!points || points.length < 2) return <div className="cm-empty-mini">No breakdown data yet.</div>;

    const xs = points.map(p => new Date(p.t).getTime());
    const minT = Math.min(...xs), maxT = Math.max(...xs);
    const totals = points.map(p => layers.reduce((s, l) => s + (p[l.key] || 0), 0));
    const maxV = (Math.max(...totals) || 1e-9) * 1.1;
    const xp = t => padL + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - padL - padR);
    const yp = v => padT + (1 - v / Math.max(maxV, 1e-9)) * (h - padT - padB);

    const xTicks = axisXTicks(minT, maxT, compact ? 4 : 6);
    const yTicks = axisYTicks(0, maxV, compact ? 3 : 4);
    const first = points[0], last = points[points.length - 1];

    /* Build stacked area paths bottom-up */
    const areas = layers.map((layer, li) => {
        const tops = points.map(p => layers.slice(0, li + 1).reduce((s, l) => s + (p[l.key] || 0), 0));
        const bots = points.map(p => layers.slice(0, li).reduce((s, l) => s + (p[l.key] || 0), 0));
        const fwd  = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xp(p.t).toFixed(1)} ${yp(tops[i]).toFixed(1)}`).join(" ");
        const back = [...points].map((p, ri) => {
            const i = points.length - 1 - ri;
            return `L ${xp(points[i].t).toFixed(1)} ${yp(bots[i]).toFixed(1)}`;
        }).join(" ");
        return { path: `${fwd} ${back} Z`, colour: layer.colour, label: layer.label };
    });

    const handleMouse = e => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const t = minT + relX * (maxT - minT);
        let closest = points[0], best = Infinity;
        for (const p of points) {
            const dist = Math.abs(new Date(p.t).getTime() - t);
            if (dist < best) { best = dist; closest = p; }
        }
        setTip({ relX, pt: closest });
    };

    return (
        <div style={{ position: "relative" }}>
            <div className="pgp-dual-legend">
                {layers.map(l => <span key={l.key} style={{ color: l.colour }}>■ {l.label}</span>)}
            </div>
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
                style={{ width: "100%", height: compact ? 150 : 210, cursor: "crosshair" }}
                onMouseMove={handleMouse} onMouseLeave={() => setTip(null)}>
                {/* Y-axis grid + labels */}
                {yTicks.map((v, i) => (
                    <g key={i}>
                        <line x1={padL} y1={yp(v)} x2={w-padR} y2={yp(v)}
                            stroke={i===0?"#e2e8f0":"#f1f5f9"} strokeWidth={1} />
                        <text x={padL-6} y={yp(v)+3.5} fontSize={9} fill="#94a3b8" textAnchor="end">{f$(v)}</text>
                    </g>
                ))}
                {/* X-axis ticks + labels */}
                {!compact && xTicks.map((t, i) => (
                    <g key={i}>
                        <line x1={xp(t)} y1={h-padB} x2={xp(t)} y2={h-padB+5} stroke="#e2e8f0" strokeWidth={1} />
                        <text x={xp(t)} y={h-padB+16} fontSize={9} fill="#94a3b8" textAnchor="middle">
                            {fmtXLabel(t, gran||"hour")}
                        </text>
                    </g>
                ))}
                {compact && (
                    <>
                        <text x={padL} y={h-8} fontSize={9} fill="#94a3b8">{fmtXLabel(first.t, gran||"hour")}</text>
                        <text x={w-padR} y={h-8} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtXLabel(last.t, gran||"hour")}</text>
                    </>
                )}
                {/* Axis lines */}
                <line x1={padL} y1={padT} x2={padL} y2={h-padB} stroke="#e2e8f0" strokeWidth={1}/>
                <line x1={padL} y1={h-padB} x2={w-padR} y2={h-padB} stroke="#e2e8f0" strokeWidth={1}/>
                {/* Stacked areas */}
                {areas.map((a, i) => (
                    <path key={i} d={a.path} fill={a.colour} opacity={0.75}/>
                ))}
                {/* Hover crosshair */}
                {tip && (
                    <line x1={xp(tip.pt.t)} y1={padT} x2={xp(tip.pt.t)} y2={h-padB}
                        stroke="#64748b" strokeWidth={1} strokeDasharray="3,3"/>
                )}
            </svg>
            {tip && (() => {
                const ptTotal = layers.reduce((s, l) => s + (tip.pt[l.key] || 0), 0);
                return (
                <div className="cm-spark-tip" style={{
                    left: tip.relX > 0.72 ? "auto" : `${tip.relX * 100 + 2}%`,
                    right: tip.relX > 0.72 ? `${(1 - tip.relX) * 100 + 2}%` : "auto",
                    top: 8,
                }}>
                    <div className="cm-spark-tip-val" style={{ color:"#0f172a" }}>{f$(ptTotal)}/hr total</div>
                    {layers.map(l => (
                        <div key={l.key} style={{ color: l.colour, fontSize:11, fontWeight:600 }}>
                            {l.label}: {f$(tip.pt[l.key]||0)}
                        </div>
                    ))}
                    <div className="cm-spark-tip-time">{new Date(tip.pt.t).toLocaleString("en-US",{
                        month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"
                    })}</div>
                </div>
                );
            })()}
        </div>
    );
}

function Spark({ points, colour, tall }) {
    const [tip, setTip] = useState(null);
    const svgRef = useRef(null);
    if (!points || points.length === 0) return <div className="cm-empty-mini">No points.</div>;
    const w = 800, h = tall ? 140 : 90, padL = 4, padR = 4, padT = 6, padB = 18;
    const xs = points.map(p => new Date(p.t).getTime());
    const vs = points.map(p => p.v);
    const minT = Math.min(...xs), maxT = Math.max(...xs);
    const maxV = Math.max(...vs) || 1e-9;
    const minV = Math.min(...vs);
    const xp = (t) => padL + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - padL - padR);
    const yp = (v) => padT + (1 - (v - minV) / Math.max(maxV - minV, 1e-9)) * (h - padT - padB);
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xp(p.t).toFixed(1)} ${yp(p.v).toFixed(1)}`).join(" ");
    const last = points[points.length - 1];
    const first = points[0];

    const handleMouse = (e) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const t = minT + relX * (maxT - minT);
        let closest = points[0];
        let best = Infinity;
        for (const p of points) {
            const dist = Math.abs(new Date(p.t).getTime() - t);
            if (dist < best) { best = dist; closest = p; }
        }
        setTip({ x: e.clientX - rect.left, y: Math.max(0, e.clientY - rect.top - 60), pt: closest });
    };

    return (
        <div style={{ position: "relative" }}>
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
                style={{ width: "100%", height: tall ? 160 : 100, cursor: "crosshair" }}
                onMouseMove={handleMouse} onMouseLeave={() => setTip(null)}>
                <defs>
                    <linearGradient id="cm-spark-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={colour} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`${d} L ${xp(last.t)} ${h-padB} L ${xp(first.t)} ${h-padB} Z`} fill="url(#cm-spark-grad)" />
                <path d={d} fill="none" stroke={colour} strokeWidth={2.5} strokeLinejoin="round" />
                {/* baseline */}
                <line x1={padL} y1={h-padB} x2={w-padR} y2={h-padB} stroke="#e2e8f0" strokeWidth={1} />
                {tip && (
                    <>
                        <line x1={xp(tip.pt.t)} y1={padT} x2={xp(tip.pt.t)} y2={h-padB}
                            stroke={colour} strokeWidth={1} strokeDasharray="3,3" />
                        <circle cx={xp(tip.pt.t)} cy={yp(tip.pt.v)} r={5}
                            fill={colour} stroke="#fff" strokeWidth={2} />
                    </>
                )}
            </svg>
            {tip && (
                <div className="cm-spark-tip" style={{ left: Math.min(tip.x + 12, 260), top: tip.y }}>
                    <div className="cm-spark-tip-val" style={{ color: colour }}>{f$4(tip.pt.v)}/hr</div>
                    <div className="cm-spark-tip-daily">{f$(tip.pt.v * 24)} / day</div>
                    <div className="cm-spark-tip-time">{new Date(tip.pt.t).toLocaleString("en-US", {
                        month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
                    })}</div>
                    {tip.pt.v === maxV && <div className="cm-spark-tip-badge" style={{ background:colour }}>PEAK</div>}
                    {tip.pt.v === minV && <div className="cm-spark-tip-badge" style={{ background:"#94a3b8" }}>LOW</div>}
                </div>
            )}
        </div>
    );
}

/* Mini inline sparkline (no hover tooltip) for product rows */
function MiniSpark({ points, colour }) {
    if (!points || points.length < 2) return null;
    const w = 120, h = 36, pad = 2;
    const vs = points.map(p => p.v);
    const xs = points.map(p => new Date(p.t).getTime());
    const minT = Math.min(...xs), maxT = Math.max(...xs);
    const maxV = Math.max(...vs) || 1e-9;
    const minV = Math.min(...vs);
    const xp = (t) => pad + ((new Date(t).getTime() - minT) / Math.max(maxT - minT, 1)) * (w - pad*2);
    const yp = (v) => pad + (1 - (v - minV) / Math.max(maxV - minV, 1e-9)) * (h - pad*2);
    const d = points.map((p, i) => `${i===0?"M":"L"} ${xp(p.t).toFixed(1)} ${yp(p.v).toFixed(1)}`).join(" ");
    const last = points[points.length-1], first = points[0];
    const trend = last.v > first.v ? "#ef4444" : last.v < first.v * 0.95 ? "#10b981" : colour;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`msp-${colour.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trend} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={trend} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`${d} L ${xp(last.t)} ${h} L ${xp(first.t)} ${h} Z`} fill={`url(#msp-${colour.replace("#","")})`} />
            <path d={d} fill="none" stroke={trend} strokeWidth={1.5} strokeLinejoin="round" />
            <circle cx={xp(last.t)} cy={yp(last.v)} r={2.5} fill={trend} />
        </svg>
    );
}

/* ════════════════════════════════════════════════════════════════════ */
/*  DATA BUILDERS                                                        */
/* ════════════════════════════════════════════════════════════════════ */

function buildCatalogue(snapshots, selectedEnvs = []) {
    /* When specific envs are selected, only show namespaces whose name starts
     * with one of those env prefixes (e.g. DEV selected → show only dev-* ns).
     * System namespaces are always shown regardless of prefix. */
    const envPrefixes = selectedEnvs.map(e => e.toLowerCase() + "-");
    const passesPrefix = (nsName) => {
        if (selectedEnvs.length === 0) return true;
        const lower = (nsName || "").toLowerCase();
        return envPrefixes.some(p => lower.startsWith(p));
    };

    const products = new Map();
    const namespaces = [];
    for (const env of Object.keys(snapshots)) {
        const snap = snapshots[env];
        const envNsList = snap.namespaces || [];

        /* Build a set of product keys that already have a prefixed namespace in this
         * env snapshot (e.g. "dev-productA" → productKey "PRODUCTA").
         * Unprefixed namespaces whose product key is already represented by a prefixed
         * one are skipped to prevent double-counting the same service. */
        const prefixedProductKeys = new Set(
            envNsList
                .filter(n => {
                    const parts = (n.namespace || "").split("-");
                    return parts.length > 1 && ENV_PREFIXES.has(parts[0].toLowerCase());
                })
                .map(n => productKey(n))
        );

        for (const ns of envNsList) {
            const isSys = isSystemNs(ns.namespace);
            /* Skip non-system namespaces that don't match the selected env prefix */
            if (!isSys && !passesPrefix(ns.namespace)) continue;

            /* Skip unprefixed namespaces whose product key is already represented
             * by a prefixed namespace in the same env snapshot (avoids double-count). */
            if (!isSys) {
                const parts = (ns.namespace || "").split("-");
                const hasEnvPrefix = parts.length > 1 && ENV_PREFIXES.has(parts[0].toLowerCase());
                if (!hasEnvPrefix && prefixedProductKeys.has(productKey(ns))) continue;
            }
            const runningPods = (ns.microservices || []).reduce((a, m) => a + (m.replicas || 0), 0);
            /* UP/DOWN: only count pods whose name contains the word "service" */
            const servicePods = (ns.microservices || []).filter(m =>
                (m.name || "").toLowerCase().includes("service")
            );
            const serviceRunning = servicePods.reduce((a, m) => a + (m.replicas || 0), 0);
            const isUp = !isSys && serviceRunning > 0;
            const flat = {
                env, ...ns,
                isSystem: isSys,
                productKey: isSys ? "SYSTEM" : productKey(ns),
                smoothed: ns.smoothedHourlyUsd ?? ns.hourlyRateUsd ?? 0,
                isUp, runningPods,
            };
            namespaces.push(flat);
            const pk = flat.productKey;
            if (!products.has(pk)) products.set(pk, {
                key: pk, totalHourly: 0, totalMtd: 0, totalCum: 0,
                pods: 0, runningPods: 0, microservices: 0, namespaces: [], byEnv: {},
                compute: 0, memory: 0, storage: 0, network: 0, overhead: 0,
                cpuUsed: 0, memUsedGb: 0,
                isUp: false,
            });
            const p = products.get(pk);
            p.totalHourly += flat.smoothed;
            p.totalMtd    += ns.monthToDateUsd || 0;
            p.totalCum    += ns.cumulativeUsd  || 0;
            p.pods        += ns.podCount       || 0;
            p.runningPods += runningPods;
            p.microservices += ns.microserviceCount || 0;
            p.compute     += ns.computeHourlyUsd || 0;
            p.memory      += ns.memoryHourlyUsd  || 0;
            p.storage     += ns.storageHourlyUsd || 0;
            p.network     += ns.networkHourlyUsd || 0;
            p.cpuUsed     += ns.cpuCores         || 0;
            p.memUsedGb   += ns.memoryGb         || 0;
            p.namespaces.push(flat);
            if (isUp) p.isUp = true;
            if (!p.byEnv[env]) p.byEnv[env] = { env, hourly: 0, namespaces: [] };
            p.byEnv[env].hourly += flat.smoothed;
            p.byEnv[env].namespaces.push(flat);
        }
    }
    /* compute overhead per product after totals are known */
    for (const p of products.values()) {
        p.overhead = Math.max(0, p.totalHourly - p.compute - p.memory - p.storage - p.network);
    }
    return {
        products: [...products.values()].sort((a, b) => b.totalHourly - a.totalHourly),
        namespaces,
    };
}

function buildEnvAgg(snapshots) {
    return Object.keys(snapshots).map((e, idx) => {
        const s = snapshots[e];
        const c = s.cluster || {};
        return {
            env: e,
            colour: envColour(e, idx),
            hourly: s.smoothedHourlyUsd ?? s.totalHourlyUsd ?? 0,
            daily:  s.dailyEstUsd ?? (s.smoothedHourlyUsd ?? 0) * 24,
            monthly:s.monthlyEstUsd ?? (s.smoothedHourlyUsd ?? 0) * HOURS_PER_MONTH,
            mtd: s.monthToDateUsd || 0,
            cumulative: s.cumulativeUsd || 0,
            nodeCount: c.nodeCount || 0,
            totalCpu: c.totalCpuCores || 0, usedCpu: c.usedCpuCores || 0,
            totalMem: c.totalMemoryGb || 0, usedMem: c.usedMemoryGb || 0,
            cpuUtilPct: c.cpuUtilPct || 0, memUtilPct: c.memoryUtilPct || 0,
            wastagePct: c.userPoolWastagePct || 0,
            podCount: (s.namespaces || []).reduce((a, n) => a + (n.podCount || 0), 0),
            nsCount:  (s.namespaces || []).length,
            components: c.componentBreakdown || [],
        };
    });
}

function buildScopeMetrics(scopeData, opsMetrics) {
    const { kind, data } = scopeData;
    let smoothed, compute, memory, storage, network, mtd, cumulative;
    let cpuUsed, cpuReq, memUsedGb, memReqGb;
    let podCount, microserviceCount, allocationPct = 0;
    let pvcList = [], msList = [], serviceLines = [];
    let restarts = 0;

    if (kind === "namespace") {
        smoothed = data.smoothed;
        compute  = data.computeHourlyUsd || 0;
        memory   = data.memoryHourlyUsd  || 0;
        storage  = data.storageHourlyUsd || 0;
        network  = data.networkHourlyUsd || 0;
        mtd      = data.monthToDateUsd   || 0;
        cumulative = data.cumulativeUsd  || 0;
        cpuUsed  = data.cpuCores         || 0;
        cpuReq   = data.cpuRequestCores  || 0;
        memUsedGb= data.memoryGb         || 0;
        memReqGb = data.memoryRequestGb  || 0;
        podCount = data.podCount         || 0;
        microserviceCount = data.microserviceCount || 0;
        allocationPct = (data.allocationShare || 0) * 100;
        pvcList = data.storage || [];
        msList = (data.microservices || []).map(m => ({ ...m, env: data.env, namespace: data.namespace }));
        serviceLines = (data.serviceLines || []).filter(s => s.category === "network");
        restarts = opsMetrics?.totalRestarts || 0;
    } else {
        const all = data.namespaces;
        smoothed   = data.totalHourly;
        compute    = all.reduce((a, n) => a + (n.computeHourlyUsd || 0), 0);
        memory     = all.reduce((a, n) => a + (n.memoryHourlyUsd  || 0), 0);
        storage    = all.reduce((a, n) => a + (n.storageHourlyUsd || 0), 0);
        network    = all.reduce((a, n) => a + (n.networkHourlyUsd || 0), 0);
        mtd        = data.totalMtd;
        cumulative = data.totalCum;
        cpuUsed    = all.reduce((a, n) => a + (n.cpuCores        || 0), 0);
        cpuReq     = all.reduce((a, n) => a + (n.cpuRequestCores || 0), 0);
        memUsedGb  = all.reduce((a, n) => a + (n.memoryGb        || 0), 0);
        memReqGb   = all.reduce((a, n) => a + (n.memoryRequestGb || 0), 0);
        podCount   = data.pods;
        microserviceCount = data.microservices;
        allocationPct = all.reduce((a, n) => a + ((n.allocationShare || 0) * 100), 0);
        for (const n of all) {
            for (const p of (n.storage || []))      pvcList.push(p);
            for (const m of (n.microservices || []))msList.push({ ...m, env: n.env, namespace: n.namespace });
            for (const sl of (n.serviceLines || []))if (sl.category === "network") serviceLines.push(sl);
        }
    }

    const overhead = Math.max(0, smoothed - compute - memory - storage - network);
    const daily    = smoothed * 24;
    const monthly  = smoothed * HOURS_PER_MONTH;

    const storageClasses = [...new Set(pvcList.map(p => p.storageClass))];
    const totalGb = pvcList.reduce((a, p) => a + (p.sizeGb || 0), 0);
    const largest = pvcList.reduce((b, p) => (p.sizeGb || 0) > (b?.sizeGb || 0) ? p : b, null);
    const smallest = pvcList.reduce((b, p) => (b == null || (p.sizeGb || Infinity) < (b.sizeGb || Infinity)) ? p : b, null);
    const classGb = new Map();
    for (const p of pvcList) classGb.set(p.storageClass, (classGb.get(p.storageClass) || 0) + (p.sizeGb || 0));
    const dom = [...classGb.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    const cpuUtilPct = cpuReq > 0 ? (cpuUsed / cpuReq) * 100 : 0;
    const memUtilPct = memReqGb > 0 ? (memUsedGb / memReqGb) * 100 : 0;
    const cpuEffPct = cpuReq > 0 ? (cpuUsed / cpuReq) * 100 : 0;
    const memEffPct = memReqGb > 0 ? (memUsedGb / memReqGb) * 100 : 0;
    const cpuWaste = Math.max(0, cpuReq - cpuUsed);
    const memWaste = Math.max(0, memReqGb - memUsedGb);
    const wasteHourly = (cpuWaste / Math.max(cpuReq, 1e-9)) * compute
                     + (memWaste / Math.max(memReqGb, 1e-9)) * memory;
    const wasteMonthly = wasteHourly * HOURS_PER_MONTH;

    const suggestion = (cpuEffPct < 30 && memEffPct < 30) ? "Reduce requests 30–50%"
                     : (cpuEffPct > 95 || memEffPct > 95) ? "Raise requests"
                     : (cpuEffPct < 50 || memEffPct < 50) ? "Mild over-provision"
                     : "Healthy";

    // Health score (very rough) 0-100
    const eff = (cpuEffPct + memEffPct) / 2;
    const effScore = eff < 30 ? 30 : eff > 90 ? 50 : 90;
    const healthScore = Math.round(effScore);

    return {
        cost: {
            hourly: smoothed, daily, monthly, mtd, cumulative,
            segments: { compute, memory, storage, network, overhead },
            perPod: smoothed / Math.max(podCount, 1),
            perCpuCore: smoothed / Math.max(cpuUsed, 0.0001),
            perMemGb: smoothed / Math.max(memUsedGb, 0.0001),
            allocationPct, podCount, microserviceCount,
        },
        cpu: {
            usedCores: cpuUsed, requestedCores: cpuReq,
            usageVsRequest: cpuReq > 0 ? (cpuUsed / cpuReq) * 100 : 0,
            coresPerPod: cpuUsed / Math.max(podCount, 1),
            coresPerMs:  cpuUsed / Math.max(microserviceCount, 1),
            cpuCostHourly: compute,
            cpuPctOfCost: smoothed > 0 ? (compute / smoothed) * 100 : 0,
            costPerCore: compute / Math.max(cpuReq, 0.0001),
            overProvisionRatio: cpuUsed > 0 ? cpuReq / cpuUsed : 0,
        },
        memory: {
            usedGb: memUsedGb, requestedGb: memReqGb,
            usageVsRequest: memReqGb > 0 ? (memUsedGb / memReqGb) * 100 : 0,
            gbPerPod: memUsedGb / Math.max(podCount, 1),
            gbPerMs:  memUsedGb / Math.max(microserviceCount, 1),
            memCostHourly: memory,
            memPctOfCost: smoothed > 0 ? (memory / smoothed) * 100 : 0,
            costPerGb: memory / Math.max(memReqGb, 0.0001),
            overProvisionRatio: memUsedGb > 0 ? memReqGb / memUsedGb : 0,
            workingSetGb: memUsedGb,
        },
        storage: {
            pvcCount: pvcList.length, totalGb,
            hourly: storage, monthly: storage * HOURS_PER_MONTH,
            pctOfCost: smoothed > 0 ? (storage / smoothed) * 100 : 0,
            largestGb: largest?.sizeGb || 0, largestName: largest?.pvcName || "",
            smallestGb: smallest?.sizeGb || 0, smallestName: smallest?.pvcName || "",
            avgGb: pvcList.length ? totalGb / pvcList.length : 0,
            classCount: storageClasses.length, classNames: storageClasses,
            avgPerGbMonth: totalGb > 0 ? (storage * HOURS_PER_MONTH) / totalGb : 0,
            dominantClass: dom?.[0] || null, dominantClassGb: dom?.[1] || 0,
            pvcs: pvcList, podCount,
        },
        network: {
            lbCount: serviceLines.filter(s => /load balancer/i.test(s.name || "")).reduce((a, s) => a + (Number(s.quantity) || 1), 0),
            ingressCount: serviceLines.filter(s => /ingress/i.test(s.name || "")).reduce((a, s) => a + (Number(s.quantity) || 1), 0),
            hourly: network, monthly: network * HOURS_PER_MONTH,
            pctOfCost: smoothed > 0 ? (network / smoothed) * 100 : 0,
            costPerLb: serviceLines.length ? network / serviceLines.length : 0,
        },
        resources: {
            podCount, microserviceCount, allocationPct, restarts,
            avgReplicas: msList.length ? msList.reduce((a, m) => a + (m.replicas || 1), 0) / msList.length : 0,
            namespaceCount: kind === "product" ? data.namespaces.length : 1,
            envCount: kind === "product" ? Object.keys(data.byEnv || {}).length : 1,
            hpaCount: 0,
            microserviceList: msList,
        },
        usage: {
            cpuUsage: cpuUsed, memUsage: memUsedGb,
            cpuCapacity: cpuReq, memCapacity: memReqGb,
            cpuUtilPct, memUtilPct,
            activePods: podCount, activeWorkloads: microserviceCount,
            costVsUsage: cpuUsed > 0 ? smoothed / cpuUsed : 0,
            dailyCompute: (compute + memory) * 24,
        },
        performance: { hourly: smoothed },
        efficiency: {
            cpuEffPct, memEffPct, cpuWasteCores: cpuWaste, memWasteGb: memWaste,
            wasteHourly, wasteMonthly, suggestion,
            overFactor: cpuUsed > 0 ? cpuReq / cpuUsed : 0,
            dollarPerActivePod: smoothed / Math.max(podCount, 1),
            costDensity: cpuUsed > 0 ? smoothed / cpuUsed : 0,
            saturationPct: Math.max(cpuUtilPct, memUtilPct),
            healthScore,
        },
        /* ── New combined keys used by the 4-category accordion ─────── */
        compute: {
            usedCores: cpuUsed, requestedCores: cpuReq,
            usageVsRequest: cpuReq > 0 ? (cpuUsed / cpuReq) * 100 : 0,
            usedGb: memUsedGb, requestedGb: memReqGb,
            memUsageVsRequest: memReqGb > 0 ? (memUsedGb / memReqGb) * 100 : 0,
            cpuCostHourly: compute, memCostHourly: memory,
            cpuPctOfCost: smoothed > 0 ? (compute / smoothed) * 100 : 0,
            memPctOfCost: smoothed > 0 ? (memory / smoothed) * 100 : 0,
            coresPerPod: cpuUsed / Math.max(podCount, 1),
            gbPerPod: memUsedGb / Math.max(podCount, 1),
            cpuOverProvision: cpuUsed > 0 ? cpuReq / cpuUsed : 0,
            memOverProvision: memUsedGb > 0 ? memReqGb / memUsedGb : 0,
            podCount, microserviceCount,
        },
        storage: {
            pvcCount: pvcList.length, totalGb,
            hourly: storage, monthly: storage * HOURS_PER_MONTH,
            pctOfCost: smoothed > 0 ? (storage / smoothed) * 100 : 0,
            largestGb: largest?.sizeGb || 0, largestName: largest?.pvcName || "",
            smallestGb: smallest?.sizeGb || 0, smallestName: smallest?.pvcName || "",
            avgGb: pvcList.length ? totalGb / pvcList.length : 0,
            classCount: storageClasses.length, classNames: storageClasses,
            avgPerGbMonth: totalGb > 0 ? (storage * HOURS_PER_MONTH) / totalGb : 0,
            dominantClass: dom?.[0] || null, dominantClassGb: dom?.[1] || 0,
            pvcs: pvcList, podCount,
            networkHourly: network, networkMonthly: network * HOURS_PER_MONTH,
            lbCount: serviceLines.filter(s => /load balancer/i.test(s.name || "")).reduce((a, s) => a + (Number(s.quantity) || 1), 0),
            ingressCount: serviceLines.filter(s => /ingress/i.test(s.name || "")).reduce((a, s) => a + (Number(s.quantity) || 1), 0),
        },
        health: {
            cpuEffPct, memEffPct, cpuWasteCores: cpuWaste, memWasteGb: memWaste,
            wasteHourly, wasteMonthly, suggestion,
            overFactor: cpuUsed > 0 ? cpuReq / cpuUsed : 0,
            dollarPerActivePod: smoothed / Math.max(podCount, 1),
            saturationPct: Math.max(cpuUtilPct, memUtilPct),
            healthScore,
            podCount, microserviceCount, restarts,
        },
    };
}

function categoryHeadline(id, m) {
    switch (id) {
        case "cost":    return [
            { label: "Right now",  value: f$4(m.hourly) + "/hr" },
            { label: "This month", value: f$big(m.monthly) },
            { label: "MTD",        value: f$big(m.mtd) },
        ];
        case "compute": return [
            { label: "CPU used",     value: `${fN(m.usedCores, 2)} cores` },
            { label: "Mem used",     value: `${fN(m.usedGb, 1)} GB` },
            { label: "CPU eff",      value: fPct(m.usageVsRequest) },
        ];
        case "storage": return [
            { label: "PVCs",         value: fI(m.pvcCount) },
            { label: "Storage",      value: `${fN(m.totalGb, 1)} GB` },
            { label: "Net cost/hr",  value: f$4(m.networkHourly) },
        ];
        case "health":  return [
            { label: "Health",       value: `${m.healthScore}/100` },
            { label: "Waste/hr",     value: f$(m.wasteHourly) },
            { label: "Status",       value: m.suggestion },
        ];
        default: return [];
    }
}

/* ─── tiny helpers ─── */
function pctOf(part, whole) {
    if (!whole || whole <= 0) return "—";
    return `${((part / whole) * 100).toFixed(1)}% of total`;
}
function fmtB(b) {
    if (b == null || isNaN(b)) return "—";
    if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB/s`;
    if (b > 1e6) return `${(b / 1e6).toFixed(2)} MB/s`;
    if (b > 1e3) return `${(b / 1e3).toFixed(2)} KB/s`;
    return `${b.toFixed(0)} B/s`;
}
function prettyCat(c) {
    return ({
        compute: "Compute", memory: "Memory", storage: "Storage", network: "Network",
        registry: "Registry", egress: "Egress", "control-plane": "Control plane",
        "system-vms": "System VMs", "user-vms": "User VMs", "spot-vms": "Spot VMs",
        "system-osdisks": "System disks", "user-osdisks": "User disks", "spot-osdisks": "Spot disks",
        "user-wastage": "Wastage", database: "Database", system: "System", support: "Support",
    })[c] || (c ? c[0].toUpperCase() + c.slice(1) : "—");
}
function catColour(c) {
    return ({
        compute: "#3b82f6", memory: "#a855f7", storage: "#f59e0b", network: "#ec4899",
        registry: "#8b5cf6", egress: "#f97316", "control-plane": "#6366f1",
        "system-vms": "#6366f1", "user-vms": "#22c55e", "spot-vms": "#f97316",
        "system-osdisks": "#a855f7", "user-osdisks": "#10b981", "spot-osdisks": "#f59e0b",
        "user-wastage": "#ef4444", database: "#06b6d4", system: "#94a3b8", support: "#14b8a6",
    })[c] || "#64748b";
}

/* ════════════════════════════════════════════════════════════════════ */
/*  CSS                                                                  */
/* ════════════════════════════════════════════════════════════════════ */

const CSS_BLOCK = `
.cm-shell { display:flex; flex-direction:column; gap:14px; padding:14px; min-height:200px; }
.cm-mute { color:#94a3b8; }
.cm-mute.small { font-size:11px; }
.spin { animation: cm-spin 1s linear infinite; }
@keyframes cm-spin { to { transform: rotate(360deg); } }

/* ── Filter bar ── */
.cm-filterbar {
  position:sticky; top:0; z-index:5; background:#fff;
  border:1px solid #e2e6ee; border-radius:12px;
  padding:12px 14px;
  box-shadow:0 2px 6px rgba(15,23,42,0.05);
}
.cm-filter-row { display:flex; flex-wrap:wrap; gap:14px; align-items:flex-end; }
.cm-filter-step { display:flex; align-items:flex-end; gap:8px; }
.cm-step-tag { width:22px; height:22px; border-radius:50%; background:#0f172a; color:#fff;
  font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;
  margin-bottom:2px; }
.cm-arrow { color:#cbd5e1; margin: 0 -4px 6px; }
.cm-filter-block { display:flex; flex-direction:column; gap:5px; }
.cm-filter-label { display:flex; align-items:center; gap:4px;
  font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; font-weight:700; }
.cm-spacer { flex:1; min-width:8px; }
.cm-filter-date { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:6px 10px; }
.cm-filter-actions { display:flex; gap:6px; align-self:flex-end; margin-bottom:1px; }

.cm-pills { display:flex; flex-wrap:wrap; gap:5px; }
.cm-pill { display:inline-flex; align-items:center; gap:5px;
  padding:4px 10px; font-size:11px; font-weight:700; border-radius:999px;
  background:#fff; border:1px solid #cbd5e1; color:#475569; cursor:pointer;
  transition:all .15s; }
.cm-pill:hover { background:#f1f5f9; }
.cm-pill.active.solid { background:#0f172a; color:#fff; border-color:#0f172a; }
.cm-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }

/* ── Env multi-select dropdown ── */
.cm-env-dd { position:relative; }
.cm-env-dd-trigger {
  display:inline-flex; align-items:center; gap:6px;
  padding:6px 10px; font-size:12px; font-weight:600;
  background:#fff; border:1px solid #cbd5e1; border-radius:8px;
  cursor:pointer; color:#0f172a; min-width:170px;
  transition: border-color .15s, box-shadow .15s;
}
.cm-env-dd-trigger:hover { border-color:#94a3b8; box-shadow:0 1px 4px rgba(15,23,42,.08); }
.cm-env-dd-dots { display:flex; align-items:center; gap:2px; }
.cm-env-dd-label { flex:1; text-align:left; }
.cm-env-dd-panel {
  position:absolute; top:calc(100% + 5px); left:0; z-index:50;
  background:#fff; border:1px solid #e2e8f0; border-radius:10px;
  box-shadow:0 8px 24px rgba(15,23,42,.12);
  min-width:200px; padding:6px 0; overflow:hidden;
}
.cm-env-dd-row {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:pointer; font-size:12px; color:#374151;
  transition: background .12s;
}
.cm-env-dd-row:hover { background:#f8fafc; }
.cm-env-dd-row.checked { background:#f0f9ff; }
.cm-env-dd-checkbox {
  flex-shrink:0;
  width:17px; height:17px;
  border:1.5px solid #cbd5e1;
  border-radius:4px;
  background:#fff;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  box-sizing:border-box;
  transition:border-color .12s, background .12s, box-shadow .12s;
}
.cm-env-dd-checkbox.is-on {
  border-width:1.5px;
  box-shadow:0 0 0 1px rgba(15,23,42,.06);
}
.cm-env-dd-checkbox.is-on.is-all {
  background:#0f172a;
  border-color:#0f172a;
  color:#fff;
  box-shadow:none;
}
.cm-env-dd-tick { display:block; }
.cm-env-dd-name { font-weight:500; }
.cm-env-dd-sep { height:1px; background:#f1f5f9; margin:4px 0; }
.cm-chip { padding:4px 10px; font-size:11px; font-weight:700; border-radius:7px;
  background:#fff; border:1px solid #fde68a; color:#92400e; cursor:pointer; transition: all .15s; }
.cm-chip:hover { background:#fef9c3; }
.cm-chip.active { background:#fef3c7; color:#78350f; border-color:#facc15; }
.cm-custom-range { display:flex; align-items:center; gap:6px; margin-top:6px; }
.cm-date { padding:4px 8px; font-size:11px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }

.cm-select { padding:6px 10px; font-size:12px; border:1px solid #cbd5e1; border-radius:7px;
  background:#fff; min-width:260px; color:#0f172a; cursor:pointer; }

/* ── Scope (Product/Namespace) custom dropdown ── */
.cm-scope-wrap { position:relative; min-width:240px; }
.cm-scope-btn {
  display:flex; align-items:center; gap:6px; padding:6px 10px;
  border:1px solid #cbd5e1; border-radius:8px; background:#fff;
  font-size:12px; font-weight:500; color:#334155; cursor:pointer;
  width:100%; text-align:left; transition:all .15s;
}
.cm-scope-btn:hover { border-color:#6366f1; background:#fafaff; }
.cm-scope-btn.active { border-color:#6366f1; background:#eef2ff; color:#4338ca; }
.cm-scope-btn-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.cm-scope-dd {
  position:absolute; top:calc(100% + 5px); left:0; z-index:800;
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  box-shadow:0 16px 48px #00000018,0 2px 8px #0000000a;
  width:320px; max-height:420px; display:flex; flex-direction:column;
  animation:pth-fadein .15s ease-out; overflow:hidden;
}
.cm-scope-search-row {
  display:flex; align-items:center; gap:6px; padding:10px 12px;
  border-bottom:1px solid #f1f5f9; flex-shrink:0;
}
.cm-scope-search-icon { color:#94a3b8; flex-shrink:0; }
.cm-scope-search {
  flex:1; border:none; outline:none; font-size:12px; color:#0f172a;
  background:transparent; placeholder-color:#94a3b8;
}
.cm-scope-search::placeholder { color:#94a3b8; }
.cm-scope-search-clr {
  background:none; border:none; cursor:pointer; color:#94a3b8;
  font-size:16px; line-height:1; padding:0 2px; transition:color .12s;
}
.cm-scope-search-clr:hover { color:#ef4444; }
.cm-scope-group-hdr {
  padding:6px 12px 3px; font-size:9px; font-weight:800; color:#94a3b8;
  text-transform:uppercase; letter-spacing:.08em; flex-shrink:0;
  background:#fafafa; border-top:1px solid #f1f5f9; margin-top:2px;
}
.cm-scope-list { overflow-y:auto; flex:1; }
.cm-scope-item {
  display:flex; align-items:center; gap:8px; padding:7px 12px;
  background:none; border:none; cursor:pointer; width:100%;
  text-align:left; transition:background .12s; font-size:12px;
}
.cm-scope-item:hover { background:#f8fafc; }
.cm-scope-item.sel { background:#eef2ff; }
.cm-scope-all { color:#64748b; font-style:italic; border-bottom:1px solid #f1f5f9; }
.cm-scope-all.sel { color:#6366f1; font-style:normal; }
.cm-scope-name { font-weight:600; color:#1e293b; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cm-scope-item.sel .cm-scope-name { color:#4338ca; }
.cm-scope-env-chip {
  font-size:9px; font-weight:800; padding:2px 5px; border-radius:4px;
  background:#e0e7ff; color:#4338ca; flex-shrink:0; text-transform:uppercase;
  letter-spacing:.04em;
}
.cm-scope-multi { flex-wrap:wrap; gap:6px; cursor:default; }
.cm-scope-multi:hover { background:#f8fafc; }
.cm-scope-env-chips { display:flex; gap:4px; flex-wrap:wrap; }
.cm-scope-env-chip-btn {
  cursor:pointer; border:1px solid #c7d2fe; transition:all .12s; padding:2px 7px;
}
.cm-scope-env-chip-btn:hover { background:#6366f1; color:#fff; border-color:#6366f1; }
.cm-scope-empty { padding:16px 12px; font-size:12px; color:#94a3b8; text-align:center; }
.cm-input { padding:6px 10px; font-size:12px; border:1px solid #cbd5e1; border-radius:7px;
  background:#fff; width:170px; color:#0f172a; }

.cm-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
  font-size:12px; font-weight:700; background:#0f172a; color:#fff; border:none;
  border-radius:7px; cursor:pointer; }
.cm-btn:disabled { opacity:0.6; cursor:not-allowed; }
.cm-btn:hover:not(:disabled) { background:#1e293b; }
.cm-btn.ghost { background:#fff; color:#475569; border:1px solid #cbd5e1; }
.cm-btn.ghost:hover { background:#f1f5f9; }
.cm-btn.sm { padding:3px 8px; font-size:10px; }

.cm-status { display:flex; flex-wrap:wrap; gap:12px; margin-top:10px;
  font-size:11px; color:#6b7280; align-items:center; }
.cm-status-line { display:inline-flex; align-items:center; gap:4px; }
.cm-active-chip { background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:999px; font-weight:700; }
.cm-active-chip.warn { background:#fef3c7; color:#92400e; }

/* ── Notice / banner / skeleton ── */
.cm-banner { display:flex; align-items:center; gap:8px; padding:8px 12px;
  background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:12px; }
.cm-notice { display:flex; gap:14px; padding:22px; background:#fff;
  border:1px solid #e2e6ee; border-radius:12px; align-items:flex-start; }
.cm-notice-icon { color:#f59e0b; }
.cm-notice-title { font-weight:700; color:#0f172a; font-size:14px; }
.cm-notice-body { color:#64748b; font-size:13px; margin-top:4px; max-width: 640px; line-height:1.5; }

.cm-empty-mini { padding:18px; color:#94a3b8; font-size:12px; text-align:center; }

.cm-skel { display:flex; flex-direction:column; gap:14px; }
.cm-skel-strip, .cm-skel-row { display:grid; gap:10px; }
.cm-skel-strip { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.cm-skel-row { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.cm-skel-kpi { height:96px; border-radius:10px; background:linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
  background-size:200% 100%; animation: cm-shimmer 1.4s linear infinite; }
.cm-skel-chart { height:240px; border-radius:10px; background:linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
  background-size:200% 100%; animation: cm-shimmer 1.4s linear infinite; }
.cm-skel-table { height:220px; border-radius:10px; background:linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
  background-size:200% 100%; animation: cm-shimmer 1.4s linear infinite; }
@keyframes cm-shimmer { 0% { background-position:200% 0; } 100% { background-position: -200% 0; } }

/* ── KPI strip ── */
.cm-kpi-strip { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; }
.cm-kpi { background:#fff; border:1px solid #e2e6ee; border-top:3px solid #94a3b8;
  border-radius:10px; padding:11px 14px; display:flex; flex-direction:column; gap:4px; }
.cm-kpi-head { display:flex; align-items:center; gap:8px; }
.cm-kpi-icon { width:28px; height:28px; border-radius:8px;
  display:inline-flex; align-items:center; justify-content:center; }
.cm-kpi-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.cm-kpi-value { font-size:20px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; }
.cm-kpi-sub { font-size:11px; color:#94a3b8; }

/* ── Card ── */
.cm-card { background:#fff; border:1px solid #e2e6ee; border-top:3px solid #0f172a; border-radius:12px; }
.cm-card-head { display:flex; justify-content:space-between; align-items:center; gap:8px;
  padding:10px 14px; border-bottom:1px solid #eef1f6; }
.cm-card-title { font-size:13px; font-weight:700; color:#0f172a; display:inline-flex; align-items:center; gap:6px; }
.cm-card-sub { font-size:11px; color:#94a3b8; font-weight:400; }
.cm-card-body { padding:14px; }

/* ── Grids ── */
.cm-grid-2 { display:grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap:14px; }
.cm-grid-3 { display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:14px; }

/* ── Donut ── */
.cm-donut { display:block; margin:0 auto 6px; }
.cm-donut-num { fill:#0f172a; font-size:14px; font-weight:700; }
.cm-donut-cap { fill:#94a3b8; font-size:9px; }

.cm-legend { display:flex; flex-direction:column; gap:6px; }
.cm-legend-row { display:flex; align-items:center; gap:8px; font-size:12px; }
.cm-legend-label { font-weight:600; color:#0f172a; min-width:60px; }
.cm-legend-val { color:#475569; font-variant-numeric:tabular-nums; min-width:50px; }
.cm-legend-extra { margin-left:auto; color:#94a3b8; font-size:11px; }

/* ── Util card / bar ── */
.cm-util-cards { display:flex; flex-direction:column; gap:10px; }
.cm-util-card { border-radius:9px; border:1px solid; padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
.cm-util-head { display:flex; justify-content:space-between; align-items:center; }
.cm-util-cost { font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; }
.cm-util-line { display:flex; flex-direction:column; gap:4px; }
.cm-util-row { display:flex; justify-content:space-between; font-size:11px; color:#475569; }
.cm-util-name { display:inline-flex; align-items:center; gap:4px; font-weight:600; }
.cm-util-sub { font-variant-numeric:tabular-nums; }
.cm-utbar { position:relative; background:#f1f5f9; border-radius:5px; height:14px; min-width:80px; overflow:hidden; }
.cm-utbar.full { width:100%; }
.cm-utbar-fill { position:absolute; top:0; left:0; height:100%; transition: width .25s; }
.cm-utbar-text { position:absolute; left:0; right:0; top:0; text-align:center; font-size:10px; font-weight:700;
  line-height:14px; color:#0f172a; mix-blend-mode: difference; filter: invert(1); }

/* ── Bar list ── */
.cm-bar { display:flex; flex-direction:column; gap:6px; }
.cm-bar-row { display:grid; grid-template-columns: 130px 1fr 80px; gap:8px; align-items:center; padding:3px 0; }
.cm-bar-row.click { cursor:pointer; border-radius:6px; padding: 3px 6px; }
.cm-bar-row.click:hover { background:#f8fafc; }
.cm-bar-row.click:hover .cm-bar-label { color:#1d4ed8; }
.cm-bar-label { font-size:11px; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cm-bar-track { background:#f1f5f9; border-radius:5px; overflow:hidden; height:14px; position:relative; }
.cm-bar-fill { height:100%; border-radius:5px; transition: width .2s; }
.cm-bar-stack { display:flex; height:100%; border-radius:5px; overflow:hidden; }
.cm-bar-val { font-size:11px; color:#0f172a; font-weight:700; text-align:right; font-variant-numeric:tabular-nums; }

/* ── Stack ── */
.cm-stack { display:flex; height:18px; border-radius:9px; overflow:hidden; background:#f1f5f9; }
.cm-stack-legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:8px; font-size:11px; color:#475569; }
.cm-stack-legend span { display:inline-flex; align-items:center; gap:4px; }

/* ── Env tag / sys / prod tag ── */
.cm-env-tag { display:inline-flex; align-items:center; gap:5px;
  font-size:10px; font-weight:700; padding:2px 8px; border:1px solid; border-radius:999px;
  text-transform:uppercase; letter-spacing:0.04em; }
.cm-env-tag.inline { padding:1px 6px; font-size:9px; }
.cm-sys-tag { margin-left:6px; font-size:9px; padding:1px 6px; border-radius:999px;
  background:#f1f5f9; color:#64748b; font-weight:700; text-transform:uppercase; }
.cm-prod-tag { display:inline-block; font-size:10px; font-weight:700; padding:1px 7px;
  border-radius:999px; background:#eef2ff; color:#3730a3; }

/* ── Table ── */
.cm-tbl-wrap { overflow-x:auto; }
.cm-tbl { width:100%; border-collapse:collapse; font-size:12px; }
.cm-tbl th { text-align:left; padding:7px 10px; font-size:10px; color:#64748b;
  text-transform:uppercase; letter-spacing:0.04em; background:#fafbfd; border-bottom:1px solid #eef1f6; }
.cm-tbl th.r { text-align:right; }
.cm-tbl td { padding:7px 10px; border-bottom:1px dashed #eef1f6; font-variant-numeric:tabular-nums; }
.cm-tbl td.r { text-align:right; }
.cm-tbl tr:hover td { background:#f8fafc; }
.cm-tbl tr.cm-row-sys td { background:#fafafa; color: #94a3b8; }
.cm-tbl tr.cm-row-sys strong { color:#64748b; }

/* ── Headline row ── */
.cm-headline-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px; }
.cm-headline { background:#fff; border:1px solid; border-radius:8px; padding:8px 10px; }
.cm-headline-label { display:flex; align-items:center; gap:4px;
  font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
.cm-headline-value { font-size:16px; font-weight:700; color:#0f172a; margin-top:2px; font-variant-numeric:tabular-nums; }

/* ── Category tiles ── */
.cm-cat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; }
.cm-cat { background:#fff; border:1px solid #e2e6ee; border-radius:10px;
  padding:12px 14px; cursor:pointer; transition:all .15s; text-align:left;
  display:flex; flex-direction:column; gap:8px; }
.cm-cat:hover { border-color:#cbd5e1; background:#fafbfd; }
.cm-cat.active { box-shadow: 0 0 0 2px currentColor inset; }
.cm-cat-head { display:flex; align-items:center; gap:8px; }
.cm-cat-icon { width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; }
.cm-cat-title { font-size:14px; font-weight:700; color:#0f172a; flex:1; }
.cm-cat-lines { display:flex; flex-direction:column; gap:3px; }
.cm-cat-line { display:flex; justify-content:space-between; font-size:12px; }
.cm-cat-line-label { color:#64748b; }
.cm-cat-line-value { font-weight:700; font-variant-numeric:tabular-nums; }
.cm-cat-foot { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin-top:4px; }

/* ── Metric grid ── */
.cm-mgrid { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; }
.cm-mtile { background:#fafbfd; border:1px solid #eef1f6; border-radius:8px; padding:9px 11px; }
.cm-mtile-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.cm-mtile-value { font-size:16px; font-weight:700; color:#0f172a; margin-top:3px; font-variant-numeric:tabular-nums; }
.cm-mtile-sub { font-size:10px; color:#94a3b8; margin-top:2px; }
.cm-wide { grid-column: 1 / -1; background:#fff; border:1px solid #eef1f6; border-radius:8px; padding:10px 12px; }
.cm-mini-title { font-size:11px; font-weight:700; color:#475569;
  text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }

.cm-twin { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
.cm-twin-label { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#475569; margin-bottom:5px; font-weight:600; }

/* ── HERO (drill-down) ── */
.cm-hero { border-top-width: 4px; }
.cm-hero-body {
  display:grid; grid-template-columns: 320px 1fr; gap:24px;
  padding:18px 18px 12px; align-items:center;
}
.cm-hero-donut { display:flex; flex-direction:column; gap:10px; align-items:center; }
.cm-hero-money { display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; }
.cm-hero-trend { padding:8px 18px 18px; border-top:1px solid #eef1f6; background:linear-gradient(180deg,#f8fafc 0%, #fff 100%); }

.cm-cost-hero { background:#fff; border:1px solid #eef1f6; border-top:3px solid #94a3b8;
  border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:4px; min-width:0; }
.cm-cost-hero.big { background: linear-gradient(180deg, #f0fdf4 0%, #fff 100%); }
.cm-cost-hero-head { display:flex; align-items:center; gap:8px; }
.cm-cost-hero-icon { width:30px; height:30px; border-radius:8px;
  display:inline-flex; align-items:center; justify-content:center; }
.cm-cost-hero-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; }
.cm-cost-hero-value { font-size:26px; font-weight:800; color:#0f172a;
  font-variant-numeric:tabular-nums; line-height:1.1; }
.cm-cost-hero.big .cm-cost-hero-value { font-size:32px; }
.cm-cost-hero-unit { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
.cm-cost-hero-sub { font-size:11px; color:#475569; margin-top:4px; }

/* ── ACCORDION ── */
.cm-accordion { display:flex; flex-direction:column; gap:8px; }
.cm-acc { border:1px solid #e2e6ee; border-radius:10px; overflow:hidden;
  background:#fff; transition: border-color .15s; }
.cm-acc.open { border-width: 1px; }
.cm-acc-bar { display:flex; align-items:center; gap:12px; width:100%;
  padding:12px 14px; background:#fff; border:none; cursor:pointer; text-align:left; }
.cm-acc-bar:hover { background:#fafbfd; }
.cm-acc-icon { width:32px; height:32px; border-radius:8px;
  display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.cm-acc-title { font-size:14px; font-weight:700; color:#0f172a; min-width:110px; }
.cm-acc-headline { display:flex; flex-wrap:wrap; gap:18px; flex:1; }
.cm-acc-headline-item { display:flex; flex-direction:column; min-width:80px; }
.cm-acc-h-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; }
.cm-acc-h-value { font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }
.cm-acc-chev { color:#94a3b8; flex-shrink:0; }
.cm-acc-body { padding:14px; background:#fafbfd; border-top:1px solid #eef1f6;
  display:flex; flex-direction:column; gap:12px; }

/* ── VIZ ROW ── */
.cm-viz-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px; }
.cm-viz-block { background:#fff; border:1px solid #eef1f6; border-radius:10px;
  padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.cm-viz-block.grow { flex: 1.6 1 320px; }

/* ── STATUS PILL (UP / DOWN) ── */
.cm-status-pill { display:inline-flex; align-items:center; gap:5px;
  padding:3px 9px; border-radius:999px; font-size:10px; font-weight:800;
  text-transform:uppercase; letter-spacing:0.06em; }
.cm-status-pill.up   { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
.cm-status-pill.down { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
.cm-status-pill.sm   { padding:1px 7px; font-size:9px; }
.cm-status-dot { width:6px; height:6px; border-radius:50%; display:inline-block; }
.cm-status-dot.up   { background:#16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.18); animation: cm-pulse-up 2s ease-in-out infinite; }
.cm-status-dot.down { background:#dc2626; }
@keyframes cm-pulse-up { 0%,100%{ box-shadow:0 0 0 3px rgba(22,163,74,0.18); } 50%{ box-shadow:0 0 0 6px rgba(22,163,74,0); } }

/* ── PRODUCT TABLE ── */
.cm-prod-tbl .cm-prod-row { cursor:pointer; }
.cm-prod-tbl .cm-prod-row:hover td { background:#f1f5f9; }
.cm-prod-envs { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
.cm-prod-cost-line { margin-top:3px; font-size:11px; font-variant-numeric:tabular-nums; }
.cm-prod-detail-row td { background:#f8fafc !important; padding:0 !important; }
.cm-prod-detail { padding:14px; }
.cm-prod-comp-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:8px; }
.cm-prod-comp { display:flex; align-items:center; gap:8px; padding:8px 10px;
  background:#fff; border:1px solid #eef1f6; border-radius:8px; }
.cm-prod-comp-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.cm-prod-comp-value { font-size:16px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; }

/* ── PER-DAY BARS ── */
.cm-perday-summary { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap:10px; margin-bottom:14px; }
.cm-perday-stat { background:#fff; border:1px solid #eef1f6; border-radius:8px; padding:8px 10px; }
.cm-perday-stat-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.cm-perday-stat-val { font-size:16px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; margin-top:2px; }
.cm-perday-bars { display:flex; gap:8px; align-items:flex-end; min-height:220px; padding-top:24px; overflow-x:auto; }
.cm-perday-bar { flex:1; min-width:42px; display:flex; flex-direction:column; align-items:center; gap:4px; height:200px; justify-content:flex-end; }
.cm-perday-bar-val { font-size:10px; color:#0f172a; font-weight:700; font-variant-numeric:tabular-nums; }
.cm-perday-bar-track { width:100%; display:flex; flex-direction:column; border-radius:5px 5px 0 0; overflow:hidden; min-height:6px; transition: height 0.3s; }
.cm-perday-bar-seg { width:100%; transition: flex 0.3s; }
.cm-perday-bar-day { font-size:10px; color:#64748b; font-variant-numeric:tabular-nums; }

/* ── POD TABLE ── */
.cm-pod-tbl td { vertical-align: middle; }
.cm-pod-bicol { display:flex; flex-direction:column; gap:2px; align-items:flex-end; min-width:120px; }
.cm-spot-tag { margin-left:6px; padding:1px 6px; border-radius:999px; font-size:9px; font-weight:700;
  background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
.cm-vm-tag { display:inline-block; margin-top:2px; padding:1px 6px; border-radius:4px;
  background:#eef2ff; color:#3730a3; font-size:9px; font-weight:700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.cm-hpa-tag { padding:2px 8px; border-radius:6px; background:#f0f9ff; color:#075985;
  font-size:11px; font-weight:600; border:1px solid #bae6fd; font-variant-numeric:tabular-nums; }
.cm-warn-tag { color:#dc2626; font-weight:700; }
.cm-pod-detail-row td { background:#f8fafc !important; padding:0 !important; }
.cm-pod-detail { padding:14px; }
.cm-pod-detail-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px; }
.cm-pod-spec { background:#fff; border:1px solid #eef1f6; border-radius:8px; padding:8px 10px; min-width:0; }
.cm-pod-spec.full { grid-column: 1 / -1; }
.cm-pod-spec-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.cm-pod-spec-value { font-size:14px; font-weight:700; color:#0f172a; margin-top:2px; word-break:break-all; }
.cm-pod-spec-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; font-weight:500; }
.cm-pod-spec-sub { font-size:10px; color:#94a3b8; margin-top:2px; }

/* ── Cost period grid ── */
.cm-cost-period-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:4px; }
.cm-cost-period { background:#fff; border:1px solid #eef1f6; border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:3px; }
.cm-cost-period.accent { background:linear-gradient(135deg, #eff6ff 0%, #fff 100%); border-color:#bfdbfe; }
.cm-cost-period-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; font-weight:700; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.cm-cost-period-date { font-size:9px; color:#94a3b8; font-weight:600; text-transform:none; letter-spacing:0; background:#f1f5f9; border-radius:4px; padding:1px 5px; }
.cm-cost-period-value { font-size:22px; font-weight:800; color:#0f172a; font-variant-numeric:tabular-nums; line-height:1.1; margin-top:2px; }
.cm-cost-period-unit { font-size:10px; color:#94a3b8; }

/* ── KPI badge ── */
.cm-kpi-badge { margin-left:auto; padding:2px 7px; border-radius:999px;
  font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; }

/* ── Active filter chips (dismissible) ── */
.cm-active-chip { display:inline-flex; align-items:center; gap:5px;
  background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:999px;
  font-weight:700; font-size:11px; border:1px solid #bfdbfe; }
.cm-active-chip.warn { background:#fef3c7; color:#92400e; border-color:#fde68a; }
.cm-active-chip.dismissible { cursor:pointer; transition: opacity .15s; }
.cm-active-chip.dismissible:hover { opacity: 0.8; }

/* ── Period banner (env donut non-live) ── */
.cm-period-banner { display:flex; align-items:center; gap:6px; padding:6px 10px;
  background:#f0fdf4; border:1px solid #bbf7d0; border-radius:7px;
  font-size:12px; color:#166534; margin-bottom:8px; flex-wrap:wrap; }

/* ── Product sparkline list ── */
.cm-product-spark-list { display:flex; flex-direction:column; gap:2px; }
.cm-product-spark-row {
  display:grid; grid-template-columns: 1fr 130px 110px;
  align-items:center; gap:10px;
  padding:8px 10px; border-radius:8px; cursor:pointer;
  border:1px solid transparent; transition: background .12s;
}
.cm-product-spark-row:hover { background:#f8fafc; border-color:#e2e8f0; }
.cm-product-spark-info { display:flex; flex-direction:column; gap:3px; min-width:0; }
.cm-product-spark-name { font-size:13px; font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cm-product-spark-envs { display:flex; flex-wrap:wrap; gap:3px; }
.cm-product-spark-meta { font-size:10px; color:#94a3b8; }
.cm-product-spark-chart { display:flex; align-items:center; justify-content:center; }
.cm-product-spark-cost { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
.cm-product-spark-value { font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; }
.cm-product-spark-sub { font-size:10px; color:#94a3b8; font-variant-numeric:tabular-nums; }

/* ── Interactive Spark tooltip ── */
.cm-spark-tip {
  position:absolute; pointer-events:none; z-index:10;
  background:#0f172a; color:#f8fafc; border-radius:9px;
  padding:8px 11px; min-width:130px; box-shadow: 0 4px 16px rgba(15,23,42,0.18);
  font-size:12px; display:flex; flex-direction:column; gap:3px;
}
.cm-spark-tip-val { font-size:16px; font-weight:800; font-variant-numeric:tabular-nums; }
.cm-spark-tip-daily { font-size:11px; color:#94a3b8; font-variant-numeric:tabular-nums; }
.cm-spark-tip-time { font-size:10px; color:#64748b; }
.cm-spark-tip-badge { display:inline-block; margin-top:3px; padding:1px 7px;
  border-radius:999px; font-size:9px; font-weight:800; color:#fff;
  text-transform:uppercase; letter-spacing:0.06em; align-self:flex-start; }

/* ── Spark legend ── */
.cm-spark-legend { display:flex; flex-wrap:wrap; gap:12px; font-size:11px; color:#475569; }
.cm-spark-legend span { display:inline-flex; align-items:center; gap:4px; }

/* ── pill-dot ── */
.cm-pill-dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex-shrink:0; }

/* responsive — collapse hero on narrow */
@media (max-width: 900px) {
  .cm-hero-body { grid-template-columns: 1fr; }
  .cm-hero-money { grid-template-columns: repeat(2, 1fr); }
  .cm-acc-headline { gap:10px; }
  .cm-product-spark-row { grid-template-columns: 1fr 90px; }
  .cm-product-spark-chart { display:none; }
}
@media (max-width: 540px) {
  .cm-hero-money { grid-template-columns: 1fr; }
  .cm-acc-title { min-width: 0; }
  .cm-perday-bar { min-width: 36px; }
  .cm-product-spark-row { grid-template-columns: 1fr 90px; }
}

/* ════════════════════════════════════════════════════════════════════ */
/*  PRODUCT GRAPHS PANEL                                                 */
/* ════════════════════════════════════════════════════════════════════ */

/* Shell */
.pgp-shell {
  display: flex; flex-direction: column; gap: 14px;
  background: #fff; border: 1px solid #e2e6ee;
  border-top: 3px solid #0ea5e9; border-radius: 12px;
  padding: 14px; box-shadow: 0 2px 8px rgba(15,23,42,0.06);
}

/* Tab bar */
.pgp-tabbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding-bottom: 10px; border-bottom: 1px solid #eef1f6;
}
.pgp-fetching {
  margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: #64748b;
}
.pgp-tab-label {
  font-size: 11px; font-weight: 700; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-right: 4px;
}
.pgp-tab {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 13px; font-size: 12px; font-weight: 700;
  border-radius: 8px; border: 1px solid #e2e8f0;
  background: #f8fafc; color: #475569; cursor: pointer;
  transition: all .15s;
}
.pgp-tab:hover { background: #f1f5f9; border-color: #cbd5e1; }
.pgp-tab.active {
  background: #0ea5e9; color: #fff; border-color: #0ea5e9;
  box-shadow: 0 2px 8px rgba(14,165,233,0.30);
}
.pgp-custom-row {
  display: flex; align-items: center; gap: 6px; margin-left: 4px;
}
.pgp-tab-live-badge {
  margin-left: auto; font-size: 10px; font-weight: 800;
  color: #0ea5e9; text-transform: uppercase; letter-spacing: 0.06em;
  background: #e0f2fe; border-radius: 999px; padding: 2px 9px;
  border: 1px solid #bae6fd;
}
.pgp-db-badge {
  font-size: 10px; font-weight: 700;
  color: #15803d; background: #dcfce7; border: 1px solid #bbf7d0;
  border-radius: 999px; padding: 2px 9px;
}

/* Charts grid: 2 cols on wide, 1 on narrow */
.pgp-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 14px;
}

/* Individual chart card */
.pgp-chart-card {
  background: #fafbfd; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  min-width: 0;
}
.pgp-live-card { border-top: 2px solid #10b981; }

/* Chart header row */
.pgp-chart-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pgp-chart-title {
  font-size: 13px; font-weight: 700; color: #0f172a;
}
.pgp-chart-sub {
  font-size: 11px; color: #94a3b8; flex: 1;
}

/* Spike count badge */
.pgp-spike-badge {
  font-size: 10px; font-weight: 800; padding: 2px 8px;
  border-radius: 999px; background: #fef2f2;
  color: #dc2626; border: 1px solid #fecaca;
  text-transform: uppercase; letter-spacing: 0.05em;
}

/* Spike inline in tooltip */
.pgp-spike-inline {
  font-size: 10px; font-weight: 800; color: #ef4444;
  background: #fef2f2; border-radius: 4px;
  padding: 1px 5px; margin-left: 4px;
}

/* Live pulsing green dot */
.pgp-live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #16a34a; display: inline-block; flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(22,163,74,0.18);
  animation: pgp-live-pulse 2s ease-in-out infinite;
}
@keyframes pgp-live-pulse {
  0%,100% { box-shadow: 0 0 0 3px rgba(22,163,74,0.18); }
  50%      { box-shadow: 0 0 0 7px rgba(22,163,74,0); }
}

/* Ops KPI grid */
.pgp-ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}
.pgp-ops-kpi {
  background: #fff; border: 1px solid #eef1f6;
  border-top: 3px solid #94a3b8; border-radius: 9px;
  padding: 10px 12px; display: flex; flex-direction: column;
  align-items: flex-start; gap: 3px;
}
.pgp-ops-kpi-icon { font-size: 16px; line-height: 1; }
.pgp-ops-kpi-value {
  font-size: 18px; font-weight: 800; color: #0f172a;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.pgp-ops-kpi-label {
  font-size: 10px; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.04em; font-weight: 700;
}

/* Dual-line legend */
.pgp-dual-legend {
  display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; font-weight: 700;
  margin-bottom: 4px;
}

/* Expand button (top-right of each chart card) */
.pgp-expand-btn {
  margin-left: auto; padding: 2px 7px; font-size: 14px; line-height: 1;
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
  color: #475569; cursor: pointer; transition: all .12s;
  flex-shrink: 0;
}
.pgp-expand-btn:hover { background: #e2e8f0; color: #0f172a; }

/* Full-view modal */
.fvm-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(15,23,42,0.55); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.fvm-box {
  background: #fff; border-radius: 14px; width: 100%; max-width: 1100px;
  max-height: 90vh; overflow-y: auto;
  box-shadow: 0 24px 80px rgba(15,23,42,0.3);
  display: flex; flex-direction: column;
}
.fvm-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid #eef1f6;
  position: sticky; top: 0; background: #fff; z-index: 1;
}
.fvm-title { font-size: 16px; font-weight: 700; color: #0f172a; }
.fvm-sub   { font-size: 12px; color: #94a3b8; }
.fvm-body  { padding: 18px; flex: 1; }

/* Responsive */
@media (max-width: 820px) {
  .pgp-charts { grid-template-columns: 1fr; }
  .fvm-box { max-width: 100%; max-height: 95vh; }
}

/* ── KPI Strip v2 (ring layout) ── */
.cm-kpi-strip-v2 {
  display: flex; gap: 18px; align-items: stretch;
  background: #fff; border: 1px solid #e2e6ee; border-radius: 14px;
  padding: 18px 20px; box-shadow: 0 2px 8px rgba(15,23,42,0.05);
  flex-wrap: wrap;
}
.cm-kpi-left {
  display: flex; gap: 20px; align-items: flex-start; flex: 1.8; min-width: 300px;
}
.cm-kpi-primary { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.cm-kpi-primary-label {
  font-size: 11px; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 700;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.cm-kpi-date-badge {
  background: #f1f5f9; color: #94a3b8; font-size: 9px; font-weight: 600;
  border-radius: 4px; padding: 1px 5px; text-transform: none; letter-spacing: 0;
}
.cm-kpi-primary-value {
  font-size: 36px; font-weight: 800; color: #0f172a;
  font-variant-numeric: tabular-nums; line-height: 1.0;
}
.cm-kpi-primary-sub { font-size: 12px; color: #64748b; }
.cm-kpi-env-pills { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.cm-kpi-env-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 8px; border: 1px solid;
  font-size: 11px; font-weight: 600;
}

.cm-kpi-right {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px; flex: 2; min-width: 260px;
}
.cm-compact-metric {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-left: 3px solid #94a3b8; border-radius: 9px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 3px;
}
.cm-compact-head { display: flex; align-items: center; gap: 5px; }
.cm-compact-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; flex: 1; }
.cm-compact-value { font-size: 16px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
.cm-compact-sub { font-size: 10px; color: #94a3b8; }

/* ── Date navigator ── */
.cm-date-nav {
  display: flex; align-items: center; gap: 6px; position: relative;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 7px 12px; font-size: 12px; color: #475569; width: fit-content;
}
.cm-date-nav-btn {
  width: 28px; height: 28px; border: 1px solid #e2e8f0; border-radius: 7px;
  background: #f8fafc; color: #475569; cursor: pointer; font-size: 18px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.cm-date-nav-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
.cm-date-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cm-date-nav-btn.cal { background: #f0f9ff; color: #0ea5e9; border-color: #bae6fd; }
.cm-date-nav-btn.cal:hover { background: #e0f2fe; }
.cm-date-nav-label {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 12px; color: #0f172a;
  padding: 0 4px;
}
.cm-date-nav-reset {
  display: inline-flex; align-items: center; gap: 3px;
  background: #fee2e2; color: #dc2626; border: none; border-radius: 999px;
  padding: 1px 7px; font-size: 10px; font-weight: 700; cursor: pointer;
}
.cm-date-nav-cal {
  position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15,23,42,0.12); padding: 14px;
  min-width: 240px; z-index: 50; display: flex; flex-direction: column; gap: 8px;
}
.cm-date-nav-cal-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.cm-date-nav-cal-row { display: flex; flex-direction: column; gap: 4px; }
.cm-date-nav-cal-row label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.cm-date-nav-cal-row input { padding: 6px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 7px; }

/* ── Single env hero ── */
.cm-env-hero {
  background: #fff; border: 1px solid #e2e6ee; border-top: 4px solid;
  border-radius: 14px; overflow: hidden;
  display: flex; gap: 0; align-items: stretch; flex-wrap: wrap;
  box-shadow: 0 2px 8px rgba(15,23,42,0.06);
}
.cm-env-hero-primary {
  flex: 2; min-width: 300px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;
  border-right: 1px solid #eef1f6;
}
.cm-env-hero-env { display: flex; align-items: center; gap: 10px; }
.cm-env-hero-money { display: flex; flex-direction: column; gap: 10px; }
.cm-env-hero-block { display: flex; flex-direction: column; gap: 3px; }
.cm-env-hero-label {
  font-size: 11px; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 700;
  display: flex; align-items: center; gap: 6px;
}
.cm-env-hero-value { font-size: 38px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.0; }
.cm-env-hero-value.est { font-size: 28px; color: #10b981; }
.cm-env-hero-sub { font-size: 12px; color: #64748b; }
.cm-env-hero-progress { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.cm-env-hero-progress-label { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 600; }
.cm-env-hero-track {
  height: 8px; background: #f1f5f9; border-radius: 999px; overflow: visible; position: relative;
}
.cm-env-hero-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.cm-env-hero-day-marker {
  position: absolute; top: -3px; width: 2px; height: 14px;
  background: #0f172a; border-radius: 2px;
  transform: translateX(-50%);
}
.cm-env-hero-secondary {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 1px; background: #eef1f6; min-width: 260px;
}
.cm-env-hero-sec-card {
  background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
}
.cm-env-hero-sec-label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
.cm-env-hero-sec-value { font-size: 22px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
.cm-env-hero-sec-sub { font-size: 10px; color: #94a3b8; }

@media (max-width: 820px) {
  .cm-kpi-strip-v2 { flex-direction: column; }
  .cm-kpi-left { flex-direction: column; align-items: center; }
  .cm-env-hero-primary { border-right: none; border-bottom: 1px solid #eef1f6; }
  .cm-env-hero-secondary { grid-template-columns: repeat(4, 1fr); }
  .cm-kpi-right { grid-template-columns: repeat(3, 1fr); }
  .cm-date-nav { width: 100%; justify-content: center; }
}

/* ── Cluster button ── */
.cm-cluster-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; font-size: 11px; font-weight: 700;
  background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd;
  border-radius: 7px; cursor: pointer; white-space: nowrap;
  transition: all .12s;
}
.cm-cluster-btn:hover { background: #e0f2fe; border-color: #7dd3fc; }
.cm-cluster-icon-btn {
  font-size: 14px; cursor: pointer; color: #0369a1;
  padding: 1px 4px; border-radius: 4px;
  transition: background .12s;
}
.cm-cluster-icon-btn:hover { background: #e0f2fe; }

/* ── Node Detail Modal ── */
.ndm-shell { display: flex; flex-direction: column; gap: 16px; }
.ndm-summary {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px; background: #f8fafc; border-radius: 10px; padding: 12px 14px;
}
.ndm-sum-card { display: flex; flex-direction: column; gap: 2px; }
.ndm-sum-card.accent { background: linear-gradient(135deg, #f0fdf4, #fff); border-radius: 8px; padding: 6px 8px; }
.ndm-sum-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
.ndm-sum-value { font-size: 18px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }

.ndm-pool { background: #fff; border: 1px solid #e2e6ee; border-radius: 12px; overflow: hidden; }
.ndm-pool-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #eef1f6; flex-wrap: wrap; gap: 8px;
}
.ndm-pool-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ndm-pool-tag { background: #0f172a; color: #fff; border-radius: 6px; padding: 2px 10px; font-size: 11px; font-weight: 800; }
.ndm-pool-sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 700; color: #3b82f6; background: #eff6ff; padding: 2px 8px; border-radius: 5px; }
.ndm-pool-spec { font-size: 12px; color: #475569; font-weight: 600; }
.ndm-pool-meta { display: flex; gap: 12px; font-size: 12px; color: #64748b; align-items: center; }
.ndm-pool-cost { font-weight: 700; color: #10b981; }

.ndm-nodes { display: flex; flex-direction: column; }
.ndm-node { border-bottom: 1px solid #f1f5f9; }
.ndm-node:last-child { border-bottom: none; }
.ndm-node.open { background: #fafbfd; }
.ndm-node-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  cursor: pointer; transition: background .12s; flex-wrap: wrap;
}
.ndm-node-row:hover { background: #f1f5f9; }
.ndm-node-arrow { font-size: 10px; color: #94a3b8; width: 12px; flex-shrink: 0; }
.ndm-node-name { display: flex; align-items: center; gap: 6px; min-width: 180px; flex: 1; }
.ndm-node-hostname { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; color: #0f172a; }
.ndm-node-zone { font-size: 9px; padding: 1px 6px; background: #fef3c7; color: #92400e; border-radius: 999px; font-weight: 700; }
.ndm-node-spec { display: flex; gap: 8px; font-size: 11px; color: #475569; font-weight: 600; min-width: 100px; }
.ndm-node-util { display: flex; flex-direction: column; gap: 3px; width: 80px; }
.ndm-util-bar { height: 5px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
.ndm-util-fill { height: 100%; border-radius: 999px; transition: width .3s; }
.ndm-util-fill.cpu { background: #3b82f6; }
.ndm-util-fill.mem { background: #a855f7; }
.ndm-node-cost { display: flex; flex-direction: column; align-items: flex-end; min-width: 90px; }
.ndm-node-hr { font-size: 12px; font-weight: 800; color: #10b981; font-variant-numeric: tabular-nums; }
.ndm-node-mo { font-size: 10px; color: #94a3b8; font-variant-numeric: tabular-nums; }
.ndm-node-pods { font-size: 11px; color: #475569; font-weight: 600; min-width: 60px; text-align: right; }
.ndm-disk-tag { font-size: 9px; padding: 1px 6px; background: #f5f3ff; color: #6d28d9; border-radius: 4px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.ndm-pod-list { padding: 0 14px 12px 26px; display: flex; flex-direction: column; gap: 8px; }
.ndm-pod-tbl { font-size: 11px; }
.ndm-pod-name { font-weight: 700; font-size: 12px; color: #0f172a; }
.ndm-pod-image { font-size: 10px; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: 1px; }
.ndm-node-pricing {
  display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #64748b;
  padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;
}

/* ── Multi-namespace cost chart ── */
.mnc-legend {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
}
.mnc-legend-item {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 8px; border: 1px solid #e2e8f0;
  background: #fafbfd; font-size: 11px; font-weight: 600;
}
.mnc-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.mnc-dot.sm { width: 7px; height: 7px; }
.mnc-ns-label { color: #0f172a; font-weight: 700; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mnc-updown { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 999px; text-transform: uppercase; }
.mnc-updown.up   { background: #dcfce7; color: #166534; }
.mnc-updown.down { background: #fee2e2; color: #991b1b; }
.mnc-trend { font-size: 12px; font-weight: 800; }
.mnc-cost { font-variant-numeric: tabular-nums; color: #10b981; font-weight: 700; }

.mnc-tip {
  position: absolute; top: 44px; z-index: 20;
  background: #0f172a; color: #f8fafc; border-radius: 12px;
  padding: 10px 14px; min-width: 220px; max-width: 300px;
  box-shadow: 0 8px 28px rgba(15,23,42,0.28);
  pointer-events: none;
}
.mnc-tip-time { font-size: 10px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; }
.mnc-tip-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 7px; }
.mnc-tip-ns { font-size: 11px; font-weight: 800; white-space: nowrap; flex-shrink: 0; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.mnc-tip-details { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.mnc-tip-cost { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.mnc-tip-detail { font-size: 10px; color: #94a3b8; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mnc-tip-warn { font-size: 10px; color: #fbbf24; font-weight: 700; }
.mnc-tip-total { border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px; font-size: 12px; color: #94a3b8; }

/* ── KPI Strip v3 — Today / This Month / Last Month ── */
.cm-kpi-v3 {
  display: flex; align-items: stretch; gap: 0;
  background: #fff; border: 1px solid #e2e6ee; border-radius: 14px;
  box-shadow: 0 2px 8px rgba(15,23,42,0.05);
}
.cm-kpi-v3-card {
  flex: 1; padding: 18px 20px;
  display: flex; flex-direction: column; gap: 6px;
  cursor: pointer; transition: background .15s;
}
.cm-kpi-v3-card:hover { background: #f8fafc; }
.cm-kpi-v3-card.primary { background: #fafaff; }
.cm-kpi-v3-card.primary:hover { background: #f3f3ff; }
.cm-kpi-v3-label {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
  font-size: 10px; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 700; flex-wrap: wrap;
}
.cm-kpi-v3-date { color: #94a3b8; font-size: 9px; font-weight: 600; text-transform: none; letter-spacing: 0; }
.cm-kpi-v3-badge {
  background: #6366f120; color: #4338ca; font-size: 9px; font-weight: 800;
  border-radius: 4px; padding: 1px 5px; text-transform: uppercase; letter-spacing: 0.06em;
}
.cm-kpi-v3-value {
  font-size: 30px; font-weight: 800; color: #0f172a;
  font-variant-numeric: tabular-nums; line-height: 1.05;
}
.cm-kpi-v3-sub { font-size: 11px; color: #64748b; flex: 1; }
.cm-kpi-v3-hint {
  font-size: 9px; color: #cbd5e1; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-top: auto;
}
.cm-kpi-v3-card:hover .cm-kpi-v3-hint { color: #6366f1; }

.cm-kpi-v3-sep { width: 0; border: none; } /* separators are the card borders */

.cm-kpi-v3-metrics {
  display: flex; flex-direction: column; justify-content: space-around;
  padding: 14px 18px; gap: 10px; min-width: 180px; flex-shrink: 0;
  border-left: 1px solid #eef1f6; background: #fafbfd;
}
.cm-kpi-v3-metric { display: flex; flex-direction: column; gap: 2px; }
.cm-kpi-v3-metric-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
}
.cm-kpi-v3-metric-value { font-size: 18px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
.cm-kpi-v3-metric-sub { font-size: 10px; color: #94a3b8; }

/* ── Calendar date range picker ── */
.cm-cal-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; font-size: 12px; font-weight: 600; color: #0f172a;
  background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
  cursor: pointer; white-space: nowrap; min-width: 160px;
  transition: border-color .12s, box-shadow .12s;
}
.cm-cal-btn:hover { border-color: #94a3b8; box-shadow: 0 1px 4px rgba(15,23,42,.06); }
.cm-cal-btn span { flex: 1; text-align: left; }
.cm-cal-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 60;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  box-shadow: 0 8px 28px rgba(15,23,42,.13);
  padding: 14px; min-width: 240px;
  display: flex; flex-direction: column; gap: 10px;
}
.cm-cal-title { font-size: 12px; font-weight: 700; color: #0f172a; }
.cm-cal-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.cm-cal-quick-btn {
  padding: 5px 8px; font-size: 11px; font-weight: 600; color: #475569;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px;
  cursor: pointer; text-align: center; transition: all .12s;
}
.cm-cal-quick-btn:hover { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; }
.cm-cal-divider {
  font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;
  font-weight: 700; text-align: center;
  border-top: 1px solid #f1f5f9; padding-top: 8px;
}
.cm-cal-inputs { display: flex; flex-direction: column; gap: 7px; }
.cm-cal-input-row { display: flex; flex-direction: column; gap: 3px; }
.cm-cal-input-row label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.cm-cal-input-row input { padding: 6px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 7px; outline: none; }
.cm-cal-input-row input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px #6366f120; }

/* ── Spec Change Modal ── */
.scm-shell { display: flex; flex-direction: column; gap: 16px; padding-top: 4px; }
.scm-summary {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.scm-sum-card {
  flex: 1; min-width: 110px; padding: 12px 14px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
  display: flex; flex-direction: column; gap: 3px;
}
.scm-sum-card.accent { background: linear-gradient(135deg, #f0fdf4, #fafcff); border-color: #bbf7d0; }
.scm-sum-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
.scm-sum-value { font-size: 22px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }

.scm-changes { display: flex; flex-direction: column; gap: 8px; }
.scm-changes-title {
  font-size: 13px; font-weight: 800; color: #0f172a;
  display: flex; align-items: center; gap: 6px;
  padding-bottom: 6px; border-bottom: 1px solid #f1f5f9;
}
.scm-change {
  padding: 10px 14px; border-radius: 10px; border: 1px solid;
  display: flex; flex-direction: column; gap: 6px;
}
.scm-change.upgrade   { background: #fff8f8; border-color: #fecaca; }
.scm-change.downgrade { background: #f0fdf4; border-color: #bbf7d0; }
.scm-change-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scm-change-badge {
  font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.scm-change-badge.upgrade   { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.scm-change-badge.downgrade { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.scm-change-ns { font-size: 12px; font-weight: 700; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: 1; }
.scm-change-time { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.scm-change-detail { display: flex; flex-wrap: wrap; gap: 10px; }
.scm-change-spec, .scm-change-cost {
  font-size: 12px; color: #475569; background: #f8fafc; padding: 3px 8px;
  border-radius: 6px; border: 1px solid #e2e8f0;
  display: flex; align-items: center; gap: 4px;
}
.scm-no-changes {
  padding: 24px; background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 12px; text-align: center; font-size: 13px;
  font-weight: 700; color: #166534;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}

@media (max-width: 820px) {
  .cm-kpi-v3 { flex-direction: column; }
  .cm-kpi-v3-card { border-right: none; border-bottom: 1px solid #eef1f6; }
  .cm-kpi-v3-metrics { border-left: none; border-top: 1px solid #eef1f6; flex-direction: row; flex-wrap: wrap; }
}

/* ── Calendar grid date picker ── */
.cm-cal-panel { min-width: 270px; }
.cm-cal-quick { grid-template-columns: 1fr 1fr 1fr; }
.cm-cal-month-nav {
  display: flex; align-items: center; justify-content: space-between;
  margin: 4px 0 6px;
}
.cm-cal-month-lbl { font-size: 12px; font-weight: 700; color: #0f172a; }
.cm-cal-nav-btn {
  background: none; border: 1px solid #e2e8f0; border-radius: 5px;
  padding: 1px 8px; cursor: pointer; color: #475569; font-size: 14px;
  transition: background .1s;
}
.cm-cal-nav-btn:hover:not(:disabled) { background: #f1f5f9; }
.cm-cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-bottom: 8px;
}
.cm-cal-dow {
  font-size: 9px; color: #94a3b8; text-align: center; font-weight: 700;
  padding: 2px 0 5px; text-transform: uppercase;
}
.cm-cal-day {
  font-size: 11px; text-align: center; padding: 5px 2px;
  border-radius: 4px; color: #374151; transition: background .1s; user-select: none;
}
.cm-cal-day:hover:not([style*="not-allowed"]) { background: #f1f5f9; }
.cm-cal-day.sel { background: #6366f1; color: #fff; font-weight: 700; border-radius: 5px; }
.cm-cal-day.in-range { background: #e0e7ff; color: #4338ca; border-radius: 0; }
.cm-cal-day.today { font-weight: 800; color: #6366f1; }
.cm-cal-day.today:not(.sel) { box-shadow: inset 0 0 0 1.5px #6366f180; border-radius: 4px; }
.cm-cal-sel-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 2px 6px; gap: 6px;
}
.cm-cal-sel-label {
  font-size: 11px; color: #475569; font-weight: 600; font-variant-numeric: tabular-nums;
  flex: 1;
}
.cm-cal-clear-btn {
  background: none; border: none; cursor: pointer; color: #94a3b8;
  font-size: 12px; padding: 0 2px;
}
.cm-cal-clear-btn:hover { color: #ef4444; }

/* ── Cost Breakdown Modal ── */
.cbd-shell { display: flex; flex-direction: column; gap: 20px; }
.cbd-grand {
  display: flex; align-items: baseline; gap: 12px;
  background: linear-gradient(135deg,#6366f110,#10b98108);
  border: 1px solid #6366f120; border-radius: 10px; padding: 14px 18px;
}
.cbd-grand-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
.cbd-grand-value { font-size: 28px; font-weight: 800; color: #1e293b; letter-spacing: -.5px; }
.cbd-grand-sub { font-size: 11px; color: #94a3b8; margin-left: auto; }
.cbd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 700px) { .cbd-cols { grid-template-columns: 1fr; } }
.cbd-col { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
.cbd-col-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .06em;
  margin-bottom: 12px;
}
.cbd-bar-row {
  display: grid; grid-template-columns: 90px 1fr 60px 36px;
  align-items: center; gap: 8px; margin-bottom: 8px;
}
.cbd-bar-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cbd-bar-track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.cbd-bar-fill { height: 100%; border-radius: 4px; transition: width .4s ease; }
.cbd-bar-val { font-size: 11px; font-weight: 700; color: #1e293b; text-align: right; white-space: nowrap; }
.cbd-bar-pct { font-size: 10px; color: #94a3b8; text-align: right; }
.cbd-trend { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }

/* ── Price Timeline ── */
.cm-kpi-strip-row { display: flex; align-items: flex-start; gap: 10px; }
.cm-kpi-strip-row > .cm-kpi-v3 { flex: 1; min-width: 0; }
.cm-tl-trigger {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  border: 1px solid #e2e8f0; background: #fff; border-radius: 10px;
  padding: 10px 8px; cursor: pointer; color: #64748b; font-size: 10px; font-weight: 700;
  transition: all .2s; white-space: nowrap; min-width: 58px;
  box-shadow: 0 1px 4px #0000000a;
}
.cm-tl-trigger:hover { border-color: #6366f1; color: #6366f1; background: #f5f3ff; }
.cm-tl-trigger.active { border-color: #6366f1; color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 2px #6366f120; }
.cm-tl-panel {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  margin-bottom: 14px; overflow: hidden;
  box-shadow: 0 2px 12px #0000000d;
}
.cm-tl-header {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  border-bottom: 1px solid #f1f5f9; background: #fafbff;
}
.cm-tl-header-left { display: flex; align-items: center; gap: 6px; flex: 1; }
.cm-tl-title { font-size: 12px; font-weight: 800; color: #1e293b; }
.cm-tl-scope-badge {
  font-size: 10px; font-weight: 700; background: #6366f110; color: #6366f1;
  border: 1px solid #6366f130; border-radius: 5px; padding: 1px 7px;
}
.cm-tl-view-tabs { display: flex; gap: 2px; background: #f1f5f9; border-radius: 7px; padding: 2px; }
.cm-tl-tab {
  font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 5px;
  border: none; background: transparent; cursor: pointer; color: #64748b;
  transition: all .15s;
}
.cm-tl-tab.active { background: #fff; color: #6366f1; box-shadow: 0 1px 3px #0000001a; }
.cm-tl-close {
  background: none; border: none; cursor: pointer; color: #94a3b8;
  padding: 4px; border-radius: 5px;
}
.cm-tl-close:hover { color: #ef4444; background: #fee2e2; }
.cm-tl-legend {
  display: flex; gap: 14px; flex-wrap: wrap; padding: 6px 16px;
  border-bottom: 1px solid #f1f5f9; font-size: 10px; font-weight: 600;
}
.cm-tl-leg-item { display: flex; align-items: center; gap: 3px; }
.cm-tl-scroll-wrap { overflow-x: auto; overflow-y: visible; padding: 10px 16px 16px; }
.cm-tl-scroll-wrap::-webkit-scrollbar { height: 5px; }
.cm-tl-scroll-wrap::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
.cm-tl-scroll-wrap::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.cm-tl-loading { display: flex; align-items: center; justify-content: center; padding: 24px; font-size: 12px; color: #94a3b8; }
.cm-tl-track-outer { position: relative; }

/* Change badges row */
.cm-tl-change-row { display: flex; min-height: 52px; align-items: flex-end; padding-bottom: 4px; }
.cm-tl-change-cell { display: flex; justify-content: center; align-items: flex-end; flex-shrink: 0; }
.cm-tl-change-badge {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  font-size: 9px; font-weight: 700; border: 1px solid; border-radius: 5px;
  padding: 2px 5px; background: #fff; white-space: nowrap; line-height: 1.3;
  max-width: 100px;
}
.cm-tl-change-delta { font-size: 9px; opacity: .85; }

/* The dotted track line + dots */
.cm-tl-track-line-row {
  display: flex; align-items: center; position: relative; height: 24px;
}
.cm-tl-track-line-row::before {
  content: ""; position: absolute; left: 40px; right: 0; top: 50%;
  height: 2px; background: linear-gradient(90deg,#6366f1,#a5b4fc); transform: translateY(-50%);
}
.cm-tl-point-wrap {
  display: flex; justify-content: center; align-items: center;
  position: relative; flex-shrink: 0; z-index: 1;
}
.cm-tl-dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid #fff; box-shadow: 0 1px 4px #00000022;
  transition: transform .2s;
}

/* Bottom labels */
.cm-tl-label-row { display: flex; padding-top: 6px; }
.cm-tl-label-cell { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.cm-tl-label-time { font-size: 9px; color: #94a3b8; font-weight: 600; white-space: nowrap; }
.cm-tl-label-cost { font-size: 10px; color: #1e293b; font-weight: 700; white-space: nowrap; margin-top: 1px; }
.cm-tl-label-cum  { font-size: 9px; color: #6366f1; font-weight: 700; white-space: nowrap; margin-top: 1px; }

/* ════ PRICE TIMELINE MODAL (pth-*) ════ */

/* ── Animations ── */
@keyframes pth-fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
@keyframes pth-slidein { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
@keyframes pth-pulse {
  0%   { transform:scale(1);   opacity:1; }
  60%  { transform:scale(2.8); opacity:0; }
  100% { transform:scale(2.8); opacity:0; }
}
@keyframes pth-pin-spin {
  from { transform:rotate(0deg); }
  to   { transform:rotate(360deg); }
}
@keyframes pth-bar-in { from{transform:scaleY(0)} to{transform:scaleY(1)} }

.pth-overlay {
  position: fixed; inset: 0; z-index: 9900;
  background: rgba(10,15,30,0.65); backdrop-filter: blur(6px);
  display: flex; align-items: stretch; justify-content: center;
  animation: pth-fadein .2s ease-out;
}
.pth-window {
  width: 100%; max-width: 100%;
  background: #0f1728; display: flex; flex-direction: column;
  box-shadow: 0 30px 80px #00000060;
}

/* ── Header ── */
.pth-header {
  display: flex; align-items: center; gap: 10px; padding: 11px 18px;
  background: linear-gradient(90deg,#111827,#1e2640);
  border-bottom: 1px solid #1e2d4a; flex-shrink: 0;
}
.pth-title { font-size: 14px; font-weight: 800; color: #e2e8f0; letter-spacing:.02em; }
.pth-scope-badge {
  font-size: 10px; font-weight: 700; background: #6366f122; color: #818cf8;
  border: 1px solid #6366f135; border-radius: 6px; padding: 2px 8px;
}
.pth-gran-pill {
  font-size: 10px; font-weight: 600; background: #1e2d4a; color: #64748b;
  border-radius: 5px; padding: 2px 7px; border: 1px solid #2d3d5a;
}
.pth-zoom-ctrl { display:flex; align-items:center; gap:4px; margin-left:4px; }
.pth-zoom-btn {
  width:22px; height:22px; border:1px solid #2d3d5a; border-radius:5px;
  background:#1e2d4a; cursor:pointer; font-size:14px; font-weight:700;
  display:flex; align-items:center; justify-content:center; color:#94a3b8;
  transition:all .15s;
}
.pth-zoom-btn:hover { background:#6366f1; border-color:#6366f1; color:#fff; }
.pth-zoom-val { font-size:10px; font-weight:700; color:#64748b; min-width:32px; text-align:center; }
.pth-theme-btn {
  background:none; border:1px solid #2d3d5a; border-radius:6px;
  padding:4px 8px; cursor:pointer; font-size:14px; line-height:1;
  color:#94a3b8; transition:all .15s; margin-left:4px;
}
.pth-theme-btn:hover { background:#6366f120; border-color:#6366f1; }
.pth-close {
  margin-left:auto; background:none; border:none; cursor:pointer;
  color:#475569; padding:6px; border-radius:6px; display:flex; align-items:center;
  transition:all .15s;
}
.pth-close:hover { background:#7f1d1d55; color:#ef4444; }

/* ══ Light theme overrides ══ */
.pth-light .pth-window { background:#f8fafc; }
.pth-light .pth-header {
  background:linear-gradient(90deg,#f1f5f9,#e8edf5);
  border-bottom:1px solid #e2e8f0;
}
.pth-light .pth-title { color:#1e293b; }
.pth-light .pth-scope-badge { background:#eef2ff; color:#4338ca; border-color:#c7d2fe; }
.pth-light .pth-gran-pill { background:#f1f5f9; color:#64748b; border-color:#e2e8f0; }
.pth-light .pth-zoom-btn { background:#f1f5f9; border-color:#e2e8f0; color:#64748b; }
.pth-light .pth-zoom-val { color:#475569; }
.pth-light .pth-theme-btn { border-color:#e2e8f0; color:#64748b; }
.pth-light .pth-close { color:#64748b; }
.pth-light .pth-close:hover { background:#fee2e220; color:#ef4444; }

.pth-light .pth-sidebar {
  background:linear-gradient(180deg,#f8fafc,#f1f5f9);
  border-right:1px solid #e2e8f0;
}
.pth-light .pth-sidebar::-webkit-scrollbar-thumb { background:#cbd5e1; }
.pth-light .pth-preset-btn {
  background:#fff; border-color:#e2e8f0; color:#475569;
}
.pth-light .pth-preset-btn:hover { background:#6366f1; border-color:#6366f1; color:#fff; }
.pth-light .pth-cal { border-top-color:#e2e8f0; }
.pth-light .pth-cal-nav button { border-color:#e2e8f0; color:#64748b; }
.pth-light .pth-cal-nav span { color:#1e293b; }
.pth-light .pth-cal-day { color:#475569; }
.pth-light .pth-cal-day.today { color:#6366f1; }
.pth-light .pth-cal-day.future { color:#cbd5e1; }
.pth-light .pth-cal-info { color:#94a3b8; }
.pth-light .pth-stats-box { border-top-color:#e2e8f0; }
.pth-light .pth-stat-lbl { color:#94a3b8; }
.pth-light .pth-stat-val { color:#1e293b; }
.pth-light .pth-legend { border-top-color:#e2e8f0; }
.pth-light .pth-leg-row:hover { background:#f1f5f9; }

.pth-light .pth-main { background:#fff; }
.pth-light .pth-center { color:#94a3b8; }
.pth-light .pth-tl-scroll {
  background:linear-gradient(180deg,#f8fafc 0%,#fff 100%);
}
.pth-light .pth-tl-scroll::-webkit-scrollbar-track { background:#f1f5f9; }
.pth-light .pth-tl-scroll::-webkit-scrollbar-thumb { background:#cbd5e1; }
.pth-light .pth-tl-line::before {
  background:linear-gradient(90deg,#e2e8f0,#cbd5e1 20%,#6366f1 50%,#cbd5e1 80%,#e2e8f0);
}
.pth-light .pth-dot { border-color:#fff; }
.pth-light .pth-lbl-cell.active { background:#eef2ff; }
.pth-light .pth-lbl-time   { color:#64748b; }
.pth-light .pth-lbl-period { color:#94a3b8; }
.pth-light .pth-lbl-cell.active .pth-lbl-time { color:#6366f1; }
.pth-light .pth-lbl-cum    { color:#6366f1; }

.pth-light .pth-pin-panel { background:#f8fafc; border-top-color:#6366f1; }
.pth-light .pth-pin-header { background:#eef2ff; border-bottom-color:#e2e8f0; }
.pth-light .pth-pin-time { color:#1e293b; }
.pth-light .pth-pin-kpis { color:#64748b; }
.pth-light .pth-pin-close { color:#94a3b8; }
.pth-light .pth-pin-close:hover { background:#fee2e2; color:#ef4444; }
.pth-light .pth-pin-diffs { border-right-color:#e2e8f0; }

.pth-light .pth-tooltip {
  background:#fff; border-color:#e2e8f0;
  box-shadow:0 8px 30px #00000015,0 0 0 1px #6366f110;
}
.pth-light .pth-tip-time { background:#f8fafc; color:#1e293b; border-bottom-color:#e2e8f0; }
.pth-light .pth-tip-kpis { border-bottom-color:#e2e8f0; }
.pth-light .pth-tip-kpis > div { border-right-color:#e2e8f0; }
.pth-light .pth-tip-lbl { color:#94a3b8; }
.pth-light .pth-tip-val { color:#1e293b; }
.pth-light .pth-tip-evt { background:#f8fafc; border-top-color: currentColor; }
.pth-light .pth-tip-diff { border-top-color:#e2e8f0; }
.pth-light .pth-tip-diff-ns { color:#64748b; }
.pth-light .pth-tip-diff-row { color:#475569; }
.pth-light .pth-tip-ns { border-top-color:#e2e8f0; }
.pth-light .pth-tip-ns-hdr { color:#94a3b8; }
.pth-light .pth-tip-ns-name { color:#64748b; }
.pth-light .pth-tip-ns-bar-wrap { background:#e2e8f0; }

.pth-body { display:flex; flex:1; min-height:0; overflow:hidden; }

/* ── Left sidebar ── */
.pth-sidebar {
  width:230px; flex-shrink:0;
  background:linear-gradient(180deg,#111827,#0f1728);
  border-right:1px solid #1e2d4a; overflow-y:auto;
  display:flex; flex-direction:column;
}
.pth-sidebar::-webkit-scrollbar { width:4px; }
.pth-sidebar::-webkit-scrollbar-thumb { background:#2d3d5a; border-radius:4px; }

.pth-presets { display:flex; flex-direction:column; gap:3px; padding:14px 12px 8px; }
.pth-preset-btn {
  width:100%; text-align:left; padding:6px 10px; border-radius:7px;
  border:1px solid #1e2d4a; background:#1a2338; cursor:pointer;
  font-size:11px; font-weight:600; color:#94a3b8; transition:all .15s;
}
.pth-preset-btn:hover { background:#6366f1; border-color:#6366f1; color:#fff; transform:translateX(2px); }

/* Calendar */
.pth-cal { padding:8px 12px; border-top:1px solid #1e2d4a; }
.pth-cal-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.pth-cal-nav button {
  background:none; border:1px solid #1e2d4a; border-radius:5px;
  width:24px; height:24px; cursor:pointer; color:#64748b; font-size:14px;
  display:flex; align-items:center; justify-content:center; transition:all .15s;
}
.pth-cal-nav button:hover { background:#6366f1; color:#fff; border-color:#6366f1; }
.pth-cal-nav span { font-size:11px; font-weight:700; color:#cbd5e1; }
.pth-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; }
.pth-cal-dow { font-size:9px; color:#475569; font-weight:700; text-align:center; padding:2px 0; }
.pth-cal-empty { height:26px; }
.pth-cal-day {
  font-size:11px; text-align:center; padding:5px 2px; border-radius:4px;
  cursor:pointer; color:#94a3b8; transition:all .12s;
}
.pth-cal-day:hover:not(.future) { background:#6366f122; color:#818cf8; }
.pth-cal-day.sel { background:#6366f1; color:#fff; font-weight:700; box-shadow:0 0 8px #6366f160; }
.pth-cal-day.in-range { background:#6366f115; color:#818cf8; border-radius:0; }
.pth-cal-day.today { font-weight:800; color:#a5b4fc; }
.pth-cal-day.today.sel { color:#fff; }
.pth-cal-day.future { color:#1e2d4a; cursor:not-allowed; }
.pth-cal-info { font-size:10px; color:#475569; margin-top:6px; text-align:center; min-height:16px; }
.pth-cal-hint { color:#334155; font-style:italic; }

/* Stats box */
.pth-stats-box {
  padding:10px 12px; border-top:1px solid #1e2d4a;
  display:flex; flex-direction:column; gap:6px;
}
.pth-stat-row { display:flex; justify-content:space-between; align-items:center; }
.pth-stat-lbl { font-size:9px; color:#475569; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.pth-stat-val { font-size:13px; font-weight:800; color:#e2e8f0; }

/* Legend */
.pth-legend { padding:10px 12px; border-top:1px solid #1e2d4a; display:flex; flex-direction:column; gap:5px; }
.pth-leg-row {
  font-size:10px; font-weight:600; display:flex; align-items:center; gap:6px;
  padding:3px 6px; border-radius:5px;
}
.pth-leg-row:hover { background:#1e2d4a; }

/* ── Main timeline area ── */
.pth-main { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; background:#0f1728; }
.pth-center { flex:1; display:flex; align-items:center; justify-content:center; font-size:13px; color:#475569; gap:8px; }

.pth-tl-scroll {
  flex:1; overflow-x:auto; overflow-y:hidden; padding:14px 20px 16px;
  background:linear-gradient(180deg,#111827 0%,#0f1728 100%);
}
.pth-tl-scroll::-webkit-scrollbar { height:6px; }
.pth-tl-scroll::-webkit-scrollbar-track { background:#1e2d4a; border-radius:4px; }
.pth-tl-scroll::-webkit-scrollbar-thumb { background:#334155; border-radius:4px; }
.pth-tl-scroll::-webkit-scrollbar-thumb:hover { background:#6366f1; }
.pth-tl-inner { position:relative; user-select:none; }

/* SVG sparkline */
.pth-sparkline { display:block; border-radius:8px; margin-bottom:2px; }

/* Event flags row */
.pth-tl-events { display:flex; min-height:40px; align-items:flex-end; padding-bottom:0; }
.pth-tl-ev-cell { display:flex; justify-content:center; align-items:flex-end; flex-shrink:0; }
.pth-ev-flag-wrap { display:flex; flex-direction:column; align-items:center; gap:0; animation:pth-slidein .2s ease-out; }
.pth-ev-flag {
  width:22px; height:22px; border-radius:5px; border:1.5px solid;
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:800; cursor:default;
  box-shadow:0 2px 8px #00000030;
  transition:transform .15s;
}
.pth-ev-flag:hover { transform:scale(1.15); }
.pth-ev-connector {
  width:2px; height:10px; border-radius:1px;
}

/* Track line + dots */
.pth-tl-line {
  display:flex; align-items:center; height:32px; position:relative;
}
.pth-tl-line::before {
  content:""; position:absolute; left:0; right:0; top:50%; height:2px;
  background:linear-gradient(90deg,#1e2d4a,#334155 20%,#6366f1 50%,#334155 80%,#1e2d4a);
  transform:translateY(-50%); border-radius:2px;
}
.pth-dot-wrap {
  display:flex; justify-content:center; align-items:center;
  flex-shrink:0; position:relative; z-index:2; cursor:pointer;
  transition:transform .15s;
}
.pth-dot-wrap:hover { transform:scale(1.1); }
.pth-dot {
  border-radius:50%; border:2px solid #0f1728;
  transition:width .2s,height .2s,box-shadow .2s;
  position:relative; z-index:3;
}
/* Pulse ring on event dots */
.pth-dot-pulse {
  position:absolute; width:100%; height:100%; border-radius:50%;
  border:2px solid var(--pc,#6366f1);
  animation:pth-pulse 2s ease-out infinite; z-index:1; pointer-events:none;
}
/* Pin ring */
.pth-dot-pin-ring {
  position:absolute; width:20px; height:20px; border-radius:50%;
  border:2px dashed var(--pc,#6366f1);
  animation:pth-pin-spin 3s linear infinite; z-index:1; pointer-events:none;
  opacity:0.7;
}

/* Mini bars */
.pth-tl-bars { display:flex; align-items:flex-end; height:34px; padding-top:4px; }
.pth-bar-cell { display:flex; justify-content:center; align-items:flex-end; flex-shrink:0; }
.pth-bar {
  width:6px; border-radius:2px 2px 0 0;
  transform-origin:bottom; animation:pth-bar-in .4s ease-out;
}

/* Labels */
.pth-tl-labels { display:flex; padding-top:6px; border-top:1px solid #1e2d4a; margin-top:4px; }
.pth-lbl-cell {
  display:flex; flex-direction:column; align-items:center; flex-shrink:0;
  padding:4px 0; border-radius:5px; transition:background .15s;
}
.pth-lbl-cell.active { background:#1e2d4a; }
.pth-lbl-time   { font-size:9px;  color:#475569; font-weight:600; white-space:nowrap; }
.pth-lbl-period { font-size:10px; color:#94a3b8; font-weight:700; white-space:nowrap; margin-top:2px; transition:color .15s; }
.pth-lbl-cell.active .pth-lbl-time { color:#818cf8; }
.pth-lbl-cum    { font-size:9px;  color:#6366f1; font-weight:800; white-space:nowrap; margin-top:1px; }

/* ── Pinned detail panel ── */
.pth-pin-panel {
  flex-shrink:0; background:#111827; border-top:2px solid #6366f1;
  max-height:200px; overflow-y:auto; display:flex; flex-direction:column;
  animation:pth-fadein .2s ease-out;
}
.pth-pin-header {
  display:flex; align-items:center; gap:10px; padding:8px 14px;
  background:#1a2338; border-bottom:1px solid #1e2d4a; flex-shrink:0; flex-wrap:wrap;
}
.pth-pin-time { font-size:11px; font-weight:800; color:#e2e8f0; }
.pth-pin-kpis { display:flex; gap:14px; font-size:11px; color:#64748b; }
.pth-pin-evt { font-size:11px; font-weight:700; }
.pth-pin-close {
  margin-left:auto; background:none; border:none; cursor:pointer;
  color:#475569; padding:4px; border-radius:5px; display:flex; align-items:center; transition:all .15s;
}
.pth-pin-close:hover { background:#7f1d1d55; color:#ef4444; }
.pth-pin-body { display:flex; gap:0; overflow:hidden; flex:1; }
.pth-pin-diffs { min-width:260px; padding:8px 12px; border-right:1px solid #1e2d4a; overflow-y:auto; }
.pth-pin-ns { flex:1; padding:8px 12px; overflow-y:auto; }

/* ── Hover tooltip ── */
.pth-tooltip {
  z-index:9999; width:310px; max-width:310px;
  background:#111827; border:1px solid #1e2d4a; border-radius:12px;
  box-shadow:0 12px 40px #00000050,0 0 0 1px #6366f115;
  overflow:hidden; pointer-events:none;
  animation:pth-fadein .15s ease-out;
}
.pth-tip-time {
  font-size:11px; font-weight:700; color:#e2e8f0; padding:8px 12px 6px;
  background:linear-gradient(90deg,#1a2338,#111827); border-bottom:1px solid #1e2d4a;
}
.pth-tip-kpis { display:grid; grid-template-columns:repeat(3,1fr); border-bottom:1px solid #1e2d4a; }
.pth-tip-kpis > div {
  display:flex; flex-direction:column; align-items:center; padding:7px 4px;
  border-right:1px solid #1e2d4a;
}
.pth-tip-kpis > div:last-child { border-right:none; }
.pth-tip-lbl { font-size:8.5px; color:#475569; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.pth-tip-val { font-size:12px; font-weight:800; color:#e2e8f0; margin-top:2px; }

/* Change event block */
.pth-tip-evt { padding:7px 10px; border-top:2px solid; font-size:10px; background:#0f1728; }
.pth-tip-evt-title { font-weight:800; font-size:11px; margin-bottom:4px; }
.pth-tip-diff { padding:4px 0 2px; border-top:1px solid #1e2d4a; }
.pth-tip-diff-ns { font-size:10px; font-weight:700; color:#94a3b8; margin-bottom:2px; }
.pth-tip-diff-row { font-size:10px; color:#64748b; line-height:1.7; }

/* Namespace breakdown */
.pth-tip-ns { padding:7px 10px; border-top:1px solid #1e2d4a; }
.pth-tip-ns-hdr { font-size:9px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:.05em; margin-bottom:5px; }
.pth-tip-ns-row { margin-bottom:6px; }
.pth-tip-ns-name { font-size:9.5px; font-weight:600; color:#94a3b8; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pth-tip-ns-bar-wrap { height:4px; background:#1e2d4a; border-radius:2px; margin-bottom:2px; }
.pth-tip-ns-bar { height:100%; background:linear-gradient(90deg,#6366f1,#818cf8); border-radius:2px; transition:width .4s ease-out; }
.pth-tip-ns-vals { display:flex; gap:6px; font-size:9px; color:#475569; font-weight:600; flex-wrap:wrap; }

/* ══ KPI REFERENCE PERIOD PICKER (cm-kpi-ref-*) ══ */
/* Per-card calendar picker */
.cm-kpi-v3-card-wrap {
  flex:1; min-width:180px; position:relative; display:flex; flex-direction:column;
  border-right:1px solid #eef1f6;
}
.cm-kpi-v3-card-wrap:first-child .cm-kpi-v3-card { border-radius:14px 0 0 14px; }
.cm-kpi-v3-card-wrap:last-child { border-right:none; }
.cm-kpi-v3-label-row { display:flex; align-items:center; justify-content:space-between; gap:4px; margin-bottom:2px; }
.cm-kpi-v3-cal-btn {
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  width:22px; height:22px; border-radius:6px; border:1px solid #e2e8f0;
  background:#f8fafc; color:#94a3b8; cursor:pointer; transition:all .15s;
}
.cm-kpi-v3-cal-btn:hover { background:#eef2ff; border-color:#6366f1; color:#6366f1; }
.cm-kpi-v3-cal-btn.active { box-shadow:0 0 0 2px currentColor; }
.cm-kpi-v3-custom-dot {
  display:inline-block; width:5px; height:5px; border-radius:50%; flex-shrink:0;
}

.cm-kpi-picker-dd {
  position:absolute; top:calc(100% + 6px); left:0; z-index:700;
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  box-shadow:0 12px 40px #00000018,0 2px 8px #0000000a;
  padding:12px; min-width:210px; animation:pth-fadein .15s ease-out;
}
.cm-kpi-picker-hdr {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:10px;
}
.cm-kpi-picker-reset {
  padding:3px 8px; border-radius:5px; border:1px solid #fca5a5;
  background:#fff; font-size:9px; font-weight:700; color:#ef4444;
  cursor:pointer; transition:all .12s;
}
.cm-kpi-picker-reset:hover { background:#fee2e2; }
.cm-kpi-picker-cal-nav {
  display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
}
.cm-kpi-picker-cal-nav button {
  background:none; border:1px solid #e2e8f0; border-radius:5px;
  width:22px; height:22px; cursor:pointer; color:#64748b; font-size:13px;
  display:flex; align-items:center; justify-content:center; transition:all .15s;
}
.cm-kpi-picker-cal-nav button:hover { background:#6366f1; color:#fff; border-color:#6366f1; }
.cm-kpi-picker-cal-nav span { font-size:11px; font-weight:800; color:#1e293b; }
.cm-kpi-picker-months-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }
.cm-kpi-picker-mo-btn {
  padding:5px 2px; border-radius:5px; border:1px solid #e2e8f0;
  background:#f8fafc; font-size:10px; font-weight:600; color:#475569;
  cursor:pointer; transition:all .15s; text-align:center;
}
.cm-kpi-picker-mo-btn:hover:not(.future):not(:disabled) { background:#eef2ff; border-color:#6366f1; color:#4338ca; }
.cm-kpi-picker-mo-btn.active { color:#fff; box-shadow:0 0 0 2px currentColor4; }
.cm-kpi-picker-mo-btn.future,.cm-kpi-picker-mo-btn:disabled { color:#cbd5e1; cursor:not-allowed; }
.cm-kpi-picker-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; margin-top:4px; }
.cm-kpi-picker-cal-dow { font-size:8px; color:#94a3b8; font-weight:700; text-align:center; padding:2px 0; }
.cm-kpi-picker-cal-day {
  font-size:10px; text-align:center; padding:4px 1px; border-radius:4px; border:none;
  cursor:pointer; color:#334155; background:none; transition:all .12s;
}
.cm-kpi-picker-cal-day:hover:not(.future):not(:disabled) { background:#e0e7ff; color:#4338ca; }
.cm-kpi-picker-cal-day.sel { color:#fff; font-weight:700; }
.cm-kpi-picker-cal-day.today { font-weight:800; color:#6366f1; }
.cm-kpi-picker-cal-day.future,.cm-kpi-picker-cal-day:disabled { color:#cbd5e1; cursor:not-allowed; }
`;





