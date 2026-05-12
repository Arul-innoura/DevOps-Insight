import { apiRequest } from "./apiClient";

export const getAnalyticsSettings = () => apiRequest("/analytics-settings");

export const saveAnalyticsSettings = (body) =>
    apiRequest("/analytics-settings", {
        method: "PUT",
        body: JSON.stringify(body),
    });

/** DevOps / Admin: persist which environment × product rows appear on monitoring charts */
export const saveMonitoringDisplayToggles = (monitoringDisplayToggles) =>
    apiRequest("/analytics-settings/monitoring-display", {
        method: "PUT",
        body: JSON.stringify({ monitoringDisplayToggles: monitoringDisplayToggles || [] }),
    });
