/**
 * After Entra ID sign-out, the browser is sent here. Register this URL per origin in Azure AD.
 */
export function getPostLogoutLoginUrl() {
    return `${window.location.origin}/login`;
}

export function signOutRedirectToLogin(msalInstance) {
    return msalInstance.logoutRedirect({
        postLogoutRedirectUri: getPostLogoutLoginUrl(),
    });
}
