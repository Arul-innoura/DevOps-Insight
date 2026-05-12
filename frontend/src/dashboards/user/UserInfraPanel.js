/**
 * UserInfraPanel — read-only infrastructure status for standard users.
 * Shows product UP/DOWN status + allocated CPU / Memory / Pods per env.
 * Zero cost figures shown.  Auto-refreshes every 60 s.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    RefreshCw, Server, Cpu, Database, Layers,
    ChevronDown, Activity, AlertTriangle,
} from "lucide-react";
import { getPrometheusEnvs, getPrometheusLive } from "../../services/billingService";

const REFRESH_MS = 60_000;

function useTheme() {
    const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
    useEffect(() => {
        const el = document.documentElement;
        const obs = new MutationObserver(() => setTheme(el.dataset.theme || 'light'));
        obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);
    return theme;
}

function darkTok(isDark) {
    return {
        cardUpBg:       isDark ? 'rgba(6,78,59,0.2)'        : '#f0fdf4',
        cardDownBg:     isDark ? 'rgba(127,29,29,0.2)'      : '#fff5f5',
        cardUpBorder:   isDark ? 'rgba(52,211,153,0.28)'    : '#bbf7d0',
        cardDownBorder: isDark ? 'rgba(248,113,113,0.28)'   : '#fecaca',
        pillBg:         isDark ? 'var(--surface-muted)'     : '#f1f5f9',
        pillBorder:     isDark ? 'var(--border-color)'      : '#e2e8f0',
        pillColor:      isDark ? 'var(--text-sub)'          : '#475569',
        barTrack:       isDark ? 'var(--surface-muted)'     : '#e2e8f0',
        envBadgeBg:     isDark ? 'rgba(14,165,233,0.15)'    : '#e0f2fe',
        envBadgeColor:  isDark ? '#38bdf8'                  : '#0369a1',
        errBg:          isDark ? 'var(--error-bg)'          : '#fef2f2',
        errBorder:      isDark ? 'var(--error-border)'      : '#fecaca',
        errColor:       isDark ? 'var(--error)'             : '#dc2626',
        divider:        isDark ? 'var(--border-color)'      : '#e2e8f0',
        emptyIcon:      isDark ? 'var(--border-color)'      : '#e2e8f0',
        countdownMuted: isDark ? 'var(--border-color)'      : '#cbd5e1',
    };
}

function fmtN(v, d = 2) {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toFixed(d);
}

// ── data hook ────────────────────────────────────────────────────────────────
function useProdStatus(env) {
    const [snapshot, setSnapshot] = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState("");
    const timerRef = useRef(null);

    const doFetch = useCallback(async () => {
        if (!env) return;
        setLoading(true);
        try {
            const s = await getPrometheusLive(env);
            setSnapshot(s);
            setError("");
        } catch (e) {
            setError(e?.message || "Could not load cluster status.");
        } finally {
            setLoading(false);
        }
    }, [env]);

    useEffect(() => {
        if (!env) { setSnapshot(null); return; }
        void doFetch();
        timerRef.current = setInterval(doFetch, REFRESH_MS);
        return () => clearInterval(timerRef.current);
    }, [env, doFetch]);

    return { snapshot, loading, error, refresh: doFetch };
}

// ── aggregate namespace data per product ─────────────────────────────────────
function buildProducts(snapshot) {
    if (!snapshot?.products?.length) return [];
    const nsMap = new Map((snapshot.namespaces || []).map(n => [n.namespace, n]));
    return snapshot.products
        .map(p => {
            const nsList = (p.namespaceNames || []).map(ns => nsMap.get(ns)).filter(Boolean);
            return {
                name:        p.projectName || p.normalizedKey || "Unknown",
                status:      p.status || (p.running ? "UP" : "DOWN"),
                running:     !!p.running,
                namespaces:  p.namespaceNames || [],
                totalPods:   p.podCount || nsList.reduce((s, n) => s + (n.podCount || 0), 0),
                runningPods: p.runningPodCount || 0,
                cpuReq:      nsList.reduce((s, n) => s + (n.cpuRequestCores  || 0), 0),
                cpuUsed:     nsList.reduce((s, n) => s + (n.cpuCores || n.cpuUsedCores || 0), 0),
                memReq:      nsList.reduce((s, n) => s + (n.memoryRequestGb  || 0), 0),
                memUsed:     nsList.reduce((s, n) => s + (n.memoryGb || 0), 0),
            };
        })
        .sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
}

// ── single product card ───────────────────────────────────────────────────────
function ProductCard({ p, isDark }) {
    const tok = darkTok(isDark);
    const cpuPct = p.cpuReq  > 0 ? Math.min(100, (p.cpuUsed  / p.cpuReq)  * 100) : 0;
    const memPct = p.memReq  > 0 ? Math.min(100, (p.memUsed  / p.memReq)  * 100) : 0;
    const barColor = (pct) =>
        pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e";

    return (
        <div style={{
            border:       `1.5px solid ${p.running ? tok.cardUpBorder : tok.cardDownBorder}`,
            borderLeft:   `4px solid ${p.running ? "#22c55e" : "#ef4444"}`,
            borderRadius: 10,
            background:   p.running ? tok.cardUpBg : tok.cardDownBg,
            padding:      "12px 14px",
            display:      "flex",
            flexDirection: "column",
            gap:          8,
        }}>
            {/* name + status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                    width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                    background: p.running ? "#22c55e" : "#ef4444",
                    boxShadow:  p.running ? "0 0 0 3px rgba(34,197,94,0.25)" : "none",
                }} />
                <span style={{
                    fontWeight: 700, fontSize: 13, color: "var(--text-main)",
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {p.name}
                </span>
                <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                    background: p.running
                        ? (isDark ? "rgba(52,211,153,0.15)" : "#dcfce7")
                        : (isDark ? "rgba(248,113,113,0.15)" : "#fee2e2"),
                    color: p.running ? "#22c55e" : "#ef4444",
                    flexShrink: 0, letterSpacing: "0.04em",
                }}>
                    {p.status}
                </span>
            </div>

            {/* namespace pills */}
            {p.namespaces.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.namespaces.map(ns => (
                        <span key={ns} style={{
                            fontSize: 10, padding: "2px 7px",
                            background: tok.pillBg, borderRadius: 5,
                            color: tok.pillColor, fontFamily: "monospace",
                            border: `1px solid ${tok.pillBorder}`,
                        }}>
                            {ns}
                        </span>
                    ))}
                </div>
            )}

            {/* resource specs row */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
                    <Cpu size={11} style={{ color: "#f97316" }} />
                    <strong style={{ color: "#f97316" }}>{fmtN(p.cpuReq, 2)}c</strong>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>cpu req</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
                    <Database size={11} style={{ color: "#818cf8" }} />
                    <strong style={{ color: isDark ? "#a5b4fc" : "#6366f1" }}>{fmtN(p.memReq, 1)} GB</strong>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>mem req</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
                    <Layers size={11} style={{ color: "#0ea5e9" }} />
                    <strong style={{ color: p.running ? (isDark ? "#38bdf8" : "#0369a1") : "var(--text-muted)" }}>
                        {p.runningPods}/{p.totalPods}
                    </strong>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>pods</span>
                </span>
            </div>

            {/* CPU utilisation bar */}
            {p.cpuReq > 0 && (
                <div>
                    <div style={{ height: 5, background: tok.barTrack, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${cpuPct.toFixed(1)}%`,
                            background: barColor(cpuPct),
                            transition: "width .3s",
                        }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                        <span>
                            cpu {fmtN(p.cpuUsed, 2)}c used
                            {p.memReq > 0 && <> · mem {fmtN(p.memUsed, 1)}/{fmtN(p.memReq, 1)} GB</>}
                        </span>
                        <span>{cpuPct.toFixed(0)}% cpu</span>
                    </div>
                </div>
            )}

            {/* mem bar (only if no cpu bar) */}
            {p.cpuReq === 0 && p.memReq > 0 && (
                <div>
                    <div style={{ height: 5, background: tok.barTrack, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${memPct.toFixed(1)}%`,
                            background: barColor(memPct),
                            transition: "width .3s",
                        }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, textAlign: "right" }}>
                        {fmtN(p.memUsed, 1)}/{fmtN(p.memReq, 1)} GB · {memPct.toFixed(0)}%
                    </div>
                </div>
            )}
        </div>
    );
}

// ── section header ─────────────────────────────────────────────────────────
function SectionLabel({ color, dot, label, count }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 11, fontWeight: 700, color,
            textTransform: "uppercase", letterSpacing: "0.07em",
            marginBottom: 10,
        }}>
            <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: dot, display: "inline-block", flexShrink: 0,
            }} />
            {label}
            <span style={{
                marginLeft: 2, padding: "1px 7px", borderRadius: 10,
                background: color + "22", color, fontSize: 10, fontWeight: 700,
            }}>
                {count}
            </span>
        </div>
    );
}

// ── main panel ────────────────────────────────────────────────────────────────
export default function UserInfraPanel() {
    const theme   = useTheme();
    const isDark  = theme === 'dark';
    const tok     = darkTok(isDark);

    const [envs,       setEnvs]       = useState([]);
    const [env,        setEnv]        = useState("");
    const [envLoading, setEnvLoading] = useState(true);
    const [countdown,  setCountdown]  = useState(REFRESH_MS / 1000);
    const countRef = useRef(null);

    useEffect(() => {
        getPrometheusEnvs()
            .then(d => {
                const list = Array.isArray(d?.envs) ? d.envs : [];
                setEnvs(list);
                if (list.length) setEnv(list[0]);
            })
            .catch(() => {})
            .finally(() => setEnvLoading(false));
    }, []);

    const { snapshot, loading, error, refresh } = useProdStatus(env);

    // Reset + tick countdown whenever env changes or refresh fires
    useEffect(() => {
        setCountdown(REFRESH_MS / 1000);
        clearInterval(countRef.current);
        countRef.current = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) return REFRESH_MS / 1000;
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(countRef.current);
    }, [env, snapshot]);

    const products = useMemo(() => buildProducts(snapshot), [snapshot]);

    const upList   = products.filter(p =>  p.running);
    const downList = products.filter(p => !p.running);

    const capturedAt = snapshot?.capturedAt
        ? new Date(snapshot.capturedAt).toLocaleTimeString(undefined, {
              hour: "2-digit", minute: "2-digit", second: "2-digit",
          })
        : null;

    // Cluster-level totals (if available)
    const c = snapshot?.cluster;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>

            {/* ── sticky header ── */}
            <div style={{
                padding: "14px 20px 12px",
                borderBottom: "1px solid var(--border, #e2e8f0)",
                background: "var(--card-bg, #fff)",
                position: "sticky", top: 0, zIndex: 2,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Server size={16} style={{ color: "#0ea5e9", flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-main, #0f172a)" }}>
                        Infrastructure
                    </span>

                    {/* env selector */}
                    {envs.length > 1 && !envLoading && (
                        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                            <select
                                value={env}
                                onChange={e => setEnv(e.target.value)}
                                style={{
                                    appearance: "none", padding: "4px 26px 4px 10px",
                                    border: "1px solid #cbd5e1", borderRadius: 7,
                                    fontSize: 12, fontWeight: 600,
                                    background: "var(--card-bg, #f8fafc)",
                                    color: "#334155", cursor: "pointer",
                                }}
                            >
                                {envs.map(e => (
                                    <option key={e} value={e}>{e.toUpperCase()}</option>
                                ))}
                            </select>
                            <ChevronDown size={11} style={{ position: "absolute", right: 7, color: "#64748b", pointerEvents: "none" }} />
                        </div>
                    )}
                    {envs.length === 1 && !envLoading && (
                        <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px",
                            background: tok.envBadgeBg, color: tok.envBadgeColor, borderRadius: 6,
                        }}>
                            {env.toUpperCase()}
                        </span>
                    )}

                    {/* refresh button */}
                    <button
                        type="button"
                        onClick={() => { refresh(); setCountdown(REFRESH_MS / 1000); }}
                        disabled={loading}
                        style={{
                            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", borderRadius: 7,
                            border: "1px solid var(--border, #e2e8f0)",
                            background: "var(--card-bg, #fff)",
                            cursor: loading ? "default" : "pointer",
                            fontSize: 11, color: "#64748b",
                        }}
                    >
                        <RefreshCw size={12} style={{ animation: loading ? "uip-spin 1s linear infinite" : "none" }} />
                        {loading ? "Updating…" : `Refresh`}
                    </button>
                </div>

                {/* sub-row: up/down counts + cluster totals + last updated */}
                {!envLoading && products.length > 0 && (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 16,
                        marginTop: 10, flexWrap: "wrap",
                    }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                            <strong style={{ color: isDark ? "#4ade80" : "#16a34a" }}>{upList.length}</strong>
                            <span style={{ color: "var(--text-sub)" }}>running</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                            <strong style={{ color: isDark ? "#f87171" : "#dc2626" }}>{downList.length}</strong>
                            <span style={{ color: "var(--text-sub)" }}>down</span>
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                            {products.length} product{products.length !== 1 ? "s" : ""}
                        </span>

                        {/* cluster resource summary */}
                        {c && (
                            <>
                                <span style={{ color: tok.divider, fontSize: 16, lineHeight: 1 }}>|</span>
                                <span style={{ fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Cpu size={11} style={{ color: "#f97316" }} />
                                    <span style={{ color: "#f97316", fontWeight: 600 }}>{fmtN(c.usedCpuCores, 1)}</span>
                                    <span style={{ color: "var(--text-muted)" }}>/ {fmtN(c.totalCpuCores, 0)} cores</span>
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Database size={11} style={{ color: isDark ? "#a5b4fc" : "#6366f1" }} />
                                    <span style={{ color: isDark ? "#a5b4fc" : "#6366f1", fontWeight: 600 }}>{fmtN(c.usedMemoryGb, 1)}</span>
                                    <span style={{ color: "var(--text-muted)" }}>/ {fmtN(c.totalMemoryGb, 0)} GB</span>
                                </span>
                            </>
                        )}

                        {capturedAt && (
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                                <Activity size={10} />
                                updated {capturedAt}
                                <span style={{
                                    marginLeft: 4, fontSize: 10,
                                    color: countdown <= 10 ? "#f59e0b" : tok.countdownMuted,
                                }}>
                                    · next in {countdown}s
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── body ── */}
            <div style={{ padding: "18px 20px 24px", flex: 1, overflowY: "auto" }}>

                {envLoading && (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 13 }}>
                        Loading environments…
                    </div>
                )}

                {!envLoading && envs.length === 0 && (
                    <div style={{
                        textAlign: "center", padding: "60px 0",
                        color: "var(--text-muted)", fontSize: 13,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    }}>
                        <AlertTriangle size={28} style={{ color: tok.emptyIcon }} />
                        No cluster environments configured.
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                        background: tok.errBg, border: `1px solid ${tok.errBorder}`,
                        color: tok.errColor, fontSize: 12,
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <AlertTriangle size={14} />
                        {error}
                    </div>
                )}

                {!envLoading && envs.length > 0 && loading && !snapshot && (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 13 }}>
                        Loading cluster status…
                    </div>
                )}

                {!loading && snapshot && products.length === 0 && (
                    <div style={{
                        textAlign: "center", padding: "60px 0",
                        color: "var(--text-muted)", fontSize: 13,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    }}>
                        <Server size={28} style={{ color: tok.emptyIcon }} />
                        No products detected in <strong>{env.toUpperCase()}</strong>.
                    </div>
                )}

                {/* Running products */}
                {upList.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <SectionLabel
                            color={isDark ? "#4ade80" : "#16a34a"}
                            dot="#22c55e"
                            label="Running"
                            count={upList.length}
                        />
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
                            gap: 10,
                        }}>
                            {upList.map(p => <ProductCard key={p.name} p={p} isDark={isDark} />)}
                        </div>
                    </div>
                )}

                {/* Stopped products */}
                {downList.length > 0 && (
                    <div>
                        <SectionLabel
                            color={isDark ? "#f87171" : "#dc2626"}
                            dot="#ef4444"
                            label="Stopped"
                            count={downList.length}
                        />
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
                            gap: 10,
                        }}>
                            {downList.map(p => <ProductCard key={p.name} p={p} isDark={isDark} />)}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes uip-spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
