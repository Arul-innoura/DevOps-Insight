import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { getActivityLogs } from "../../services/activityLogService";

// ─── Badge colour map ────────────────────────────────────────────────────────

const ACTION_STYLES = {
    TICKET_CREATED:  { bg: "#DBEAFE", color: "#1D4ED8", label: "Created" },
    STATUS_CHANGED:  { bg: "#FEF3C7", color: "#B45309", label: "Status Changed" },
    TICKET_ASSIGNED: { bg: "#EDE9FE", color: "#6D28D9", label: "Assigned" },
    NOTE_ADDED:      { bg: "#F3F4F6", color: "#374151", label: "Note Added" },
    TICKET_DELETED:  { bg: "#FEE2E2", color: "#B91C1C", label: "Deleted" },
    COST_SUBMITTED:  { bg: "#D1FAE5", color: "#065F46", label: "Cost Submitted" },
};

const actionStyle = (action) =>
    ACTION_STYLES[action] || { bg: "#F3F4F6", color: "#374151", label: action };

const ENTITY_TYPES = ["", "TICKET", "USER", "PROJECT"];
const ACTION_TYPES = ["", ...Object.keys(ACTION_STYLES)];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
};

const matchesDateRange = (isoTimestamp, from, to) => {
    if (!from && !to) return true;
    const ts = new Date(isoTimestamp).getTime();
    if (from && ts < new Date(from).getTime()) return false;
    if (to   && ts > new Date(to + "T23:59:59").getTime()) return false;
    return true;
};

// ─── Main component ──────────────────────────────────────────────────────────

const ActivityLogsView = () => {
    const [logs, setLogs]         = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [expandedRow, setExpandedRow] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);
    const intervalRef = useRef(null);

    // Filters
    const [filterAction, setFilterAction]         = useState("");
    const [filterEntityType, setFilterEntityType] = useState("");
    const [filterPerformedBy, setFilterPerformedBy] = useState("");
    const [filterDateFrom, setFilterDateFrom]     = useState("");
    const [filterDateTo, setFilterDateTo]         = useState("");
    const [searchText, setSearchText]             = useState("");

    const fetchLogs = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const data = await getActivityLogs();
            setLogs(Array.isArray(data) ? data : []);
            setLastRefresh(new Date());
        } catch (err) {
            setError(err.message || "Failed to load activity logs");
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => { fetchLogs(false); }, [fetchLogs]);

    // Auto-refresh every 30 s
    useEffect(() => {
        intervalRef.current = setInterval(() => fetchLogs(true), 30_000);
        return () => clearInterval(intervalRef.current);
    }, [fetchLogs]);

    // Filtered data
    const filtered = logs.filter((log) => {
        if (filterAction     && log.action     !== filterAction)     return false;
        if (filterEntityType && log.entityType !== filterEntityType) return false;
        if (filterPerformedBy) {
            const q = filterPerformedBy.toLowerCase();
            if (
                !(log.performedBy      || "").toLowerCase().includes(q) &&
                !(log.performedByEmail || "").toLowerCase().includes(q)
            ) return false;
        }
        if (!matchesDateRange(log.timestamp, filterDateFrom, filterDateTo)) return false;
        if (searchText) {
            const q = searchText.toLowerCase();
            if (
                !(log.description   || "").toLowerCase().includes(q) &&
                !(log.entityId      || "").toLowerCase().includes(q) &&
                !(log.performedBy   || "").toLowerCase().includes(q)
            ) return false;
        }
        return true;
    });

    const clearFilters = () => {
        setFilterAction("");
        setFilterEntityType("");
        setFilterPerformedBy("");
        setFilterDateFrom("");
        setFilterDateTo("");
        setSearchText("");
    };

    const hasFilters = filterAction || filterEntityType || filterPerformedBy || filterDateFrom || filterDateTo || searchText;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="activity-logs-view" style={{ padding: "0 0 2rem 0" }}>
            {/* Filter bar */}
            <div
                style={{
                    background: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "flex-end",
                }}
            >
                {/* Search */}
                <div style={{ position: "relative", flex: "1 1 180px" }}>
                    <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                    <input
                        type="text"
                        placeholder="Search description / entity / user…"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={inputStyle({ paddingLeft: 30 })}
                    />
                </div>

                {/* Action type */}
                <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={inputStyle()}>
                    <option value="">All Actions</option>
                    {ACTION_TYPES.filter(Boolean).map((a) => (
                        <option key={a} value={a}>{actionStyle(a).label}</option>
                    ))}
                </select>

                {/* Entity type */}
                <select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)} style={inputStyle()}>
                    <option value="">All Entities</option>
                    {ENTITY_TYPES.filter(Boolean).map((e) => (
                        <option key={e} value={e}>{e}</option>
                    ))}
                </select>

                {/* Performed by */}
                <input
                    type="text"
                    placeholder="Performed by…"
                    value={filterPerformedBy}
                    onChange={(e) => setFilterPerformedBy(e.target.value)}
                    style={inputStyle({ flex: "1 1 140px" })}
                />

                {/* Date range */}
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={inputStyle()} title="From date" />
                    <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>
                    <input type="date" value={filterDateTo}   onChange={(e) => setFilterDateTo(e.target.value)}   style={inputStyle()} title="To date" />
                </div>

                {/* Clear + refresh */}
                {hasFilters && (
                    <button onClick={clearFilters} style={btnStyle("#F3F4F6", "#374151")} title="Clear filters">
                        <X size={14} /> Clear
                    </button>
                )}
                <button onClick={() => fetchLogs(false)} style={btnStyle("#EFF6FF", "#1D4ED8")} title="Refresh now">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Meta row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", color: "#6B7280", fontSize: "0.8rem" }}>
                <span>{filtered.length} log{filtered.length !== 1 ? "s" : ""} {hasFilters ? "(filtered)" : ""}</span>
                {lastRefresh && <span>Last refreshed: {lastRefresh.toLocaleTimeString()} · auto-refresh every 30s</span>}
            </div>

            {/* Content */}
            {loading ? (
                <div style={centerStyle}>
                    <div className="spinner" />
                    <p style={{ color: "#6B7280", marginTop: "0.75rem" }}>Loading activity logs…</p>
                </div>
            ) : error ? (
                <div style={{ ...centerStyle, color: "#B91C1C" }}>
                    <p>{error}</p>
                    <button onClick={() => fetchLogs(false)} style={{ ...btnStyle("#FEE2E2", "#B91C1C"), marginTop: "0.5rem" }}>
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div style={centerStyle}>
                    <p style={{ color: "#6B7280" }}>No activity logs found.</p>
                </div>
            ) : (
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={tableHeaderStyle}>
                        <div style={{ flex: "0 0 170px" }}>Timestamp</div>
                        <div style={{ flex: "0 0 150px" }}>Action</div>
                        <div style={{ flex: "0 0 80px" }}>Entity</div>
                        <div style={{ flex: "1" }}>Description</div>
                        <div style={{ flex: "0 0 180px" }}>Performed By</div>
                        <div style={{ flex: "0 0 24px" }} />
                    </div>

                    {filtered.map((log) => {
                        const style = actionStyle(log.action);
                        const isExpanded = expandedRow === log.id;

                        return (
                            <React.Fragment key={log.id}>
                                <div
                                    style={{
                                        ...tableRowStyle,
                                        cursor: "pointer",
                                        background: isExpanded ? "#F9FAFB" : "#fff",
                                    }}
                                    onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                >
                                    <div style={{ flex: "0 0 170px", fontSize: "0.78rem", color: "#6B7280", fontFamily: "monospace" }}>
                                        {fmt(log.timestamp)}
                                    </div>
                                    <div style={{ flex: "0 0 150px" }}>
                                        <span style={{
                                            background: style.bg,
                                            color: style.color,
                                            borderRadius: 6,
                                            padding: "2px 8px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            whiteSpace: "nowrap",
                                        }}>
                                            {style.label}
                                        </span>
                                    </div>
                                    <div style={{ flex: "0 0 80px", fontSize: "0.78rem", color: "#9CA3AF" }}>
                                        {log.entityType || "—"}
                                    </div>
                                    <div style={{ flex: "1", fontSize: "0.85rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {log.description || "—"}
                                        {log.entityId && (
                                            <span style={{ marginLeft: 6, color: "#9CA3AF", fontSize: "0.75rem" }}>
                                                [{log.entityId}]
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ flex: "0 0 180px", fontSize: "0.82rem" }}>
                                        <div style={{ fontWeight: 500, color: "#374151" }}>{log.performedBy || "—"}</div>
                                        {log.performedByEmail && (
                                            <div style={{ color: "#9CA3AF", fontSize: "0.73rem" }}>{log.performedByEmail}</div>
                                        )}
                                    </div>
                                    <div style={{ flex: "0 0 24px", color: "#9CA3AF" }}>
                                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                    </div>
                                </div>

                                {/* Expanded metadata */}
                                {isExpanded && (
                                    <div style={{
                                        background: "#F9FAFB",
                                        borderTop: "1px solid #F3F4F6",
                                        padding: "0.75rem 1.5rem 1rem 1.5rem",
                                        fontSize: "0.82rem",
                                        color: "#374151",
                                    }}>
                                        <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                                            <div>
                                                <span style={labelStyle}>Entity ID</span>
                                                <span style={{ fontFamily: "monospace" }}>{log.entityId || "—"}</span>
                                            </div>
                                            <div>
                                                <span style={labelStyle}>Action</span>
                                                <span style={{ fontFamily: "monospace" }}>{log.action}</span>
                                            </div>
                                            {log.ipAddress && (
                                                <div>
                                                    <span style={labelStyle}>IP</span>
                                                    <span style={{ fontFamily: "monospace" }}>{log.ipAddress}</span>
                                                </div>
                                            )}
                                        </div>
                                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                                            <div>
                                                <span style={{ ...labelStyle, display: "block", marginBottom: "0.35rem" }}>Metadata</span>
                                                <pre style={{
                                                    background: "#F3F4F6",
                                                    border: "1px solid #E5E7EB",
                                                    borderRadius: 6,
                                                    padding: "0.6rem 0.9rem",
                                                    fontSize: "0.78rem",
                                                    overflowX: "auto",
                                                    margin: 0,
                                                    color: "#1F2937",
                                                }}>
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputStyle = (extra = {}) => ({
    border: "1px solid #D1D5DB",
    borderRadius: 7,
    padding: "6px 10px",
    fontSize: "0.83rem",
    color: "#374151",
    background: "#fff",
    outline: "none",
    height: 34,
    ...extra,
});

const btnStyle = (bg, color) => ({
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    background: bg,
    color,
    border: "none",
    borderRadius: 7,
    padding: "6px 12px",
    fontSize: "0.83rem",
    fontWeight: 500,
    cursor: "pointer",
    height: 34,
    whiteSpace: "nowrap",
});

const tableHeaderStyle = {
    display: "flex",
    gap: "0.75rem",
    padding: "0.7rem 1.25rem",
    background: "#F9FAFB",
    borderBottom: "1px solid #E5E7EB",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

const tableRowStyle = {
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem 1.25rem",
    borderBottom: "1px solid #F3F4F6",
    alignItems: "center",
    transition: "background 0.12s",
};

const centerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem 0",
    color: "#6B7280",
};

const labelStyle = {
    color: "#9CA3AF",
    fontWeight: 600,
    marginRight: 6,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

export default ActivityLogsView;
