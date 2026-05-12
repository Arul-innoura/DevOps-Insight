/**
 * Central authenticated fetch for JSON APIs — one place for 401 + token refresh + session expiry.
 * Keeps behaviour consistent and highly available across all services.
 */

import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken, refreshAuthToken, clearTokenCache } from "./tokenCacheService";
import { markSessionExpired } from "./sessionExpiry";
import { msalInstance } from "../auth/msalInstance";
import { signOutRedirectToLogin } from "../auth/logoutHelper";

const API_BASE_URL = resolveApiBaseUrl();

export function getApiBaseUrl() {
    return API_BASE_URL;
}

function createSessionExpiredError() {
    const err = new Error("SESSION_EXPIRED");
    err.code = "SESSION_EXPIRED";
    return err;
}

async function redirectToLoginSessionExpired() {
    try {
        await signOutRedirectToLogin(msalInstance, { sessionExpired: true });
    } catch {
        const base = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
        window.location.replace(`${window.location.origin}${base}/login?session=expired`);
    }
}

async function failSessionExpired() {
    clearTokenCache();
    const first = markSessionExpired();
    if (first) {
        await redirectToLoginSessionExpired();
    }
    throw createSessionExpiredError();
}

/**
 * JSON API request with Bearer token, one silent refresh on 401, then session recovery.
 */
export async function apiRequest(endpoint, options = {}) {
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
        if (token) {
            response = await doRequest(token);
        }
    }

    if (response.status === 401) {
        await failSessionExpired();
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");

    const readErrorPayload = async () => {
        if (isJson) {
            return response.json().catch(() => ({}));
        }
        const text = await response.text().catch(() => "");
        return {
            message: text
                ? `Unexpected response from server: ${text.slice(0, 120)}`
                : "Unexpected response from server"
        };
    };

    if (!response.ok) {
        const errorData = await readErrorPayload();
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    if (!isJson) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `Expected JSON response but received non-JSON content from ${endpoint}. ${text.slice(0, 120)}`
        );
    }
    return response.json();
}

/**
 * Authenticated fetch for multipart / non-JSON (e.g. file upload). Same 401 + session rules.
 * @param {string} path - path starting with / (e.g. `/tickets/x/upload`)
 * @param {RequestInit} init - fetch init; do not set Content-Type for FormData
 */
export async function fetchWithAuth(path, init = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

    const mergeAuth = (t) => {
        const h = new Headers(init.headers || {});
        if (t) h.set("Authorization", `Bearer ${t}`);
        return { ...init, headers: h };
    };

    let token = await getAuthToken();
    let response = await fetch(url, mergeAuth(token));

    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) {
            response = await fetch(url, mergeAuth(token));
        }
    }

    if (response.status === 401) {
        await failSessionExpired();
    }

    return response;
}
