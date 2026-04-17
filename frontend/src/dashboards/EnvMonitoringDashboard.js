import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    Activity, BarChart3, Clock, Layers, Globe, Server,
    Calendar, Edit2, Check, X,
    AlertCircle, Database, Info,
    SlidersHorizontal, Save, Loader2,
} from 'lucide-react';
import { TICKET_STATUS } from '../services/ticketService';
import { getAnalyticsSettings, saveMonitoringDisplayToggles } from '../services/analyticsSettingsService';

/* ──────────────────────────────────────────────
   CONSTANTS
────────────────────────────────────────────── */
const PRODUCT_COLORS = [
    '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
    '#14b8a6', '#a855f7', '#f43f5e', '#0ea5e9', '#22c55e',
];

const ENV_COLORS = {
    Development: '#3b82f6',
    'Quality Assurance': '#f59e0b',
    Staging: '#8b5cf6',
    'User Acceptance Testing': '#10b981',
    Production: '#ef4444',
};

const getEnvColor = (env) => ENV_COLORS[env] || '#64748b';

const getProductColor = (productName, productList) => {
    const idx = productList.indexOf(productName);
    return idx >= 0 ? PRODUCT_COLORS[idx % PRODUCT_COLORS.length] : '#94a3b8';
};

/* ──────────────────────────────────────────────
   DATE / TICKET HELPERS
────────────────────────────────────────────── */
const fmtShortDate = (date) =>
    new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const fmtFullDate = (date) =>
    new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const toDateStr = (date) => new Date(date).toISOString().split('T')[0];

const getDayRange = (from, to) => {
    const days = [];
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
};

const getTicketPeriod = (ticket) => {
    const startRaw = ticket.activationDate || ticket.createdAt;
    const start = new Date(startRaw).getTime();
    let end;
    if (ticket.shutdownDate) {
        end = new Date(ticket.shutdownDate).getTime();
    } else if (ticket.duration && startRaw) {
        end = start + ticket.duration * 3_600_000;
    } else if (
        [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED, TICKET_STATUS.REJECTED].includes(ticket.status)
    ) {
        end = new Date(ticket.updatedAt || ticket.createdAt).getTime();
    } else {
        end = Date.now();
    }
    return { start, end: Math.max(start, end) };
};

const overlapHours = (s, e, dayStart, dayEnd) => {
    const os = Math.max(s, dayStart);
    const oe = Math.min(e, dayEnd);
    if (oe <= os) return 0;
    return Math.min((oe - os) / 3_600_000, 24);
};

const parseIsoMs = (v) => {
    if (v == null || v === '') return null;
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
};

/** Extra bar-chart hours from a DevOps manual Running / Stopped segment (not from ticket rows). */
function manualSessionHoursForDay(meta, dayStart, dayEnd, nowMs) {
    if (!meta) return 0;
    const ro = meta.runningOverride;
    const sinceMs = parseIsoMs(meta.manualRunningSince);
    const stoppedMs = parseIsoMs(meta.manualRunningStoppedAt);
    if (ro === true && sinceMs != null) {
        return overlapHours(sinceMs, nowMs, dayStart, dayEnd);
    }
    if (ro === false && sinceMs != null && stoppedMs != null) {
        return overlapHours(sinceMs, Math.max(sinceMs, stoppedMs), dayStart, dayEnd);
    }
    return 0;
}

function addManualHoursForEnvIntoDay(productHours, metaMap, envName, dayStart, dayEnd, nowMs) {
    if (!metaMap || metaMap.size === 0) return;
    metaMap.forEach((meta, key) => {
        const sep = key.indexOf('||');
        if (sep < 0) return;
        const productName = key.slice(0, sep);
        const environment = key.slice(sep + 2);
        const want = (envName || '').replace(/_/g, ' ');
        const envNorm = environment.replace(/_/g, ' ');
        if (envNorm !== want && environment !== envName) return;
        const h = manualSessionHoursForDay(meta, dayStart, dayEnd, nowMs);
        if (h <= 0) return;
        productHours[productName] = Math.min((productHours[productName] || 0) + h, 24);
    });
}

/** Tooltip copy: sub-hour runtimes show as whole minutes (e.g. 5 min), not 0.0h. */
function formatRuntimeDuration(hours) {
    if (hours == null || !Number.isFinite(hours) || hours <= 0) return '0 min';
    const totalMinutes = hours * 60;
    if (totalMinutes < 1) return '<1 min';
    if (hours < 1) {
        return `${Math.round(totalMinutes)} min`;
    }
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

/** Many tickets omit environment; bucket so charts still render for standard users. */
function normalizedTicketEnv(t) {
    const raw = t && t.environment != null ? String(t.environment).trim() : '';
    if (!raw) return 'Unknown';
    return raw.replace(/_/g, ' ');
}

function normalizedTicketProduct(t) {
    const raw = t && t.productName != null ? String(t.productName).trim() : '';
    return raw || 'Unknown';
}

/** Bar chart hours only count tickets that have reached Completed (not in-progress or other states). */
function isCompletedForBarChart(t) {
    return t && t.status === TICKET_STATUS.COMPLETED;
}

const computeDailyBreakdown = (tickets, envName, days, toggleMeta, nowMs) => {
    const envTickets = tickets.filter((t) => {
        if (!isCompletedForBarChart(t)) return false;
        const e = normalizedTicketEnv(t);
        const want = (envName || '').replace(/_/g, ' ');
        return e === want || e === envName;
    });
    const endNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    return days.map((day) => {
        const ds = new Date(day); ds.setHours(0, 0, 0, 0);
        const de = new Date(day); de.setHours(23, 59, 59, 999);
        const productHours = {};
        envTickets.forEach((t) => {
            const { start, end } = getTicketPeriod(t);
            const h = overlapHours(start, end, ds.getTime(), de.getTime());
            if (h > 0) {
                const p = normalizedTicketProduct(t);
                productHours[p] = Math.min((productHours[p] || 0) + h, 24);
            }
        });
        addManualHoursForEnvIntoDay(productHours, toggleMeta, envName, ds.getTime(), de.getTime(), endNow);
        const totalHours = Math.min(
            Object.values(productHours).reduce((s, h) => s + h, 0),
            24
        );
        return { date: day, label: fmtShortDate(day), fullLabel: fmtFullDate(day), productHours, totalHours };
    });
};

const pairKey = (product, env) => `${product || ''}||${env || ''}`;

/** Per product×environment: visibility + optional DevOps running override (null = use ticket activity only). */
function buildToggleMetaByPair(toggles) {
    const m = new Map();
    (toggles || []).forEach((t) => {
        m.set(pairKey(t.productName, t.environment), {
            enabled: t.enabled !== false,
            runningOverride:
                t.runningOverride === true ? true : t.runningOverride === false ? false : null,
            manualRunningSince: t.manualRunningSince ?? null,
            manualRunningStoppedAt: t.manualRunningStoppedAt ?? null,
        });
    });
    return m;
}

function isPairShown(metaMap, product, env) {
    const meta = metaMap.get(pairKey(product, env));
    if (!meta) return true;
    return meta.enabled;
}

function isProductRunningDisplayed(metaMap, tickets, envName, productName) {
    const meta = metaMap.get(pairKey(productName, envName));
    if (meta && meta.runningOverride === true) return true;
    if (meta && meta.runningOverride === false) return false;
    /** Auto (null): live Running / Stopped follows open tickets only. */
    return isProductUpInEnv(tickets, envName, productName);
}

function runningMetricSource(metaMap, envName, productName) {
    const meta = metaMap.get(pairKey(productName, envName));
    if (meta && (meta.runningOverride === true || meta.runningOverride === false)) return 'devops';
    return 'tickets';
}

function matchEnvTicket(t, envName) {
    const e = normalizedTicketEnv(t);
    const want = (envName || '').replace(/_/g, ' ');
    return e === want || e === envName;
}

const TERMINAL_TICKET = [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED, TICKET_STATUS.REJECTED];

/** Green "up" = this product is currently running in the environment (open work). */
function isProductUpInEnv(tickets, envName, productName) {
    return tickets.some(
        (t) =>
            matchEnvTicket(t, envName) &&
            normalizedTicketProduct(t) === productName &&
            !TERMINAL_TICKET.includes(t.status)
    );
}

/* ──────────────────────────────────────────────
   DAILY STACKED BARS (per environment)
────────────────────────────────────────────── */
const DailyStackedBarChart = ({
    dailyData,
    productOrder,
    productColors,
    productMetrics,
    chartHeight = 200,
    barMinWidth = 28,
    emptyMsg,
}) => {
    const [tip, setTip] = useState(null);

    const handleEnter = useCallback(
        (e, day) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const segs = productOrder
                .map((p) => {
                    const hours = day.productHours[p] || 0;
                    const m = productMetrics && productMetrics[p];
                    return {
                        product: p,
                        hours,
                        color: productColors[p],
                        liveRunning: m ? m.running : false,
                        liveSource: m ? m.source : 'tickets',
                    };
                })
                .filter((s) => s.hours > 0);
            setTip({
                x: rect.left + rect.width / 2,
                y: rect.top,
                day,
                segs,
            });
        },
        [productOrder, productColors, productMetrics]
    );

    if (!dailyData || dailyData.length === 0) {
        return <div className="em-empty">{emptyMsg || 'No data for this range.'}</div>;
    }

    const maxDayTotal = Math.max(0.01, ...dailyData.map((d) => d.totalHours));
    return (
        <div className="em-chart-outer em-chart-outer--full-width">
            <div className="em-bars-scroll em-bars-scroll--flush">
                <div
                    className="em-bars-inner"
                    style={{ minWidth: Math.max(dailyData.length * barMinWidth, 220) }}
                >
                    {dailyData.map((day, idx) => {
                        const sortedProds = productOrder.filter((p) => (day.productHours[p] || 0) > 0);
                        const total = day.totalHours;
                        const colPct = total > 0 ? Math.max(6, (total / maxDayTotal) * 100) : 0;
                        return (
                            <div
                                key={idx}
                                className="em-bar-col"
                                onMouseEnter={(e) => handleEnter(e, day)}
                                onMouseLeave={() => setTip(null)}
                            >
                                <div className="em-bar-stack" style={{ height: chartHeight }}>
                                    {total > 0 && (
                                        <div
                                            className="em-bar-day-column"
                                            style={{
                                                position: 'absolute',
                                                left: 2,
                                                right: 2,
                                                bottom: 0,
                                                height: `${colPct}%`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'flex-end',
                                                borderRadius: '4px 4px 0 0',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {sortedProds.map((p) => {
                                                const h = day.productHours[p] || 0;
                                                return (
                                                    <div
                                                        key={p}
                                                        style={{
                                                            height: `${(h / total) * 100}%`,
                                                            minHeight: 3,
                                                            background: productColors[p] || '#94a3b8',
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                    {total === 0 && (
                                        <div className="em-bar-empty-seg" style={{ height: '3%', bottom: 0 }} />
                                    )}
                                </div>
                                <div className="em-bar-xlabel">{day.label.split(' ')[1] || day.label}</div>
                                <div className="em-bar-xmonth">
                                    {idx === 0 || day.date.getDate() === 1 ? day.label.split(' ')[0] : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {tip && (
                <div
                    className="em-tooltip"
                    style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}
                >
                    <div className="em-tip-date">{tip.day.fullLabel}</div>
                    {tip.segs.length === 0 ? (
                        <div className="em-tip-empty">No product hours</div>
                    ) : (
                        tip.segs.map((s) => (
                            <div key={s.product} className="em-tip-row em-tip-row--stacked">
                                <div className="em-tip-row-main">
                                    <span className="em-tip-dot" style={{ background: s.color }} />
                                    <span className="em-tip-name">{s.product}</span>
                                    <span className="em-tip-val">{formatRuntimeDuration(s.hours)}</span>
                                </div>
                                <div className="em-tip-live">
                                    Live:{' '}
                                    <strong className={s.liveRunning ? 'em-tip-live-on' : 'em-tip-live-off'}>
                                        {s.liveRunning ? 'Running' : 'Stopped'}
                                    </strong>
                                    <span className="em-tip-live-src">
                                        {s.liveSource === 'devops' ? '(DevOps)' : '(from activity)'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                    {tip.segs.length > 0 && (
                        <div className="em-tip-total">
                            Day total: {formatRuntimeDuration(tip.segs.reduce((a, s) => a + s.hours, 0))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ──────────────────────────────────────────────
   ENV → PRODUCT MAP GRID
────────────────────────────────────────────── */
const EnvProductMap = ({ tickets, productColors }) => {
    const envMap = useMemo(() => {
        const m = {};
        tickets.forEach((t) => {
            const env = normalizedTicketEnv(t);
            const prod = normalizedTicketProduct(t);
            if (!m[env]) m[env] = new Set();
            m[env].add(prod);
        });
        return Object.entries(m).map(([env, prods]) => ({ env, products: [...prods].sort() }));
    }, [tickets]);

    return (
        <div className="em-envmap-grid">
            {envMap.map(({ env, products }) => (
                <div key={env} className="em-envmap-card" style={{ '--env-color': getEnvColor(env) }}>
                    <div className="em-envmap-header">
                        <span className="em-envmap-dot" style={{ background: getEnvColor(env) }} />
                        <span className="em-envmap-name">{env}</span>
                        <span className="em-envmap-count">{products.length} product{products.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="em-envmap-products">
                        {products.map((p) => (
                            <span
                                key={p}
                                className="em-prod-chip"
                                style={{ background: `${productColors[p]}18`, color: productColors[p], borderColor: `${productColors[p]}44` }}
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

/* ──────────────────────────────────────────────
   INFRA PANEL (DevOps / Admin — from cloud services in project config)
────────────────────────────────────────────── */
const InfraPanel = ({ tickets, projects }) => {
    const infraByProduct = useMemo(() => {
        const map = {};
        tickets.forEach((t) => {
            const p = t.productName || 'Unknown';
            if (!map[p]) {
                map[p] = {
                    product: p,
                    envs: new Set(),
                    totalTickets: 0,
                    inProgress: 0,
                    completedHours: 0,
                    databases: new Set(),
                };
            }
            map[p].totalTickets++;
            map[p].envs.add(t.environment || '');
            if (t.status === TICKET_STATUS.IN_PROGRESS) map[p].inProgress++;
            if (t.databaseType) map[p].databases.add(t.databaseType);
            if (t.activationDate && t.shutdownDate) {
                const h = (new Date(t.shutdownDate) - new Date(t.activationDate)) / 3_600_000;
                if (h > 0) map[p].completedHours += h;
            }
        });
        return Object.values(map).sort((a, b) => b.totalTickets - a.totalTickets);
    }, [tickets]);

    // Cloud services from projects' workflow - derive from project data
    const projectCloudServices = useMemo(() => {
        const pMap = {};
        (projects || []).forEach((proj) => {
            pMap[proj.name] = proj;
        });
        return pMap;
    }, [projects]);

    if (infraByProduct.length === 0) {
        return <div className="em-empty">No infrastructure data available yet.</div>;
    }

    return (
        <div className="em-infra-grid">
            {infraByProduct.slice(0, 12).map((item) => {
                const avgHrs = item.completedHours > 0 && item.totalTickets > 0
                    ? (item.completedHours / item.totalTickets).toFixed(1)
                    : '—';
                const proj = projectCloudServices[item.product];
                return (
                    <div key={item.product} className="em-infra-card">
                        <div className="em-infra-card-header">
                            <span className="em-infra-product">{item.product}</span>
                            {item.inProgress > 0 && (
                                <span className="em-infra-live">
                                    <span className="em-live-dot" />
                                    {item.inProgress} live
                                </span>
                            )}
                        </div>
                        <div className="em-infra-stats">
                            <div className="em-infra-stat">
                                <Layers size={13} />
                                <span>{[...item.envs].filter(Boolean).length} env{[...item.envs].length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="em-infra-stat">
                                <Activity size={13} />
                                <span>{item.totalTickets} tickets</span>
                            </div>
                            <div className="em-infra-stat">
                                <Clock size={13} />
                                <span>{avgHrs !== '—' ? `${avgHrs}h avg` : '—'}</span>
                            </div>
                            {[...item.databases].length > 0 && (
                                <div className="em-infra-stat">
                                    <Database size={13} />
                                    <span>{[...item.databases].join(', ')}</span>
                                </div>
                            )}
                        </div>
                        {proj && (
                            <div className="em-infra-envs">
                                {(proj.environments || []).map((e) => (
                                    <span key={e} className="em-infra-env-tag" style={{ borderColor: `${getEnvColor(e)}88`, color: getEnvColor(e) }}>
                                        {e}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/* ──────────────────────────────────────────────
   DEVOPS / ADMIN — CHART DISPLAY (saved to DB)
────────────────────────────────────────────── */
const MonitoringDisplaySettingsPanel = ({ tickets, onSettingsUpdated }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const rebuildRows = useCallback((settingsDoc) => {
        const toggles = settingsDoc?.monitoringDisplayToggles || [];
        const toggleByKey = new Map(toggles.map((t) => [pairKey(t.productName, t.environment), t]));
        const pairs = new Set();
        tickets.forEach((t) => {
            pairs.add(pairKey(normalizedTicketProduct(t), normalizedTicketEnv(t)));
        });
        const list = [...pairs]
            .map((k) => {
                const sep = k.indexOf('||');
                const productName = sep >= 0 ? k.slice(0, sep) : k;
                const environment = sep >= 0 ? k.slice(sep + 2) : '';
                const t = toggleByKey.get(k);
                return {
                    productName,
                    environment,
                    enabled: t ? t.enabled !== false : true,
                    runningOverride:
                        t && t.runningOverride === true
                            ? true
                            : t && t.runningOverride === false
                              ? false
                              : null,
                    manualRunningSince: t?.manualRunningSince ?? null,
                    manualRunningStoppedAt: t?.manualRunningStoppedAt ?? null,
                };
            })
            .sort(
                (a, b) =>
                    a.environment.localeCompare(b.environment) || a.productName.localeCompare(b.productName)
            );
        setRows(list);
    }, [tickets]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setMessage('');
        getAnalyticsSettings()
            .then((doc) => {
                if (!cancelled) rebuildRows(doc);
            })
            .catch((e) => {
                if (!cancelled) setMessage(e.message || 'Could not load settings');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [rebuildRows]);

    const flipRow = (idx) => {
        setRows((prev) =>
            prev.map((row, i) => (i === idx ? { ...row, enabled: !row.enabled } : row))
        );
    };

    const setRunningOverride = (idx, value) => {
        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== idx) return row;
                const nowIso = new Date().toISOString();
                if (value === true) {
                    return {
                        ...row,
                        runningOverride: true,
                        manualRunningSince: nowIso,
                        manualRunningStoppedAt: null,
                    };
                }
                if (value === false) {
                    const wasRunning = row.runningOverride === true;
                    return {
                        ...row,
                        runningOverride: false,
                        manualRunningSince: wasRunning ? row.manualRunningSince : null,
                        manualRunningStoppedAt: wasRunning ? nowIso : null,
                    };
                }
                return {
                    ...row,
                    runningOverride: null,
                    manualRunningSince: null,
                    manualRunningStoppedAt: null,
                };
            })
        );
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const saved = await saveMonitoringDisplayToggles(rows);
            rebuildRows(saved);
            onSettingsUpdated?.(saved);
            setMessage('Saved to server.');
        } catch (e) {
            setMessage(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="em-display-panel">
                <div className="em-empty">
                    <Loader2 size={20} className="em-spin" /> Loading display settings…
                </div>
            </div>
        );
    }

    return (
        <div className="em-display-panel">
            <div className="em-display-panel-head">
                <div>
                    <h3 className="em-display-title">
                        <SlidersHorizontal size={18} /> Charts & live status
                    </h3>
                    <p className="em-display-desc">
                        <strong>Show on chart</strong> hides a product in that environment for everyone.
                        <strong> Live status:</strong> <strong>Running</strong> starts a manual uptime window from the
                        moment you click it until <strong>Stopped</strong> (charts and pills follow that, not ticket
                        polling). <strong>Auto</strong> uses open tickets only for Running / Stopped and does not use
                        the manual window.
                    </p>
                </div>
                <button type="button" className="em-display-save" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={16} className="em-spin" /> : <Save size={16} />}
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
            {message && <div className={`em-display-msg ${message.includes('fail') ? 'err' : ''}`}>{message}</div>}
            {rows.length === 0 ? (
                <div className="em-empty">No environment + product pairs found in tickets yet.</div>
            ) : (
                <div className="em-display-table-wrap">
                    <table className="em-display-table">
                        <thead>
                            <tr>
                                <th>Environment</th>
                                <th>Product</th>
                                <th>Show on chart</th>
                                <th>Live status (Running / Stopped)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={pairKey(row.productName, row.environment)}>
                                    <td>
                                        <span className="em-display-env" style={{ color: getEnvColor(row.environment) }}>
                                            {row.environment}
                                        </span>
                                    </td>
                                    <td>{row.productName}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className={`em-toggle ${row.enabled ? 'on' : 'off'}`}
                                            onClick={() => flipRow(idx)}
                                        >
                                            <span className="em-toggle-knob" />
                                            {row.enabled ? 'On' : 'Off'}
                                        </button>
                                    </td>
                                    <td>
                                        <div className="em-live-trio" role="group" aria-label="Live running metric">
                                            <button
                                                type="button"
                                                className={`em-live-trio-btn ${row.runningOverride == null ? 'active' : ''}`}
                                                onClick={() => setRunningOverride(idx, null)}
                                            >
                                                Auto
                                            </button>
                                            <button
                                                type="button"
                                                className={`em-live-trio-btn ${row.runningOverride === true ? 'active' : ''}`}
                                                onClick={() => setRunningOverride(idx, true)}
                                            >
                                                Running
                                            </button>
                                            <button
                                                type="button"
                                                className={`em-live-trio-btn ${row.runningOverride === false ? 'active' : ''}`}
                                                onClick={() => setRunningOverride(idx, false)}
                                            >
                                                Stopped
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

/* ──────────────────────────────────────────────
   ADMIN EDIT PANEL
────────────────────────────────────────────── */
const AdminEditPanel = ({ tickets, projects }) => {
    const STORAGE_KEY = 'em_admin_overrides';
    const [overrides, setOverrides] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
    });
    const [editKey, setEditKey] = useState(null);
    const [editVal, setEditVal] = useState('');
    const [saved, setSaved] = useState(false);

    const envProductPairs = useMemo(() => {
        const pairs = new Set();
        tickets.forEach((t) => {
            if (t.environment && t.productName) {
                pairs.add(`${t.productName}||${t.environment}`);
            }
        });
        return [...pairs].sort().map((k) => {
            const [product, env] = k.split('||');
            return { product, env };
        });
    }, [tickets]);

    const save = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [overrides]);

    const startEdit = (key, currentVal) => {
        setEditKey(key);
        setEditVal(String(currentVal || ''));
    };

    const commitEdit = () => {
        if (!editKey) return;
        setOverrides((prev) => ({ ...prev, [editKey]: editVal }));
        setEditKey(null);
    };

    return (
        <div className="em-admin-panel">
            <div className="em-admin-header">
                <div className="em-admin-title">
                    <Edit2 size={16} /> Metric Overrides
                    <span className="em-admin-hint">Override uptime notes per project / environment</span>
                </div>
                <button className="em-admin-save-btn" onClick={save}>
                    {saved ? <><Check size={14} /> Saved!</> : <><Check size={14} /> Save overrides</>}
                </button>
            </div>

            <div className="em-admin-grid">
                {envProductPairs.slice(0, 30).map(({ product, env }) => {
                    const key = `${product}__${env}`;
                    const override = overrides[key] || '';
                    const isEditing = editKey === key;
                    return (
                        <div key={key} className="em-admin-row">
                            <span className="em-admin-env-dot" style={{ background: getEnvColor(env) }} />
                            <span className="em-admin-product">{product}</span>
                            <span className="em-admin-env">{env}</span>
                            <div className="em-admin-value-wrap">
                                {isEditing ? (
                                    <>
                                        <input
                                            className="em-admin-input"
                                            value={editVal}
                                            autoFocus
                                            onChange={(e) => setEditVal(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') commitEdit();
                                                if (e.key === 'Escape') setEditKey(null);
                                            }}
                                            placeholder="e.g. Maintenance scheduled, Node replaced…"
                                        />
                                        <button className="em-admin-icon-btn ok" onClick={commitEdit}><Check size={13} /></button>
                                        <button className="em-admin-icon-btn" onClick={() => setEditKey(null)}><X size={13} /></button>
                                    </>
                                ) : (
                                    <>
                                        <span className="em-admin-note">{override || <span style={{ color: '#94a3b8' }}>—</span>}</span>
                                        <button className="em-admin-icon-btn" onClick={() => startEdit(key, override)}><Edit2 size={13} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {Object.keys(overrides).length > 0 && (
                <div className="em-admin-overrides-preview">
                    <Info size={13} style={{ flexShrink: 0 }} />
                    <span>{Object.keys(overrides).length} override{Object.keys(overrides).length !== 1 ? 's' : ''} saved locally. Connect to backend to persist.</span>
                </div>
            )}
        </div>
    );
};

/* ──────────────────────────────────────────────
   MAIN COMPONENT
────────────────────────────────────────────── */
const EnvMonitoringDashboard = ({
    tickets = [],
    projects = [],
    devOpsMembers: _devOpsMembers = [],
    userRole = 'user', // 'user' | 'devops' | 'admin'
}) => {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const isUser = userRole === 'user';
    const isDevOps = userRole === 'devops';
    const isAdmin = userRole === 'admin';

    const [dateFrom, setDateFrom] = useState(toDateStr(defaultFrom));
    const [dateTo, setDateTo] = useState(toDateStr(now));
    const [activeTab, setActiveTab] = useState('activity');
    const [monitoringSettings, setMonitoringSettings] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getAnalyticsSettings()
            .then((doc) => {
                if (!cancelled) setMonitoringSettings(doc);
            })
            .catch(() => {
                if (!cancelled) setMonitoringSettings({});
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const toggleMetaByPair = useMemo(
        () => buildToggleMetaByPair(monitoringSettings?.monitoringDisplayToggles),
        [monitoringSettings]
    );

    const [liveTick, setLiveTick] = useState(0);
    const hasActiveManualRunning = useMemo(() => {
        for (const meta of toggleMetaByPair.values()) {
            if (meta.runningOverride === true && meta.manualRunningSince) return true;
        }
        return false;
    }, [toggleMetaByPair]);

    useEffect(() => {
        if (!hasActiveManualRunning) return undefined;
        const id = setInterval(() => setLiveTick((n) => n + 1), 30000);
        return () => clearInterval(id);
    }, [hasActiveManualRunning]);

    const ticketsForCharts = useMemo(
        () =>
            tickets.filter((t) => {
                const p = normalizedTicketProduct(t);
                const e = normalizedTicketEnv(t);
                return isPairShown(toggleMetaByPair, p, e);
            }),
        [tickets, toggleMetaByPair]
    );

    const allProducts = useMemo(
        () => [...new Set(ticketsForCharts.map((t) => normalizedTicketProduct(t)))].sort(),
        [ticketsForCharts]
    );

    const productColors = useMemo(() => {
        const m = {};
        allProducts.forEach((p, i) => {
            m[p] = PRODUCT_COLORS[i % PRODUCT_COLORS.length];
        });
        return m;
    }, [allProducts]);

    const days = useMemo(() => {
        let from = dateFrom;
        let to = dateTo;
        if (from > to) {
            const x = from;
            from = to;
            to = x;
        }
        let range = getDayRange(from, to);
        if (range.length === 0) {
            const t = toDateStr(new Date());
            range = getDayRange(t, t);
        }
        return range;
    }, [dateFrom, dateTo]);

    const chartNowMs = useMemo(
        () => Date.now(),
        [liveTick, dateFrom, dateTo, ticketsForCharts, monitoringSettings]
    );

    const environments = useMemo(
        () => [...new Set(ticketsForCharts.map((t) => normalizedTicketEnv(t)))].sort(),
        [ticketsForCharts]
    );

    const productMetricsByEnv = useMemo(() => {
        const out = {};
        environments.forEach((env) => {
            const productsInEnv = [
                ...new Set(
                    ticketsForCharts
                        .filter((t) => matchEnvTicket(t, env))
                        .map((t) => normalizedTicketProduct(t))
                ),
            ].sort();
            const m = {};
            productsInEnv.forEach((p) => {
                m[p] = {
                    running: isProductRunningDisplayed(toggleMetaByPair, ticketsForCharts, env, p),
                    source: runningMetricSource(toggleMetaByPair, env, p),
                };
            });
            out[env] = m;
        });
        return out;
    }, [environments, ticketsForCharts, toggleMetaByPair]);

    const showAdmin = isAdmin || isDevOps;

    return (
        <div className="em-root">
            <div className="em-header">
                <div className="em-header-left">
                    <div className="em-header-icon">
                        <Activity size={22} />
                    </div>
                    <div>
                        <h2 className="em-header-title">{isUser ? 'Analytics' : 'Environment monitoring'}</h2>
                        <p className="em-header-sub">
                            {isUser
                                ? 'Each environment has its own chart. Colors match products (legend + bars). Hover a day for hours and live Running / Stopped.'
                                : 'Running / Stopped are manual (from click time until you change). Auto follows tickets only. Bar colors = products; tooltips include hours and live status.'}
                        </p>
                    </div>
                </div>
                <div className="em-header-controls">
                    <div className="em-date-range">
                        <Calendar size={14} style={{ color: '#64748b' }} />
                        <span className="em-date-label">From</span>
                        <input type="date" className="em-date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>–</span>
                        <span className="em-date-label">To</span>
                        <input type="date" className="em-date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                </div>
            </div>

            {showAdmin && (
                <div className="em-tabs">
                    <button type="button" className={`em-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                        <BarChart3 size={14} /> Activity
                    </button>
                    <button type="button" className={`em-tab ${activeTab === 'infra' ? 'active' : ''}`} onClick={() => setActiveTab('infra')}>
                        <Server size={14} /> Infrastructure
                    </button>
                    <button type="button" className={`em-tab ${activeTab === 'display' ? 'active' : ''}`} onClick={() => setActiveTab('display')}>
                        <SlidersHorizontal size={14} /> Charts & live status
                    </button>
                    {isAdmin && (
                        <button type="button" className={`em-tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                            <Edit2 size={14} /> Admin edit
                        </button>
                    )}
                </div>
            )}

            {(activeTab === 'activity' || !showAdmin) && (
                <>
                    {environments.length === 0 ? (
                        <div className="em-chart-card">
                            <div className="em-empty">
                                {isUser
                                    ? 'No product / environment data for this account yet.'
                                    : 'No data (or everything is hidden under Charts & live status).'}
                            </div>
                        </div>
                    ) : (
                        <div className="em-env-mini-grid">
                        {environments.map((env) => {
                            const productsInEnv = [
                                ...new Set(
                                    ticketsForCharts
                                        .filter((t) => matchEnvTicket(t, env))
                                        .map((t) => normalizedTicketProduct(t))
                                ),
                            ].sort();
                            const dailyData = computeDailyBreakdown(
                                ticketsForCharts,
                                env,
                                days,
                                toggleMetaByPair,
                                chartNowMs
                            );
                            const hasHours = dailyData.some((d) => d.totalHours > 0);
                            return (
                                <div key={env} className="em-chart-card em-mini-env-card">
                                    <div className="em-mini-env-head">
                                        <div className="em-mini-env-title-row">
                                            <span className="em-mini-env-dot" style={{ background: getEnvColor(env) }} />
                                            <h3 className="em-mini-env-name">{env}</h3>
                                        </div>
                                        <p className="em-mini-env-meta">
                                            {days.length} day{days.length !== 1 ? 's' : ''} · hover a column for per-product hours
                                        </p>
                                    </div>
                                    <div
                                        className="em-status-strip em-status-strip--compact"
                                        aria-label="Product up or down in this environment"
                                    >
                                        {productsInEnv.map((p) => {
                                            const up = isProductRunningDisplayed(
                                                toggleMetaByPair,
                                                ticketsForCharts,
                                                env,
                                                p
                                            );
                                            const src = runningMetricSource(toggleMetaByPair, env, p);
                                            const c = productColors[p] || '#64748b';
                                            return (
                                                <span
                                                    key={p}
                                                    className={`em-status-pill em-status-pill--product ${up ? 'up' : 'down'}`}
                                                    title={
                                                        `${p} in ${env}: ${up ? 'Running' : 'Stopped'}` +
                                                        (src === 'devops' ? ' (set by DevOps)' : ' (from activity)')
                                                    }
                                                >
                                                    <span className="em-status-prod-dot" style={{ background: c }} />
                                                    <span className="em-status-prod-name">{p}</span>
                                                    <span className="em-status-prod-flag">{up ? 'Run' : 'Stop'}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <DailyStackedBarChart
                                        dailyData={dailyData}
                                        productOrder={productsInEnv}
                                        productColors={productColors}
                                        productMetrics={productMetricsByEnv[env] || {}}
                                        chartHeight={132}
                                        barMinWidth={20}
                                        emptyMsg={
                                            hasHours
                                                ? ''
                                                : 'No hours in this range for this environment.'
                                        }
                                    />
                                    {productsInEnv.length > 0 && (
                                        <div className="em-env-metrics-footer" aria-label="Live metrics by product">
                                            {productsInEnv.map((p) => {
                                                const mm = (productMetricsByEnv[env] || {})[p] || {
                                                    running: false,
                                                    source: 'tickets',
                                                };
                                                return (
                                                    <div
                                                        key={p}
                                                        className="em-metric-mini"
                                                        style={{ borderLeftColor: productColors[p] || '#94a3b8' }}
                                                    >
                                                        <span className="em-metric-mini-name">{p}</span>
                                                        <span
                                                            className={
                                                                mm.running ? 'em-metric-mini-val on' : 'em-metric-mini-val off'
                                                            }
                                                        >
                                                            {mm.running ? 'Running' : 'Stopped'}
                                                        </span>
                                                        <span className="em-metric-mini-src">
                                                            {mm.source === 'devops' ? 'DevOps' : 'Activity'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    )}
                </>
            )}

            {(activeTab === 'activity' || !showAdmin) && (
                <>
                    <div className="em-section-label">
                        <Globe size={14} /> Environments &amp; products (shown on chart)
                    </div>
                    <EnvProductMap tickets={ticketsForCharts} productColors={productColors} />
                </>
            )}

            {showAdmin && activeTab === 'infra' && (
                <div className="em-section-wrap">
                    <div className="em-section-label"><Server size={14} /> Infrastructure workload by product</div>
                    <InfraPanel tickets={tickets} projects={projects} />
                </div>
            )}

            {showAdmin && activeTab === 'display' && (
                <MonitoringDisplaySettingsPanel tickets={tickets} onSettingsUpdated={setMonitoringSettings} />
            )}

            {isAdmin && activeTab === 'admin' && <AdminEditPanel tickets={tickets} projects={projects} />}
        </div>
    );
};

export default EnvMonitoringDashboard;
