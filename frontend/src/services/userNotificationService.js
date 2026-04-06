import { getAuthToken, refreshAuthToken } from "./tokenCacheService";

const resolveApiBaseUrl = () => {
    const envUrl = (process.env.REACT_APP_API_URL || "").trim();
    const origin = window.location.origin.replace(/\/$/, "");
    const isProdHost = !/localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const envPointsLocal = /localhost|127\.0\.0\.1/i.test(envUrl);
    if (isProdHost && envPointsLocal) return `${origin}/api`;
    return envUrl || `${origin}/api`;
};

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
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `API failed: ${response.status}`);
    }
    return response.json();
};

export const getMyNotificationPreferences = () =>
    apiRequest("/notification-preferences/me");

export const saveMyNotificationPreferences = (body) =>
    apiRequest("/notification-preferences/me", { method: "PUT", body: JSON.stringify(body) });
