/**
 * EnvUptimeDashboard — uptime analytics for User, Admin, and DevOps.
 *
 * Shows a Gantt-style timeline per environment for the selected product.
 * Environments are loaded from the project configuration (custom envs included).
 * DevOps: Start/Stop/Auto buttons + click any env card to see its full cycle history.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronDown, X, Clock, Play, Square, RotateCcw as AutoIcon } from 'lucide-react';
import EnvUptimeChart, { ENV_COLORS, resolveEnvColor } from '../components/EnvUptimeChart';
import ProjectMonitoringView from './ProjectMonitoringView';
import ResourceMonitoringDashboard from './ResourceMonitoringDashboard';
import CostMonitoringDashboard from './CostMonitoringDashboard';
import CostManagementDashboard from './CostManagementDashboard';
import {
    getMonitoringProducts,
    getUptimeSessions,
    setManualEnvControl,
    getProjectList,
} from '../services/monitoringService';
import { useToast } from '../services/ToastNotification';
import { useLiveEnvSummary } from '../services/useAnyEnvLive';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXTRA_COLORS = [
    '#06b6d4','#f97316','#84cc16','#ec4899',
    '#14b8a6','#a855f7','#eab308','#f43f5e',
];

function buildEnvColors(envs) {
    const colors = { ...ENV_COLORS };
    let extra = 0;
    for (const env of envs) {
        if (!colors[env]) colors[env] = EXTRA_COLORS[extra++ % EXTRA_COLORS.length];
    }
    return colors;
}

function isoToDate(iso) {
    return new Date(iso).toISOString().slice(0, 10);
}

function liveDuration(sinceIso) {
    if (!sinceIso) return null;
    let ms = Date.now() - new Date(sinceIso).getTime();
    if (ms < 0) ms = 0;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function fmtDatetime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtDuration(ms) {
    if (ms <= 0) return '0s';
    const sec = Math.floor(ms / 1000);
    const h   = Math.floor(sec / 3600);
    const m   = Math.floor((sec % 3600) / 60);
    const s   = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function fmtHours(totalHours) {
    if (!totalHours || totalHours <= 0) return null;
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvUptimeDashboard({ role = 'user' }) {
    const toast    = useToast();
    const isDevOps = role === 'devops';
    const { items: liveItems, refresh: refreshLive } = useLiveEnvSummary();

    const defaultTo   = isoToDate(new Date().toISOString());
    const defaultFrom = isoToDate(new Date(Date.now() - 30 * 86400e3).toISOString());

    const [products,        setProducts]        = useState([]);
    const [allProjects,     setAllProjects]      = useState([]);
    const [selectedProduct, setSelectedProduct]  = useState('');
    const [projectEnvs,     setProjectEnvs]      = useState([]);
    const [fromDate,        setFromDate]         = useState(defaultFrom);
    const [toDate,          setToDate]           = useState(defaultTo);
    const [sessions,        setSessions]         = useState([]);
    const [loading,         setLoading]          = useState(false);
    const [tick,            setTick]             = useState(0);
    const [controlLoading,  setControlLoading]   = useState('');
    const [detailEnv,       setDetailEnv]        = useState(null);
    const [devTab,          setDevTab]           = useState('env'); // 'env' | 'project' | 'resource' | 'cost'

    // 1-second tick for live timers
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    // Load products + all projects on mount
    useEffect(() => {
        getMonitoringProducts()
            .then(list => {
                const arr = Array.isArray(list) ? list : [];
                setProducts(arr);
                if (arr.length > 0) setSelectedProduct(arr[0]);
            })
            .catch(() => {});
        getProjectList()
            .then(list => setAllProjects(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []);

    // Update envs when product changes or projects load
    useEffect(() => {
        if (!selectedProduct) { setProjectEnvs([]); return; }
        const proj = allProjects.find(
            p => p.name?.toLowerCase() === selectedProduct.toLowerCase()
                || p.tag?.toLowerCase() === selectedProduct.toLowerCase()
        );
        if (proj?.environments?.length > 0) {
            setProjectEnvs([...proj.environments]);
        } else {
            setProjectEnvs([]);
        }
    }, [selectedProduct, allProjects]);

    // Environments to display: project config → session-derived → standard defaults
    const displayEnvs = useMemo(() => {
        if (projectEnvs.length > 0) return projectEnvs;
        const fromSessions = [...new Set(sessions.map(s => s.environment))];
        return fromSessions.length > 0 ? fromSessions : Object.keys(ENV_COLORS);
    }, [projectEnvs, sessions]);

    const envColors = useMemo(() => buildEnvColors(displayEnvs), [displayEnvs]);

    // Fetch sessions — extend from date by 90 days to catch long-running/previous cycles
    const fetchSessions = useCallback(async () => {
        if (!selectedProduct) return;
        setLoading(true);
        try {
            const extFrom = new Date(fromDate);
            extFrom.setDate(extFrom.getDate() - 90);
            const data = await getUptimeSessions({
                productName: selectedProduct,
                from: extFrom.toISOString().slice(0, 10),
                to: toDate,
            });
            setSessions(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error('Load failed', e.message || 'Could not load uptime data');
        } finally {
            setLoading(false);
        }
    }, [selectedProduct, fromDate, toDate, toast]);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    // Auto-refresh every 60 s — always active when a product is selected
    useEffect(() => {
        if (!selectedProduct) return;
        const id = setInterval(fetchSessions, 60_000);
        return () => clearInterval(id);
    }, [selectedProduct, fetchSessions]);

    // Per-environment status (recomputed each tick so live timers update)
    const envStatus = useMemo(() => {
        // eslint-disable-next-line no-unused-expressions
        tick;
        const map = {};
        for (const env of displayEnvs) {
            const live = sessions.filter(s => s.environment === env && s.endTime === null);
            const all  = sessions
                .filter(s => s.environment === env)
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            map[env] = {
                running:  live.length > 0,
                since:    live[0]?.startTime ?? null,
                duration: live.length > 0 ? liveDuration(live[0].startTime) : null,
                lastRan:  all[0]?.endTime ?? all[0]?.startTime ?? null,
                cycles:   all,
            };
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessions, displayEnvs, tick]);

    // Total hours per env in the user-selected date range (for display in cards)
    const envRangeHours = useMemo(() => {
        const rangeFromMs = new Date(fromDate + 'T00:00:00').getTime();
        const rangeToMs   = new Date(toDate   + 'T23:59:59').getTime();
        const map = {};
        for (const env of displayEnvs) {
            let totalMs = 0;
            sessions
                .filter(s => s.environment === env)
                .forEach(s => {
                    const start = Math.max(new Date(s.startTime).getTime(), rangeFromMs);
                    const end   = Math.min(s.endTime ? new Date(s.endTime).getTime() : Date.now(), rangeToMs);
                    if (end > start) totalMs += end - start;
                });
            map[env] = totalMs / 3_600_000;
        }
        return map;
    }, [sessions, displayEnvs, fromDate, toDate]);

    // Flat list of all currently-running product×env combos (all products, not just selected)
    const nowRunningItems = useMemo(() => {
        // eslint-disable-next-line no-unused-expressions
        tick;
        const items = [];
        liveItems.forEach(item => {
            const seen = new Set();
            (item.liveSessions || []).forEach(s => {
                if (!s.endTime && !seen.has(s.environment)) {
                    seen.add(s.environment);
                    items.push({
                        product:  item.product,
                        env:      s.environment,
                        since:    s.startTime,
                        duration: liveDuration(s.startTime) || '0s',
                    });
                }
            });
        });
        // oldest running first
        return items.sort((a, b) => new Date(a.since) - new Date(b.since));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveItems, tick]);

    const runningCount = displayEnvs.filter(e => envStatus[e]?.running).length;

    // DevOps manual control
    const handleControl = async (env, action) => {
        setControlLoading(env + action);
        try {
            await setManualEnvControl({ productName: selectedProduct, environment: env, action });
            toast.success('Updated', `${env} → ${action}`);
            await fetchSessions();
            refreshLive(); // also update the global "now running" panel immediately
        } catch (e) {
            toast.error('Control failed', e.message || 'Update failed');
        } finally {
            setControlLoading('');
        }
    };

    // DevOps cycle history detail
    const detailSessions = useMemo(() => {
        if (!detailEnv) return [];
        return sessions
            .filter(s => s.environment === detailEnv)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    }, [detailEnv, sessions, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="eud-wrap">

            {/* ── Tab switcher ──────────────────────────────────────────── */}
            <div className="eud-tabs">
                <button
                    className={`eud-tab${devTab === 'env' ? ' eud-tab--active' : ''}`}
                    onClick={() => setDevTab('env')}>
                    Environment Monitoring
                </button>
                <button
                    className={`eud-tab${devTab === 'resource' ? ' eud-tab--active' : ''}`}
                    onClick={() => setDevTab('resource')}>
                    Resource Monitoring
                </button>
                {isDevOps && (
                    <button
                        className={`eud-tab${devTab === 'project' ? ' eud-tab--active' : ''}`}
                        onClick={() => setDevTab('project')}>
                        Project Monitoring
                    </button>
                )}
                {isDevOps && (
                    <button
                        className={`eud-tab${devTab === 'cost' ? ' eud-tab--active' : ''}`}
                        onClick={() => setDevTab('cost')}>
                        Cost Monitoring
                    </button>
                )}
                {isDevOps && (
                    <button
                        className={`eud-tab${devTab === 'cost-mgmt' ? ' eud-tab--active' : ''}`}
                        onClick={() => setDevTab('cost-mgmt')}>
                        Cost Management
                    </button>
                )}
            </div>

            {/* ── Project Monitoring tab (DevOps only) ─────────────────── */}
            {isDevOps && devTab === 'project' && <ProjectMonitoringView />}

            {/* ── Resource Monitoring tab (shared) ─────────────────────── */}
            {devTab === 'resource' && <ResourceMonitoringDashboard role={role} />}

            {/* ── Cost Monitoring tab (DevOps only) ────────────────────── */}
            {isDevOps && devTab === 'cost' && <CostMonitoringDashboard />}

            {/* ── Cost Management tab (DevOps only — capacity-based) ───── */}
            {isDevOps && devTab === 'cost-mgmt' && <CostManagementDashboard />}

            {/* ── Environment Monitoring tab ────────────────────────────── */}
            {devTab === 'env' && <>

            {/* Now Running — all products (updates every second) */}
            {nowRunningItems.length > 0 && (
                <div className="eud-now-running" role="status" aria-label="Currently running environments">
                    <div className="eud-now-running-label">
                        <span className="eud-now-running-dot" aria-hidden="true" />
                        Now Running
                    </div>
                    <div className="eud-now-running-chips">
                        {nowRunningItems.map((item, i) => (
                            <div key={i} className="eud-running-chip">
                                <span className="eud-running-chip-product">{item.product}</span>
                                <span className="eud-running-chip-sep">·</span>
                                <span
                                    className="eud-running-chip-env"
                                    style={{ color: resolveEnvColor(item.env, ENV_COLORS, 0) }}
                                >
                                    {item.env}
                                </span>
                                <span className="eud-running-chip-dur">{item.duration}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Controls ──────────────────────────────────────────────── */}
            <div className="eud-controls">
                <div className="eud-cg">
                    <label className="eud-label">Product</label>
                    <div className="eud-select-wrap">
                        <select className="eud-select" value={selectedProduct}
                            onChange={e => { setSelectedProduct(e.target.value); setDetailEnv(null); }}>
                            {products.length === 0 && <option value="">No products</option>}
                            {products.map(p => {
                                const isUp = liveItems.some(item => item.product === p);
                                return <option key={p} value={p}>{isUp ? '▲ ' : '▽ '}{p}</option>;
                            })}
                        </select>
                        <ChevronDown size={12} className="eud-select-icon" />
                    </div>
                </div>

                <div className="eud-cg">
                    <label className="eud-label">From</label>
                    <input type="date" className="eud-input" value={fromDate}
                        max={toDate} onChange={e => setFromDate(e.target.value)} />
                </div>

                <div className="eud-cg">
                    <label className="eud-label">To</label>
                    <input type="date" className="eud-input" value={toDate}
                        min={fromDate} onChange={e => setToDate(e.target.value)} />
                </div>

                <button className="eud-refresh-btn" onClick={fetchSessions}
                    disabled={loading} title="Refresh now">
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>

                {selectedProduct && displayEnvs.length > 0 && (
                    <div className={`eud-summary-badge ${runningCount > 0 ? 'eud-summary-badge--up' : 'eud-summary-badge--down'}`}>
                        <span className="eud-summary-dot" />
                        {runningCount > 0
                            ? `${runningCount} / ${displayEnvs.length} running`
                            : 'All down'}
                    </div>
                )}
            </div>

            {/* ── Status cards ──────────────────────────────────────────── */}
            {displayEnvs.length > 0 && (
                <div className="eud-status-grid">
                    {displayEnvs.map(env => {
                        const st      = envStatus[env] || {};
                        const col     = resolveEnvColor(env, envColors, displayEnvs.indexOf(env));
                        const isSelected = detailEnv === env;
                        const rangeHrs   = envRangeHours[env] || 0;
                        const cycleCount = (st.cycles?.length ?? 0);
                        return (
                            <div key={env}
                                className={`eud-card ${st.running ? 'eud-card--up' : 'eud-card--down'}${isDevOps ? ' eud-card--clickable' : ''}${isSelected ? ' eud-card--selected' : ''}`}
                                onClick={() => isDevOps && setDetailEnv(prev => prev === env ? null : env)}>

                                <div className="eud-card-header">
                                    <span className="eud-env-dot" style={{ background: col }} />
                                    <span className="eud-env-name" title={env}>{env}</span>
                                    <span className={`eud-pill ${st.running ? 'eud-pill--up' : 'eud-pill--down'}`}>
                                        {st.running ? '▲ UP' : '▼ DOWN'}
                                    </span>
                                </div>

                                <div className="eud-card-timer">
                                    {st.running
                                        ? <><span className="eud-timer-label">Running </span><strong>{st.duration}</strong></>
                                        : st.lastRan
                                            ? <span className="eud-timer-label">Last active {new Date(st.lastRan).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                            : <span className="eud-timer-label">No activity</span>
                                    }
                                </div>

                                <div className="eud-card-hours-row">
                                    <span className="eud-card-hrs" title="Total hours in selected date range">
                                        {rangeHrs > 0 ? `${fmtHours(rangeHrs)} total` : 'No hours in range'}
                                    </span>
                                    {cycleCount > 0 && (
                                        <span className="eud-card-cycles">
                                            {cycleCount} cycle{cycleCount !== 1 ? 's' : ''}
                                            {isDevOps && (
                                                <span className="eud-click-hint">
                                                    {isSelected ? ' · close' : ' · details'}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>

                                {/* DevOps controls */}
                                {isDevOps && (
                                    <div className="eud-ctrl-row" onClick={e => e.stopPropagation()}>
                                        <button className="eud-ctrl start"
                                            onClick={() => handleControl(env, 'start')}
                                            disabled={!!controlLoading || st.running}
                                            title="Mark as UP (manual)">
                                            <Play size={9} /> Start
                                        </button>
                                        <button className="eud-ctrl stop"
                                            onClick={() => handleControl(env, 'stop')}
                                            disabled={!!controlLoading || !st.running}
                                            title="Mark as DOWN (manual)">
                                            <Square size={9} /> Stop
                                        </button>
                                        <button className="eud-ctrl auto"
                                            onClick={() => handleControl(env, 'auto')}
                                            disabled={!!controlLoading}
                                            title="Auto (ticket-based)">
                                            <AutoIcon size={9} /> Auto
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── DevOps: Cycle history panel ────────────────────────────── */}
            {isDevOps && detailEnv && (
                <div className="eud-detail-panel">
                    <div className="eud-detail-header">
                        <span className="eud-env-dot"
                            style={{ background: resolveEnvColor(detailEnv, envColors, displayEnvs.indexOf(detailEnv)) }} />
                        <strong>{detailEnv}</strong>
                        <span className="eud-detail-sub">— {selectedProduct}</span>
                        <button className="eud-detail-close" onClick={() => setDetailEnv(null)}>
                            <X size={14} />
                        </button>
                    </div>

                    {detailSessions.length === 0 ? (
                        <p className="eud-detail-empty">No cycles in this date range.</p>
                    ) : (
                        <div className="eud-detail-table-wrap">
                            <table className="eud-detail-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Started</th>
                                        <th>Stopped</th>
                                        <th>Duration</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailSessions.map((s, i) => {
                                        const isLive  = s.endTime === null;
                                        const endMs   = isLive ? Date.now() : new Date(s.endTime).getTime();
                                        const startMs = new Date(s.startTime).getTime();
                                        const durMs   = endMs - startMs;
                                        return (
                                            <tr key={i} className={isLive ? 'eud-detail-row--live' : ''}>
                                                <td className="eud-detail-num">{detailSessions.length - i}</td>
                                                <td>{fmtDatetime(s.startTime)}</td>
                                                <td>{isLive
                                                    ? <span className="eud-live-badge">Now</span>
                                                    : fmtDatetime(s.endTime)}
                                                </td>
                                                <td><strong>{fmtDuration(durMs)}</strong></td>
                                                <td>
                                                    <span className={`eud-pill ${isLive ? 'eud-pill--up' : 'eud-pill--done'}`}>
                                                        {isLive ? '▲ LIVE' : '✓ Done'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Gantt Chart — all cycles in range (incl. long-running) ── */}
            {selectedProduct && displayEnvs.length > 0 && (
                <div className="eud-chart-wrap">
                    <div className="eud-chart-header">
                        <span className="eud-chart-title">
                            {selectedProduct} — Uptime Timeline
                        </span>
                        <span className="eud-chart-range">{fromDate} → {toDate}</span>
                    </div>
                    {loading ? (
                        <div className="eud-chart-empty">
                            <p className="eud-empty-hint">Loading…</p>
                        </div>
                    ) : (
                        <>
                            <EnvUptimeChart
                                sessions={sessions}
                                envs={displayEnvs}
                                fromDate={fromDate + 'T00:00:00Z'}
                                toDate={toDate   + 'T23:59:59Z'}
                                envColors={envColors}
                                onSessionClick={isDevOps ? (s, env) => setDetailEnv(env) : undefined}
                            />
                            {sessions.length === 0 && (
                                <div className="eud-chart-footnote">
                                    <p>
                                        No uptime cycles in this date range for <strong>{selectedProduct}</strong>.
                                    </p>
                                    <p className="eud-empty-hint">
                                        Cycles come from completed <em>Environment Up / Down</em> tickets and DevOps manual sessions.
                                        {isDevOps && ' Use Start/Stop on the cards to record manually.'}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            </> /* end env tab */}
        </div>
    );
}
