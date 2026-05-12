import React, { useMemo, useState } from "react";

/**
 * Compact, dependency-free SVG charts for the Live Cluster Cost panel.
 *
 * Exported:
 *   <LiveAreaChart />        single-series area with optional comparison line
 *   <CostMultiLineChart />   multi-series coloured lines
 *   <AllocVsUsageBars />     horizontal used-vs-allocated bar pairs
 *   <CostBarChart />         vertical bar chart over a time series
 */

// ─── shared helpers ────────────────────────────────────────────────────────────
const fmtNum = (v, d = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);

/**
 * Format a timestamp for X-axis labels. Adapts to both granularity and the
 * total span of data so labels stay concise:
 *   - span < 1 day  → "14:05"
 *   - span < 7 days → "May 9 14:05" (hour) or "May 9" (day)
 *   - month range   → "May 9"
 *   - year range    → "Jan"
 */
function fmtTime(iso, granularity, spanMs) {
    const d = new Date(typeof iso === "number" ? iso : iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const DAY = 86400000;
    const span = spanMs ?? DAY * 2;

    switch (granularity) {
        case "month":
            // year view — just show month abbreviation
            return d.toLocaleString(undefined, { month: "short" });

        case "day":
            // month view — "May 9"
            return d.toLocaleString(undefined, { month: "short", day: "numeric" });

        case "hour":
            if (span < DAY)
                // same-day hour window — "14:00"
                return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
            // multi-day hour window — "May 9 14:00"
            return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", hour12: false });

        default: // minute / live ticks
            if (span < DAY)
                // live same-day — "14:05"
                return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
            // live multi-day — "May 9 14:05"
            return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    }
}

/** Pick ~6 evenly-spaced tick indices from an array, always including the last. */
function pickXTicks(arr, count = 6) {
    if (!arr.length) return [];
    const step = Math.max(1, Math.floor(arr.length / count));
    const out = [];
    for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
    if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
    return out;
}

/** 5 evenly-spaced Y-axis ticks, 0 → max. */
function yTicks(max) {
    return Array.from({ length: 5 }, (_, i) => (i / 4) * max);
}

// ─── LiveAreaChart ─────────────────────────────────────────────────────────────
/**
 * Single-series live area chart with optional dashed comparison line.
 *
 * Props:
 *   points           Array<{ t, value }>   — primary series (used / actual)
 *   allocatedPoints  Array<{ t, value }>   — comparison series (dashed)
 *   color            string                — primary line/fill colour
 *   allocColor       string                — comparison line colour
 *   height           number
 *   granularity      "minute"|"hour"|"day"|"month"
 *   valueLabel       string                — unit shown in hover tooltip
 *   valueFmt         (v:number)=>string    — Y-axis + tooltip formatter
 *   title            string
 *   currentValue     number                — badge in top-right
 *   currentAllocated number
 */
export function LiveAreaChart({
    points = [], allocatedPoints = [],
    color = "#3b82f6", allocColor = "#cbd5e1",
    height = 180, granularity = "minute", valueLabel = "",
    valueFmt, title, currentValue, currentAllocated,
}) {
    const VP_W  = 720;
    const padL  = 52, padR = 16, padT = 14, padB = 34;
    const innerW = VP_W - padL - padR;
    const innerH = height - padT - padB;
    const [hover, setHover] = useState(null);
    const fmtV = valueFmt || (v => v == null || isNaN(v) ? "—" : v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1));
    const gradId = useMemo(() => `lac-grad-${Math.random().toString(36).slice(2, 9)}`, []);

    const { allTs, minT, maxT, max, spanMs } = useMemo(() => {
        const set = new Set();
        let m = 0;
        for (const p of points || [])          { set.add(new Date(p.t).getTime()); if ((p.value || 0) > m) m = p.value; }
        for (const p of allocatedPoints || []) { set.add(new Date(p.t).getTime()); if ((p.value || 0) > m) m = p.value; }
        const sorted = [...set].sort((a, b) => a - b);
        const lo = sorted[0] ?? 0;
        const hi = sorted[sorted.length - 1] ?? 0;
        return { allTs: sorted, minT: lo, maxT: hi, max: m * 1.15 || 1, spanMs: hi - lo };
    }, [points, allocatedPoints]);

    if (!allTs.length) {
        return (
            <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12, border: "1px dashed #e2e6ee", borderRadius: 8 }}>
                Waiting for data…
            </div>
        );
    }

    const xOf = ms => padL + (maxT === minT ? innerW / 2 : ((ms - minT) / (maxT - minT)) * innerW);
    const yOf = v  => padT + innerH - (v / max) * innerH;

    const sortedV = [...points].sort((a, b) => new Date(a.t) - new Date(b.t));
    const linePath = sortedV.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(new Date(p.t).getTime()).toFixed(1)} ${yOf(p.value || 0).toFixed(1)}`).join(" ");
    const areaPath = sortedV.length
        ? `${linePath} L ${xOf(new Date(sortedV[sortedV.length - 1].t).getTime()).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xOf(new Date(sortedV[0].t).getTime()).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
        : "";

    const sortedA = [...allocatedPoints].sort((a, b) => new Date(a.t) - new Date(b.t));
    const allocPath = sortedA.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(new Date(p.t).getTime()).toFixed(1)} ${yOf(p.value || 0).toFixed(1)}`).join(" ");

    const xTickMs = pickXTicks(allTs);

    const handleMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const xPx = ((e.clientX - rect.left) / rect.width) * VP_W;
        if (xPx < padL || xPx > padL + innerW) { setHover(null); return; }
        const targetMs = minT + ((xPx - padL) / innerW) * (maxT - minT);
        let nearest = sortedV[0], bestD = Infinity;
        for (const p of sortedV) {
            const d = Math.abs(new Date(p.t).getTime() - targetMs);
            if (d < bestD) { bestD = d; nearest = p; }
        }
        const allocMatch = sortedA.reduce((acc, a) =>
            Math.abs(new Date(a.t).getTime() - new Date(nearest.t).getTime()) <
            Math.abs(new Date((acc?.t) || 0).getTime() - new Date(nearest.t).getTime()) ? a : acc
        , null);
        setHover({ p: nearest, alloc: allocMatch });
    };

    return (
        <div style={{ position: "relative" }}>
            {title && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</div>
                    {currentValue != null && (
                        <div style={{ fontSize: 13, fontWeight: 700, color }}>
                            {fmtV(currentValue)}
                            {currentAllocated != null && (
                                <span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 11 }}> / {fmtV(currentAllocated)} {valueLabel}</span>
                            )}
                        </div>
                    )}
                </div>
            )}
            <svg viewBox={`0 0 ${VP_W} ${height}`} width="100%"
                 style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
                 onMouseMove={handleMove}
                 onMouseLeave={() => setHover(null)}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {/* Y-axis gridlines + labels */}
                {yTicks(max).map((tv, i) => (
                    <g key={i}>
                        <line x1={padL} x2={padL + innerW} y1={yOf(tv)} y2={yOf(tv)}
                              stroke="#e2e6ee" strokeDasharray="2 3" />
                        <text x={padL - 6} y={yOf(tv) + 4} textAnchor="end" fontSize="10" fill="#64748b">
                            {fmtV(tv)}
                        </text>
                    </g>
                ))}
                <line x1={padL} x2={padL}           y1={padT} y2={padT + innerH} stroke="#cbd5e1" />
                <line x1={padL} x2={padL + innerW}  y1={padT + innerH} y2={padT + innerH} stroke="#cbd5e1" />

                {/* Allocated/request dashed line */}
                {allocPath && (
                    <path d={allocPath} fill="none" stroke={allocColor} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.85" />
                )}
                {/* Area fill + primary line */}
                {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
                {linePath  && <path d={linePath}  fill="none" stroke={color} strokeWidth="2.2"
                                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.06))" }} />}

                {/* Live pulsing indicator */}
                {sortedV.length > 0 && (() => {
                    const last = sortedV[sortedV.length - 1];
                    const cx = xOf(new Date(last.t).getTime()), cy = yOf(last.value || 0);
                    return (
                        <g>
                            <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.18">
                                <animate attributeName="r"       values="6;11;6"      dur="1.6s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={cx} cy={cy} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />
                        </g>
                    );
                })()}

                {/* Hover crosshair */}
                {hover && (() => {
                    const cx = xOf(new Date(hover.p.t).getTime()), cy = yOf(hover.p.value || 0);
                    return (
                        <g>
                            <line x1={cx} x2={cx} y1={padT} y2={padT + innerH} stroke={color} strokeOpacity="0.4" strokeDasharray="3 3" />
                            <circle cx={cx} cy={cy} r="5" fill={color} stroke="#fff" strokeWidth="1.5" />
                        </g>
                    );
                })()}

                {/* X-axis tick labels — span-aware format */}
                {xTickMs.map((ms, i) => (
                    <text key={i} x={xOf(ms)} y={padT + innerH + 16}
                          textAnchor="middle" fontSize="10" fill="#64748b">
                        {fmtTime(ms, granularity, spanMs)}
                    </text>
                ))}
            </svg>

            {hover && (
                <div style={{
                    position: "absolute", pointerEvents: "none",
                    left: `${Math.min(74, Math.max(2, (xOf(new Date(hover.p.t).getTime()) / VP_W) * 100)).toFixed(1)}%`,
                    top: 8,
                    background: "#0f172a", color: "#fff",
                    padding: "6px 10px", borderRadius: 6, fontSize: 11, lineHeight: 1.45,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.18)", whiteSpace: "nowrap",
                    transform: "translateX(-50%)",
                }}>
                    <div style={{ color: "#cbd5e1" }}>{fmtTime(hover.p.t, granularity, spanMs)}</div>
                    <div><strong style={{ color }}>{fmtV(hover.p.value || 0)}</strong>{" "}<span style={{ color: "#94a3b8" }}>{valueLabel}</span></div>
                    {hover.alloc != null && (
                        <div style={{ color: allocColor }}>alloc {fmtV(hover.alloc.value || 0)} {valueLabel}</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── AllocVsUsageBars ──────────────────────────────────────────────────────────
export function AllocVsUsageBars({ rows = [], height = 26, title }) {
    const max = useMemo(() => Math.max(0.001, ...rows.map(r => Math.max(r.used || 0, r.allocated || 0))), [rows]);
    if (!rows.length) return <div style={{ padding: 14, color: "#94a3b8", fontSize: 12 }}>No data.</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {title && <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</div>}
            {rows.map((r, i) => {
                const used = Math.max(0, r.used || 0), allocated = Math.max(0, r.allocated || 0);
                const usedPct = (used / max) * 100, allocPct = (allocated / max) * 100;
                const usedColor = r.color || "#3b82f6", allocClr = r.allocColor || "#cbd5e1";
                const over = allocated > 0 && used > allocated;
                return (
                    <div key={r.label + "-" + i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#334155" }}>
                            <span style={{ fontWeight: 600, color: "#0f172a" }}>{r.label}</span>
                            <span>
                                <span style={{ color: usedColor, fontWeight: 600 }}>{fmtNum(used)}</span>
                                <span style={{ color: "#94a3b8" }}> / </span>
                                <span style={{ color: "#475569" }}>{fmtNum(allocated)}</span>
                                {r.unit && <span style={{ color: "#94a3b8" }}> {r.unit}</span>}
                                {allocated > 0 && (
                                    <span style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: over ? "#fee2e2" : "#f1f5f9", color: over ? "#991b1b" : "#475569" }}>
                                        {fmtNum((used / allocated) * 100, 0)}%
                                    </span>
                                )}
                            </span>
                        </div>
                        <div style={{ position: "relative", height, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${allocPct}%`, background: allocClr, opacity: 0.55 }} />
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${usedPct}%`, background: over ? "linear-gradient(90deg,#3b82f6 0%,#ef4444 100%)" : usedColor, transition: "width 220ms ease" }} />
                        </div>
                    </div>
                );
            })}
            <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#64748b", paddingTop: 4 }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3b82f6", borderRadius: 2, verticalAlign: "middle" }} /> Used</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#cbd5e1", borderRadius: 2, verticalAlign: "middle" }} /> Allocated</span>
            </div>
        </div>
    );
}

// ─── CostBarChart ──────────────────────────────────────────────────────────────
export function CostBarChart({ points = [], color = "#10b981", height = 200, granularity = "hour", valueLabel = "$/hr" }) {
    const VP_W = 720;
    const padL = 52, padR = 16, padT = 14, padB = 38;
    const innerW = VP_W - padL - padR;
    const innerH = height - padT - padB;
    const [hover, setHover] = useState(null);

    const { max, minT, maxT, spanMs } = useMemo(() => {
        const m = Math.max(0.001, ...points.map(p => p.value || 0));
        const ts = points.map(p => new Date(p.t).getTime());
        const lo = Math.min(...ts), hi = Math.max(...ts);
        return { max: m * 1.15, minT: lo, maxT: hi, spanMs: hi - lo };
    }, [points]);

    if (!points.length) {
        return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2e6ee", borderRadius: 8 }}>No data for this range yet.</div>;
    }

    const barW = Math.max(2, (innerW / points.length) * 0.7);
    const stride = innerW / points.length;
    const yOf = v => padT + innerH - (v / max) * innerH;

    return (
        <div style={{ position: "relative" }}>
            <svg viewBox={`0 0 ${VP_W} ${height}`} width="100%" style={{ display: "block", overflow: "visible" }}>
                {yTicks(max).map((tv, i) => (
                    <g key={i}>
                        <line x1={padL} x2={padL + innerW} y1={yOf(tv)} y2={yOf(tv)} stroke="#e2e6ee" strokeDasharray="2 3" />
                        <text x={padL - 6} y={yOf(tv) + 4} textAnchor="end" fontSize="10" fill="#64748b">
                            ${tv < 1 ? tv.toFixed(4) : tv.toFixed(2)}
                        </text>
                    </g>
                ))}
                <line x1={padL} x2={padL}          y1={padT} y2={padT + innerH} stroke="#cbd5e1" />
                <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="#cbd5e1" />
                {points.map((p, i) => {
                    const x = padL + i * stride + (stride - barW) / 2;
                    const y = yOf(p.value || 0), h = padT + innerH - y;
                    const isHov = hover?.idx === i;
                    return (
                        <rect key={i} x={x} y={y} width={barW} height={Math.max(1, h)} rx={2}
                              fill={isHov ? "#0f172a" : color} opacity={isHov ? 1 : 0.9}
                              onMouseEnter={() => setHover({ idx: i, p })}
                              onMouseLeave={() => setHover(null)}
                              style={{ cursor: "pointer", transition: "opacity 120ms" }} />
                    );
                })}
                {pickXTicks(points.map((_, i) => i)).map(i => (
                    <text key={i} x={padL + i * stride + stride / 2} y={padT + innerH + 16}
                          textAnchor="middle" fontSize="10" fill="#64748b">
                        {fmtTime(points[i].t, granularity, spanMs)}
                    </text>
                ))}
            </svg>
            {hover && (
                <div style={{ position: "absolute", pointerEvents: "none", left: padL + hover.idx * stride + stride / 2 + 8, top: 4, background: "#0f172a", color: "#fff", padding: "5px 9px", borderRadius: 6, fontSize: 11, lineHeight: 1.4, whiteSpace: "nowrap" }}>
                    <div style={{ color: "#cbd5e1" }}>{fmtTime(hover.p.t, granularity, spanMs)}</div>
                    <div><strong style={{ color }}>${(hover.p.value || 0).toFixed(4)}</strong> <span style={{ color: "#94a3b8" }}>{valueLabel}</span></div>
                </div>
            )}
        </div>
    );
}

// ─── CostMultiLineChart ────────────────────────────────────────────────────────
/**
 * Multiple coloured lines over a shared time axis.
 *
 * Props:
 *   series       Array<{ key, label, color, points: [{ t, value }] }>
 *   height       number
 *   granularity  "minute"|"hour"|"day"|"month"
 *   valueFmt     (v:number)=>string   — Y-axis + tooltip formatter
 *   valueLabel   string               — unit suffix shown in legend hover
 */
export function CostMultiLineChart({ series = [], height = 220, granularity = "hour", valueFmt, valueLabel = "/hr" }) {
    const VP_W = 720;
    const padL = 52, padR = 16, padT = 14, padB = 40;
    const innerW = VP_W - padL - padR;
    const innerH = height - padT - padB;
    const [hover, setHover] = useState(null);
    const fmtY = valueFmt || (v => v < 0.01 ? `$${v.toFixed(4)}` : v < 1 ? `$${v.toFixed(3)}` : v < 100 ? `$${v.toFixed(2)}` : `$${v.toFixed(0)}`);

    const { allTs, minT, maxT, max, spanMs } = useMemo(() => {
        const setT = new Set();
        let m = 0.001;
        for (const s of series) {
            for (const p of s.points || []) {
                setT.add(new Date(p.t).getTime());
                if ((p.value || 0) > m) m = p.value;
            }
        }
        const sorted = [...setT].sort((a, b) => a - b);
        const lo = sorted[0] ?? 0, hi = sorted[sorted.length - 1] ?? 0;
        return { allTs: sorted, minT: lo, maxT: hi, max: m * 1.15, spanMs: hi - lo };
    }, [series]);

    if (!allTs.length) {
        return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2e6ee", borderRadius: 8 }}>No data for this range yet.</div>;
    }

    const xOf = ms => padL + (maxT === minT ? innerW / 2 : ((ms - minT) / (maxT - minT)) * innerW);
    const yOf = v  => padT + innerH - (v / max) * innerH;
    const xTickMs = pickXTicks(allTs);

    return (
        <div>
            <svg viewBox={`0 0 ${VP_W} ${height}`} width="100%"
                 style={{ display: "block", overflow: "visible" }}
                 onMouseLeave={() => setHover(null)}>

                {yTicks(max).map((tv, i) => (
                    <g key={i}>
                        <line x1={padL} x2={padL + innerW} y1={yOf(tv)} y2={yOf(tv)} stroke="#e2e6ee" strokeDasharray="2 3" />
                        <text x={padL - 6} y={yOf(tv) + 4} textAnchor="end" fontSize="10" fill="#64748b">
                            {fmtY(tv)}
                        </text>
                    </g>
                ))}
                <line x1={padL} x2={padL}          y1={padT} y2={padT + innerH} stroke="#cbd5e1" />
                <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="#cbd5e1" />

                {series.map(s => {
                    if (!s.points?.length) return null;
                    const sorted = [...s.points].sort((a, b) => new Date(a.t) - new Date(b.t));
                    const d = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(new Date(p.t).getTime()).toFixed(1)} ${yOf(p.value || 0).toFixed(1)}`).join(" ");
                    return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth="2" />;
                })}

                {series.map(s =>
                    (s.points || []).map((p, i) => (
                        <circle key={s.key + "-" + i}
                                cx={xOf(new Date(p.t).getTime())}
                                cy={yOf(p.value || 0)}
                                r={hover?.s === s.key && hover?.i === i ? 5 : 2.5}
                                fill={s.color}
                                onMouseEnter={() => setHover({ s: s.key, i, p, color: s.color, label: s.label })}
                                style={{ cursor: "pointer", transition: "r 120ms" }} />
                    ))
                )}

                {xTickMs.map((ms, i) => (
                    <text key={i} x={xOf(ms)} y={padT + innerH + 16}
                          textAnchor="middle" fontSize="10" fill="#64748b">
                        {fmtTime(ms, granularity, spanMs)}
                    </text>
                ))}
            </svg>

            {/* Legend + hover value */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, padding: "6px 0", color: "#475569" }}>
                {series.map(s => (
                    <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: "inline-block" }} />
                        {s.label}
                    </span>
                ))}
                {hover && (
                    <span style={{ marginLeft: "auto", color: hover.color, fontWeight: 600 }}>
                        {hover.label}: {fmtY(hover.p.value || 0)}{valueLabel} · {fmtTime(hover.p.t, granularity, spanMs)}
                    </span>
                )}
            </div>
        </div>
    );
}
