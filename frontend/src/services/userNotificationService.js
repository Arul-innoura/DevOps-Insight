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
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `API failed: ${response.status}`);
    }
    return response.json();
};

export const getMyNotificationPreferences = () =>
    apiRequest("/notification-preferences/me");

export const saveMyNotificationPreferences = (body) =>
    apiRequest("/notification-preferences/me", { method: "PUT", body: JSON.stringify(body) });
