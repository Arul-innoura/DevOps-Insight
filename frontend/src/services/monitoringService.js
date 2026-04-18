import { apiRequest } from "./apiClient";

export const getMonitoringProducts = async () => apiRequest("/monitoring/products");

export const getEnvironmentMonitoring = async ({ productName, year, month }) => {
    const params = new URLSearchParams();
    params.set("productName", productName || "");
    if (year) params.set("year", String(year));
    if (month) params.set("month", String(month));
    return apiRequest(`/monitoring/environment?${params.toString()}`);
};

