import { msalConfig } from "./authConfig";
import { clearTokenCache } from "../services/tokenCacheService";
import { initializeMsal } from "./msalInstance";

/**
 * After Entra ID sign-out, the browser is sent here. Register this URL per origin in Azure AD.
 * Matches msalConfig.auth.postLogoutRedirectUri (including REACT_APP_POST_LOGOUT_REDIRECT_URI / PUBLIC_URL).
 */
export function getPostLogoutLoginUrl() {
    const configured = (msalConfig.auth.postLogoutRedirectUri || "").trim();
    if (configured) return configured;
    const base = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
    return `${window.location.origin}${base}/login`;
}

/**
 * Remove MSAL keys from sessionStorage (cacheLocation in authConfig).
 * Ensures no stale tokens remain if removeAccount misses anything.
 */
function clearMsalSessionStorage() {
    try {
        if (typeof sessionStorage === "undefined") return;
        for (const k of Object.keys(sessionStorage)) {
            if (k.startsWith("msal.")) {
                sessionStorage.removeItem(k);
            }
        }
    } catch {
        /* ignore */
    }
}

/**
 * Sign out of this app only: clear MSAL + token cache and go straight to the login page.
 * Does not call Microsoft's logout redirect (avoids "pick account to sign out" UI).
 * Note: the user may still have an active Microsoft SSO cookie; the app session is cleared here.
 */
/**
 * @param {import("@azure/msal-browser").PublicClientApplication} msalInstance
 * @param {{ sessionExpired?: boolean }} [opts] - when true, append ?session=expired so the login page can explain
 */
export async function signOutRedirectToLogin(msalInstance, opts = {}) {
    clearTokenCache();
    let target = getPostLogoutLoginUrl();
    if (opts.sessionExpired) {
        try {
            const u = new URL(target, window.location.href);
            u.searchParams.set("session", "expired");
            target = `${u.pathname}${u.search}${u.hash}`;
        } catch {
            target = target.includes("?") ? `${target}&session=expired` : `${target}?session=expired`;
        }
    }

    try {
        await initializeMsal();
        msalInstance.setActiveAccount(null);
        const accounts = [...msalInstance.getAllAccounts()];
        for (const account of accounts) {
            try {
                msalInstance.removeAccount(account);
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* MSAL not initialized — still clear storage and redirect */
    }

    clearMsalSessionStorage();
    window.location.replace(target);
}

