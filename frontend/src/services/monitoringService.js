import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken, refreshAuthToken } from "./tokenCacheService";

const API_BASE_URL = resolveApiBaseUrl();

const apiRequest = async (endpoint, options = {}) => {
    const doRequest = async (token) => {
        const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    };

    let token = await getAuthToken();
    let response = await doRequest(token);
    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) response = await doRequest(token);
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Monitoring API failed: ${response.status}`);
    }
    return response.json();
};

export const getMonitoringProducts = async () => apiRequest("/monitoring/products");

export const getEnvironmentMonitoring = async ({ productName, year, month }) => {
    const params = new URLSearchParams();
    params.set("productName", productName || "");
    if (year) params.set("year", String(year));
    if (month) params.set("month", String(month));
    return apiRequest(`/monitoring/environment?${params.toString()}`);
};

