import React, { useEffect, useMemo, useState } from "react";
import { getEnvironmentMonitoring, getMonitoringProducts } from "../services/monitoringService";

const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

const monthLabel = (year, month) =>
    new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

const barColor = (active) => (active ? "#36B37E" : "#0052CC");

const EnvironmentBars = ({ series, daysInMonth }) => {
    const maxHours = Math.max(24, ...series.flatMap((s) => s.daily.map((d) => d.activeHours)));
    return (
        <div style={{ display: "grid", gap: "1rem" }}>
            {series.map((env) => (
                <div key={env.environment} style={{ border: "1px solid #DFE1E6", borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <strong>{env.environment}</strong>
                        <span style={{ fontSize: 12, color: env.currentlyActive ? "#36B37E" : "#6B778C" }}>
                            {env.currentlyActive ? "Active now" : "Inactive"}
                        </span>
                    </div>
                    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${daysInMonth}, minmax(16px,1fr))`, gap: 2, alignItems: "end", height: 90, minWidth: daysInMonth * 18 }}>
                        {env.daily.map((d) => {
                            const h = d.activeHours || 0;
                            const pct = Math.max(2, (h / maxHours) * 100);
                            return (
                                <div
                                    key={`${env.environment}-${d.day}`}
                                    title={`Day ${d.day}: ${h.toFixed(2)}h active`}
                                    style={{
                                        height: `${pct}%`,
                                        background: barColor(env.currentlyActive),
                                        borderRadius: 2,
                                        opacity: h > 0 ? 1 : 0.18
                                    }}
                                />
                            );
                        })}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${daysInMonth}, minmax(16px,1fr))`, gap: 2, marginTop: 4, minWidth: daysInMonth * 18 }}>
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                                <div
                                    key={`${env.environment}-x-${d}`}
                                    style={{ fontSize: 10, color: "#6B778C", textAlign: "center", lineHeight: 1.2 }}
                                    title={`Day ${d}`}
                                >
                                    {d}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const MonitoringPanel = ({ adminMode = false }) => {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [products, setProducts] = useState([]);
    const [product, setProduct] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        getMonitoringProducts()
            .then((items) => {
                if (!mounted) return;
                setProducts(items || []);
                if ((items || []).length > 0) setProduct(items[0]);
            })
            .catch((e) => mounted && setError(e.message || "Failed to load products"));
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!product) return;
        setLoading(true);
        setError("");
        getEnvironmentMonitoring({ productName: product, year, month })
            .then(setData)
            .catch((e) => setError(e.message || "Failed to load monitoring"))
            .finally(() => setLoading(false));
    }, [product, year, month]);

    const totals = useMemo(() => {
        if (!data?.environments) return { hours: 0, activeEnvs: 0, avgDailyHours: 0, uptimePercent: 0 };
        const days = Math.max(1, data.daysInMonth || 1);
        const totalHours = data.environments.reduce((sum, e) => sum + (e.totalActiveHours || 0), 0);
        const envCount = Math.max(1, data.environments.length);
        const maxPossible = days * 24 * envCount;
        return {
            hours: totalHours,
            activeEnvs: data.environments.filter((e) => e.currentlyActive).length,
            avgDailyHours: totalHours / days,
            uptimePercent: (totalHours / maxPossible) * 100
        };
    }, [data]);

    return (
        <div className="tickets-section">
            <div className="tickets-header">
                <h3>Environment Monitoring</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    <select value={product} onChange={(e) => setProduct(e.target.value)}>
                        {products.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                        {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }} />
                </div>
            </div>
            <div className="tickets-list" style={{ padding: "1rem" }}>
                {loading && <p>Loading monitoring data...</p>}
                {!!error && <p style={{ color: "#DE350B" }}>{error}</p>}
                {!loading && !error && data && (
                    <>
                        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Month</div>
                                <strong>{monthLabel(year, month)}</strong>
                            </div>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Current Active Environment</div>
                                <strong>{data.currentActiveEnvironment || "None"}</strong>
                            </div>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Total Active Hours</div>
                                <strong>{totals.hours.toFixed(2)} h</strong>
                            </div>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Active Environments</div>
                                <strong>{totals.activeEnvs}</strong>
                            </div>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Avg Active Hours / Day</div>
                                <strong>{totals.avgDailyHours.toFixed(2)} h</strong>
                            </div>
                            <div style={{ background: "#F4F5F7", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: "#5E6C84" }}>Monthly Uptime Index</div>
                                <strong>{totals.uptimePercent.toFixed(1)}%</strong>
                            </div>
                            {adminMode && (
                                <div style={{ background: "#DEEBFF", padding: "0.75rem 1rem", borderRadius: 8 }}>
                                    <div style={{ fontSize: 12, color: "#0747A6" }}>Admin View</div>
                                    <strong>Editable metric config can be added here</strong>
                                </div>
                            )}
                        </div>
                        <EnvironmentBars series={data.environments || []} daysInMonth={data.daysInMonth || 31} />
                    </>
                )}
            </div>
        </div>
    );
};

export default MonitoringPanel;

