import { msalConfig } from "./authConfig";
import { clearTokenCache } from "../services/tokenCacheService";

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

export function signOutRedirectToLogin(msalInstance) {
    clearTokenCache();
    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    return msalInstance.logoutRedirect({
        ...(account ? { account } : {}),
        postLogoutRedirectUri: getPostLogoutLoginUrl(),
    });
}
