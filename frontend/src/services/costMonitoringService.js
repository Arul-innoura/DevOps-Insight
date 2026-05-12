import { apiRequest } from "./apiClient";

const q = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : "";
};

/** DevOps + Admin: every cloud service across every project — live. */
export const getLiveCosts = () => apiRequest("/cost-monitoring/live");

export const getProjectBreakdown = ({ projectId, environment }) =>
    apiRequest(`/cost-monitoring/project${q({ projectId, environment })}`);

export const getCostTimeline = ({ projectId, environment, cloudServiceId, from, to }) =>
    apiRequest(`/cost-monitoring/timeline${q({ projectId, environment, cloudServiceId, from, to })}`);

/** DevOps only: start / stop a running cycle for a service. */
export const setServiceCycle = ({ projectId, environment, cloudServiceId, action }) =>
    apiRequest("/cost-monitoring/cycle", {
        method: "POST",
        body: JSON.stringify({ projectId, environment, cloudServiceId, action }),
    });

export const forceTick = () => apiRequest("/cost-monitoring/tick", { method: "POST" });

/**
 * Capacity-based breakdown per environment — feeds the DevOps "Cost Management"
 * dashboard (totals per env, per-project share of node capacity, savings hints).
 */
export const getCapacityBreakdown = () =>
    apiRequest("/cost-monitoring/capacity-breakdown");

export const getCapacityBreakdownFor = (environmentId) =>
    apiRequest(`/cost-monitoring/capacity-breakdown/${encodeURIComponent(environmentId)}`);
