import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
    Zap,
    Pencil,
    Save,
    Loader2,
    CalendarRange,
    MoveUp,
    MoveDown,
    Trash2,
    Plus,
} from 'lucide-react';
import { TICKET_STATUS, ENVIRONMENTS, REQUEST_TYPES } from '../../services/ticketService';
import { getAnalyticsSettings, saveAnalyticsSettings } from '../../services/analyticsSettingsService';
import { ProjectRoadmapChart } from '../../components/ProjectRoadmap';

/* ═══════════════════════════════════════════════════
   SHARED HELPERS
   ═══════════════════════════════════════════════════ */

const ANALYTICS_VIEWS = [
    { key: 'overview',       label: 'Overview',           icon: BarChart3 },
    { key: 'infrastructure', label: 'Infrastructure',     icon: Cpu },
    { key: 'traffic',        label: 'Traffic (Ingress / Egress)', icon: Activity },
    { key: 'roadmap',        label: 'Project roadmap',    icon: CalendarRange },
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
    const symbols = { USD: '$', INR: '₹', AED: 'د.إ', QAR: 'ر.ق', SAR: '﷼', EUR: '€' };
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

const clamp0 = (n) => Math.max(0, Math.round(Number.isFinite(Number(n)) ? Number(n) : 0));

function normalizeAnalyticsSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
        id: s.id || 'global',
        overviewMetricDeltas: { ...(s.overviewMetricDeltas || {}) },
        dayTrafficDeltas: Array.isArray(s.dayTrafficDeltas) ? [...s.dayTrafficDeltas] : [],
        monthTrafficDeltas: Array.isArray(s.monthTrafficDeltas) ? [...s.monthTrafficDeltas] : [],
        envTrafficDeltas: Array.isArray(s.envTrafficDeltas) ? [...s.envTrafficDeltas] : [],
        projectTimelineSegments: Array.isArray(s.projectTimelineSegments)
            ? s.projectTimelineSegments.map((row, i) => ({ ...row, sortOrder: Number(row?.sortOrder) || i }))
            : [],
        monitoringDisplayToggles: Array.isArray(s.monitoringDisplayToggles)
            ? s.monitoringDisplayToggles.map((t) => ({
                  productName: t.productName || '',
                  environment: t.environment || '',
                  enabled: t.enabled !== false,
                  runningOverride:
                      t.runningOverride === true ? true : t.runningOverride === false ? false : null,
                  manualRunningSince: t.manualRunningSince ?? null,
                  manualRunningStoppedAt: t.manualRunningStoppedAt ?? null,
              }))
            : [],
        updatedAt: s.updatedAt,
        updatedBy: s.updatedBy,
    };
}

function newTimelineSegmentId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function reindexTimelineSegments(list) {
    return list.map((row, i) => ({ ...row, sortOrder: i }));
}

function mergeTrafficDaySeries(baseIng, baseEg, viewYear, viewMonth, viewEnv, deltas) {
    const envKey = viewEnv || '';
    const ing = { ...baseIng };
    const eg = { ...baseEg };
    const addIng = {};
    const addEg = {};
    (deltas || []).forEach((d) => {
        if (d.year !== viewYear || d.month !== viewMonth) return;
        if ((d.environment || '') !== envKey) return;
        const day = d.day;
        addIng[day] = (addIng[day] || 0) + (d.ingressDelta || 0);
        addEg[day] = (addEg[day] || 0) + (d.egressDelta || 0);
    });
    Object.keys(addIng).forEach((k) => {
        const day = Number(k);
        ing[day] = clamp0((ing[day] || 0) + addIng[day]);
    });
    Object.keys(addEg).forEach((k) => {
        const day = Number(k);
        eg[day] = clamp0((eg[day] || 0) + addEg[day]);
    });
    return { ingress: ing, egress: eg };
}

function sumMonthTrafficDelta(yearMonth, deltas) {
    let ing = 0;
    let eg = 0;
    (deltas || []).forEach((m) => {
        if (m.yearMonth === yearMonth) {
            ing += m.ingressDelta || 0;
            eg += m.egressDelta || 0;
        }
    });
    return { ingressDelta: ing, egressDelta: eg };
}

function mergeMonthlyTrafficRows(monthRows, monthDeltas) {
    const deltaAgg = new Map();
    (monthDeltas || []).forEach((m) => {
        if (!m || !m.yearMonth) return;
        const prev = deltaAgg.get(m.yearMonth) || { i: 0, e: 0 };
        deltaAgg.set(m.yearMonth, {
            i: prev.i + (m.ingressDelta || 0),
            e: prev.e + (m.egressDelta || 0),
        });
    });
    const map = new Map(monthRows);
    deltaAgg.forEach((de, ym) => {
        const cur = map.get(ym) || { ingress: 0, egress: 0 };
        map.set(ym, {
            ingress: clamp0(cur.ingress + de.i),
            egress: clamp0(cur.egress + de.e),
        });
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function mergeEnvTrafficRows(rows, envDeltas) {
    const deltaByEnv = new Map();
    (envDeltas || []).forEach((ex) => {
        const env = ex.environment || '';
        const prev = deltaByEnv.get(env) || { ingressDelta: 0, egressDelta: 0 };
        deltaByEnv.set(env, {
            ingressDelta: prev.ingressDelta + (ex.ingressDelta || 0),
            egressDelta: prev.egressDelta + (ex.egressDelta || 0),
        });
    });
    const seen = new Set();
    const merged = rows.map(([env, data]) => {
        seen.add(env);
        const ex = deltaByEnv.get(env) || { ingressDelta: 0, egressDelta: 0 };
        const ingress = clamp0(data.ingress + (ex.ingressDelta || 0));
        const egress = clamp0(data.egress + (ex.egressDelta || 0));
        return [env, { ingress, egress, total: ingress + egress }];
    });
    deltaByEnv.forEach((agg, env) => {
        if (!env || seen.has(env)) return;
        merged.push([
            env,
            {
                ingress: clamp0(agg.ingressDelta || 0),
                egress: clamp0(agg.egressDelta || 0),
                total: clamp0((agg.ingressDelta || 0) + (agg.egressDelta || 0)),
            },
        ]);
    });
    return merged.sort((a, b) => b[1].total - a[1].total);
}

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
   VIEW: PROJECT ROADMAP (admin configures; all roles see chart)
   ═══════════════════════════════════════════════════ */

const ROADMAP_SELECT_STYLE = {
    padding: '0.35rem 1.75rem 0.35rem 0.55rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.8125rem',
    color: '#374151',
    background: 'var(--card-bg, #fff)',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    minWidth: 0,
    backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 6px center',
    backgroundSize: '14px',
};

const ProjectRoadmapView = ({
    projects = [],
    ticketProductNames = [],
    analyticsSettings,
    setAnalyticsSettings,
    isAdminRole,
    onPersistAnalytics,
    savingAnalytics,
}) => {
    const norm = normalizeAnalyticsSettings(analyticsSettings);

    const projectByName = useMemo(() => {
        const m = new Map();
        (projects || []).forEach((p) => {
            const n = (p && (p.name || p.projectName || '')).trim();
            if (n) m.set(n, p);
        });
        return m;
    }, [projects]);

    const projectChoices = useMemo(() => {
        const s = new Set();
        projectByName.forEach((_, k) => s.add(k));
        (ticketProductNames || []).forEach((n) => {
            if (n) s.add(n);
        });
        return [...s].sort();
    }, [projectByName, ticketProductNames]);

    const [quickProject, setQuickProject] = useState('');

    useEffect(() => {
        if (!quickProject && projectChoices.length > 0) {
            setQuickProject(projectChoices[0]);
        }
        if (quickProject && projectChoices.length > 0 && !projectChoices.includes(quickProject)) {
            setQuickProject(projectChoices[0]);
        }
    }, [projectChoices, quickProject]);

    const envChoicesForQuick = useMemo(() => {
        const p = projectByName.get(quickProject);
        const fromCfg = p && Array.isArray(p.environments) ? p.environments.filter(Boolean) : [];
        return fromCfg.length > 0 ? fromCfg : ENVIRONMENTS;
    }, [projectByName, quickProject]);

    const patchSegments = useCallback(
        (fn) => {
            setAnalyticsSettings((prev) => {
                const base = normalizeAnalyticsSettings(prev);
                const cur = [...(base.projectTimelineSegments || [])];
                cur.sort(
                    (a, b) =>
                        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                        String(a.id || '').localeCompare(String(b.id || ''))
                );
                const next = fn(cur);
                return { ...base, projectTimelineSegments: reindexTimelineSegments(next) };
            });
        },
        [setAnalyticsSettings]
    );

    const updateRow = useCallback(
        (idx, patch) => {
            patchSegments((rows) => {
                const next = [...rows];
                if (!next[idx]) return rows;
                next[idx] = { ...next[idx], ...patch };
                return next;
            });
        },
        [patchSegments]
    );

    const moveRow = (idx, delta) => {
        patchSegments((rows) => {
            const next = [...rows];
            const j = idx + delta;
            if (j < 0 || j >= next.length) return rows;
            [next[idx], next[j]] = [next[j], next[idx]];
            return next;
        });
    };

    const removeRow = (idx) => {
        patchSegments((rows) => {
            const next = [...rows];
            next.splice(idx, 1);
            return next;
        });
    };

    const addRow = () => {
        const pn = (quickProject || projectChoices[0] || '').trim() || 'Project';
        const envFirst = envChoicesForQuick[0] || '';
        patchSegments((rows) => [
            ...rows,
            {
                id: newTimelineSegmentId(),
                projectName: pn,
                environment: envFirst,
                startDate: new Date().toISOString().slice(0, 10),
                endDate: '',
                label: '',
                color: '',
                sortOrder: rows.length,
            },
        ]);
    };

    const rowsOrdered = useMemo(() => {
        const raw = [...(norm.projectTimelineSegments || [])];
        raw.sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                String(a.id || '').localeCompare(String(b.id || ''))
        );
        return raw;
    }, [norm.projectTimelineSegments]);

    const envOptionsForRow = (row) => {
        const p = projectByName.get(String(row.projectName || '').trim());
        const fromCfg = p && Array.isArray(p.environments) ? p.environments.filter(Boolean) : [];
        return fromCfg.length > 0 ? fromCfg : ENVIRONMENTS;
    };

    return (
        <div className="sa-view-content">
            <div className="sa-card sa-card-full sa-roadmap-published">
                <h3 className="sa-card-title">
                    <CalendarRange size={18} /> Published timeline
                </h3>
                <p className="sa-roadmap-intro">
                    This timeline is shown on the User and DevOps monitoring page. Each bar is one product and environment window;
                    colors follow the project when no custom color is set.
                </p>
                <ProjectRoadmapChart segments={norm.projectTimelineSegments} title="Projects running by environment" />
            </div>

            {isAdminRole && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title">Edit timeline rows</h3>
                    <p className="sa-roadmap-intro">
                        Choose a configured product and environment, set dates, then save. Use the arrows to move a row up or down
                        (order matches the chart).
                    </p>

                    <div className="sa-roadmap-quick-add">
                        <span className="sa-roadmap-quick-label">Add using</span>
                        {projectChoices.length > 0 ? (
                            <select
                                className="sa-roadmap-quick-select"
                                style={ROADMAP_SELECT_STYLE}
                                value={quickProject}
                                onChange={(e) => setQuickProject(e.target.value)}
                            >
                                {projectChoices.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                className="sa-admin-input sa-admin-input--sm sa-roadmap-quick-text"
                                placeholder="Product name for new rows"
                                value={quickProject}
                                onChange={(e) => setQuickProject(e.target.value)}
                            />
                        )}
                        <button type="button" className="sa-admin-secondary-btn" onClick={addRow}>
                            <Plus size={15} /> Add segment
                        </button>
                    </div>

                    <div className="sa-table-wrap sa-roadmap-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 72 }}>Order</th>
                                    <th>Project</th>
                                    <th>Environment</th>
                                    <th>Start</th>
                                    <th>End</th>
                                    <th>Label</th>
                                    <th style={{ width: 100 }}>Color</th>
                                    <th style={{ width: 56 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {rowsOrdered.map((row, idx) => {
                                    const envOpts = envOptionsForRow(row);
                                    const colorVal = /^#[0-9a-fA-F]{6}$/.test(row.color || '') ? row.color : '#2563eb';
                                    return (
                                        <tr key={row.id || idx}>
                                            <td>
                                                <div className="sa-roadmap-order-btns">
                                                    <button
                                                        type="button"
                                                        className="sa-roadmap-icon-btn"
                                                        title="Move up"
                                                        disabled={idx === 0}
                                                        onClick={() => moveRow(idx, -1)}
                                                    >
                                                        <MoveUp size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="sa-roadmap-icon-btn"
                                                        title="Move down"
                                                        disabled={idx === rowsOrdered.length - 1}
                                                        onClick={() => moveRow(idx, 1)}
                                                    >
                                                        <MoveDown size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                {(() => {
                                                    const opts =
                                                        row.projectName && !projectChoices.includes(row.projectName)
                                                            ? [...projectChoices, row.projectName]
                                                            : [...projectChoices];
                                                    if (opts.length === 0) {
                                                        return (
                                                            <input
                                                                className="sa-admin-input sa-admin-input--sm"
                                                                style={{ width: '100%', maxWidth: 220 }}
                                                                placeholder="Product name"
                                                                value={row.projectName || ''}
                                                                onChange={(e) =>
                                                                    updateRow(idx, { projectName: e.target.value })
                                                                }
                                                            />
                                                        );
                                                    }
                                                    return (
                                                        <select
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            style={{ ...ROADMAP_SELECT_STYLE, width: '100%', maxWidth: 220 }}
                                                            value={row.projectName || ''}
                                                            onChange={(e) => {
                                                                const name = e.target.value;
                                                                const p = projectByName.get(name);
                                                                const envs =
                                                                    p &&
                                                                    Array.isArray(p.environments) &&
                                                                    p.environments.length
                                                                        ? p.environments.filter(Boolean)
                                                                        : ENVIRONMENTS;
                                                                updateRow(idx, {
                                                                    projectName: name,
                                                                    environment: envs[0] || '',
                                                                });
                                                            }}
                                                        >
                                                            {opts.map((n) => (
                                                                <option key={n} value={n}>
                                                                    {n}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    );
                                                })()}
                                            </td>
                                            <td>
                                                <select
                                                    className="sa-admin-input sa-admin-input--sm"
                                                    style={{ ...ROADMAP_SELECT_STYLE, width: '100%', maxWidth: 180 }}
                                                    value={row.environment || ''}
                                                    onChange={(e) => updateRow(idx, { environment: e.target.value })}
                                                >
                                                    {envOpts.map((e) => (
                                                        <option key={e} value={e}>
                                                            {e}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    className="sa-admin-input sa-admin-input--sm"
                                                    value={row.startDate || ''}
                                                    onChange={(e) => updateRow(idx, { startDate: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    className="sa-admin-input sa-admin-input--sm"
                                                    value={row.endDate || ''}
                                                    onChange={(e) => updateRow(idx, { endDate: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="sa-admin-input sa-admin-input--sm"
                                                    placeholder="Optional"
                                                    value={row.label || ''}
                                                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <div className="sa-roadmap-color-cell">
                                                    <input
                                                        type="color"
                                                        className="sa-roadmap-color-input"
                                                        value={colorVal}
                                                        onChange={(e) => updateRow(idx, { color: e.target.value })}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="sa-roadmap-mini-link"
                                                        onClick={() => updateRow(idx, { color: '' })}
                                                    >
                                                        Auto
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="sa-roadmap-icon-btn sa-roadmap-icon-btn--danger"
                                                    title="Remove"
                                                    onClick={() => removeRow(idx)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="sa-admin-actions">
                        <button
                            type="button"
                            className="sa-admin-save-btn"
                            disabled={savingAnalytics || !analyticsSettings}
                            onClick={() => onPersistAnalytics(normalizeAnalyticsSettings(analyticsSettings))}
                        >
                            {savingAnalytics ? <Loader2 size={16} className="sa-spin" /> : <Save size={16} />}
                            Save project roadmap
                        </button>
                    </div>
                </div>
            )}
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
    const [analyticsSettings, setAnalyticsSettings] = useState(null);
    const [savingAnalytics, setSavingAnalytics] = useState(false);

    const isAdminRole = String(userRole || '').toLowerCase() === 'admin';

    useEffect(() => {
        let cancelled = false;
        getAnalyticsSettings()
            .then((raw) => {
                if (!cancelled) setAnalyticsSettings(normalizeAnalyticsSettings(raw));
            })
            .catch(() => {
                if (!cancelled) setAnalyticsSettings(normalizeAnalyticsSettings(null));
            });
        return () => { cancelled = true; };
    }, []);

    const persistAnalyticsSettings = useCallback(async (next) => {
        setSavingAnalytics(true);
        try {
            const saved = await saveAnalyticsSettings(normalizeAnalyticsSettings(next));
            setAnalyticsSettings(normalizeAnalyticsSettings(saved));
        } catch (e) {
            window.alert(e?.message || 'Failed to save analytics settings');
        } finally {
            setSavingAnalytics(false);
        }
    }, []);

    const patchOverviewMetricDelta = useCallback((key, rawVal) => {
        setAnalyticsSettings((prev) => {
            const base = normalizeAnalyticsSettings(prev);
            const nextOd = { ...base.overviewMetricDeltas };
            const n = Number(rawVal);
            if (rawVal === '' || rawVal === null || rawVal === undefined || !Number.isFinite(n)) {
                delete nextOd[key];
            } else {
                nextOd[key] = Math.round(n);
            }
            return { ...base, overviewMetricDeltas: nextOd };
        });
    }, []);

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
        background: 'var(--card-bg, #fff)',
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
            {activeView === 'overview' && (
                <OverviewView
                    tickets={filtered}
                    analyticsSettings={analyticsSettings}
                    isAdminRole={isAdminRole}
                    patchOverviewMetricDelta={patchOverviewMetricDelta}
                    onPersistAnalytics={persistAnalyticsSettings}
                    savingAnalytics={savingAnalytics}
                />
            )}
            {activeView === 'infrastructure' && <InfrastructureView tickets={filtered} />}
            {activeView === 'traffic' && (
                <TrafficView
                    tickets={filtered}
                    analyticsSettings={analyticsSettings}
                    setAnalyticsSettings={setAnalyticsSettings}
                    isAdminRole={isAdminRole}
                    onPersistAnalytics={persistAnalyticsSettings}
                    savingAnalytics={savingAnalytics}
                />
            )}
            {activeView === 'roadmap' && (
                <ProjectRoadmapView
                    projects={projects}
                    ticketProductNames={productNames}
                    analyticsSettings={analyticsSettings}
                    setAnalyticsSettings={setAnalyticsSettings}
                    isAdminRole={isAdminRole}
                    onPersistAnalytics={persistAnalyticsSettings}
                    savingAnalytics={savingAnalytics}
                />
            )}
            {activeView === 'cost' && canViewCost && <CostView tickets={filtered} selectedMonths={selectedMonths} availableMonths={availableMonths} />}
            {activeView === 'team' && <TeamView tickets={filtered} devOpsMembers={devOpsMembers} />}
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   VIEW: OVERVIEW
   ═══════════════════════════════════════════════════ */

const OverviewView = ({
    tickets,
    analyticsSettings,
    isAdminRole,
    patchOverviewMetricDelta,
    onPersistAnalytics,
    savingAnalytics,
}) => {
    const od = analyticsSettings?.overviewMetricDeltas || {};
    const total = clamp0(tickets.length + (od.totalDelta || 0));
    const resolved = clamp0(
        tickets.filter(t => [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length + (od.resolvedDelta || 0)
    );
    const inProgress = clamp0(
        tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length + (od.inProgressDelta || 0)
    );
    const pending = clamp0(tickets.filter(t => t.status === TICKET_STATUS.CREATED).length + (od.pendingDelta || 0));
    const actionRequired = clamp0(
        tickets.filter(t => t.status === TICKET_STATUS.ACTION_REQUIRED).length + (od.actionRequiredDelta || 0)
    );

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

            {isAdminRole && (
                <div className="sa-card sa-card-full sa-admin-corrections">
                    <h3 className="sa-card-title"><Pencil size={18} /> Admin — overview KPI adjustments</h3>
                    <p className="sa-admin-hint">
                        Values below are <strong>added</strong> to ticket-based counts for dashboards and reporting. Leave blank to use tickets only.
                    </p>
                    <div className="sa-admin-kpi-grid">
                        {[
                            { key: 'totalDelta', label: 'Total tickets Δ' },
                            { key: 'resolvedDelta', label: 'Resolved Δ' },
                            { key: 'inProgressDelta', label: 'In progress Δ' },
                            { key: 'pendingDelta', label: 'Pending Δ' },
                            { key: 'actionRequiredDelta', label: 'Action required Δ' },
                        ].map(({ key, label }) => (
                            <label key={key} className="sa-admin-field">
                                <span>{label}</span>
                                <input
                                    type="number"
                                    className="sa-admin-input"
                                    value={od[key] != null && od[key] !== '' ? String(od[key]) : ''}
                                    onChange={(e) => patchOverviewMetricDelta(key, e.target.value)}
                                    placeholder="0"
                                />
                            </label>
                        ))}
                    </div>
                    <div className="sa-admin-actions">
                        <button
                            type="button"
                            className="sa-admin-save-btn"
                            disabled={savingAnalytics || !analyticsSettings}
                            onClick={() => onPersistAnalytics(normalizeAnalyticsSettings(analyticsSettings))}
                        >
                            {savingAnalytics ? <Loader2 size={16} className="sa-spin" /> : <Save size={16} />}
                            Save overview adjustments
                        </button>
                    </div>
                </div>
            )}
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

function upsertDayTrafficDelta(list, row) {
    const env = row.environment || '';
    const idx = list.findIndex(
        (d) => d.year === row.year && d.month === row.month && d.day === row.day && (d.environment || '') === env
    );
    const next = [...list];
    const ing = Math.round(Number(row.ingressDelta) || 0);
    const eg = Math.round(Number(row.egressDelta) || 0);
    if (ing === 0 && eg === 0) {
        if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
        next[idx] = { year: row.year, month: row.month, day: row.day, environment: env, ingressDelta: ing, egressDelta: eg };
    } else {
        next.push({ year: row.year, month: row.month, day: row.day, environment: env, ingressDelta: ing, egressDelta: eg });
    }
    return next;
}

function upsertMonthTrafficDelta(list, yearMonth, ingressDelta, egressDelta) {
    const next = [...list];
    const idx = next.findIndex((m) => m.yearMonth === yearMonth);
    const ing = Math.round(Number(ingressDelta) || 0);
    const eg = Math.round(Number(egressDelta) || 0);
    if (ing === 0 && eg === 0) {
        if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
        next[idx] = { yearMonth, ingressDelta: ing, egressDelta: eg };
    } else {
        next.push({ yearMonth, ingressDelta: ing, egressDelta: eg });
    }
    return next;
}

function upsertEnvTrafficDelta(list, environment, ingressDelta, egressDelta) {
    const env = environment || '';
    const next = [...list];
    const idx = next.findIndex((e) => (e.environment || '') === env);
    const ing = Math.round(Number(ingressDelta) || 0);
    const eg = Math.round(Number(egressDelta) || 0);
    if (ing === 0 && eg === 0) {
        if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
        next[idx] = { environment: env, ingressDelta: ing, egressDelta: eg };
    } else {
        next.push({ environment: env, ingressDelta: ing, egressDelta: eg });
    }
    return next;
}

const TrafficView = ({
    tickets,
    analyticsSettings,
    setAnalyticsSettings,
    isAdminRole,
    onPersistAnalytics,
    savingAnalytics,
}) => {
    const now = new Date();
    const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewEnv, setViewEnv] = useState('');
    const [showTrafficAdmin, setShowTrafficAdmin] = useState(false);
    const [newEnvName, setNewEnvName] = useState('');

    const norm = normalizeAnalyticsSettings(analyticsSettings);

    const ingressTickets = useMemo(() =>
        tickets.filter(t => t.requestType === REQUEST_TYPES.ENVIRONMENT_UP || t.requestType === 'Environment Up'),
    [tickets]);
    const egressTickets = useMemo(() =>
        tickets.filter(t => t.requestType === REQUEST_TYPES.ENVIRONMENT_DOWN || t.requestType === 'Environment Down'),
    [tickets]);

    const totalIngress = ingressTickets.length;
    const totalEgress = egressTickets.length;

    const baseTrafficSeries = useMemo(() => {
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

    const { ingress, egress } = useMemo(
        () => mergeTrafficDaySeries(
            baseTrafficSeries.ingress,
            baseTrafficSeries.egress,
            viewYear,
            viewMonth,
            viewEnv,
            norm.dayTrafficDeltas
        ),
        [baseTrafficSeries, viewYear, viewMonth, viewEnv, analyticsSettings]
    );

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

    const monthlyTrafficDisplay = useMemo(
        () => mergeMonthlyTrafficRows(monthlyTraffic, norm.monthTrafficDeltas),
        [monthlyTraffic, analyticsSettings]
    );

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

    const byEnvTrafficDisplay = useMemo(
        () => mergeEnvTrafficRows(byEnvTraffic, norm.envTrafficDeltas),
        [byEnvTraffic, analyticsSettings]
    );

    const numDays = useMemo(() => daysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
    const dayNumbers = useMemo(() => Array.from({ length: numDays }, (_, i) => i + 1), [numDays]);

    const patchDayDelta = (day, field, rawVal) => {
        setAnalyticsSettings((prev) => {
            const base = normalizeAnalyticsSettings(prev);
            const envKey = viewEnv || '';
            const idx = base.dayTrafficDeltas.findIndex(
                (d) => d.year === viewYear && d.month === viewMonth && d.day === day && (d.environment || '') === envKey
            );
            const cur = idx >= 0 ? base.dayTrafficDeltas[idx] : { ingressDelta: 0, egressDelta: 0 };
            const ing = field === 'ingress' ? rawVal : cur.ingressDelta;
            const eg = field === 'egress' ? rawVal : cur.egressDelta;
            return {
                ...base,
                dayTrafficDeltas: upsertDayTrafficDelta(base.dayTrafficDeltas, {
                    year: viewYear,
                    month: viewMonth,
                    day,
                    environment: envKey,
                    ingressDelta: ing,
                    egressDelta: eg,
                }),
            };
        });
    };

    const patchMonthRow = (yearMonth, field, rawVal) => {
        setAnalyticsSettings((prev) => {
            const base = normalizeAnalyticsSettings(prev);
            const idx = base.monthTrafficDeltas.findIndex((m) => m.yearMonth === yearMonth);
            const cur = idx >= 0 ? base.monthTrafficDeltas[idx] : { ingressDelta: 0, egressDelta: 0 };
            const ing = field === 'ingress' ? rawVal : cur.ingressDelta;
            const eg = field === 'egress' ? rawVal : cur.egressDelta;
            return { ...base, monthTrafficDeltas: upsertMonthTrafficDelta(base.monthTrafficDeltas, yearMonth, ing, eg) };
        });
    };

    const patchEnvRow = (environment, field, rawVal) => {
        setAnalyticsSettings((prev) => {
            const base = normalizeAnalyticsSettings(prev);
            const env = environment || '';
            const idx = base.envTrafficDeltas.findIndex((e) => (e.environment || '') === env);
            const cur = idx >= 0 ? base.envTrafficDeltas[idx] : { ingressDelta: 0, egressDelta: 0 };
            const ing = field === 'ingress' ? rawVal : cur.ingressDelta;
            const eg = field === 'egress' ? rawVal : cur.egressDelta;
            return { ...base, envTrafficDeltas: upsertEnvTrafficDelta(base.envTrafficDeltas, environment, ing, eg) };
        });
    };

    const appendEnvTrafficRow = (nameRaw) => {
        const name = (nameRaw || '').trim();
        if (!name) return;
        setAnalyticsSettings((prev) => {
            const base = normalizeAnalyticsSettings(prev);
            if (base.envTrafficDeltas.some((e) => (e.environment || '') === name)) return base;
            return {
                ...base,
                envTrafficDeltas: [...base.envTrafficDeltas, { environment: name, ingressDelta: 0, egressDelta: 0 }],
            };
        });
        setNewEnvName('');
    };

    const getDayDelta = (day) => {
        const envKey = viewEnv || '';
        const d = norm.dayTrafficDeltas.find(
            (x) => x.year === viewYear && x.month === viewMonth && x.day === day && (x.environment || '') === envKey
        );
        return { ing: d?.ingressDelta || 0, eg: d?.egressDelta || 0 };
    };

    const SELECT_STYLE = {
        padding: '0.35rem 1.8rem 0.35rem 0.6rem',
        border: '1px solid #d1d5db',
        borderRadius: '7px',
        fontSize: '0.8rem',
        color: '#374151',
        background: 'var(--card-bg, #fff)',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
    };

    return (
        <div className="sa-view-content">
            {/* Daily bar chart first on Traffic view */}
            <div className="sa-card sa-card-full">
                <div className="sa-card-header-row">
                    <h3 className="sa-card-title"><Activity size={18} /> Daily Activity</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    days={numDays}
                    ingress={ingress}
                    egress={egress}
                    month={viewMonth}
                    year={viewYear}
                />
            </div>

            {isAdminRole && (
                <div className="sa-card sa-card-full sa-admin-corrections">
                    <div className="sa-admin-corrections-head">
                        <h3 className="sa-card-title" style={{ margin: 0 }}><Pencil size={18} /> Admin — traffic corrections</h3>
                        <button
                            type="button"
                            className="sa-admin-toggle-btn"
                            onClick={() => setShowTrafficAdmin((v) => !v)}
                        >
                            {showTrafficAdmin ? 'Hide editor' : 'Show editor'}
                        </button>
                    </div>
                    <p className="sa-admin-hint">
                        Adjustments are <strong>added</strong> to ticket-based Environment Up / Down counts. Use the same month and environment selectors as the chart above. Save persists for all users.
                    </p>
                    {showTrafficAdmin && (
                        <>
                            <h4 className="sa-admin-subtitle">Daily deltas ({viewYear}-{String(viewMonth).padStart(2, '0')}, {viewEnv || 'All envs'})</h4>
                            <div className="sa-table-wrap sa-admin-day-table-wrap">
                                <table className="sa-table sa-admin-compact-table">
                                    <thead>
                                        <tr>
                                            <th>Day</th>
                                            <th>Tickets ↑</th>
                                            <th>Tickets ↓</th>
                                            <th>Adj ↑</th>
                                            <th>Adj ↓</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayNumbers.map((d) => {
                                            const adj = getDayDelta(d);
                                            const bi = baseTrafficSeries.ingress[d] || 0;
                                            const be = baseTrafficSeries.egress[d] || 0;
                                            return (
                                                <tr key={d}>
                                                    <td className="sa-td-bold">{d}</td>
                                                    <td>{bi}</td>
                                                    <td>{be}</td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={adj.ing !== 0 ? String(adj.ing) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchDayDelta(d, 'ingress', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={adj.eg !== 0 ? String(adj.eg) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchDayDelta(d, 'egress', e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <h4 className="sa-admin-subtitle">Monthly table deltas (yyyy-MM)</h4>
                            <div className="sa-table-wrap">
                                <table className="sa-table">
                                    <thead>
                                        <tr><th>Month</th><th>Tickets ↑</th><th>Tickets ↓</th><th>Adj ↑</th><th>Adj ↓</th></tr>
                                    </thead>
                                    <tbody>
                                        {monthlyTraffic.map(([ym, data]) => {
                                            const sm = sumMonthTrafficDelta(ym, norm.monthTrafficDeltas);
                                            return (
                                                <tr key={ym}>
                                                    <td className="sa-td-bold">{monthLabel(ym)}</td>
                                                    <td>{data.ingress}</td>
                                                    <td>{data.egress}</td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={sm.ingressDelta !== 0 ? String(sm.ingressDelta) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchMonthRow(ym, 'ingress', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={sm.egressDelta !== 0 ? String(sm.egressDelta) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchMonthRow(ym, 'egress', e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <h4 className="sa-admin-subtitle">By environment deltas</h4>
                            <div className="sa-table-wrap">
                                <table className="sa-table">
                                    <thead>
                                        <tr><th>Environment</th><th>Tickets ↑</th><th>Tickets ↓</th><th>Adj ↑</th><th>Adj ↓</th></tr>
                                    </thead>
                                    <tbody>
                                        {byEnvTraffic.map(([env, data]) => {
                                            const ex = norm.envTrafficDeltas.find((r) => (r.environment || '') === env) || {};
                                            return (
                                                <tr key={env}>
                                                    <td className="sa-td-bold">{env}</td>
                                                    <td>{data.ingress}</td>
                                                    <td>{data.egress}</td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={(ex.ingressDelta || 0) !== 0 ? String(ex.ingressDelta || 0) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchEnvRow(env, 'ingress', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className="sa-admin-input sa-admin-input--sm"
                                                            type="number"
                                                            value={(ex.egressDelta || 0) !== 0 ? String(ex.egressDelta || 0) : ''}
                                                            placeholder="0"
                                                            onChange={(e) => patchEnvRow(env, 'egress', e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="sa-admin-new-env-row">
                                            <td colSpan={3}>
                                                <input
                                                    className="sa-admin-input"
                                                    placeholder="Other environment name"
                                                    value={newEnvName}
                                                    onChange={(e) => setNewEnvName(e.target.value)}
                                                />
                                            </td>
                                            <td colSpan={2}>
                                                <button
                                                    type="button"
                                                    className="sa-admin-secondary-btn"
                                                    onClick={() => appendEnvTrafficRow(newEnvName)}
                                                >
                                                    Add row
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="sa-admin-actions">
                                <button
                                    type="button"
                                    className="sa-admin-save-btn"
                                    disabled={savingAnalytics || !analyticsSettings}
                                    onClick={() => onPersistAnalytics(normalizeAnalyticsSettings(analyticsSettings))}
                                >
                                    {savingAnalytics ? <Loader2 size={16} className="sa-spin" /> : <Save size={16} />}
                                    Save traffic adjustments
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="sa-metrics-grid">
                <MetricCard icon={ArrowUpCircle} label="Total Ingress" value={totalIngress} color="#22c55e" sub="Environment Up (from tickets)" />
                <MetricCard icon={ArrowDownCircle} label="Total Egress" value={totalEgress} color="#ef4444" sub="Environment Down (from tickets)" />
                <MetricCard icon={Activity} label="Net Flow" value={totalIngress - totalEgress} color={totalIngress >= totalEgress ? '#22c55e' : '#ef4444'} />
                <MetricCard icon={Globe} label="Environments" value={byEnvTrafficDisplay.length} color="#2563eb" />
            </div>

            {byEnvTrafficDisplay.length > 0 && (
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
                                {byEnvTrafficDisplay.map(([env, data], i) => (
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

            {monthlyTrafficDisplay.length > 0 && (
                <div className="sa-card sa-card-full">
                    <h3 className="sa-card-title"><TrendingUp size={18} /> Monthly Traffic Trend</h3>
                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr><th>Month</th><th>↑ Ingress</th><th>↓ Egress</th><th>Net</th></tr>
                            </thead>
                            <tbody>
                                {monthlyTrafficDisplay.map(([month, data], i) => (
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
