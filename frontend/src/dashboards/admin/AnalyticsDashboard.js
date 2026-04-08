import React, { useState, useMemo } from 'react';
import {
    BarChart3,
    TrendingUp,
    Activity,
    CheckCircle,
    Clock,
    PlayCircle,
    Users,
    Filter,
    X
} from 'lucide-react';
import { TICKET_STATUS, ENVIRONMENTS } from '../../services/ticketService';

const SELECT_STYLE = {
    padding: '0.375rem 0.625rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    color: '#334155',
    background: '#fff',
    cursor: 'pointer',
    outline: 'none'
};

const BAR_COLORS = {
    env: '#2563eb',
    status: '#7c3aed',
    assignee: '#16a34a',
    product: '#ea580c',
    month: '#0891b2'
};

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

const HorizontalBarChart = ({ data, color, emptyMsg = 'No data' }) => {
    if (!data || data.length === 0) {
        return <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{emptyMsg}</p>;
    }
    const max = maxVal(data);
    return (
        <div className="analytics-chart">
            {data.map(([label, count]) => (
                <div key={label} className="chart-bar-row">
                    <span className="chart-label">{label || 'Unknown'}</span>
                    <div className="chart-bar-container">
                        <div
                            className="chart-bar"
                            style={{
                                width: `${(count / max) * 100}%`,
                                backgroundColor: color
                            }}
                        />
                    </div>
                    <span className="chart-value">{count}</span>
                </div>
            ))}
        </div>
    );
};

const AnalyticsDashboard = ({ tickets = [], devOpsMembers = [], projects = [] }) => {
    const [filterEnv, setFilterEnv] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [filterDateRange, setFilterDateRange] = useState('all');
    const [filterAssignedTo, setFilterAssignedTo] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const filtered = useMemo(() => {
        let result = [...tickets];

        if (filterEnv) {
            result = result.filter(t => t.environment === filterEnv);
        }
        if (filterProduct) {
            result = result.filter(t => t.productName === filterProduct);
        }
        if (filterAssignedTo) {
            result = result.filter(t => t.assignedTo === filterAssignedTo);
        }
        if (filterStatus) {
            result = result.filter(t => t.status === filterStatus);
        }
        if (filterDateRange && filterDateRange !== 'all') {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
            const days = daysMap[filterDateRange];
            if (days) {
                const cutoff = now - days * dayMs;
                result = result.filter(t => {
                    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
                    return created >= cutoff;
                });
            }
        }

        return result;
    }, [tickets, filterEnv, filterProduct, filterAssignedTo, filterStatus, filterDateRange]);

    const totalTickets = filtered.length;
    const resolvedCount = filtered.filter(t =>
        [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
    ).length;
    const inProgressCount = filtered.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length;

    const avgResolutionDays = useMemo(() => {
        const resolved = filtered.filter(t => t.status === TICKET_STATUS.COMPLETED && t.createdAt);
        if (!resolved.length) return null;
        const totalMs = resolved.reduce((sum, t) => {
            let completedAt = null;
            if (t.timeline && t.timeline.length > 0) {
                const entry = t.timeline.find(e => e.status === TICKET_STATUS.COMPLETED);
                if (entry) completedAt = entry.timestamp;
            }
            if (!completedAt) completedAt = t.updatedAt;
            if (!completedAt) return sum;
            return sum + (new Date(completedAt).getTime() - new Date(t.createdAt).getTime());
        }, 0);
        const avgDays = totalMs / resolved.length / (24 * 60 * 60 * 1000);
        return avgDays.toFixed(1);
    }, [filtered]);

    const byEnvironment = useMemo(() => groupBy(filtered, 'environment'), [filtered]);
    const byStatus = useMemo(() => groupBy(filtered, 'status'), [filtered]);
    const byProduct = useMemo(() => groupBy(filtered, 'productName'), [filtered]);

    const resolvedByAssignee = useMemo(() => {
        const map = {};
        filtered
            .filter(t => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status))
            .forEach(t => {
                const name = t.assignedTo || 'Unassigned';
                map[name] = (map[name] || 0) + 1;
            });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    const byMonth = useMemo(() => {
        const map = {};
        filtered.forEach(t => {
            if (!t.createdAt) return;
            const d = new Date(t.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            map[key] = (map[key] || 0) + 1;
        });
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    const envSummary = useMemo(() => {
        const envs = [...new Set(filtered.map(t => t.environment || 'Unknown'))];
        return envs
            .map(env => {
                const envTickets = filtered.filter(t => (t.environment || 'Unknown') === env);
                const total = envTickets.length;
                const resolved = envTickets.filter(t =>
                    [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
                ).length;
                const inProg = envTickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length;
                return {
                    env,
                    total,
                    resolved,
                    inProgress: inProg,
                    resolutionPct: total > 0 ? Math.round((resolved / total) * 100) : 0
                };
            })
            .sort((a, b) => b.total - a.total);
    }, [filtered]);

    const productNames = useMemo(
        () => [...new Set(tickets.map(t => t.productName).filter(Boolean))].sort(),
        [tickets]
    );
    const assigneeNames = useMemo(
        () => [...new Set(tickets.map(t => t.assignedTo).filter(Boolean))].sort(),
        [tickets]
    );

    const hasActiveFilters =
        filterEnv || filterProduct || filterDateRange !== 'all' || filterAssignedTo || filterStatus;

    const clearFilters = () => {
        setFilterEnv('');
        setFilterProduct('');
        setFilterDateRange('all');
        setFilterAssignedTo('');
        setFilterStatus('');
    };

    return (
        <div className="analytics-view">
            {/* Filter Bar */}
            <div
                className="analytics-filter-bar"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '1rem 1.25rem',
                    background: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '1.5rem',
                    alignItems: 'center'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
                    <Filter size={16} /> Filters
                </div>

                <select value={filterEnv} onChange={e => setFilterEnv(e.target.value)} style={SELECT_STYLE}>
                    <option value="">All Environments</option>
                    {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>

                <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={SELECT_STYLE}>
                    <option value="">All Products</option>
                    {productNames.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <select value={filterDateRange} onChange={e => setFilterDateRange(e.target.value)} style={SELECT_STYLE}>
                    <option value="all">All Time</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                </select>

                <select value={filterAssignedTo} onChange={e => setFilterAssignedTo(e.target.value)} style={SELECT_STYLE}>
                    <option value="">All Assignees</option>
                    {assigneeNames.map(a => <option key={a} value={a}>{a}</option>)}
                </select>

                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={SELECT_STYLE}>
                    <option value="">All Statuses</option>
                    {Object.values(TICKET_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            padding: '0.375rem 0.75rem',
                            background: 'transparent',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#64748b',
                            fontSize: '0.8125rem',
                            fontWeight: 500
                        }}
                    >
                        <X size={14} /> Clear Filters
                    </button>
                )}

                <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.8125rem' }}>
                    Showing <strong style={{ color: '#1e293b' }}>{totalTickets}</strong> ticket{totalTickets !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Metric Cards */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-card jira-style">
                    <div className="stat-icon blue"><BarChart3 size={24} /></div>
                    <div className="stat-value">{totalTickets}</div>
                    <span className="stat-label">Total Tickets</span>
                </div>
                <div className="stat-card jira-style">
                    <div className="stat-icon green"><CheckCircle size={24} /></div>
                    <div className="stat-value">{resolvedCount}</div>
                    <span className="stat-label">Resolved / Completed</span>
                </div>
                <div className="stat-card jira-style">
                    <div className="stat-icon purple"><PlayCircle size={24} /></div>
                    <div className="stat-value">{inProgressCount}</div>
                    <span className="stat-label">In Progress</span>
                </div>
                <div className="stat-card jira-style">
                    <div className="stat-icon orange"><Clock size={24} /></div>
                    <div className="stat-value">{avgResolutionDays !== null ? `${avgResolutionDays}d` : '—'}</div>
                    <span className="stat-label">Avg Resolution Time</span>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="analytics-grid">
                <div className="analytics-card">
                    <h3><TrendingUp size={18} /> Tickets by Environment</h3>
                    <HorizontalBarChart data={byEnvironment} color={BAR_COLORS.env} />
                </div>

                <div className="analytics-card">
                    <h3><BarChart3 size={18} /> Tickets by Status</h3>
                    <HorizontalBarChart data={byStatus} color={BAR_COLORS.status} />
                </div>

                <div className="analytics-card">
                    <h3><Users size={18} /> Resolved Tickets by Assignee</h3>
                    <HorizontalBarChart
                        data={resolvedByAssignee}
                        color={BAR_COLORS.assignee}
                        emptyMsg="No resolved tickets"
                    />
                </div>

                <div className="analytics-card">
                    <h3><Activity size={18} /> Tickets by Product</h3>
                    <HorizontalBarChart data={byProduct} color={BAR_COLORS.product} />
                </div>

                <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
                    <h3><TrendingUp size={18} /> Tickets Over Time (by Month)</h3>
                    <HorizontalBarChart data={byMonth} color={BAR_COLORS.month} />
                </div>
            </div>

            {/* Environment Summary Table */}
            <div className="analytics-card" style={{ marginTop: '1.5rem' }}>
                <h3><BarChart3 size={18} /> Ticket Resolution by Environment</h3>
                {envSummary.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No data available</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    {['Environment', 'Total', 'Resolved', 'In Progress', 'Resolution %'].map(h => (
                                        <th
                                            key={h}
                                            style={{
                                                padding: '0.625rem 0.875rem',
                                                textAlign: 'left',
                                                color: '#64748b',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {envSummary.map((row, i) => (
                                    <tr
                                        key={row.env}
                                        style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: i % 2 === 0 ? '#fff' : '#f8fafc'
                                        }}
                                    >
                                        <td style={{ padding: '0.625rem 0.875rem', fontWeight: 500, color: '#1e293b' }}>
                                            {row.env}
                                        </td>
                                        <td style={{ padding: '0.625rem 0.875rem', color: '#475569' }}>{row.total}</td>
                                        <td style={{ padding: '0.625rem 0.875rem', color: '#16a34a', fontWeight: 500 }}>{row.resolved}</td>
                                        <td style={{ padding: '0.625rem 0.875rem', color: '#7c3aed' }}>{row.inProgress}</td>
                                        <td style={{ padding: '0.625rem 0.875rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${row.resolutionPct}%`, background: '#16a34a', borderRadius: 3 }} />
                                                </div>
                                                <span style={{ minWidth: 36, textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                                                    {row.resolutionPct}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
