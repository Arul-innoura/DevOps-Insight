/**
 * EnvUptimeChart — interactive Gantt/timeline chart showing environment uptime sessions.
 *
 * Live-follow mode (default): viewport auto-scrolls so "now" stays at 60% from the left,
 * showing ~2.4 h of history and ~1.6 h of buffer to the right (hours zoom level).
 * Scroll/drag to pan — exits live mode. Click "Live" to resume.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// ─── Layout constants ─────────────────────────────────────────────────────────

const VW        = 900;
const LABEL_W   = 150;
const PAD_TOP   = 36;
const PAD_BOT   = 8;
const PAD_RIGHT = 16;
const ROW_H     = 46;
const BAR_PAD   = 10;
const BAR_R     = 4;
const CHART_W   = VW - LABEL_W - PAD_RIGHT;

// ─── Live-follow settings ─────────────────────────────────────────────────────

const LIVE_WINDOW_MS = 4 * 3600_000; // 4-hour viewport (shows "hours" zoom level)
const NOW_RATIO      = 0.60;         // "now" sits at 60% from the left edge

function liveVp(currentNow) {
    const leftPad  = Math.round(LIVE_WINDOW_MS * NOW_RATIO);   // ~2.4 h of history
    const rightPad = LIVE_WINDOW_MS - leftPad;                  // ~1.6 h buffer
    return [currentNow - leftPad, currentNow + rightPad];
}

// ─── Colors ───────────────────────────────────────────────────────────────────

export const ENV_COLORS = {
    'Development':             '#3b82f6',
    'Quality Assurance':       '#f59e0b',
    'Staging':                 '#8b5cf6',
    'User Acceptance Testing': '#10b981',
    'Production':              '#ef4444',
};

const EXTRA_COLORS = [
    '#06b6d4','#f97316','#84cc16','#ec4899',
    '#14b8a6','#a855f7','#eab308','#f43f5e',
];

export function resolveEnvColor(env, envColors = ENV_COLORS, index = 0) {
    return (envColors && envColors[env]) || ENV_COLORS[env] || EXTRA_COLORS[index % EXTRA_COLORS.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zoomName(rangeMs) {
    if (rangeMs > 60 * 86400e3) return 'months';
    if (rangeMs > 14 * 86400e3) return 'weeks';
    if (rangeMs >      86400e3) return 'days';
    if (rangeMs >      3600e3)  return 'hours';
    if (rangeMs >        60e3)  return 'minutes';
    return 'seconds';
}

function tickInterval(rangeMs) {
    switch (zoomName(rangeMs)) {
        case 'months':  return  7 * 86400e3;
        case 'weeks':   return  2 * 86400e3;
        case 'days':    return  6 * 3600e3;
        case 'hours':   return 30 * 60e3;
        case 'minutes': return  5 * 60e3;
        default:        return 10e3;
    }
}

function fmtAxis(ms, level) {
    const d = new Date(ms);
    switch (level) {
        case 'months':
        case 'weeks':
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        case 'days':
            return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        case 'hours':
        case 'minutes':
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        default:
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
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

function fmtDatetime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvUptimeChart({
    sessions   = [],
    envs       = [],
    fromDate,
    toDate,
    envColors  = ENV_COLORS,
    onSessionClick,
}) {
    const fromMs = useMemo(() => new Date(fromDate).getTime(), [fromDate]);
    const toMs   = useMemo(() => new Date(toDate).getTime(),   [toDate]);

    // Start in live-follow mode: 4h window, "now" at 60% from left
    const [vs,       setVs]       = useState(() => liveVp(Date.now())[0]);
    const [ve,       setVe]       = useState(() => liveVp(Date.now())[1]);
    const [now,      setNow]      = useState(() => Date.now());
    const [tooltip,  setTooltip]  = useState(null);
    const [liveMode, setLiveMode] = useState(true);

    const rangeMs = ve - vs;
    const zoomLvl = zoomName(rangeMs);
    const VH      = PAD_TOP + Math.max(1, envs.length) * ROW_H + PAD_BOT;

    const parsed = useMemo(() => sessions.map(s => ({
        ...s,
        startMs: new Date(s.startTime).getTime(),
        endMs:   s.endTime ? new Date(s.endTime).getTime() : null,
    })), [sessions]);

    const hasLive = parsed.some(s => s.endMs === null);

    // When date-range filter changes while NOT in live mode, sync the viewport
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!liveMode) { setVs(fromMs); setVe(toMs); }
    }, [fromMs, toMs]);

    // 1-second tick (always on, so live-follow works even when sessions are still loading)
    useEffect(() => {
        const ms = zoomLvl === 'seconds' ? 100 : 1000;
        const id = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(id);
    }, [zoomLvl]);

    // Live-follow: advance viewport every tick so "now" stays at NOW_RATIO from left
    useEffect(() => {
        if (!liveMode) return;
        const [newVs, newVe] = liveVp(now);
        setVs(newVs);
        setVe(newVe);
    }, [liveMode, now]);

    // Coordinate helpers
    const xc     = useCallback((t) => LABEL_W + ((t - vs) / rangeMs) * CHART_W, [vs, rangeMs]);
    const clampX = useCallback((x) => Math.max(LABEL_W, Math.min(LABEL_W + CHART_W, x)), []);

    // X-axis ticks
    const xTicks = useMemo(() => {
        const iv    = tickInterval(rangeMs);
        const first = Math.ceil(vs / iv) * iv;
        const tks   = [];
        for (let t = first; t <= ve; t += iv) tks.push(t);
        return tks;
    }, [vs, ve, rangeMs]);

    // ── Interaction ───────────────────────────────────────────────────────────

    const svgRef  = useRef(null);
    const dragRef = useRef(null);

    // In historical mode, clamp to a wide window around the selected range
    // (no clamping in live mode — viewport follows time freely)
    const clamp = useCallback((s, e) => {
        if (liveMode) return [s, e];
        const range  = e - s;
        const lo     = fromMs - 90 * 86400e3; // allow scrolling 90 days back
        const hi     = toMs   +  7 * 86400e3; // allow 7 days forward
        const start  = Math.max(lo, Math.min(s, hi - range));
        return [start, start + range];
    }, [liveMode, fromMs, toMs]);

    const doZoom = useCallback((centerMs, factor) => {
        const maxRange = liveMode ? LIVE_WINDOW_MS * 20 : (toMs - fromMs) + 90 * 86400e3;
        const newRange = Math.max(10_000, Math.min(maxRange, rangeMs * factor));
        const ratio    = (centerMs - vs) / rangeMs;
        const [s, e]   = clamp(centerMs - newRange * ratio, centerMs - newRange * ratio + newRange);
        setVs(s); setVe(e);
    }, [vs, rangeMs, fromMs, toMs, clamp, liveMode]);

    const svgX = useCallback((clientX) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return (clientX - rect.left) * (VW / rect.width);
    }, []);

    // Scroll-to-zoom — exits live mode
    const handleWheel = useCallback((ev) => {
        ev.preventDefault();
        setLiveMode(false);
        const sx = svgX(ev.clientX);
        if (sx < LABEL_W) return;
        const center = vs + ((sx - LABEL_W) / CHART_W) * rangeMs;
        doZoom(center, ev.deltaY > 0 ? 1.6 : 0.625);
    }, [vs, rangeMs, doZoom, svgX]);

    // Drag-to-pan — exits live mode
    const handleMouseDown = useCallback((ev) => {
        if (ev.button !== 0) return;
        setLiveMode(false);
        dragRef.current = { x: ev.clientX, vs, ve };
    }, [vs, ve]);

    const handleMouseMove = useCallback((ev) => {
        if (!dragRef.current) return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const svgDx = (ev.clientX - dragRef.current.x) * (VW / rect.width);
        const dtMs  = -(svgDx / CHART_W) * rangeMs;
        const [s, e] = clamp(dragRef.current.vs + dtMs, dragRef.current.ve + dtMs);
        setVs(s); setVe(e);
    }, [rangeMs, clamp]);

    const handleMouseUp = () => { dragRef.current = null; };

    // Reset to full date-range (historical mode)
    const handleReset = () => {
        setLiveMode(false);
        setVs(fromMs);
        setVe(toMs);
    };

    const isFullRange = !liveMode
        && Math.abs(vs - fromMs) < 1000
        && Math.abs(ve - toMs)   < 1000;

    // ── Bar tooltip ───────────────────────────────────────────────────────────

    const handleBarEnter = useCallback((ev, session, color) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, session, color });
    }, []);
    const handleBarLeave = useCallback(() => setTooltip(null), []);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="uc-wrap" style={{ position: 'relative' }}>

            {/* Toolbar */}
            <div className="uc-bar">

                {/* Live-follow toggle — primary action */}
                <button
                    className={`uc-preset-btn uc-live-btn${liveMode ? ' active' : ''}`}
                    onClick={() => setLiveMode(true)}
                    title="Live: auto-scroll so current time stays at 60% from left (4-hour window)"
                >
                    <span className="uc-live-dot-sm" />
                    Live
                </button>

                <div className="uc-bar-sep" />

                {/* Zoom presets */}
                <button
                    className={`uc-preset-btn${isFullRange ? ' active' : ''}`}
                    onClick={handleReset}
                    title="Show full selected date range"
                >All</button>
                <button
                    className="uc-preset-btn"
                    onClick={() => { setLiveMode(false); const c = now; setVs(c - 7*86400e3); setVe(c); }}
                    title="Last 7 days"
                >7d</button>
                <button
                    className="uc-preset-btn"
                    onClick={() => { setLiveMode(false); const c = now; setVs(c - 86400e3); setVe(c); }}
                    title="Last 24 hours"
                >24h</button>
                <button
                    className="uc-preset-btn"
                    onClick={() => { setLiveMode(false); const c = now; setVs(c - 4*3600e3); setVe(c + 1*3600e3); }}
                    title="Last 4 hours"
                >4h</button>

                <div className="uc-bar-sep" />

                <button className="uc-btn" onClick={() => { setLiveMode(false); doZoom((vs + ve) / 2, 0.5); }} title="Zoom in">
                    <ZoomIn size={13} />
                </button>
                <button className="uc-btn" onClick={() => { setLiveMode(false); doZoom((vs + ve) / 2, 2); }} title="Zoom out">
                    <ZoomOut size={13} />
                </button>
                {!isFullRange && !liveMode && (
                    <button className="uc-btn uc-reset" onClick={handleReset} title="Reset to full date range">
                        <RotateCcw size={13} /> Reset
                    </button>
                )}

                <span className="uc-zoom-badge" title="Current zoom level">{zoomLvl}</span>
                {hasLive && !liveMode && (
                    <span className="uc-live-dot" title="Live session active — click Live to follow" />
                )}
            </div>

            {/* SVG Gantt */}
            <svg
                ref={svgRef}
                viewBox={`0 0 ${VW} ${VH}`}
                preserveAspectRatio="xMidYMid meet"
                className="uc-svg"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
            >
                <defs>
                    <clipPath id="uc-chart-clip">
                        <rect x={LABEL_W} y={0} width={CHART_W + PAD_RIGHT} height={VH} />
                    </clipPath>
                </defs>

                {/* Alternating row backgrounds */}
                {envs.map((env, i) => (
                    <rect key={env + '-bg'}
                        x={0} y={PAD_TOP + i * ROW_H}
                        width={VW} height={ROW_H}
                        fill={i % 2 === 0
                            ? 'var(--row-even, rgba(0,0,0,0.012))'
                            : 'var(--row-odd,  rgba(0,0,0,0.030))'}
                    />
                ))}

                {/* Vertical grid lines */}
                <g clipPath="url(#uc-chart-clip)">
                    {xTicks.map((t, i) => (
                        <line key={i}
                            x1={xc(t)} y1={PAD_TOP}
                            x2={xc(t)} y2={VH - PAD_BOT}
                            stroke="var(--border-color,#e5e7eb)"
                            strokeWidth={0.5} strokeDasharray="3 3" />
                    ))}
                </g>

                {/* X-axis tick labels */}
                {xTicks.map((t, i) => {
                    const x = xc(t);
                    if (x < LABEL_W + 8 || x > VW - PAD_RIGHT - 4) return null;
                    return (
                        <text key={i} x={x} y={PAD_TOP - 6} textAnchor="middle"
                            style={{ fontSize: 8, fill: 'var(--text-muted,#9ca3af)', fontFamily: 'inherit' }}>
                            {fmtAxis(t, zoomLvl)}
                        </text>
                    );
                })}

                {/* X-axis baseline */}
                <line x1={LABEL_W} y1={PAD_TOP}
                    x2={VW - PAD_RIGHT} y2={PAD_TOP}
                    stroke="var(--border-color,#d1d5db)" strokeWidth={1} />

                {/* Row separator lines */}
                {envs.map((_, i) => (
                    <line key={i}
                        x1={0} y1={PAD_TOP + (i + 1) * ROW_H}
                        x2={VW} y2={PAD_TOP + (i + 1) * ROW_H}
                        stroke="var(--border-color,#e5e7eb)" strokeWidth={0.5} />
                ))}

                {/* Label column separator */}
                <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={VH}
                    stroke="var(--border-color,#d1d5db)" strokeWidth={1} />

                {/* Environment labels */}
                {envs.map((env, i) => {
                    const col   = resolveEnvColor(env, envColors, i);
                    const midY  = PAD_TOP + i * ROW_H + ROW_H / 2;
                    const label = env.length > 17 ? env.slice(0, 15) + '…' : env;
                    return (
                        <g key={env + '-lbl'}>
                            <circle cx={12} cy={midY} r={5} fill={col} />
                            <text x={22} y={midY} dominantBaseline="middle"
                                style={{ fontSize: 10, fill: 'var(--text-primary,#111827)', fontFamily: 'inherit', fontWeight: 500 }}>
                                {label}
                            </text>
                        </g>
                    );
                })}

                {/* Session bars */}
                <g clipPath="url(#uc-chart-clip)">
                    {envs.map((env, i) => {
                        const col     = resolveEnvColor(env, envColors, i);
                        const envSess = parsed.filter(s => s.environment === env);
                        const barY    = PAD_TOP + i * ROW_H + BAR_PAD;
                        const barH    = ROW_H - 2 * BAR_PAD;
                        const midY    = PAD_TOP + i * ROW_H + ROW_H / 2;

                        return (
                            <g key={env}>
                                {envSess.map((s, si) => {
                                    const x1   = clampX(xc(s.startMs));
                                    const x2   = clampX(xc(s.endMs ?? now));
                                    const w    = Math.max(2, x2 - x1);
                                    const live = s.endMs === null;
                                    return (
                                        <rect key={si}
                                            x={x1} y={barY} width={w} height={barH}
                                            rx={BAR_R} ry={BAR_R}
                                            fill={col}
                                            fillOpacity={live ? 0.92 : 0.72}
                                            stroke={col}
                                            strokeWidth={live ? 1.5 : 0}
                                            style={{ cursor: onSessionClick ? 'pointer' : 'default' }}
                                            onMouseEnter={(ev) => handleBarEnter(ev, s, col)}
                                            onMouseLeave={handleBarLeave}
                                            onClick={() => onSessionClick?.(s, env)}
                                        />
                                    );
                                })}

                                {/* Pulsing live dot at current time */}
                                {parsed.some(s => s.environment === env && s.endMs === null) && (
                                    <circle
                                        cx={clampX(xc(now))} cy={midY}
                                        r={5} fill={col} stroke="#fff" strokeWidth={1.5}
                                    />
                                )}
                            </g>
                        );
                    })}

                    {/* "Now" vertical line — always visible in chart area */}
                    {(() => {
                        const nx = xc(now);
                        if (nx < LABEL_W || nx > LABEL_W + CHART_W) return null;
                        return (
                            <g>
                                <line x1={nx} y1={PAD_TOP}
                                    x2={nx} y2={VH - PAD_BOT}
                                    stroke="#ef4444" strokeWidth={1.5}
                                    strokeDasharray="4 3" opacity={0.55} />
                                <text x={nx} y={PAD_TOP - 3} textAnchor="middle"
                                    style={{ fontSize: 7, fill: '#ef4444', fontFamily: 'inherit', fontWeight: 700 }}>
                                    now
                                </text>
                            </g>
                        );
                    })()}
                </g>
            </svg>

            {/* Hover tooltip */}
            {tooltip && (() => {
                const s       = tooltip.session;
                const endMs   = s.endMs ?? now;
                const durMs   = endMs - s.startMs;
                const isLive  = s.endMs === null;
                const rect    = svgRef.current?.getBoundingClientRect();
                const maxLeft = rect ? rect.width - 210 : 9999;
                return (
                    <div className="uc-tooltip"
                        style={{
                            left: Math.min(tooltip.x + 14, maxLeft),
                            top:  Math.max(4, tooltip.y - 110),
                        }}>
                        <div className="uc-tip-env">
                            <span className="uc-tip-dot" style={{ background: tooltip.color }} />
                            <strong>{s.environment}</strong>
                            {isLive && <span className="uc-tip-live-tag">LIVE</span>}
                        </div>
                        <div className="uc-tip-row">
                            <span>Started</span>
                            <span>{fmtDatetime(s.startTime)}</span>
                        </div>
                        <div className="uc-tip-row">
                            <span>Stopped</span>
                            <span>{isLive ? 'Still running' : fmtDatetime(s.endTime)}</span>
                        </div>
                        <div className="uc-tip-dur">{fmtDuration(durMs)}</div>
                    </div>
                );
            })()}
        </div>
    );
}
