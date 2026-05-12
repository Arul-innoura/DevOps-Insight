import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Check, X } from "lucide-react";
import { suggestAzureCatalog } from "../services/azurePricingService";

/**
 * Category-aware live autocomplete for the admin "Cloud Services" tree.
 *
 * The component takes a category bucket (compute / aks / network / security /
 * storage / database / ai / other) and resolves it server-side onto the
 * right Azure serviceName filter — no manual SKU typing or "what is the
 * exact Azure service name" guessing.
 *
 * On selection the parent gets the full suggestion row, including derived
 * vCPU/RAM (when applicable), an hourly rate, and a pre-computed monthly
 * estimate so it can autofill specs + cost on the underlying CategoryServiceItem.
 *
 * Props:
 *   category        string  — required. Azure category key.
 *   region          string  — Azure ARM region (defaults eastus).
 *   value           object  — currently selected row (or { skuName, monthlyEstUsd } shape).
 *                             Used purely for display; component does not own state.
 *   onPick          (row) => void
 *   onClear         () => void  — optional; shows a clear (×) chip when defined.
 *   spot            boolean — request Spot pricing (compute/aks only).
 *   placeholder     string
 *   size            "sm" | "md"
 *   disabled        boolean
 *   minChars        number  — min query length before fetching (default 0 → loads
 *                             a default page on focus).
 */
export default function AzureCatalogAutocomplete({
    category,
    region = "eastus",
    value,
    onPick,
    onClear,
    spot = false,
    placeholder,
    size = "sm",
    disabled = false,
    minChars = 0,
}) {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const compact = size === "sm";

    const fetchSuggestions = useCallback(
        (q) => {
            if (!category) {
                setRows([]);
                return Promise.resolve();
            }
            setLoading(true);
            return suggestAzureCatalog({
                category,
                query: q,
                armRegionName: region,
                max: 30,
                spot: spot ? true : undefined,
            })
                .then((data) => setRows(Array.isArray(data) ? data : []))
                .catch(() => setRows([]))
                .finally(() => setLoading(false));
        },
        [category, region, spot]
    );

    useEffect(() => {
        if (!open) return undefined;
        const trimmed = query.trim();
        if (trimmed.length < minChars) {
            if (trimmed.length === 0 && minChars === 0) {
                fetchSuggestions("");
            } else {
                setRows([]);
            }
            return undefined;
        }
        const tid = setTimeout(() => fetchSuggestions(trimmed), 300);
        return () => clearTimeout(tid);
    }, [query, open, minChars, fetchSuggestions]);

    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const selectedLabel = useMemo(() => {
        if (!value) return null;
        const sku = value.armSkuName || value.skuName || value.azureSkuName;
        if (sku) return sku;
        if (value.productName) return value.productName;
        return null;
    }, [value]);

    const monthlyDisplay = useMemo(() => {
        if (!value) return null;
        const m =
            value.monthlyEstUsd ?? value.monthlyRateUsd ?? value.azureRetailPriceMonthly;
        if (m != null && Number.isFinite(Number(m))) return Number(m);
        const h = value.hourlyRateUsd;
        if (h != null && Number.isFinite(Number(h))) return Number(h) * 730;
        return null;
    }, [value]);

    const handleKeyDown = (e) => {
        if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
                setOpen(true);
                e.preventDefault();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            if (activeIdx >= 0 && rows[activeIdx]) {
                e.preventDefault();
                pick(rows[activeIdx]);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const pick = (row) => {
        onPick?.(row);
        setQuery("");
        setOpen(false);
        setActiveIdx(-1);
    };

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
            <div style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    disabled={disabled}
                    placeholder={
                        placeholder ||
                        (selectedLabel
                            ? `Change: ${selectedLabel}`
                            : `Search Azure ${category || "service"}…`)
                    }
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        setActiveIdx(-1);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    style={{
                        ...inputBase(compact),
                        paddingRight: selectedLabel ? 56 : 30,
                        opacity: disabled ? 0.6 : 1,
                    }}
                />
                <div style={iconRow}>
                    {loading ? (
                        <Loader2 size={14} style={spinStyle} />
                    ) : selectedLabel ? (
                        <Check size={14} color="#059669" />
                    ) : (
                        <Search size={14} color="var(--text-muted, #9ca3af)" />
                    )}
                    {selectedLabel && onClear && (
                        <button
                            type="button"
                            title="Clear"
                            onClick={() => {
                                onClear();
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            style={clearBtn}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {selectedLabel && (
                <div style={selectedChip}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                        {selectedLabel}
                    </span>
                    {monthlyDisplay != null && (
                        <span style={{ color: "#059669", fontFamily: "monospace" }}>
                            ${monthlyDisplay.toFixed(2)}/mo
                        </span>
                    )}
                </div>
            )}

            {open && !disabled && (
                <div style={dropdown}>
                    {loading && rows.length === 0 && (
                        <div style={hintRow}>Loading live Azure prices…</div>
                    )}
                    {!loading && rows.length === 0 && (
                        <div style={hintRow}>
                            {query.trim()
                                ? `No ${category || "matching"} services for "${query}"`
                                : `Type to search Azure ${category || "services"}`}
                        </div>
                    )}
                    {rows.map((r, i) => {
                        const active = i === activeIdx;
                        const monthly = r.monthlyEstUsd;
                        return (
                            <button
                                key={r.meterId || `${r.skuName}-${i}`}
                                type="button"
                                onMouseEnter={() => setActiveIdx(i)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    pick(r);
                                }}
                                style={{
                                    ...rowBtn,
                                    background: active
                                        ? "var(--hover-bg, #f3f4f6)"
                                        : "transparent",
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={rowTitle}>
                                        {r.armSkuName || r.skuName || r.productName}
                                        {r.vCpuPerNode > 0 && (
                                            <span style={specChip}>
                                                {r.vCpuPerNode} vCPU · {r.memoryGbPerNode} GB
                                            </span>
                                        )}
                                    </div>
                                    <div style={rowSub}>
                                        {r.productName || r.serviceName}
                                        {r.serviceName && r.productName && r.serviceName !== r.productName
                                            ? ` · ${r.serviceName}`
                                            : ""}
                                    </div>
                                </div>
                                <div style={rowPrice}>
                                    {monthly != null
                                        ? `$${monthly.toFixed(2)}/mo`
                                        : r.retailPrice != null
                                            ? `$${r.retailPrice.toFixed(4)}/${unitShort(r.unitOfMeasure)}`
                                            : "—"}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const unitShort = (u) => {
    if (!u) return "unit";
    const s = u.toLowerCase();
    if (s.includes("hour")) return "hr";
    if (s.includes("month")) return "mo";
    if (s.includes("day")) return "day";
    if (s.includes("year")) return "yr";
    if (s.includes("gb")) return "GB";
    return s.split(" ").pop() || "unit";
};

const inputBase = (compact) => ({
    width: "100%",
    padding: compact ? "6px 30px 6px 10px" : "9px 36px 9px 12px",
    border: "1px solid var(--border-color)",
    borderRadius: 6,
    background: "var(--input-bg, #fff)",
    color: "var(--text-primary)",
    fontSize: compact ? 13 : 14,
    outline: "none",
    boxSizing: "border-box",
});

const iconRow = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    pointerEvents: "auto",
};

const clearBtn = {
    background: "transparent",
    border: 0,
    cursor: "pointer",
    padding: 2,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
};

const spinStyle = { animation: "spin 1s linear infinite" };

const selectedChip = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 3,
    gap: 8,
};

const dropdown = {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    zIndex: 200,
    background: "var(--card-bg, #fff)",
    border: "1px solid var(--border-color)",
    borderRadius: 6,
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    maxHeight: 320,
    overflowY: "auto",
};

const hintRow = {
    padding: "10px 12px",
    fontSize: 12,
    color: "var(--text-muted)",
};

const rowBtn = {
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    border: 0,
    borderBottom: "1px solid var(--border-color)",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
};

const rowTitle = {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const specChip = {
    fontSize: 10,
    color: "var(--text-muted)",
    background: "var(--badge-bg, #eff6ff)",
    padding: "1px 6px",
    borderRadius: 8,
    fontWeight: 400,
};

const rowSub = {
    fontSize: 11,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const rowPrice = {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#059669",
    whiteSpace: "nowrap",
    fontWeight: 600,
};
