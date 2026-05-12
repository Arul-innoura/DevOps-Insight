import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    Layers,
    Server,
    Cpu,
    HardDrive,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Info,
    Clock,
    Camera,
} from "lucide-react";
import {
    getResourceHierarchy,
    getClusterFluctuation,
    getProjectFluctuation,
    getMicroserviceFluctuation,
    snapshotProject,
} from "../services/resourceMonitoringService";
import FluctuationChart from "../components/FluctuationChart";
import { useToast } from "../services/ToastNotification";

const METRICS = [
    {
        key: "cpu", label: "CPU (cores)", color: "#3b82f6", field: "cpuCores",
        toV: v => v,
        fmt: v => v == null ? "–" : `${v.toFixed(2)} cores`,
    },
    {
        key: "mem", label: "Memory (GB)", color: "#8b5cf6", field: "memoryMb",
        toV: v => v != null ? v / 1024 : null,   // stored as MB, display in GB
        fmt: v => v == null ? "–" : `${v.toFixed(2)} GB`,
    },
];

const mbToGb = (mb) => mb != null ? (mb / 1024).toFixed(2) + " GB" : "–";

const LEVEL_ICONS = {
    ENVIRONMENT: <Layers size={16} />,
    CLUSTER: <Server size={16} />,
    PROJECT: <Layers size={14} />,
    MICROSERVICE: <Cpu size={14} />,
};

/**
 * Shared Resource Monitoring section shown inside Analytics for both User
 * and DevOps roles. Drill-down tree + fluctuation graphs at environment
 * and project levels. DevOps users see an extra "Snapshot now" action.
 */
export default function ResourceMonitoringDashboard({ role = "user" }) {
    const toast = useToast();
    const [hierarchy, setHierarchy] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [fluctuation, setFluctuation] = useState([]);
    const [fluctLoading, setFluctLoading] = useState(false);
    const [fluctRange, setFluctRange] = useState("90d");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getResourceHierarchy();
            setHierarchy(Array.isArray(data) ? data : []);
            // auto-expand top level
            const initial = {};
            (data || []).forEach(n => { initial[n.id] = true; });
            setExpanded(prev => ({ ...initial, ...prev }));
        } catch (e) {
            toast.error("Failed to load resource hierarchy");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const loadFluctuation = useCallback(async (node, range) => {
        if (!node) return;
        setFluctLoading(true);
        setFluctuation([]);
        const r = range ?? fluctRange;
        const to = new Date().toISOString();
        const from = r === "30d"  ? new Date(Date.now() - 30  * 86400e3).toISOString()
                   : r === "90d"  ? new Date(Date.now() - 90  * 86400e3).toISOString()
                   : r === "365d" ? new Date(Date.now() - 365 * 86400e3).toISOString()
                   : null; // "all" — no lower bound
        try {
            let pts = [];
            if (node.level === "ENVIRONMENT") {
                pts = await getClusterFluctuation({ environment: node.name, from, to });
            } else if (node.level === "CLUSTER") {
                const [, env, clusterName] = (node.id || "").split(":");
                pts = await getClusterFluctuation({ environment: env, clusterName, from, to });
            } else if (node.level === "PROJECT") {
                const envNode = findEnvFor(hierarchy, node.id);
                pts = await getProjectFluctuation({ projectId: node.id, environment: envNode || "", from, to });
            } else if (node.level === "MICROSERVICE") {
                pts = await getMicroserviceFluctuation({ microserviceId: node.id, from, to });
            }
            setFluctuation(pts || []);
        } catch (e) {
            toast.error("Could not load fluctuation graph");
        } finally {
            setFluctLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hierarchy, toast]);

    const select = (node) => {
        setSelected(node);
        loadFluctuation(node, fluctRange);
    };

    // Re-fetch when date range toggle changes
    useEffect(() => {
        if (selected) loadFluctuation(selected, fluctRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fluctRange]);

    const handleSnapshot = async (node) => {
        const envNode = node.level === "PROJECT" ? findEnvFor(hierarchy, node.id) : null;
        if (!envNode) return toast.error("Select a project inside an environment first");
        try {
            await snapshotProject({ projectId: node.id, environment: envNode });
            toast.success("Snapshot captured");
            loadFluctuation(node);
        } catch {
            toast.error("Snapshot failed");
        }
    };

    const series = useMemo(() => METRICS.map(m => ({
        key: m.key,
        label: m.label,
        color: m.color,
        fmt: m.fmt,
        points: (fluctuation || []).map(p => ({ t: p.capturedAt, v: m.toV(p[m.field]) })),
    })), [fluctuation]);

    return (
        <div className="resource-monitoring" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16 }}>
            <aside style={paneStyle}>
                <header style={paneHeaderStyle}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Layers size={16} />
                        <strong>Resource Monitoring</strong>
                    </span>
                    <button className="rm-btn" onClick={load} disabled={loading} title="Reload" style={iconBtn}>
                        <RefreshCw size={14} className={loading ? "rm-spin" : ""} />
                    </button>
                </header>
                {loading && <div style={{ padding: 16, color: "var(--text-secondary)" }}>Loading…</div>}
                {!loading && hierarchy.length === 0 && (
                    <div style={{ padding: 16, color: "var(--text-secondary)" }}>
                        No projects configured yet. Ask an admin to add projects & services.
                    </div>
                )}
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {hierarchy.map(n => (
                        <HierarchyRow key={n.id} node={n}
                            expanded={expanded} toggle={toggle}
                            selected={selected} select={select}
                        />
                    ))}
                </ul>
            </aside>

            <main style={paneStyle}>
                <header style={paneHeaderStyle}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {selected ? LEVEL_ICONS[selected.level] : <Info size={16} />}
                        <strong>{selected ? `${selected.level}: ${selected.name}` : "Overview"}</strong>
                    </span>
                    {selected && role === "devops" && selected.level === "PROJECT" && (
                        <button className="rm-btn" style={iconBtn} onClick={() => handleSnapshot(selected)} title="Capture snapshot">
                            <Camera size={14} /> <span style={{ marginLeft: 4 }}>Snapshot</span>
                        </button>
                    )}
                </header>

                {selected ? (
                    <div style={{ padding: 16, display: "grid", gap: 16 }}>
                        <div style={cardRowStyle}>
                            <MetricCard icon={<Cpu size={18} />} label="CPU" value={`${(selected.cpuCores ?? 0).toFixed(2)} cores`} color="#3b82f6" />
                            <MetricCard icon={<HardDrive size={18} />} label="Memory" value={mbToGb(selected.memoryMb)} color="#8b5cf6" />
                            {role !== "user" && (
                                <MetricCard icon={<Clock size={18} />} label="Hourly (USD)"
                                    value={`$${(selected.hourlyRateUsd ?? 0).toFixed(4)} /h`} color="#059669" />
                            )}
                        </div>

                        {selected.detail && (
                            <DetailPanel detail={selected.detail} level={selected.level} showPricing={role !== "user"} />
                        )}

                        <section>
                            <div style={{
                                display: "flex", alignItems: "center",
                                justifyContent: "space-between", marginBottom: 10,
                                flexWrap: "wrap", gap: 8,
                            }}>
                                <h4 style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
                                    Configuration Change Timeline
                                </h4>
                                <div style={{ display: "flex", gap: 4 }}>
                                    {[
                                        { key: "30d",  label: "30 days" },
                                        { key: "90d",  label: "90 days" },
                                        { key: "365d", label: "1 year"  },
                                        { key: "all",  label: "All"     },
                                    ].map(r => (
                                        <button key={r.key}
                                            onClick={() => setFluctRange(r.key)}
                                            style={{
                                                padding: "3px 10px", fontSize: 11, cursor: "pointer",
                                                borderRadius: 4, border: "1px solid var(--border-color)",
                                                background: fluctRange === r.key
                                                    ? "rgba(59,130,246,0.12)" : "transparent",
                                                color: fluctRange === r.key
                                                    ? "#3b82f6" : "var(--text-secondary)",
                                                fontWeight: fluctRange === r.key ? 600 : 400,
                                            }}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {fluctLoading ? (
                                <div style={{ padding: 24, color: "var(--text-secondary)", textAlign: "center" }}>
                                    Loading…
                                </div>
                            ) : (
                                <FluctuationChart
                                    series={series}
                                    yLabel=""
                                    formatV={v => v == null ? "–" : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)}
                                    emptyHint='No snapshots yet. Use "Snapshot now" to start recording changes.'
                                />
                            )}
                        </section>

                        {selected.level === "ENVIRONMENT" && selected.detail?.clusterInfrastructure && (
                            <NodePoolsPanel ci={selected.detail.clusterInfrastructure} showPricing={role !== "user"} />
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 24, color: "var(--text-secondary)" }}>
                        Select an environment, cluster, project or microservice on the left to see its detailed
                        resource configuration and fluctuation graph.
                    </div>
                )}
            </main>

            <style>{`
                .rm-btn { cursor: pointer; }
                .rm-spin { animation: rm-spin 1s linear infinite; }
                @keyframes rm-spin { to { transform: rotate(360deg); } }
                .rm-row:hover { background: var(--hover-bg, rgba(255,255,255,0.04)); }
                .rm-row.selected { background: var(--active-bg, rgba(59,130,246,0.14)); }
            `}</style>
        </div>
    );
}

function HierarchyRow({ node, depth = 0, expanded, toggle, selected, select }) {
    const hasChildren = (node.children || []).length > 0;
    const isOpen = !!expanded[node.id];
    const isSelected = selected && selected.id === node.id;
    return (
        <li>
            <div
                className={`rm-row ${isSelected ? "selected" : ""}`}
                style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px 6px", paddingLeft: 10 + depth * 14,
                    cursor: "pointer", fontSize: 13, borderRadius: 4,
                }}
                onClick={() => { select(node); if (hasChildren) toggle(node.id); }}
            >
                <span onClick={(e) => { e.stopPropagation(); if (hasChildren) toggle(node.id); }}
                      style={{ width: 16, display: "inline-flex", alignItems: "center" }}>
                    {hasChildren ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{LEVEL_ICONS[node.level]}</span>
                <span style={{ flex: 1, color: "var(--text-primary)" }}>{node.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary, var(--text-secondary))" }}>
                    {(node.cpuCores ?? 0).toFixed(1)}c · {((node.memoryMb ?? 0) / 1024).toFixed(1)}GB
                </span>
            </div>
            {isOpen && hasChildren && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {node.children.map(c => (
                        <HierarchyRow key={c.id} node={c} depth={depth + 1}
                            expanded={expanded} toggle={toggle}
                            selected={selected} select={select} />
                    ))}
                </ul>
            )}
        </li>
    );
}

function MetricCard({ icon, label, value, color }) {
    return (
        <div style={{
            flex: 1, minWidth: 160, padding: "12px 14px", borderRadius: 8,
            background: "var(--panel-bg)", border: "1px solid var(--border-color)",
            display: "flex", gap: 10, alignItems: "center",
        }}>
            <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${color}20`, color,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{icon}</span>
            <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
            </div>
        </div>
    );
}

function DetailPanel({ detail, level, showPricing }) {
    return (
        <section style={{
            background: "var(--panel-bg)", border: "1px solid var(--border-color)",
            borderRadius: 8, padding: 14,
        }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>Configuration</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {detail.environment && <Kv k="Environment" v={detail.environment} />}
                {detail.clusterName && <Kv k="Cluster" v={detail.clusterName} />}
                {level === "MICROSERVICE" && <>
                    {detail.cpuRange && <Kv k="CPU (config)" v={detail.cpuRange} />}
                    {detail.ramRange && <Kv k="RAM (config)" v={detail.ramRange} />}
                </>}
                {detail.clusterInfrastructure?.controlPlaneSku && <Kv k="Control plane" v={detail.clusterInfrastructure.controlPlaneSku} />}
                {detail.clusterInfrastructure?.region && <Kv k="Region" v={detail.clusterInfrastructure.region} />}
                {detail.clusterInfrastructure?.ingressSku && <Kv k="Ingress" v={`${detail.clusterInfrastructure.ingressSku}${detail.clusterInfrastructure.ingressCount ? ` × ${detail.clusterInfrastructure.ingressCount}` : ""}`} />}
            </div>
            {detail.notes && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}
                     dangerouslySetInnerHTML={{ __html: detail.notes }} />
            )}
            {showPricing && Array.isArray(detail.cloudServices) && detail.cloudServices.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <h5 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-secondary)" }}>Cloud services</h5>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                        {detail.cloudServices.map(cs => (
                            <li key={cs.id} style={{
                                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                                padding: "6px 8px", background: "var(--panel-bg-alt, rgba(0,0,0,0.04))",
                                borderRadius: 4,
                            }}>
                                <span style={{ flex: 1 }}>{cs.customName || cs.name}</span>
                                {cs.hourlyRateUsd != null && (
                                    <span style={{ color: "var(--text-secondary)" }}>
                                        ${cs.hourlyRateUsd.toFixed(4)}/h
                                    </span>
                                )}
                                {cs.sharedAcrossProjects && <span style={{ fontSize: 10, padding: "2px 6px", background: "#f59e0b20", color: "#f59e0b", borderRadius: 3 }}>shared</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

function NodePoolsPanel({ ci, showPricing }) {
    if (!ci?.nodePools?.length) return null;
    return (
        <section style={{
            background: "var(--panel-bg)", border: "1px solid var(--border-color)",
            borderRadius: 8, padding: 14,
        }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>Node pools</h4>
            <div style={{ display: "grid", gap: 8 }}>
                {ci.nodePools.map((np, i) => (
                    <div key={i} style={{
                        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
                        padding: "8px 10px", border: "1px solid var(--border-color)", borderRadius: 6,
                    }}>
                        <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{np.kind || "pool"}</span>
                        {np.poolName && <span style={{ color: "var(--text-secondary)" }}>{np.poolName}</span>}
                        {np.vmSize && <Chip>{np.vmSize}</Chip>}
                        {np.nodeCount != null && <Chip>{np.nodeCount} nodes</Chip>}
                        {showPricing && np.hourlyRateUsd != null && (
                            <Chip>{`$${np.hourlyRateUsd.toFixed(4)}/h`}</Chip>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

function Kv({ k, v }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{v}</div>
        </div>
    );
}
function Chip({ children }) {
    return (
        <span style={{
            fontSize: 11, padding: "3px 8px", borderRadius: 10,
            background: "var(--panel-bg-alt, rgba(0,0,0,0.05))",
            color: "var(--text-secondary)",
        }}>{children}</span>
    );
}

function findEnvFor(hierarchy, projectId) {
    for (const env of hierarchy) {
        for (const cluster of env.children || []) {
            for (const proj of cluster.children || []) {
                if (proj.id === projectId) return env.name;
            }
        }
    }
    return null;
}

const paneStyle = {
    background: "var(--panel-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    minHeight: 520,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
};
const paneHeaderStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border-color)",
    background: "var(--panel-bg-alt, rgba(0,0,0,0.03))",
};
const iconBtn = {
    display: "inline-flex", alignItems: "center",
    padding: "4px 8px", border: "1px solid var(--border-color)",
    borderRadius: 4, background: "transparent", color: "var(--text-primary)",
    fontSize: 12,
};
const cardRowStyle = {
    display: "flex", gap: 12, flexWrap: "wrap",
};
