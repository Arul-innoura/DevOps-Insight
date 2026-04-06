import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { getUserRoles } from "../services/azureService";
import { useTestAuth } from "../auth/TestAuthContext";

/**
 * Higher-order component that determines where to send the user 
 * right after they land on the home page '/' based on their Azure roles or test role.
 */
export const RoleRedirect = () => {
    const { accounts, inProgress } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const { testUser, isTestAuthenticated } = useTestAuth();
    const navigate = useNavigate();

    useEffect(() => {
        console.log("=== RoleRedirect State ===");
        console.log("Azure isAuthenticated:", isAuthenticated);
        console.log("Test isAuthenticated:", isTestAuthenticated());
        console.log("inProgress:", inProgress);
        console.log("accounts:", accounts);
        console.log("testUser:", testUser);
        console.log("=========================");
        
        // Handle test users
        if (inProgress === "none" && isTestAuthenticated() && testUser) {
            const role = testUser.role;
            console.log("🧪 Test user role:", role);
            
            if (role === "Admin") {
                console.log("🔴 Redirecting to Admin dashboard");
                navigate("/admin");
            } else if (role === "DevOps Team" || role === "DevOps") {
                console.log("🔵 Redirecting to DevOps dashboard");
                navigate("/devops");
            } else if (role === "User") {
                console.log("🟢 Redirecting to User dashboard");
                navigate("/user");
            } else {
                console.log("⚠️ Unknown role, redirecting to unauthorized");
                navigate("/unauthorized");
            }
        }
        // Handle Azure SSO users
        else if (inProgress === "none" && isAuthenticated) {
            const roles = getUserRoles(accounts[0]);
            console.log("📋 Azure user roles:", roles);
            
            if (roles.includes("Admin")) {
                console.log("🔴 Redirecting to Admin dashboard");
                navigate("/admin");
            } else if (roles.includes("DevOps Team") || roles.includes("DevOps")) {
                console.log("🔵 Redirecting to DevOps dashboard");
                navigate("/devops");
            } else if (roles.includes("User")) {
                console.log("🟢 Redirecting to User dashboard");
                navigate("/user");
            } else {
                console.log("⚠️ No roles found, redirecting to unauthorized");
                navigate("/unauthorized");
            }
        } 
        // Not authenticated at all
        else if (inProgress === "none" && !isAuthenticated && !isTestAuthenticated()) {
            console.log("🔒 Not authenticated, redirecting to login");
            navigate("/login");
        }
    }, [inProgress, isAuthenticated, accounts, testUser, isTestAuthenticated, navigate]);

    return (
        <div className="loading-screen">
            <div className="spinner"></div>
            <p>Redirecting to your dashboard...</p>
        </div>
    );
};

export const Unauthorized = () => (
    <div className="login-container">
        <div className="login-card">
            <h2 className="alert-text">Unauthorized</h2>
            <p>You do not have any assigned roles in Azure AD. Please contact your administrator.</p>
            <button className="microsoft-btn" onClick={() => window.location.href = "/"}>Back to Home</button>
        </div>
    </div>
);
