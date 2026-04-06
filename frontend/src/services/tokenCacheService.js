/**
 * Centralized Token Cache Service
 * Caches tokens in memory to avoid repeated MSAL calls and 401 loops.
 */

import { msalInstance, initializeMsal } from "../auth/msalInstance";
import { oidcScopes } from "../auth/authConfig";

let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/**
 * Get a valid auth token, using cache when possible.
 * Prevents parallel token requests from causing multiple 401s.
 */
export const getAuthToken = async () => {
    const now = Date.now();
    
    // Return cached token if still valid
    if (cachedToken && tokenExpiry > now + TOKEN_BUFFER_MS) {
        return cachedToken;
    }
    
    // If a token request is in progress, wait for it
    if (tokenPromise) {
        return tokenPromise;
    }
    
    // Start new token acquisition
    tokenPromise = acquireToken();
    try {
        const token = await tokenPromise;
        return token;
    } finally {
        tokenPromise = null;
    }
};

/**
 * Force refresh the token (used after 401)
 */
export const refreshAuthToken = async () => {
    cachedToken = null;
    tokenExpiry = 0;
    return acquireToken(true);
};

/**
 * Clear token cache (used on logout)
 */
export const clearTokenCache = () => {
    cachedToken = null;
    tokenExpiry = 0;
    tokenPromise = null;
};

/**
 * Internal token acquisition logic
 */
const acquireToken = async (forceRefresh = false) => {
    try {
        await initializeMsal();
        const accounts = msalInstance.getAllAccounts();
        let active = msalInstance.getActiveAccount();
        
        if (!active && accounts.length > 0) {
            active = accounts[0];
            msalInstance.setActiveAccount(active);
        }
        
        if (!active) {
            console.warn("[TokenCache] No active account found");
            return null;
        }
        
        // Acquire token silently with OIDC scopes (most compatible)
        try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
                account: active,
                scopes: oidcScopes.scopes,
                forceRefresh
            });
            
            const token = tokenResponse.idToken || tokenResponse.accessToken;
            if (token) {
                // Cache the token
                cachedToken = token;
                // Set expiry from token claims or default to 1 hour
                const expiresOn = tokenResponse.expiresOn?.getTime() || (Date.now() + 3600000);
                tokenExpiry = expiresOn;
                return token;
            }
        } catch (silentError) {
            console.warn("[TokenCache] Silent token acquisition failed:", silentError?.message);
        }
        
        // Fallback: use cached ID token from account
        if (active.idToken) {
            cachedToken = active.idToken;
            tokenExpiry = Date.now() + 3600000; // Assume 1 hour validity
            return active.idToken;
        }
        
        return null;
    } catch (error) {
        console.warn("[TokenCache] Failed to acquire token:", error?.message || error);
        return null;
    }
};

export default {
    getAuthToken,
    refreshAuthToken,
    clearTokenCache
};
