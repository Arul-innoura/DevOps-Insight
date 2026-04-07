/**
 * DevOps Status Service — Handles heartbeat and status timeline API calls.
 */

import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken as getCachedAuthToken, refreshAuthToken } from "./tokenCacheService";

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

    let token = await getCachedAuthToken();
    let response = await doRequest(token);

    // Retry once on 401 with force refresh token
    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) {
            response = await doRequest(token);
        }
    }

    if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.toLowerCase().includes("application/json");
        const errorData = isJson ? await response.json().catch(() => ({})) : {};
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
};

/**
 * Send a heartbeat to the backend to prove the user is still active.
 * Called every 60 seconds by the useActivityTracker hook.
 */
export const sendHeartbeat = async () => {
    return apiRequest("/devops-status/heartbeat", {
        method: "POST",
        body: JSON.stringify({ action: "heartbeat" })
    });
};

/**
 * Send a "going offline" beacon when the user closes the tab/browser.
 * Uses navigator.sendBeacon for reliability during page unload.
 */
export const sendGoingOfflineBeacon = async () => {
    const token = await getCachedAuthToken();
    const url = `${API_BASE_URL}/devops-status/heartbeat`;
    const body = JSON.stringify({ action: "going_offline" });

    // sendBeacon can't set Authorization header, so it will always 401 on secured endpoints.
    // Use fetch(keepalive) so the request still has Bearer token during unload.
    try {
        await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body,
            keepalive: true
        });
    } catch (e) {
        console.warn("[DevOpsStatusService] Failed to send going offline signal:", e);
    }
};

/**
 * Get all status change logs for a specific date (for admin timeline).
 * @param {string} date - ISO date string like "2026-04-04"
 */
export const getStatusTimeline = async (date) => {
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    return apiRequest(`/devops-status/timeline?date=${encodeURIComponent(date)}&tzOffsetMinutes=${tzOffsetMinutes}`);
};

/**
 * Get status change logs for a specific member within a date range.
 * @param {string} email - Member email
 * @param {string} from - ISO date string
 * @param {string} to - ISO date string
 */
export const getMemberTimeline = async (email, from, to) => {
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    return apiRequest(
        `/devops-status/timeline/${encodeURIComponent(email)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tzOffsetMinutes=${tzOffsetMinutes}`
    );
};
