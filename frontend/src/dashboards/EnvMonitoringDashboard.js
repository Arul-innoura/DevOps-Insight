import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    Activity, BarChart3, Clock, Users, Layers, Globe, Server,
    Cpu, HardDrive, ChevronDown, Calendar, Edit2, Check, X,
    TrendingUp, Zap, AlertCircle, Database, Cloud, Package,
    RefreshCw, Info, CheckCircle, PlayCircle
} from 'lucide-react';
import { TICKET_STATUS } from '../services/ticketService';

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

const computeDailyBreakdown = (tickets, envName, days) => {
    const envTickets = tickets.filter(
        (t) => (t.environment || '') === envName || (t.environment || '').replace(/_/g, ' ') === envName
    );
    return days.map((day) => {
        const ds = new Date(day); ds.setHours(0, 0, 0, 0);
        const de = new Date(day); de.setHours(23, 59, 59, 999);
        const productHours = {};
        envTickets.forEach((t) => {
            const { start, end } = getTicketPeriod(t);
            const h = overlapHours(start, end, ds.getTime(), de.getTime());
            if (h > 0) {
                const p = t.productName || 'Unknown';
                productHours[p] = Math.min((productHours[p] || 0) + h, 24);
            }
        });
        const totalHours = Math.min(
            Object.values(productHours).reduce((s, h) => s + h, 0),
            24
        );
        return { date: day, label: fmtShortDate(day), fullLabel: fmtFullDate(day), productHours, totalHours };
    });
};

/* ──────────────────────────────────────────────
   STACKED BAR CHART
────────────────────────────────────────────── */
const StackedBarChart = ({ dailyData, productColors, allProducts, chartHeight = 200 }) => {
    const [tip, setTip] = useState(null);
    const tipRef = useRef(null);

    const yMarks = [24, 18, 12, 6, 0];

    const handleMouseEnter = useCallback((e, day) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const segs = allProducts
            .map((p) => ({ product: p, hours: day.productHours[p] || 0, color: productColors[p] }))
            .filter((s) => s.hours > 0);
        setTip({ x: rect.left + rect.width / 2, y: rect.top, day, segs });
    }, [allProducts, productColors]);

    return (
        <div className="em-chart-outer">
            {/* Y axis */}
            <div className="em-yaxis">
                {yMarks.map((h) => (
                    <div key={h} className="em-yaxis-row">
                        <span className="em-yaxis-label">{h}h</span>
                        <div className="em-yaxis-line" />
                    </div>
                ))}
            </div>

            {/* Scrollable bars */}
            <div className="em-bars-scroll">
                <div className="em-bars-inner" style={{ minWidth: Math.max(dailyData.length * 32, 400) }}>
                    {dailyData.map((day, idx) => {
                        const sortedProds = allProducts.filter((p) => (day.productHours[p] || 0) > 0);
                        let cumPct = 0;
                        return (
                            <div
                                key={idx}
                                className="em-bar-col"
                                onMouseEnter={(e) => handleMouseEnter(e, day)}
                                onMouseLeave={() => setTip(null)}
                            >
                                <div className="em-bar-stack" style={{ height: chartHeight }}>
                                    {sortedProds.map((p) => {
                                        const h = day.productHours[p] || 0;
                                        const pct = (h / 24) * 100;
                                        const bottom = cumPct;
                                        cumPct += pct;
                                        return (
                                            <div
                                                key={p}
                                                className="em-bar-seg"
                                                style={{
                                                    height: `${pct}%`,
                                                    bottom: `${bottom}%`,
                                                    background: productColors[p] || '#94a3b8',
                                                }}
                                            />
                                        );
                                    })}
                                    {day.totalHours === 0 && (
                                        <div className="em-bar-empty-seg" style={{ height: '3%', bottom: 0 }} />
                                    )}
                                </div>
                                <div className="em-bar-xlabel">{day.label.split(' ')[1] || day.label}</div>
                                <div className="em-bar-xmonth">{idx === 0 || day.date.getDate() === 1 ? day.label.split(' ')[0] : ''}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tooltip */}
            {tip && (
                <div
                    className="em-tooltip"
                    style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}
                >
                    <div className="em-tip-date">{tip.day.fullLabel}</div>
                    {tip.segs.length === 0 ? (
                        <div className="em-tip-empty">No activity</div>
                    ) : (
                        tip.segs.map((s) => (
                            <div key={s.product} className="em-tip-row">
                                <span className="em-tip-dot" style={{ background: s.color }} />
                                <span className="em-tip-name">{s.product}</span>
                                <span className="em-tip-val">{s.hours.toFixed(1)}h</span>
                            </div>
                        ))
                    )}
                    {tip.segs.length > 0 && (
                        <div className="em-tip-total">Total: {tip.day.totalHours.toFixed(1)}h</div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ──────────────────────────────────────────────
   SUMMARY CARD
────────────────────────────────────────────── */
const SumCard = ({ icon: Icon, label, value, sub, color }) => (
    <div className="em-sum-card">
        <div className="em-sum-icon" style={{ background: `${color}18`, color }}>
            <Icon size={20} />
        </div>
        <div>
            <div className="em-sum-value">{value}</div>
            <div className="em-sum-label">{label}</div>
            {sub && <div className="em-sum-sub">{sub}</div>}
        </div>
    </div>
);

/* ──────────────────────────────────────────────
   ENV → PRODUCT MAP GRID
────────────────────────────────────────────── */
const EnvProductMap = ({ tickets, productColors, allProducts }) => {
    const envMap = useMemo(() => {
        const m = {};
        tickets.forEach((t) => {
            const env = t.environment || 'Unknown';
            const prod = t.productName || 'Unknown';
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
   DEVOPS EXTRA METRICS
────────────────────────────────────────────── */
const DevOpsMetrics = ({ tickets, devOpsMembers }) => {
    const metrics = useMemo(() => {
        const total = tickets.length;
        const inProgress = tickets.filter((t) => t.status === TICKET_STATUS.IN_PROGRESS).length;
        const completed = tickets.filter((t) => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length;
        const actionReq = tickets.filter((t) => t.status === TICKET_STATUS.ACTION_REQUIRED).length;
        const onHold = tickets.filter((t) => t.status === TICKET_STATUS.ON_HOLD).length;
        const pending = tickets.filter((t) => t.status === TICKET_STATUS.CREATED).length;
        const managerPending = tickets.filter((t) => t.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING).length;
        const costPending = tickets.filter((t) => t.status === TICKET_STATUS.COST_APPROVAL_PENDING).length;

        const resolveTimes = tickets
            .filter((t) => t.status === TICKET_STATUS.COMPLETED && t.createdAt && t.updatedAt)
            .map((t) => (new Date(t.updatedAt) - new Date(t.createdAt)) / 86_400_000);
        const avgResolve = resolveTimes.length
            ? (resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length).toFixed(1)
            : null;

        const assigned = tickets.filter((t) => t.assignedTo).length;
        const unassigned = total - assigned;

        const byEnv = {};
        tickets.forEach((t) => {
            const e = t.environment || 'Unknown';
            byEnv[e] = (byEnv[e] || 0) + 1;
        });
        const topEnv = Object.entries(byEnv).sort((a, b) => b[1] - a[1])[0];

        return {
            total, inProgress, completed, actionReq, onHold, pending,
            managerPending, costPending, avgResolve, assigned, unassigned, topEnv,
            resolutionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    }, [tickets]);

    // Workload per devops member
    const memberWorkload = useMemo(() => {
        const map = {};
        tickets.forEach((t) => {
            if (!t.assignedTo) return;
            if (!map[t.assignedTo]) map[t.assignedTo] = { name: t.assignedTo, total: 0, active: 0, done: 0 };
            map[t.assignedTo].total++;
            if (t.status === TICKET_STATUS.IN_PROGRESS) map[t.assignedTo].active++;
            if ([TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)) map[t.assignedTo].done++;
        });
        return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8);
    }, [tickets]);

    const maxWorkload = Math.max(1, ...memberWorkload.map((m) => m.total));

    // Recent 7-day trend
    const weekTrend = useMemo(() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const count = tickets.filter((t) => {
                if (!t.createdAt) return false;
                const ts = new Date(t.createdAt).getTime();
                return ts >= d.getTime() && ts < next.getTime();
            }).length;
            days.push({ label: fmtShortDate(d), count });
        }
        return days;
    }, [tickets]);
    const maxWeek = Math.max(1, ...weekTrend.map((d) => d.count));

    return (
        <div className="em-devops-section">
            {/* KPI row */}
            <div className="em-devops-kpis">
                <SumCard icon={Layers} label="Total Tickets" value={metrics.total} color="#2563eb" />
                <SumCard icon={PlayCircle} label="In Progress" value={metrics.inProgress} color="#7c3aed" />
                <SumCard icon={CheckCircle} label="Completed" value={metrics.completed} sub={`${metrics.resolutionRate}% rate`} color="#16a34a" />
                <SumCard icon={AlertCircle} label="Action Required" value={metrics.actionReq} color="#dc2626" />
                <SumCard icon={Clock} label="Avg Resolve" value={metrics.avgResolve ? `${metrics.avgResolve}d` : '—'} color="#ea580c" />
                <SumCard icon={Users} label="Assigned / Unassigned" value={`${metrics.assigned} / ${metrics.unassigned}`} color="#0891b2" />
                <SumCard icon={Zap} label="Awaiting Approval" value={metrics.managerPending + metrics.costPending} color="#f59e0b" />
                <SumCard icon={Activity} label="On Hold" value={metrics.onHold} color="#64748b" />
            </div>

            {/* Week trend + team workload */}
            <div className="em-devops-row">
                <div className="em-devops-card">
                    <div className="em-card-title"><BarChart3 size={16} /> New Tickets — Last 7 Days</div>
                    <div className="em-week-bars">
                        {weekTrend.map((d, i) => (
                            <div key={i} className="em-week-col" title={`${d.label}: ${d.count}`}>
                                <div className="em-week-bar" style={{ height: `${Math.max(4, (d.count / maxWeek) * 100)}%` }} />
                                <span className="em-week-label">{d.label.split(' ')[1]}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {memberWorkload.length > 0 && (
                    <div className="em-devops-card">
                        <div className="em-card-title"><Users size={16} /> Team Workload</div>
                        <div className="em-workload-list">
                            {memberWorkload.map((m) => (
                                <div key={m.name} className="em-workload-row">
                                    <span className="em-workload-name" title={m.name}>
                                        {m.name.split(' ').map((s) => s[0]).join('').toUpperCase().slice(0, 2)}
                                    </span>
                                    <div className="em-workload-track">
                                        <div className="em-workload-fill-active" style={{ width: `${(m.active / maxWorkload) * 100}%` }} />
                                        <div className="em-workload-fill-done" style={{ width: `${(m.done / maxWorkload) * 100}%`, left: `${(m.active / maxWorkload) * 100}%` }} />
                                    </div>
                                    <span className="em-workload-val">{m.total}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
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
    devOpsMembers = [],
    userRole = 'user',   // 'user' | 'devops' | 'admin'
}) => {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const [selectedEnv, setSelectedEnv] = useState('');
    const [dateFrom, setDateFrom] = useState(toDateStr(defaultFrom));
    const [dateTo, setDateTo] = useState(toDateStr(now));
    const [activeProducts, setActiveProducts] = useState([]);  // empty = all
    const [activeTab, setActiveTab] = useState('activity');     // 'activity' | 'infra' | 'admin'

    const isDevOps = userRole === 'devops';
    const isAdmin = userRole === 'admin';

    // Derive all envs from tickets
    const allEnvs = useMemo(
        () => [...new Set(tickets.map((t) => t.environment).filter(Boolean))].sort(),
        [tickets]
    );

    // Auto-select first env
    useEffect(() => {
        if (!selectedEnv && allEnvs.length > 0) setSelectedEnv(allEnvs[0]);
    }, [allEnvs, selectedEnv]);

    // All products in selected env
    const productsInEnv = useMemo(() => {
        const envTickets = tickets.filter(
            (t) => (t.environment || '') === selectedEnv || (t.environment || '').replace(/_/g, ' ') === selectedEnv
        );
        return [...new Set(envTickets.map((t) => t.productName).filter(Boolean))].sort();
    }, [tickets, selectedEnv]);

    // All products (for color assignment)
    const allProducts = useMemo(
        () => [...new Set(tickets.map((t) => t.productName).filter(Boolean))].sort(),
        [tickets]
    );

    const productColors = useMemo(() => {
        const m = {};
        allProducts.forEach((p, i) => { m[p] = PRODUCT_COLORS[i % PRODUCT_COLORS.length]; });
        return m;
    }, [allProducts]);

    // Day range
    const days = useMemo(() => getDayRange(dateFrom, dateTo), [dateFrom, dateTo]);

    // Filtered tickets (by active product chips)
    const filteredTickets = useMemo(() => {
        if (activeProducts.length === 0) return tickets;
        return tickets.filter((t) => activeProducts.includes(t.productName || 'Unknown'));
    }, [tickets, activeProducts]);

    // Daily breakdown for selected env
    const dailyData = useMemo(
        () => computeDailyBreakdown(filteredTickets, selectedEnv, days),
        [filteredTickets, selectedEnv, days]
    );

    // Products visible in chart
    const visibleProducts = activeProducts.length > 0 ? activeProducts : productsInEnv;

    // Summary metrics
    const summary = useMemo(() => {
        const envTickets = filteredTickets.filter(
            (t) => (t.environment || '') === selectedEnv || (t.environment || '').replace(/_/g, ' ') === selectedEnv
        );
        const totalH = dailyData.reduce((s, d) => s + d.totalHours, 0);
        const activeDays = dailyData.filter((d) => d.totalHours > 0).length;
        const uptimePct = days.length > 0 ? Math.round((activeDays / days.length) * 100) : 0;
        const activeNow = envTickets.filter(
            (t) => ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED, TICKET_STATUS.REJECTED].includes(t.status)
        ).length;
        return { totalH: totalH.toFixed(1), activeDays, uptimePct, activeNow, envTotal: envTickets.length };
    }, [dailyData, filteredTickets, selectedEnv, days]);

    const toggleProduct = (p) => {
        setActiveProducts((prev) =>
            prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
        );
    };

    const showAdmin = isAdmin || isDevOps;

    return (
        <div className="em-root">
            {/* ── Header ── */}
            <div className="em-header">
                <div className="em-header-left">
                    <div className="em-header-icon">
                        <Activity size={22} />
                    </div>
                    <div>
                        <h2 className="em-header-title">Environment Monitoring</h2>
                        <p className="em-header-sub">Uptime &amp; activity by environment and product</p>
                    </div>
                </div>
                <div className="em-header-controls">
                    {/* Environment selector */}
                    <div className="em-env-select-wrap">
                        <span className="em-env-dot" style={{ background: getEnvColor(selectedEnv) }} />
                        <select
                            className="em-env-select"
                            value={selectedEnv}
                            onChange={(e) => { setSelectedEnv(e.target.value); setActiveProducts([]); }}
                        >
                            {allEnvs.length === 0 && <option value="">No environments</option>}
                            {allEnvs.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <ChevronDown size={14} className="em-select-chev" />
                    </div>

                    {/* Date range */}
                    <div className="em-date-range">
                        <Calendar size={14} style={{ color: '#64748b' }} />
                        <input type="date" className="em-date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>–</span>
                        <input type="date" className="em-date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* ── Tab bar (devops/admin gets extra tabs) ── */}
            {showAdmin && (
                <div className="em-tabs">
                    <button className={`em-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                        <BarChart3 size={14} /> Activity
                    </button>
                    <button className={`em-tab ${activeTab === 'infra' ? 'active' : ''}`} onClick={() => setActiveTab('infra')}>
                        <Server size={14} /> Infrastructure
                    </button>
                    <button className={`em-tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>
                        <Zap size={14} /> Full Metrics
                    </button>
                    {isAdmin && (
                        <button className={`em-tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                            <Edit2 size={14} /> Admin Edit
                        </button>
                    )}
                </div>
            )}

            {/* ── Main stacked bar chart (Activity / user view) ── */}
            {(activeTab === 'activity' || !showAdmin) && (
                <div className="em-chart-card">
                    <div className="em-chart-card-header">
                        <div className="em-chart-title">
                            <BarChart3 size={16} />
                            Daily Activity — <span style={{ color: getEnvColor(selectedEnv) }}>{selectedEnv || 'All'}</span>
                            <span className="em-chart-sub">Hours active per product per day (hover for details)</span>
                        </div>
                        {/* Legend */}
                        <div className="em-legend">
                            {visibleProducts.map((p) => (
                                <span key={p} className="em-legend-item">
                                    <span className="em-legend-dot" style={{ background: productColors[p] }} />
                                    {p}
                                </span>
                            ))}
                        </div>
                    </div>
                    {dailyData.length === 0 ? (
                        <div className="em-empty">No data for the selected range.</div>
                    ) : (
                        <StackedBarChart
                            dailyData={dailyData}
                            productColors={productColors}
                            allProducts={visibleProducts}
                            chartHeight={200}
                        />
                    )}
                </div>
            )}

            {/* ── Summary cards ── */}
            <div className="em-sum-row">
                <SumCard icon={Clock} label="Total Active Hours" value={`${summary.totalH}h`} color="#3b82f6" />
                <SumCard icon={Globe} label="Active Days" value={summary.activeDays} sub={`of ${days.length} days`} color="#8b5cf6" />
                <SumCard icon={TrendingUp} label="Uptime" value={`${summary.uptimePct}%`} color="#10b981" />
                <SumCard icon={Layers} label="Active Tickets" value={summary.activeNow} sub="currently running" color="#f59e0b" />
                {(isDevOps || isAdmin) && (
                    <SumCard icon={Activity} label="All Tickets (env)" value={summary.envTotal} color="#0891b2" />
                )}
            </div>

            {/* ── Environment → Products map ── */}
            {(activeTab === 'activity' || !showAdmin) && (
                <>
                    <div className="em-section-label"><Globe size={14} /> Environments &amp; Products</div>
                    <EnvProductMap tickets={tickets} productColors={productColors} allProducts={allProducts} />
                </>
            )}

            {/* ── Product filter chips ── */}
            {(activeTab === 'activity' || !showAdmin) && productsInEnv.length > 0 && (
                <div className="em-prod-filter">
                    <span className="em-prod-filter-label">Filter products:</span>
                    {productsInEnv.map((p) => (
                        <button
                            key={p}
                            className={`em-prod-chip-btn ${activeProducts.includes(p) ? 'active' : ''}`}
                            style={{
                                '--chip-color': productColors[p] || '#94a3b8',
                                background: activeProducts.includes(p) ? `${productColors[p]}22` : undefined,
                                borderColor: activeProducts.includes(p) ? productColors[p] : undefined,
                                color: activeProducts.includes(p) ? productColors[p] : undefined,
                            }}
                            onClick={() => toggleProduct(p)}
                        >
                            <span className="em-chip-dot" style={{ background: productColors[p] }} />
                            {p}
                        </button>
                    ))}
                    {activeProducts.length > 0 && (
                        <button className="em-chip-clear" onClick={() => setActiveProducts([])}>
                            <X size={12} /> Clear
                        </button>
                    )}
                </div>
            )}

            {/* ── Infrastructure tab ── */}
            {showAdmin && activeTab === 'infra' && (
                <div className="em-section-wrap">
                    <div className="em-section-label"><Server size={14} /> Infrastructure Workload by Product</div>
                    <InfraPanel tickets={tickets} projects={projects} />
                </div>
            )}

            {/* ── Full metrics tab (devops) ── */}
            {showAdmin && activeTab === 'metrics' && (
                <DevOpsMetrics tickets={tickets} devOpsMembers={devOpsMembers} />
            )}

            {/* ── Admin edit tab ── */}
            {isAdmin && activeTab === 'admin' && (
                <AdminEditPanel tickets={tickets} projects={projects} />
            )}
        </div>
    );
};

export default EnvMonitoringDashboard;
