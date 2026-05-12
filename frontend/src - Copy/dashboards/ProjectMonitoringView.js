/**
 * ProjectMonitoringView — DevOps only.
 * Shows all manual start→stop cycle records per product as cards.
 * Each card: environment, who started/stopped, when, total duration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, User, Clock, Play, Square, AlertCircle } from 'lucide-react';
import { getMonitoringProducts, getCycleHistory } from '../services/monitoringService';
import { resolveEnvColor, ENV_COLORS } from '../components/EnvUptimeChart';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToDate(iso) {
    return new Date(iso).toISOString().slice(0, 10);
}

function fmtDatetime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtDuration(seconds) {
    if (seconds == null) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function liveDurationSec(startIso) {
    if (!startIso) return 0;
    return Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
}

// ─── Cycle Card ───────────────────────────────────────────────────────────────

function CycleCard({ cycle, index }) {
    const isLive = cycle.stoppedAt == null;
    const color  = resolveEnvColor(cycle.environment, ENV_COLORS, 0);

    const [liveSec, setLiveSec] = useState(() => liveDurationSec(cycle.startedAt));
    useEffect(() => {
        if (!isLive) return;
        const id = setInterval(() => setLiveSec(liveDurationSec(cycle.startedAt)), 1000);
        return () => clearInterval(id);
    }, [isLive, cycle.startedAt]);

    const duration = isLive ? fmtDuration(liveSec) : fmtDuration(cycle.durationSeconds);

    return (
        <div className={`pm-card ${isLive ? 'pm-card--live' : 'pm-card--done'}`}>
            {/* Header */}
            <div className="pm-card-head">
                <span className="pm-env-dot" style={{ background: color }} />
                <span className="pm-env-name" title={cycle.environment}>{cycle.environment}</span>
                <span className="pm-product-tag">{cycle.productName}</span>
                <span className={`pm-status ${isLive ? 'pm-status--live' : 'pm-status--done'}`}>
                    {isLive ? '▲ LIVE' : '✓ Done'}
                </span>
            </div>

            {/* Duration hero */}
            <div className="pm-duration">
                <Clock size={13} />
                <span>{duration || '—'}</span>
                {isLive && <span className="pm-live-tag">running</span>}
            </div>

            {/* Start row */}
            <div className="pm-row">
                <span className="pm-row-icon pm-row-icon--start"><Play size={10} /></span>
                <div className="pm-row-body">
                    <span className="pm-row-label">Started</span>
                    <span className="pm-row-time">{fmtDatetime(cycle.startedAt)}</span>
                    {cycle.startedBy && (
                        <span className="pm-row-who">
                            <User size={9} /> {cycle.startedBy}
                        </span>
                    )}
                </div>
            </div>

            {/* Stop row */}
            <div className="pm-row">
                <span className={`pm-row-icon ${isLive ? 'pm-row-icon--pending' : 'pm-row-icon--stop'}`}>
                    <Square size={10} />
                </span>
                <div className="pm-row-body">
                    <span className="pm-row-label">Stopped</span>
                    {isLive ? (
                        <span className="pm-row-pending">Still running…</span>
                    ) : (
                        <>
                            <span className="pm-row-time">{fmtDatetime(cycle.stoppedAt)}</span>
                            {cycle.stoppedBy && (
                                <span className="pm-row-who">
                                    <User size={9} /> {cycle.stoppedBy}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ProjectMonitoringView() {
    const defaultTo   = isoToDate(new Date().toISOString());
    const defaultFrom = isoToDate(new Date(Date.now() - 30 * 86400e3).toISOString());

    const [products,        setProducts]        = useState([]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [fromDate,        setFromDate]         = useState(defaultFrom);
    const [toDate,          setToDate]           = useState(defaultTo);
    const [cycles,          setCycles]           = useState([]);
    const [loading,         setLoading]          = useState(false);
    const [error,           setError]            = useState('');

    useEffect(() => {
        getMonitoringProducts()
            .then(list => setProducts(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []);

    const fetchCycles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getCycleHistory({
                productName: selectedProduct,
                from: fromDate,
                to: toDate,
            });
            setCycles(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message || 'Failed to load cycle history');
        } finally {
            setLoading(false);
        }
    }, [selectedProduct, fromDate, toDate]);

    useEffect(() => { fetchCycles(); }, [fetchCycles]);

    // Group by product for "All products" view
    const grouped = selectedProduct
        ? { [selectedProduct]: cycles }
        : cycles.reduce((acc, c) => {
            if (!acc[c.productName]) acc[c.productName] = [];
            acc[c.productName].push(c);
            return acc;
        }, {});

    const totalLive = cycles.filter(c => c.stoppedAt == null).length;

    return (
        <div className="pm-wrap">
            {/* ── Controls ──────────────────────────────────────────────── */}
            <div className="pm-controls">
                <div className="eud-cg">
                    <label className="eud-label">Product</label>
                    <div className="eud-select-wrap">
                        <select className="eud-select" value={selectedProduct}
                            onChange={e => setSelectedProduct(e.target.value)}>
                            <option value="">All Products</option>
                            {products.map(p => <option key={p} value={p}>{p}</option>)}
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

                <button className="eud-refresh-btn" onClick={fetchCycles} disabled={loading} title="Refresh">
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>

                {totalLive > 0 && (
                    <div className="eud-summary-badge eud-summary-badge--up">
                        <span className="eud-summary-dot" />
                        {totalLive} session{totalLive !== 1 ? 's' : ''} live now
                    </div>
                )}
            </div>

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
                <div className="pm-error">
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {/* ── Grouped cycle cards ───────────────────────────────────── */}
            {!loading && !error && Object.keys(grouped).length === 0 && (
                <div className="pm-empty">
                    <p>No cycle records found for this period.</p>
                    <p className="eud-empty-hint">
                        Cycles are recorded each time DevOps uses the Start / Stop buttons
                        in the Environment Monitoring tab.
                    </p>
                </div>
            )}

            {Object.entries(grouped).map(([product, productCycles]) => (
                <div key={product} className="pm-product-section">
                    {!selectedProduct && (
                        <div className="pm-product-header">
                            <span className="pm-product-name">{product}</span>
                            <span className="pm-product-count">
                                {productCycles.length} cycle{productCycles.length !== 1 ? 's' : ''}
                                {productCycles.some(c => !c.stoppedAt) && (
                                    <span className="pm-live-badge">LIVE</span>
                                )}
                            </span>
                        </div>
                    )}
                    <div className="pm-card-grid">
                        {productCycles.map((cycle, i) => (
                            <CycleCard key={cycle.id || i} cycle={cycle} index={i} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
