import React, { useState, useCallback } from "react";
import { Search, Loader2, Check, X } from "lucide-react";
import { lookupAzurePrice, searchAzurePrices } from "../services/azurePricingService";
import { useToast } from "../services/ToastNotification";

/**
 * Modal that lets an Admin pick a real Azure retail price row (from the
 * public Azure Retail Pricing API) when adding / editing a cloud service.
 * The selected row is returned to the parent, which stores meterId +
 * skuName + region + retailPrice on the CloudServiceItem so the backend
 * scheduler can refresh the live price.
 *
 * Props:
 *   open      boolean
 *   onClose   () => void
 *   onPick    (priceRow) => void
 *   defaultService   string — prefill serviceName
 *   defaultRegion    string — prefill armRegionName
 */
export default function AzureSkuPicker({ open, onClose, onPick, defaultService = "", defaultRegion = "eastus" }) {
    const toast = useToast();
    const [serviceName, setServiceName] = useState(defaultService);
    const [armRegionName, setArmRegionName] = useState(defaultRegion);
    const [skuName, setSkuName] = useState("");
    const [productName, setProductName] = useState("");
    const [rawFilter, setRawFilter] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState("structured"); // "structured" | "raw"

    const runSearch = useCallback(async () => {
        setLoading(true);
        try {
            const rows = mode === "raw"
                ? await searchAzurePrices({ filter: rawFilter })
                : await lookupAzurePrice({ serviceName, armRegionName, skuName, productName });
            setResults(Array.isArray(rows) ? rows : []);
            if (!rows?.length) toast.info("No prices matched — widen the filter.");
        } catch (e) {
            toast.error("Azure pricing lookup failed");
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [mode, rawFilter, serviceName, armRegionName, skuName, productName, toast]);

    if (!open) return null;

    return (
        <div style={overlay} onMouseDown={onClose}>
            <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
                <header style={header}>
                    <strong>Azure Retail Pricing — live lookup</strong>
                    <button style={xBtn} onClick={onClose}><X size={16} /></button>
                </header>

                <div style={{ padding: 14, borderBottom: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <ModeBtn active={mode === "structured"} onClick={() => setMode("structured")}>Structured</ModeBtn>
                        <ModeBtn active={mode === "raw"} onClick={() => setMode("raw")}>OData filter</ModeBtn>
                    </div>

                    {mode === "structured" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            <LabeledInput label="Service name" value={serviceName} onChange={setServiceName}
                                placeholder="Virtual Machines / Container Registry / …" required />
                            <LabeledInput label="Region (arm)" value={armRegionName} onChange={setArmRegionName}
                                placeholder="eastus" />
                            <LabeledInput label="SKU name" value={skuName} onChange={setSkuName}
                                placeholder="D4 v3 / Standard" />
                            <LabeledInput label="Product name" value={productName} onChange={setProductName}
                                placeholder="Virtual Machines DSv3 Series" />
                        </div>
                    ) : (
                        <textarea
                            value={rawFilter}
                            onChange={(e) => setRawFilter(e.target.value)}
                            rows={3}
                            placeholder={`serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and skuName eq 'D4 v3'`}
                            style={textareaStyle}
                        />
                    )}

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button style={primaryBtn} onClick={runSearch} disabled={loading}>
                            {loading ? <Loader2 size={14} className="rm-spin" /> : <Search size={14} />}
                            <span style={{ marginLeft: 6 }}>{loading ? "Searching…" : "Search live prices"}</span>
                        </button>
                    </div>
                </div>

                <div style={{ overflow: "auto", maxHeight: 420 }}>
                    {results.length === 0 ? (
                        <div style={{ padding: 24, color: "var(--text-secondary)", textAlign: "center" }}>
                            No results yet. Run a search — this calls the live public Azure Retail Prices API.
                        </div>
                    ) : (
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={th}>Product</th>
                                    <th style={th}>SKU</th>
                                    <th style={th}>Region</th>
                                    <th style={th}>Unit</th>
                                    <th style={thRight}>Price (USD)</th>
                                    <th style={th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r) => (
                                    <tr key={r.meterId || `${r.skuId}-${r.armRegionName}`} style={{ borderTop: "1px solid var(--border-color)" }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>{r.productName}</div>
                                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                                {r.serviceName}{r.serviceFamily ? ` · ${r.serviceFamily}` : ""}
                                            </div>
                                        </td>
                                        <td style={td}>{r.skuName}</td>
                                        <td style={td}>{r.armRegionName || "–"}</td>
                                        <td style={td}>{r.unitOfMeasure}</td>
                                        <td style={tdRight}>
                                            {r.retailPrice != null ? `$${r.retailPrice.toFixed(6)}` : "–"}
                                        </td>
                                        <td style={td}>
                                            <button style={primaryBtn} onClick={() => { onPick(r); onClose(); }}>
                                                <Check size={13} /> <span style={{ marginLeft: 4 }}>Use</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

function ModeBtn({ active, children, onClick }) {
    return (
        <button onClick={onClick} style={{
            padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
            border: "1px solid var(--border-color)",
            background: active ? "var(--accent-color, #3b82f6)" : "transparent",
            color: active ? "#fff" : "var(--text-primary)",
        }}>{children}</button>
    );
}

function LabeledInput({ label, value, onChange, placeholder, required }) {
    return (
        <label style={{ display: "block" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                {label}{required ? " *" : ""}
            </div>
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                style={inputStyle} />
        </label>
    );
}

const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
};
const modal = {
    width: "min(900px, 96vw)", maxHeight: "90vh",
    background: "var(--bg-primary, #0f0f17)", color: "var(--text-primary, #fff)",
    border: "1px solid var(--border-color)", borderRadius: 10,
    display: "flex", flexDirection: "column", overflow: "hidden",
};
const header = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px", borderBottom: "1px solid var(--border-color)",
};
const xBtn = { background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" };
const primaryBtn = {
    display: "inline-flex", alignItems: "center",
    padding: "5px 11px", borderRadius: 4, fontSize: 12, cursor: "pointer",
    background: "var(--accent-color, #3b82f6)", color: "#fff", border: "none",
};
const inputStyle = {
    width: "100%", padding: "6px 8px", fontSize: 13,
    border: "1px solid var(--border-color)", borderRadius: 4,
    background: "var(--panel-bg)", color: "var(--text-primary)",
};
const textareaStyle = { ...inputStyle, fontFamily: "monospace", resize: "vertical" };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 500, background: "var(--panel-bg-alt, rgba(0,0,0,0.04))" };
const thRight = { ...th, textAlign: "right" };
const td = { padding: "8px 10px", verticalAlign: "middle" };
const tdRight = { ...td, textAlign: "right", fontFeatureSettings: "'tnum' 1" };
