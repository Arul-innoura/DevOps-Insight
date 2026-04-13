import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken, refreshAuthToken } from "./tokenCacheService";

const API_BASE_URL = resolveApiBaseUrl();

const apiRequest = async (endpoint, options = {}) => {
    const doRequest = async (token) => {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    };

    let token = await getAuthToken();
    let response = await doRequest(token);
    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) response = await doRequest(token);
    }
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    if (!response.ok) {
        const err = isJson ? await response.json().catch(() => ({})) : {};
        throw new Error(err.message || `API failed: ${response.status}`);
    }
    if (response.status === 204) return [];
    if (!isJson) throw new Error("Expected JSON");
    return response.json();
};

/**
 * Contacts from all saved product workflows (optionally excluding one product), for autocomplete.
 * @param {{ excludeProjectId?: string, q?: string }} params
 * @returns {Promise<Array<{ email: string, name?: string, role?: string }>>}
 */
export const fetchWorkflowDirectoryContacts = async (params = {}) => {
    const search = new URLSearchParams();
    if (params.excludeProjectId) search.set("excludeProjectId", params.excludeProjectId);
    if (params.q && String(params.q).trim()) search.set("q", String(params.q).trim());
    const qs = search.toString();
    const path = `/workflow-directory/contacts${qs ? `?${qs}` : ""}`;
    const data = await apiRequest(path);
    return Array.isArray(data) ? data : [];
};
