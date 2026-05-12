/**
 * Utility function to extract App Roles from the MSAL account object.
 * Azure AD includes assigned App Roles in the idTokenClaims.roles array.
 */
export const getUserRoles = (account) => {
    const roles = account?.idTokenClaims?.roles || [];
    return roles.map((role) => {
        if (role === "DevOps") {
            return "DevOps Team";
        }
        return role;
    });
};

/**
 * Utility function to check if an account possesses a specific role.
 */
export const hasRole = (account, requiredRole) => {
    const roles = getUserRoles(account);
    return roles.includes(requiredRole);
};
