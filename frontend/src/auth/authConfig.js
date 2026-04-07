export const msalConfig = {
    auth: {
        // Replace with your Azure AD Application (client) ID
        clientId: "2cc4db33-435b-45ee-a2d6-63e15a4d6f77",

        // Replace with your Azure AD Directory (tenant) ID
        authority: "https://login.microsoftonline.com/cd775fb1-40c4-42dc-8ddf-2ca152bec472",

        // Use explicit env override if set, otherwise current origin.
        redirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
        postLogoutRedirectUri: process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI || `${window.location.origin}/login`
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
