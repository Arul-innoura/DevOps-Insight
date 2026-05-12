import React, { useMemo, useRef, useState } from "react";

/**
 * Resource fluctuation chart with change-detection highlighting.
 *
 * Visually distinguishes snapshots where configuration actually changed
 * from "same-as-before" snapshots, and renders a change summary strip
 * below the chart listing every date+delta event.
 *
 * Props:
 *   series     Array<{ key, label, color, fmt?, points: [{ t: ISO, v: number }] }>
 *              Each series may carry a `fmt(v) => string` for its own unit display.
 *   yLabel     string — y-axis side label
 *   height     number — SVG viewBox height (default 260)
 *   formatV    (v) => string — generic y-axis tick formatter (fallback if series has no fmt)
 *   formatT    (iso) => string — x-axis date formatter
 *   emptyHint  node — shown when all series are empty
 */
const CHANGE_EPS = 0.005; // min absolute delta to count as a configuration change

export default function FluctuationChart({
    series = [],
    yLabel = "",
    height = 260,
    formatV = (v) => (v == null ? "–" : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)),
    formatT = (iso) => new Date(iso).toLocaleDateString(),
    emptyHint = "No data for this range yet.",
}) {
    const VP_W = 720;
    const padL = 52, padR = 20, padT = 24, padB = 36;
    const innerW = VP_W - padL - padR;
    const innerH = height - padT - padB;

    const svgRef = useRef(null);
    const [hover, setHover] = useState(null);

    const { bounds, enrichedSeries, changeSummary } = useMemo(() => {
        let minT = Infinity, maxT = -Infinity, minV = Infinity, maxV = -Infinity;

        const enriched = series.map(s => {
            const fmt = s.fmt || formatV;
            const rawPts = (s.points || [])
                .map(p => ({ ...p, tMs: new Date(p.t).getTime() }))
                .filter(p => Number.isFinite(p.tMs))
                .sort((a, b) => a.tMs - b.tMs);

            const pts = rawPts.map((p, i) => {
                const prev = rawPts[i - 1];
                const delta = prev?.v != null && p.v != null ? p.v - prev.v : null;
                const isChange = i > 0 && delta != null && Math.abs(delta) > CHANGE_EPS;
                return { ...p, delta, isChange };
            });

            for (const p of pts) {
                if (p.tMs < minT) minT = p.tMs;
                if (p.tMs > maxT) maxT = p.tMs;
                if (p.v != null && Number.isFinite(p.v)) {
                    if (p.v < minV) minV = p.v;
                    if (p.v > maxV) maxV = p.v;
                }
            }
            return { ...s, pts, fmt };
        });

        // Build change summary (merged by timestamp across all series)
        const evtMap = new Map();
        for (const s of enriched) {
            for (const p of s.pts) {
                if (!p.isChange) continue;
                if (!evtMap.has(p.tMs)) evtMap.set(p.tMs, { tMs: p.tMs, t: p.t, changes: [] });
                evtMap.get(p.tMs).changes.push({ s, p });
            }
        }
        const summary = [...evtMap.values()].sort((a, b) => a.tMs - b.tMs);

        if (!Number.isFinite(minT)) return { bounds: null, enrichedSeries: enriched, changeSummary: summary };
        if (minT === maxT) maxT = minT + 86400e3;
        if (minV === Infinity) { minV = 0; maxV = 1; }
        if (minV === maxV) { maxV = minV + 1; }
        const pad = (maxV - minV) * 0.15;
        return {
            bounds: { minT, maxT, minV: Math.max(0, minV - pad), maxV: maxV + pad },
            enrichedSeries: enriched,
            changeSummary: summary,
        };
    }, [series, formatV]);

    if (!bounds) {
        return (
            <div style={{
                height, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                color: "var(--text-secondary)", background: "var(--panel-bg)",
                border: "1px dashed var(--border-color)", borderRadius: 8, fontSize: 13,
            }}>
                <span style={{ fontSize: 22, opacity: 0.5 }}>📊</span>
                <span>{emptyHint}</span>
            </div>
        );
    }

    const xOf = t => padL + ((t - bounds.minT) / (bounds.maxT - bounds.minT)) * innerW;
    const yOf = v => padT + innerH - ((v - bounds.minV) / (bounds.maxV - bounds.minV)) * innerH;

    const yTicks = Array.from({ length: 5 }, (_, i) =>
        bounds.minV + (i / 4) * (bounds.maxV - bounds.minV));

    // X-axis: show at most 6 representative ticks
    const allTs = [...new Set(enrichedSeries.flatMap(s => s.pts.map(p => p.tMs)))].sort((a, b) => a - b);
    const xTicks = allTs.length <= 6 ? allTs : (() => {
        const step = Math.max(1, Math.floor(allTs.length / 5));
        const picks = [allTs[0]];
        for (let i = step; i < allTs.length - 1; i += step) picks.push(allTs[i]);
        picks.push(allTs[allTs.length - 1]);
        return [...new Set(picks)];
    })();

    const tooltipPos = e => {
        const TW = 220, TH = 130;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = e.clientX + 14;
        let top  = e.clientY - TH / 2;
        if (left + TW > vw - 8) left = e.clientX - TW - 14;
        if (top < 8)            top  = 8;
        if (top + TH > vh - 8)  top  = vh - TH - 8;
        return { left, top };
    };

    return (
        <div style={{ position: "relative" }}>
            {/* SVG chart */}
            <svg
                ref={svgRef}
                viewBox={`0 0 ${VP_W} ${height}`}
                width="100%"
                style={{ display: "block", overflow: "visible" }}
                onMouseLeave={() => setHover(null)}
            >
                {/* Y-axis grid lines + labels */}
                {yTicks.map((tv, i) => (
                    <g key={i}>
                        <line x1={padL} x2={padL + innerW} y1={yOf(tv)} y2={yOf(tv)}
                            stroke="var(--border-color)" strokeDasharray="2 3" opacity="0.45" />
                        <text x={padL - 6} y={yOf(tv) + 4} textAnchor="end" fontSize="10"
                            fill="var(--text-secondary)">{formatV(tv)}</text>
                    </g>
                ))}

                {/* Vertical highlight at each change-event timestamp */}
                {enrichedSeries.flatMap(s =>
                    s.pts.filter(p => p.isChange).map((p, i) => (
                        <line key={`${s.key}-vmark-${i}`}
                            x1={xOf(p.tMs)} x2={xOf(p.tMs)}
                            y1={padT} y2={padT + innerH}
                            stroke={s.color} strokeWidth={1.2}
                            strokeDasharray="4 3" opacity="0.28" />
                    ))
                )}

                {/* Axes */}
                <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke="var(--border-color)" />
                <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="var(--border-color)" />

                {/* Series lines */}
                {enrichedSeries.map(s => {
                    if (!s.pts.length) return null;
                    const d = s.pts.map((p, i) =>
                        `${i === 0 ? "M" : "L"} ${xOf(p.tMs).toFixed(1)} ${yOf(p.v ?? 0).toFixed(1)}`
                    ).join(" ");
                    return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth="2" />;
                })}

                {/* Dots + invisible hit areas */}
                {enrichedSeries.map(s =>
                    s.pts.map((p, idx) => {
                        const isHov   = hover?.serieKey === s.key && hover?.idx === idx;
                        const isFirst = idx === 0;
                        const cx = xOf(p.tMs), cy = yOf(p.v ?? 0);
                        // Change points: bigger, ringed.  Unchanged: smaller, dimmed.
                        const r       = isHov ? 6 : p.isChange ? 5 : isFirst ? 3.5 : 2.5;
                        const opacity = p.isChange || isFirst || isHov ? 1 : 0.4;
                        return (
                            <g key={`${s.key}-${idx}`}>
                                {/* Hit area */}
                                <circle cx={cx} cy={cy} r={12} fill="transparent"
                                    style={{ cursor: "pointer" }}
                                    onMouseMove={e => setHover({
                                        serieKey: s.key, idx, p,
                                        color: s.color, label: s.label, fmt: s.fmt,
                                        ...tooltipPos(e),
                                    })}
                                    onMouseLeave={() => setHover(null)} />
                                {/* Dot */}
                                <circle cx={cx} cy={cy} r={r} fill={s.color} opacity={opacity}
                                    stroke={p.isChange || isHov ? "var(--panel-bg,#fff)" : "none"}
                                    strokeWidth={p.isChange || isHov ? 1.5 : 0}
                                    style={{ pointerEvents: "none", transition: "r 0.1s" }} />
                                {/* Outer ring on change points */}
                                {p.isChange && !isHov && (
                                    <circle cx={cx} cy={cy} r={r + 3.5} fill="none"
                                        stroke={s.color} strokeWidth={1} opacity="0.22"
                                        style={{ pointerEvents: "none" }} />
                                )}
                            </g>
                        );
                    })
                )}

                {/* X-axis tick labels */}
                {xTicks.map((t, i, arr) => (
                    <text key={i}
                        x={xOf(t)} y={padT + innerH + 16}
                        textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}
                        fontSize="10" fill="var(--text-secondary)">
                        {formatT(new Date(t).toISOString())}
                    </text>
                ))}

                {/* Y-axis title */}
                {yLabel && (
                    <text x={-(padT + innerH / 2)} y={14}
                        transform="rotate(-90)" textAnchor="middle"
                        fontSize="11" fill="var(--text-secondary)">{yLabel}</text>
                )}
            </svg>

            {/* Legend */}
            <div style={{
                display: "flex", flexWrap: "wrap", alignItems: "center",
                gap: 10, fontSize: 12, padding: "4px 0 6px",
                color: "var(--text-secondary)",
            }}>
                {enrichedSeries.map(s => (
                    <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{
                            width: 10, height: 10, background: s.color,
                            borderRadius: 2, flexShrink: 0,
                        }} />
                        {s.label}
                    </span>
                ))}
                <span style={{
                    marginLeft: "auto",
                    display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.65,
                }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="6" cy="6" r="2" fill="currentColor" />
                    </svg>
                    = config changed
                </span>
            </div>

            {/* Change event summary strip */}
            {changeSummary.length > 0 && (
                <div style={{
                    marginTop: 8,
                    border: "1px solid var(--border-color)",
                    borderRadius: 8, overflow: "hidden",
                }}>
                    <div style={{
                        padding: "7px 12px",
                        background: "var(--panel-bg-alt, rgba(0,0,0,0.03))",
                        borderBottom: "1px solid var(--border-color)",
                        fontSize: 12, fontWeight: 600,
                        color: "var(--text-secondary)",
                        display: "flex", alignItems: "center", gap: 6,
                    }}>
                        <span>⚡</span>
                        {changeSummary.length} configuration change{changeSummary.length !== 1 ? "s" : ""} detected
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {changeSummary.map((ev, i) => (
                            <div key={i} style={{
                                display: "flex", alignItems: "flex-start", gap: 12,
                                padding: "7px 12px",
                                borderBottom: i < changeSummary.length - 1
                                    ? "1px solid var(--border-color)" : "none",
                                background: "var(--panel-bg)",
                                fontSize: 12,
                            }}>
                                {/* Date */}
                                <span style={{
                                    color: "var(--text-muted, #9ca3af)",
                                    whiteSpace: "nowrap", minWidth: 110, fontSize: 11,
                                    paddingTop: 1,
                                }}>
                                    {new Date(ev.tMs).toLocaleString(undefined, {
                                        month: "short", day: "numeric",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </span>
                                {/* Deltas */}
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                                    {ev.changes.map(({ s, p }, j) => (
                                        <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                            <span style={{
                                                width: 8, height: 8, borderRadius: 2,
                                                background: s.color, flexShrink: 0,
                                            }} />
                                            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                                            <span style={{
                                                fontWeight: 700,
                                                color: p.delta > 0 ? "#10b981" : "#ef4444",
                                            }}>
                                                {p.delta > 0 ? "▲" : "▼"}&nbsp;
                                                {(s.fmt || formatV)(Math.abs(p.delta))}
                                            </span>
                                            <span style={{ color: "var(--text-muted, #9ca3af)" }}>
                                                → {(s.fmt || formatV)(p.v)}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tooltip */}
            {hover && (
                <div style={{
                    position: "fixed",
                    left: hover.left, top: hover.top,
                    zIndex: 99999, pointerEvents: "none",
                    background: "var(--panel-bg, #1c1c28)",
                    color: "var(--text-primary, #fff)",
                    padding: "8px 11px", borderRadius: 8,
                    border: `1.5px solid ${hover.color}`,
                    fontSize: 12,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                    minWidth: 160, maxWidth: 220,
                }}>
                    <div style={{ fontWeight: 700, color: hover.color, marginBottom: 3 }}>
                        {hover.label}
                    </div>
                    <div style={{ color: "var(--text-secondary)", marginBottom: 4, fontSize: 11 }}>
                        {new Date(hover.p.t).toLocaleString()}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {(hover.fmt || formatV)(hover.p.v)}
                    </div>
                    {hover.p.isChange && hover.p.delta != null && (
                        <div style={{
                            marginTop: 5, paddingTop: 5,
                            borderTop: "1px solid var(--border-color)",
                            color: hover.p.delta > 0 ? "#10b981" : "#ef4444",
                            fontWeight: 600, fontSize: 11,
                        }}>
                            {hover.p.delta > 0 ? "▲" : "▼"}&nbsp;
                            {(hover.fmt || formatV)(Math.abs(hover.p.delta))} from previous
                        </div>
                    )}
                    {!hover.p.isChange && hover.p.delta != null && (
                        <div style={{ marginTop: 3, fontSize: 10, color: "var(--text-muted, #9ca3af)" }}>
                            No change from previous
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
