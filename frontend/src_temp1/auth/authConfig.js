export const msalConfig = {
    auth: {
        // Replace with your Azure AD Application (client) ID
        clientId: "2cc4db33-435b-45ee-a2d6-63e15a4d6f77",
        
        // Replace with your Azure AD Directory (tenant) ID
        authority: "https://login.microsoftonline.com/cd775fb1-40c4-42dc-8ddf-2ca152bec472",
        
        // Use an environment override so the redirect URI always matches the
        // Azure app registration in each environment.
        redirectUri: process.env.REACT_APP_REDIRECT_URI || "http://localhost:3000",
        
        postLogoutRedirectUri: process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI || `${window.location.origin}/login`
    },
    cache: {
        cacheLocation: "sessionStorage", // This configures where your cache will be stored
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    }
};

// Use OIDC scopes for login only. Role claims come from the ID token, so we do
// not request Microsoft Graph access during sign-in.
export const loginRequest = {
    scopes: ["openid", "profile", "email"]
};
