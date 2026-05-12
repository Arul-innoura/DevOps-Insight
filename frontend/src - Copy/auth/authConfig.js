const appPublicPath = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const defaultAppBase = () =>
    typeof window !== "undefined" ? `${window.location.origin}${appPublicPath}` : "";

export const msalConfig = {
    auth: {
        // Replace with your Azure AD Application (client) ID
        clientId: "2cc4db33-435b-45ee-a2d6-63e15a4d6f77",

        // Replace with your Azure AD Directory (tenant) ID
        authority: "https://login.microsoftonline.com/cd775fb1-40c4-42dc-8ddf-2ca152bec472",

        // Runtime origin when unset. In Azure Portal register EVERY URL you use (e.g. http://192.168.1.68:3000
        // and https://your.domain.com) as SPA redirect URIs, or login fails on the domain.
        redirectUri: process.env.REACT_APP_REDIRECT_URI || defaultAppBase(),
        postLogoutRedirectUri:
            process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI || `${defaultAppBase()}/login`
    },
    cache: {
        cacheLocation: "sessionStorage",
        // Helps silent/iframe token flows and strict browser privacy modes (Safari ITP, embedded apps).
        storeAuthStateInCookie: true
    },
    system: {
        allowPlatformBroker: false
    }
};

const defaultOidcScopes = ["openid", "profile", "email"];
const configuredApiScope = (process.env.REACT_APP_AZURE_API_SCOPE || "").trim();

// Use API scope only when explicitly configured for this tenant.
// Otherwise use OIDC scopes to prevent AADSTS500011 invalid_resource.
export const loginRequest = {
    scopes: configuredApiScope ? [configuredApiScope] : defaultOidcScopes
};

export const oidcScopes = {
    scopes: defaultOidcScopes
};
