import { apiRequest } from "./apiClient";

export const getMonitoringProducts = async () =>
    apiRequest("/monitoring/products");

export const getEnvironmentMonitoring = async ({ productName, year, month }) => {
    const p = new URLSearchParams();
    p.set("productName", productName || "");
    if (year)  p.set("year",  String(year));
    if (month) p.set("month", String(month));
    return apiRequest(`/monitoring/environment?${p.toString()}`);
};

/** Returns raw uptime intervals [{environment, startTime, endTime|null}] for a date range. */
export const getUptimeSessions = async ({ productName, from, to }) => {
    const p = new URLSearchParams();
    p.set("productName", productName || "");
    p.set("from", from);
    p.set("to",   to);
    return apiRequest(`/monitoring/uptime-sessions?${p.toString()}`);
};

/** DevOps only: action = "start" | "stop" | "auto" */
export const setManualEnvControl = async ({ productName, environment, action }) =>
    apiRequest("/monitoring/manual-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, environment, action }),
    });

/** Returns all projects (with their environments list). */
export const getProjectList = async () =>
    apiRequest("/projects");

/** DevOps: manual cycle history for a product (or all products if blank). */
export const getCycleHistory = async ({ productName = '', from = '', to = '' } = {}) => {
    const p = new URLSearchParams();
    if (productName) p.set("productName", productName);
    if (from)        p.set("from", from);
    if (to)          p.set("to", to);
    return apiRequest(`/monitoring/cycle-history?${p.toString()}`);
};
