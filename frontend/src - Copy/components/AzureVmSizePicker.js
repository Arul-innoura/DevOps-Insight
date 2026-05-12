import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getAzureVmSkus } from "../services/azurePricingService";

/**
 * Compact dropdown that fetches live Azure VM sizes for a region and lets
 * the admin pick one. On select, returns the full row including vCpuPerNode
 * and memoryGbPerNode derived from armSkuName by the backend.
 *
 * Props:
 *   region   string      — Azure ARM region (defaults eastus)
 *   value    string      — currently selected armSkuName / vmSize
 *   onPick   (row) => void — full row from /vm-skus
 *   spot     boolean     — fetch Spot pricing instead of on-demand
 */
export default function AzureVmSizePicker({ region = "eastus", value, onPick, size = "sm", spot = false }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("");
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getAzureVmSkus({ armRegionName: region, max: 80, spot: spot || undefined })
            .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setRows([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [region, spot]);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return rows.slice(0, 30);
        return rows.filter(r =>
            (r.armSkuName || "").toLowerCase().includes(q) ||
            (r.skuName || "").toLowerCase().includes(q) ||
            (r.productName || "").toLowerCase().includes(q)
        ).slice(0, 40);
    }, [rows, filter]);

    const compact = size === "sm";
    return (
        <div style={{ position: "relative", width: "100%" }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    width: "100%",
                    padding: compact ? "6px 10px" : "10px 12px",
                    background: "var(--input-bg, #fff)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    textAlign: "left",
                    fontSize: compact ? 13 : 14,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
            >
                <span>{value || (loading ? "Loading VM sizes…" : "Select VM size…")}</span>
                {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={14} />}
            </button>
            {open && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40,
                    marginTop: 4, background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-color)", borderRadius: 6,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.12)", maxHeight: 320, overflow: "hidden",
                    display: "flex", flexDirection: "column",
                }}>
                    <input
                        autoFocus
                        placeholder="Filter: D4s_v3, F4s, B-series, ..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        style={{
                            padding: "8px 10px", border: 0, borderBottom: "1px solid var(--border-color)",
                            outline: "none", fontSize: 13, background: "transparent",
                            color: "var(--text-primary)",
                        }}
                    />
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        {filtered.length === 0 && !loading && (
                            <div style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>
                                No VM sizes match "{filter}" in {region}.
                            </div>
                        )}
                        {filtered.map((r) => (
                            <button
                                type="button"
                                key={r.meterId}
                                onClick={() => { onPick?.(r); setOpen(false); }}
                                style={{
                                    width: "100%", textAlign: "left", padding: "8px 12px",
                                    background: "transparent", border: 0, borderBottom: "1px solid var(--border-color)",
                                    cursor: "pointer", fontSize: 13, color: "var(--text-primary)",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg, #f3f4f6)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                            >
                                <span>
                                    <strong>{r.armSkuName || r.skuName}</strong>
                                    {(r.vCpuPerNode > 0) && (
                                        <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}>
                                            {r.vCpuPerNode} vCPU · {r.memoryGbPerNode} GB RAM
                                        </span>
                                    )}
                                </span>
                                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                                    ${Number(r.retailPrice || 0).toFixed(4)}/hr
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
