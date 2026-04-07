/**
 * DevOps Status Service — Handles heartbeat and status timeline API calls.
 */

import { msalInstance, initializeMsal } from "../auth/msalInstance";
import { loginRequest, oidcScopes } from "../auth/authConfig";
import { resolveApiBaseUrl } from "../config/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl();

const getAuthToken = async () => {
    try {
        await initializeMsal();
        const accounts = msalInstance.getAllAccounts();
        let active = msalInstance.getActiveAccount();
        if (!active && accounts.length > 0) {
            active = accounts[0];
            msalInstance.setActiveAccount(active);
        }
        if (!active) return null;
        try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
                account: active,
                scopes: loginRequest.scopes
            });
            return tokenResponse.accessToken || tokenResponse.idToken || null;
        } catch (primaryError) {
            const oidcResponse = await msalInstance.acquireTokenSilent({
                account: active,
                scopes: oidcScopes.scopes
            });
            return oidcResponse.idToken || oidcResponse.accessToken || null;
        }
    } catch (error) {
        console.error("[DevOpsStatusService] Failed to get auth token:", error);
        return null;
    }
};

const apiRequest = async (endpoint, options = {}) => {
    const token = await getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
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
    const token = await getAuthToken();
    const url = `${API_BASE_URL}/devops-status/heartbeat`;
    const body = JSON.stringify({ action: "going_offline" });

    // Try sendBeacon first (works during page unload)
    if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        // sendBeacon can't set auth headers, so we fall back to fetch with keepalive
        try {
            const success = navigator.sendBeacon(url, blob);
            if (success) return;
        } catch (e) {
            // Fall through to fetch
        }
    }

    // Fallback: fetch with keepalive
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
