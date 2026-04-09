import React, { useState, useMemo, useCallback } from 'react';
import {
    BarChart3,
    TrendingUp,
    Activity,
    CheckCircle,
    Clock,
    PlayCircle,
    Users,
    Filter,
    X,
    Server,
    Cpu,
    HardDrive,
    ArrowUpCircle,
    ArrowDownCircle,
    DollarSign,
    Globe,
    Layers,
    ChevronDown,
    AlertCircle,
    Zap
} from 'lucide-react';
import { TICKET_STATUS, ENVIRONMENTS, REQUEST_TYPES } from '../../services/ticketService';

/* ═══════════════════════════════════════════════════
   SHARED HELPERS
   ═══════════════════════════════════════════════════ */

const ANALYTICS_VIEWS = [
    { key: 'overview',       label: 'Overview',           icon: BarChart3 },
    { key: 'infrastructure', label: 'Infrastructure',     icon: Cpu },
    { key: 'traffic',        label: 'Traffic (Ingress / Egress)', icon: Activity },
    { key: 'cost',           label: 'Cost Estimation',    icon: DollarSign },
    { key: 'team',           label: 'Team Analytics',     icon: Users },
];

const groupBy = (items, key) => {
    const map = {};
    items.forEach(item => {
        const val = item[key] || 'Unknown';
        map[val] = (map[val] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

const maxVal = (entries) =>
    entries.length > 0 ? Math.max(...entries.map(e => e[1])) : 1;

const fmtCurrency = (amount, currency = 'USD') => {
    const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    const sym = symbols[currency] || currency + ' ';
    return `${sym}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getMonthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
};

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/* ═══════════════════════════════════════════════════
   REUSABLE CHART COMPONENTS
   ═══════════════════════════════════════════════════ */

const HorizontalBarChart = ({ data, color, emptyMsg = 'No data', labelWidth = 120 }) => {
    if (!data || data.length === 0) {
        return <p className="sa-empty">{emptyMsg}</p>;
    }
    const max = maxVal(data);
    return (
        <div className="sa-hbar-chart">
            {data.map(([label, count]) => (
                <div key={label} className="sa-hbar-row">
                    <span className="sa-hbar-label" style={{ minWidth: labelWidth }}>{label || 'Unknown'}</span>
                    <div className="sa-hbar-track">
                        <div
                            className="sa-hbar-fill"
                            style={{ width: `${Math.max(2, (count / max) * 100)}%`, background: color }}
                        />
                    </div>
                    <span className="sa-hbar-value">{count}</span>
                </div>
            ))}
        </div>
    );
};

const DailyBarChart = ({ days, ingress, egress, month, year }) => {
    const numDays = daysInMonth(year, month);
    const dayArr = Array.from({ length: numDays }, (_, i) => i + 1);
    const maxH = Math.max(1, ...dayArr.map(d => (ingress[d] || 0) + (egress[d] || 0)));

    return (
        <div className="sa-daily-chart-wrap">
            <div className="sa-daily-chart" style={{ gridTemplateColumns: `repeat(${numDays}, minmax(14px, 1fr))` }}>
                {dayArr.map(d => {
                    const ing = ingress[d] || 0;
                    const eg = egress[d] || 0;
                    const total = ing + eg;
                    const pct = Math.max(2, (total / maxH) * 100);
                    const ingPct = total > 0 ? (ing / total) * 100 : 0;
                    return (
                        <div key={d} className="sa-daily-bar-col" title={`Day ${d}: ↑${ing} ingress, ↓${eg} egress`}>
                            <div className="sa-daily-bar" style={{ height: `${pct}%` }}>
                                <div className="sa-daily-bar-ingress" style={{ height: `${ingPct}%` }} />
                                <div className="sa-daily-bar-egress" style={{ height: `${100 - ingPct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="sa-daily-labels" style={{ gridTemplateColumns: `repeat(${numDays}, minmax(14px, 1fr))` }}>
                {dayArr.map(d => (
                    <span key={d} className="sa-daily-label">{d}</span>
                ))}
            </div>
            <div className="sa-daily-legend">
                <span className="sa-legend-dot" style={{ background: '#22c55e' }} /> Ingress (Env Up)
                <span className="sa-legend-dot" style={{ background: '#ef4444', marginLeft: 16 }} /> Egress (Env Down)
            </div>
        </div>
    );
};

const MetricCard = ({ icon: Icon, label, value, sub, color = '#2563eb', accent }) => (
    <div className="sa-metric-card" style={{ '--sa-accent': accent || color }}>
        <div className="sa-metric-icon" style={{ background: `${color}14`, color }}>
            <Icon size={22} />
        </div>
        <div className="sa-metric-body">
            <div className="sa-metric-value">{value}</div>
            <div className="sa-metric-label">{label}</div>
            {sub && <div className="sa-metric-sub">{sub}</div>}
        </div>
    </div>
);

/* ═══════════════════════════════════════════════════
   MONTH PICKER (custom multi-select)
   ═══════════════════════════════════════════════════ */

const MonthPicker = ({ availableMonths, selectedMonths, onChange }) => {
    const toggle = (m) => {
        if (selectedMonths.includes(m)) {
            onChange(selectedMonths.filter(x => x !== m));
        } else {
            onChange([...selectedMonths, m].sort());
        }
    };
    const selectAll = () => onChange([...availableMonths]);
    const clearAll = () => onChange([]);

    return (
        <div className="sa-month-picker">
            <div className="sa-month-picker-actions">
                <button type="button" onClick={selectAll} className="sa-mp-btn">All</button>
                <button type="button" onClick={clearAll} className="sa-mp-btn">Clear</button>
            </div>
            <div className="sa-month-chips">
                {availableMonths.map(m => (
                    <button
                        key={m}
                        type="button"
                        className={`sa-month-chip ${selectedMonths.includes(m) ? 'active' : ''}`}
                        onClick={() => toggle(m)}
                    >
                        {monthLabel(m)}
                    </button>
                ))}
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

const AnalyticsDashboard = ({ tickets = [], devOpsMembers = [], projects = [], showCost = true, userRole = 'admin' }) => {
    const [activeView, setActiveView] = useState('overview');
    const [filterEnv, setFilterEnv] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [selectedMonths, setSelectedMonths] = useState([]);

    // Derive available months from tickets
    const availableMonths = useMemo(() => {
        const set = new Set();
        tickets.forEach(t => {
            if (t.createdAt) set.add(getMonthKey(t.createdAt));
        });
        return [...set].sort();
    }, [tickets]);

    // Filtered ticket set
    const filtered = useMemo(() => {
        let result = [...tickets];
        if (filterEnv) result = result.filter(t => t.environment === filterEnv);
        if (filterProduct) result = result.filter(t => t.productName === filterProduct);
        if (selectedMonths.length > 0) {
            result = result.filter(t => t.createdAt && selectedMonths.includes(getMonthKey(t.createdAt)));
        }
        return result;
    }, [tickets, filterEnv, filterProduct, selectedMonths]);

    const productNames = useMemo(
        () => [...new Set(tickets.map(t => t.productName).filter(Boolean))].sort(),
        [tickets]
    );
    const assigneeNames = useMemo(
        () => [...new Set(tickets.map(t => t.assignedTo).filter(Boolean))].sort(),
        [tickets]
    );

    const hasActiveFilters = filterEnv || filterProduct || selectedMonths.length > 0;
    const clearFilters = () => { setFilterEnv(''); setFilterProduct(''); setSelectedMonths([]); };

    const canViewCost = showCost && ['admin', 'devops'].includes(String(userRole || '').toLowerCase());
    // Hide cost view if not allowed
    const views = canViewCost ? ANALYTICS_VIEWS : ANALYTICS_VIEWS.filter(v => v.key !== 'cost');

    const SELECT_STYLE = {
        padding: '0.4rem 2rem 0.4rem 0.7rem',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        color: '#374151',
        background: '#fff',
        cursor: 'pointer',
        outline: 'none',
        appearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '14px',
    };

    return (
        <div className="sa-analytics-root">
            {/* ─── View Selector + Filters ─── */}
            <div className="sa-toolbar">
                <div className="sa-toolbar-left">
                    <div className="sa-view-dropdown-wrap">
                        <select
                            className="sa-view-dropdown"
                            value={activeView}
                            onChange={e => setActiveView(e.target.value)}
                        >
                            {views.map(v => (
                                <option key={v.key} value={v.key}>{v.label}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="sa-dd-icon" />
                    </div>
                </div>

                <div className="sa-toolbar-filters">
                    <Filter size={14} style={{ color: '#9ca3af' }} />
                    <select value={filterEnv} onChange={e => setFilterEnv(e.target.value)} style={SELECT_STYLE}>
                        <option value="">All Environments</option>
                        {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={SELECT_STYLE}>
                        <option value="">All Products</option>
                        {productNames.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="sa-clear-btn">
                            <X size={13} /> Clear
                        </button>
                    )}
                    <span className="sa-filter-count">
                        <strong>{filtered.length}</strong> ticket{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Month picker */}
            {availableMonths.length > 1 && (
                <MonthPicker
                    availableMonths={availableMonths}
                    selectedMonths={selectedMonths}
                    onChange={setSelectedMonths}
                />
            )}

            {/* ─── View Content ─── */}
            {activeView === 'overview' && <OverviewView tickets={filtered} />}
            {activeView === 'infrastructure' && <InfrastructureView tickets={filtered} />}
            {activeView === 'traffic' && <TrafficView tickets={filtered} />}
            {activeView === 'cost' && canViewCost && <CostView tickets={filtered} selectedMonths={selectedMonths} availableMonths={availableMonths} />}
            {activeView === 'team' && <TeamView tickets={filtered} devOpsMembers={devOpsMembers} />}
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: OVERVIEW
   ═══════════════════════════════════════════════════ */

const OverviewView = ({ tickets }) => {
    const total = tickets.length;
    const resolved = tickets.filter(t => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length;
    const inProgress = tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length;
    const pending = tickets.filter(t => t.status === TICKET_STATUS.CREATED).length;
    const actionRequired = tickets.filter(t => t.status === TICKET_STATUS.ACTION_REQUIRED).length;

    const avgResolutionDays = useMemo(() => {
        const done = tickets.filter(t => t.status === TICKET_STATUS.COMPLETED && t.createdAt);
        if (!done.length) return null;
        const totalMs = done.reduce((sum, t) => {
            let completedAt = null;
            if (t.timeline?.length) {
                const entry = t.timeline.find(e => e.status === TICKET_STATUS.COMPLETED);
                if (entry) completedAt = entry.timestamp;
            }
            if (!completedAt) completedAt = t.updatedAt;
            if (!completedAt) return sum;
            return sum + (new Date(completedAt).getTime() - new Date(t.createdAt).getTime());
        }, 0);
        return (totalMs / done.length / 86400000).toFixed(1);
    }, [tickets]);

    const byEnvironment = useMemo(() => groupBy(tickets, 'environment'), [tickets]);
    const byStatus = useMemo(() => groupBy(tickets, 'status'), [tickets]);
    const byProduct = useMemo(() => groupBy(tickets, 'productName'), [tickets]);
    const byMonth = useMemo(() => {
        const map = {};
        tickets.forEach(t => {
            if (!t.createdAt) return;
            const key = getMonthKey(t.createdAt);
            map[key] = (map[key] || 0) + 1;
        });
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [monthLabel(k), v]);
    }, [tickets]);

    // Environment activity
    const envActivity = useMemo(() => {
        const envs = [...new Set(tickets.map(t => t.environment || 'Unknown'))];
        return envs.map(env => {
            const envTickets = tickets.filter(t => (t.environment || 'Unknown') === env);
            const totalT = envTickets.length;
            const active = envTickets.filter(t => ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length;
            const done = envTickets.filter(t => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length;
            return { env, total: totalT, active, done, pct: totalT > 0 ? Math.round((done / totalT) * 100) : 0 };
        }).sort((a, b) => b.total - a.total);
    }, [tickets]);

    // Rising products
    const risingProducts = useMemo(() => {
        const now = Date.now();
        const thirtyDays = 30 * 86400000;
        const recent = tickets.filter(t => t.createdAt && (now - new Date(t.createdAt).getTime()) < thirtyDays);
        const older = tickets.filter(t => t.createdAt && (now - new Date(t.createdAt).getTime()) >= thirtyDays && (now - new Date(t.createdAt).getTime()) < 2 * thirtyDays);
        const recentMap = {};
        recent.forEach(t => { recentMap[t.productName || 'Unknown'] = (recentMap[t.productName || 'Unknown'] || 0) + 1; });
        const olderMap = {};
        older.forEach(t => { olderMap[t.productName || 'Unknown'] = (olderMap[t.productName || 'Unknown'] || 0) + 1; });
        return Object.entries(recentMap)
            .map(([name, count]) => ({ name, count, prev: olderMap[name] || 0, delta: count - (olderMap[name] || 0) }))
            .filter(p => p.delta > 0)
            .sort((a, b) => b.delta - a.delta)
            .slice(0, 5);
    }, [tickets]);

    return (
        <div className="sa-view-content">
            {/* KPI Cards */}
            <div className="sa-metrics-grid">
                <MetricCard icon={Layers} label="Total Tickets" value={total} color="#2563eb" />
                <MetricCard icon={CheckCircle} label="Resolved" value={resolved} color="#16a34a" sub={`${total > 0 ? Math.round((resolved / total) * 100) : 0}% resolution`} />
                <MetricCard icon={PlayCircle} label="In Progress" value={inProgress} color="#7c3aed" />
                <MetricCard icon={Clock} label="Avg Resolution" value={avgResolutionDays ? `${avgResolutionDays}d` : '—'} color="#ea580c" />
                <MetricCard icon={AlertCircle} label="Action Required" value={actionRequired} color="#dc2626" />
                <MetricCard icon={Zap} label="Pending" value={pending} color="#0891b2" />
            </div>

            {/* Environment Activity */}
            {envActivity.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Globe size={18} /> Environment Activity</h3>
                    <div className="sa-env-grid">
                        {envActivity.map(ea => (
                            <div key={ea.env} className="sa-env-card">
                                <div className="sa-env-card-header">
                                    <span className="sa-env-name">{ea.env}</span>
                                    <span className={`sa-env-status ${ea.active > 0 ? 'active' : 'idle'}`}>
                                        {ea.active > 0 ? `${ea.active} active` : 'Idle'}
                                    </span>
                                </div>
                                <div className="sa-env-stats">
                                    <span>{ea.total} total</span>
                                    <span>{ea.done} resolved</span>
                                </div>
                                <div className="sa-env-bar-track">
                                    <div className="sa-env-bar-fill" style={{ width: `${ea.pct}%` }} />
                                </div>
                                <span className="sa-env-pct">{ea.pct}% resolved</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Rising Products */}
            {risingProducts.length > 0 && (
                <div className="sa-card">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> Rising Products (30d)</h3>
                    <div className="sa-rising-list">
                        {risingProducts.map(p => (
                            <div key={p.name} className="sa-rising-item">
                                <span className="sa-rising-name">{p.name}</span>
                                <span className="sa-rising-count">{p.count} tickets</span>
                                <span className="sa-rising-delta">+{p.delta}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Charts */}
            <div className="sa-charts-grid">
                <div className="sa-card">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> By Environment</h3>
                    <HorizontalBarChart data={byEnvironment} color="#2563eb" />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><BarChart3 size={18} /> By Status</h3>
                    <HorizontalBarChart data={byStatus} color="#7c3aed" />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><Activity size={18} /> By Product</h3>
                    <HorizontalBarChart data={byProduct} color="#ea580c" />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> Monthly Trend</h3>
                    <HorizontalBarChart data={byMonth} color="#0891b2" />
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: INFRASTRUCTURE
   ═══════════════════════════════════════════════════ */

const InfrastructureView = ({ tickets }) => {
    // Extract infra data from workflowConfiguration.infrastructure
    const infraData = useMemo(() => {
        const map = {};
        tickets.forEach(t => {
            const infra = t.workflowConfiguration?.infrastructure;
            if (!infra) return;
            const key = t.productName || 'Unknown';
            if (!map[key]) {
                map[key] = {
                    product: key,
                    env: t.environment || '—',
                    cpu: infra.cpu || '—',
                    memory: infra.memory || '—',
                    cloud: infra.cloudProvider || '—',
                    region: infra.region || '—',
                    db: infra.databaseType || '—',
                    dbAlloc: infra.databaseAllocation || '—',
                    monthly: infra.monthlyCostEstimate || '—',
                    ticketCount: 0,
                };
            }
            map[key].ticketCount++;
        });
        return Object.values(map).sort((a, b) => b.ticketCount - a.ticketCount);
    }, [tickets]);

    // Aggregate CPU/Memory stats
    const cpuStats = useMemo(() => {
        const cpuMap = {};
        infraData.forEach(i => {
            if (i.cpu && i.cpu !== '—') {
                cpuMap[i.cpu] = (cpuMap[i.cpu] || 0) + i.ticketCount;
            }
        });
        return Object.entries(cpuMap).sort((a, b) => b[1] - a[1]);
    }, [infraData]);

    const memoryStats = useMemo(() => {
        const memMap = {};
        infraData.forEach(i => {
            if (i.memory && i.memory !== '—') {
                memMap[i.memory] = (memMap[i.memory] || 0) + i.ticketCount;
            }
        });
        return Object.entries(memMap).sort((a, b) => b[1] - a[1]);
    }, [infraData]);

    const cloudStats = useMemo(() => {
        const cloudMap = {};
        infraData.forEach(i => {
            if (i.cloud && i.cloud !== '—') {
                cloudMap[i.cloud] = (cloudMap[i.cloud] || 0) + i.ticketCount;
            }
        });
        return Object.entries(cloudMap).sort((a, b) => b[1] - a[1]);
    }, [infraData]);

    return (
        <div className="sa-view-content">
            <div className="sa-metrics-grid">
                <MetricCard icon={Cpu} label="Products with Infra" value={infraData.length} color="#7c3aed" />
                <MetricCard icon={Server} label="CPU Configs" value={cpuStats.length} color="#2563eb" />
                <MetricCard icon={HardDrive} label="Memory Configs" value={memoryStats.length} color="#16a34a" />
                <MetricCard icon={Globe} label="Cloud Providers" value={cloudStats.length} color="#ea580c" />
            </div>

            <div className="sa-charts-grid">
                <div className="sa-card">
                    <h3 className="sa-card-title"><Cpu size={18} /> CPU Distribution</h3>
                    <HorizontalBarChart data={cpuStats} color="#7c3aed" emptyMsg="No CPU data configured" />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><HardDrive size={18} /> Memory Distribution</h3>
                    <HorizontalBarChart data={memoryStats} color="#16a34a" emptyMsg="No memory data configured" />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><Globe size={18} /> Cloud Provider Usage</h3>
                    <HorizontalBarChart data={cloudStats} color="#ea580c" emptyMsg="No cloud data configured" />
                </div>
            </div>

            {/* Infra Detail Table */}
            {infraData.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Server size={18} /> Infrastructure Detail</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    {['Product', 'Environment', 'CPU', 'Memory', 'Cloud', 'Region', 'Database', 'Monthly Est.', 'Tickets'].map(h => (
                                        <th key={h}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {infraData.map((row, i) => (
                                    <tr key={row.product} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{row.product}</td>
                                        <td>{row.env}</td>
                                        <td><span className="sa-infra-chip cpu">{row.cpu}</span></td>
                                        <td><span className="sa-infra-chip mem">{row.memory}</span></td>
                                        <td>{row.cloud}</td>
                                        <td>{row.region}</td>
                                        <td>{row.db}{row.dbAlloc !== '—' ? ` (${row.dbAlloc})` : ''}</td>
                                        <td>{row.monthly}</td>
                                        <td className="sa-td-center">{row.ticketCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: TRAFFIC (INGRESS / EGRESS)
   ═══════════════════════════════════════════════════ */

const TrafficView = ({ tickets }) => {
    const now = new Date();
    const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewEnv, setViewEnv] = useState('');

    const ingressTickets = useMemo(() =>
        tickets.filter(t => t.requestType === REQUEST_TYPES.ENVIRONMENT_UP || t.requestType === 'Environment Up'),
    [tickets]);
    const egressTickets = useMemo(() =>
        tickets.filter(t => t.requestType === REQUEST_TYPES.ENVIRONMENT_DOWN || t.requestType === 'Environment Down'),
    [tickets]);

    const totalIngress = ingressTickets.length;
    const totalEgress = egressTickets.length;

    // Daily breakdown for chart
    const { ingress, egress } = useMemo(() => {
        const ing = {};
        const eg = {};
        const filterByMonthYear = (t) => {
            if (!t.createdAt) return false;
            const d = new Date(t.createdAt);
            if (d.getFullYear() !== viewYear || d.getMonth() + 1 !== viewMonth) return false;
            if (viewEnv && t.environment !== viewEnv) return false;
            return true;
        };
        ingressTickets.filter(filterByMonthYear).forEach(t => {
            const day = new Date(t.createdAt).getDate();
            ing[day] = (ing[day] || 0) + 1;
        });
        egressTickets.filter(filterByMonthYear).forEach(t => {
            const day = new Date(t.createdAt).getDate();
            eg[day] = (eg[day] || 0) + 1;
        });
        return { ingress: ing, egress: eg };
    }, [ingressTickets, egressTickets, viewMonth, viewYear, viewEnv]);

    // Monthly trend data
    const monthlyTraffic = useMemo(() => {
        const map = {};
        [...ingressTickets, ...egressTickets].forEach(t => {
            if (!t.createdAt) return;
            const key = getMonthKey(t.createdAt);
            if (!map[key]) map[key] = { ingress: 0, egress: 0 };
            if (t.requestType === REQUEST_TYPES.ENVIRONMENT_UP || t.requestType === 'Environment Up') {
                map[key].ingress++;
            } else {
                map[key].egress++;
            }
        });
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    }, [ingressTickets, egressTickets]);

    // By environment
    const byEnvTraffic = useMemo(() => {
        const map = {};
        const allTraffic = [...ingressTickets, ...egressTickets];
        allTraffic.forEach(t => {
            const env = t.environment || 'Unknown';
            if (!map[env]) map[env] = { ingress: 0, egress: 0, total: 0 };
            if (t.requestType === REQUEST_TYPES.ENVIRONMENT_UP || t.requestType === 'Environment Up') {
                map[env].ingress++;
            } else {
                map[env].egress++;
            }
            map[env].total++;
        });
        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    }, [ingressTickets, egressTickets]);

    const SELECT_STYLE = {
        padding: '0.35rem 1.8rem 0.35rem 0.6rem',
        border: '1px solid #d1d5db',
        borderRadius: '7px',
        fontSize: '0.8rem',
        color: '#374151',
        background: '#fff',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
    };

    return (
        <div className="sa-view-content">
            <div className="sa-metrics-grid">
                <MetricCard icon={ArrowUpCircle} label="Total Ingress" value={totalIngress} color="#22c55e" sub="Environment Up" />
                <MetricCard icon={ArrowDownCircle} label="Total Egress" value={totalEgress} color="#ef4444" sub="Environment Down" />
                <MetricCard icon={Activity} label="Net Flow" value={totalIngress - totalEgress} color={totalIngress >= totalEgress ? '#22c55e' : '#ef4444'} />
                <MetricCard icon={Globe} label="Environments" value={byEnvTraffic.length} color="#2563eb" />
            </div>

            {/* Daily Chart */}
            <div className="sa-card sa-card-full">
                <div className="sa-card-header-row">
                    <h3 className="sa-card-title"><Activity size={18} /> Daily Traffic</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <select value={viewEnv} onChange={e => setViewEnv(e.target.value)} style={SELECT_STYLE}>
                            <option value="">All Envs</option>
                            {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} style={SELECT_STYLE}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(undefined, { month: 'long' })}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={viewYear}
                            onChange={e => setViewYear(Number(e.target.value))}
                            style={{ ...SELECT_STYLE, width: 80 }}
                        />
                    </div>
                </div>
                <DailyBarChart
                    days={daysInMonth(viewYear, viewMonth)}
                    ingress={ingress}
                    egress={egress}
                    month={viewMonth}
                    year={viewYear}
                />
            </div>

            {/* By Environment table */}
            {byEnvTraffic.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Globe size={18} /> Traffic by Environment</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    <th>Environment</th>
                                    <th>↑ Ingress</th>
                                    <th>↓ Egress</th>
                                    <th>Total</th>
                                    <th>Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byEnvTraffic.map(([env, data], i) => (
                                    <tr key={env} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{env}</td>
                                        <td style={{ color: '#16a34a' }}>{data.ingress}</td>
                                        <td style={{ color: '#dc2626' }}>{data.egress}</td>
                                        <td>{data.total}</td>
                                        <td>
                                            <div className="sa-ratio-bar">
                                                <div className="sa-ratio-ingress" style={{ width: `${data.total > 0 ? (data.ingress / data.total) * 100 : 50}%` }} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Monthly Trend */}
            {monthlyTraffic.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> Monthly Traffic Trend</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Month</th><th>↑ Ingress</th><th>↓ Egress</th><th>Net</th></tr>
                            </thead>
                            <tbody>
                                {monthlyTraffic.map(([month, data], i) => (
                                    <tr key={month} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{monthLabel(month)}</td>
                                        <td style={{ color: '#16a34a' }}>{data.ingress}</td>
                                        <td style={{ color: '#dc2626' }}>{data.egress}</td>
                                        <td style={{ color: data.ingress >= data.egress ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                            {data.ingress - data.egress >= 0 ? '+' : ''}{data.ingress - data.egress}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: COST ESTIMATION (Admin/DevOps only)
   ═══════════════════════════════════════════════════ */

const CostView = ({ tickets, selectedMonths, availableMonths }) => {
    const ticketsWithCost = useMemo(() =>
        tickets.filter(t => t.estimatedCost != null && Number(t.estimatedCost) > 0),
    [tickets]);

    // Total cost by currency
    const totalByCurrency = useMemo(() => {
        const map = {};
        ticketsWithCost.forEach(t => {
            const cur = t.costCurrency || 'USD';
            map[cur] = (map[cur] || 0) + Number(t.estimatedCost);
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [ticketsWithCost]);

    // Primary currency total
    const primaryCurrency = totalByCurrency.length > 0 ? totalByCurrency[0][0] : 'USD';
    const primaryTotal = totalByCurrency.length > 0 ? totalByCurrency[0][1] : 0;

    // Cost by environment
    const costByEnv = useMemo(() => {
        const map = {};
        ticketsWithCost.forEach(t => {
            const env = t.environment || 'Unknown';
            const cur = t.costCurrency || 'USD';
            if (!map[env]) map[env] = {};
            map[env][cur] = (map[env][cur] || 0) + Number(t.estimatedCost);
        });
        return Object.entries(map).sort((a, b) => {
            const aTotal = Object.values(a[1]).reduce((s, v) => s + v, 0);
            const bTotal = Object.values(b[1]).reduce((s, v) => s + v, 0);
            return bTotal - aTotal;
        });
    }, [ticketsWithCost]);

    // Cost by product
    const costByProduct = useMemo(() => {
        const map = {};
        ticketsWithCost.forEach(t => {
            const p = t.productName || 'Unknown';
            const cur = t.costCurrency || 'USD';
            if (!map[p]) map[p] = { total: 0, currency: cur };
            map[p].total += Number(t.estimatedCost);
        });
        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    }, [ticketsWithCost]);

    // Monthly cost trend
    const monthlyCost = useMemo(() => {
        const map = {};
        ticketsWithCost.forEach(t => {
            if (!t.createdAt) return;
            const key = getMonthKey(t.createdAt);
            const cur = t.costCurrency || 'USD';
            if (!map[key]) map[key] = {};
            map[key][cur] = (map[key][cur] || 0) + Number(t.estimatedCost);
        });
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    }, [ticketsWithCost]);

    // Cost by assignee
    const costByAssignee = useMemo(() => {
        const map = {};
        ticketsWithCost.forEach(t => {
            const a = t.assignedTo || 'Unassigned';
            const cur = t.costCurrency || 'USD';
            if (!map[a]) map[a] = { total: 0, currency: cur, tickets: 0 };
            map[a].total += Number(t.estimatedCost);
            map[a].tickets++;
        });
        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    }, [ticketsWithCost]);

    return (
        <div className="sa-view-content">
            <div className="sa-metrics-grid">
                <MetricCard icon={DollarSign} label="Total Estimated Cost" value={fmtCurrency(primaryTotal, primaryCurrency)} color="#16a34a" />
                <MetricCard icon={Layers} label="Tickets with Cost" value={ticketsWithCost.length} color="#7c3aed" sub={`of ${tickets.length} total`} />
                <MetricCard icon={Globe} label="Environments" value={costByEnv.length} color="#2563eb" />
                <MetricCard icon={Users} label="Assignees" value={costByAssignee.length} color="#ea580c" />
            </div>

            {/* Cost by Product */}
            {costByProduct.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Activity size={18} /> Cost by Product</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Product</th><th>Estimated Cost</th><th>Share</th></tr>
                            </thead>
                            <tbody>
                                {costByProduct.map(([product, data], i) => (
                                    <tr key={product} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{product}</td>
                                        <td style={{ fontWeight: 600 }}>{fmtCurrency(data.total, data.currency)}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div className="sa-env-bar-track" style={{ flex: 1 }}>
                                                    <div className="sa-env-bar-fill" style={{ width: `${primaryTotal > 0 ? (data.total / primaryTotal) * 100 : 0}%`, background: '#7c3aed' }} />
                                                </div>
                                                <span style={{ fontSize: '0.8rem', color: '#6b7280', minWidth: 36, textAlign: 'right' }}>
                                                    {primaryTotal > 0 ? Math.round((data.total / primaryTotal) * 100) : 0}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Monthly Cost Trend */}
            {monthlyCost.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> Monthly Cost Trend</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Month</th>{totalByCurrency.map(([cur]) => <th key={cur}>Cost ({cur})</th>)}</tr>
                            </thead>
                            <tbody>
                                {monthlyCost.map(([month, curMap], i) => (
                                    <tr key={month} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{monthLabel(month)}</td>
                                        {totalByCurrency.map(([cur]) => (
                                            <td key={cur} style={{ fontWeight: 500 }}>{fmtCurrency(curMap[cur] || 0, cur)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Cost by Environment */}
            {costByEnv.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Globe size={18} /> Cost by Environment</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Environment</th>{totalByCurrency.map(([cur]) => <th key={cur}>{cur}</th>)}</tr>
                            </thead>
                            <tbody>
                                {costByEnv.map(([env, curMap], i) => (
                                    <tr key={env} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{env}</td>
                                        {totalByCurrency.map(([cur]) => (
                                            <td key={cur}>{fmtCurrency(curMap[cur] || 0, cur)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: TEAM ANALYTICS
   ═══════════════════════════════════════════════════ */

const TeamView = ({ tickets, devOpsMembers }) => {
    const resolvedByAssignee = useMemo(() => {
        const map = {};
        tickets
            .filter(t => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status))
            .forEach(t => {
                const name = t.assignedTo || 'Unassigned';
                map[name] = (map[name] || 0) + 1;
            });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [tickets]);

    const ticketsByAssignee = useMemo(() => {
        const map = {};
        tickets.forEach(t => {
            const name = t.assignedTo || 'Unassigned';
            if (!map[name]) map[name] = { total: 0, active: 0, resolved: 0 };
            map[name].total++;
            if ([TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)) {
                map[name].resolved++;
            } else {
                map[name].active++;
            }
        });
        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    }, [tickets]);

    // Avg resolution time by assignee
    const avgResByAssignee = useMemo(() => {
        const map = {};
        tickets
            .filter(t => t.status === TICKET_STATUS.COMPLETED && t.createdAt)
            .forEach(t => {
                const name = t.assignedTo || 'Unassigned';
                if (!map[name]) map[name] = { totalMs: 0, count: 0 };
                let completedAt = null;
                if (t.timeline?.length) {
                    const entry = t.timeline.find(e => e.status === TICKET_STATUS.COMPLETED);
                    if (entry) completedAt = entry.timestamp;
                }
                if (!completedAt) completedAt = t.updatedAt;
                if (!completedAt) return;
                map[name].totalMs += new Date(completedAt).getTime() - new Date(t.createdAt).getTime();
                map[name].count++;
            });
        return Object.entries(map)
            .map(([name, data]) => [name, data.count > 0 ? (data.totalMs / data.count / 86400000).toFixed(1) : '—'])
            .sort((a, b) => (parseFloat(a[1]) || 999) - (parseFloat(b[1]) || 999));
    }, [tickets]);

    // Team availability
    const availabilitySummary = useMemo(() => {
        const map = { Available: 0, Busy: 0, Away: 0, Offline: 0 };
        devOpsMembers.forEach(m => {
            const status = m.availability || 'Offline';
            map[status] = (map[status] || 0) + 1;
        });
        return map;
    }, [devOpsMembers]);

    return (
        <div className="sa-view-content">
            <div className="sa-metrics-grid">
                <MetricCard icon={Users} label="Team Members" value={devOpsMembers.length} color="#2563eb" />
                <MetricCard icon={CheckCircle} label="Available Now" value={availabilitySummary.Available} color="#16a34a" />
                <MetricCard icon={AlertCircle} label="Busy" value={availabilitySummary.Busy} color="#ea580c" />
                <MetricCard icon={Clock} label="Away / Offline" value={availabilitySummary.Away + availabilitySummary.Offline} color="#6b7280" />
            </div>

            <div className="sa-charts-grid">
                <div className="sa-card">
                    <h3 className="sa-card-title"><CheckCircle size={18} /> Resolved by Assignee</h3>
                    <HorizontalBarChart data={resolvedByAssignee} color="#16a34a" emptyMsg="No resolved tickets" labelWidth={140} />
                </div>
                <div className="sa-card">
                    <h3 className="sa-card-title"><Clock size={18} /> Avg Resolution (days)</h3>
                    <HorizontalBarChart data={avgResByAssignee} color="#ea580c" emptyMsg="No data" labelWidth={140} />
                </div>
            </div>

            {/* Team Workload Table */}
            {ticketsByAssignee.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><Users size={18} /> Team Workload</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Assignee</th><th>Total</th><th>Active</th><th>Resolved</th><th>Utilization</th></tr>
                            </thead>
                            <tbody>
                                {ticketsByAssignee.map(([name, data], i) => (
                                    <tr key={name} className={i % 2 === 0 ? 'even' : ''}>
                                        <td className="sa-td-bold">{name}</td>
                                        <td>{data.total}</td>
                                        <td style={{ color: '#7c3aed' }}>{data.active}</td>
                                        <td style={{ color: '#16a34a' }}>{data.resolved}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div className="sa-env-bar-track" style={{ flex: 1 }}>
                                                    <div className="sa-env-bar-fill" style={{
                                                        width: `${data.total > 0 ? (data.resolved / data.total) * 100 : 0}%`
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: '0.8rem', color: '#6b7280', minWidth: 36, textAlign: 'right' }}>
                                                    {data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
