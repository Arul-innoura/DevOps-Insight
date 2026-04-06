import React from "react";
import { Navigate } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { hasRole } from "../services/azureService";
import { useTestAuth } from "../auth/TestAuthContext";

const ProtectedRoute = ({ children, requiredRole }) => {
    const isAuthenticated = useIsAuthenticated();
    const { accounts, inProgress } = useMsal();
    const { testUser, isTestAuthenticated } = useTestAuth();

    if (inProgress !== "none") {
        return <div className="loading-screen"><div className="spinner"></div></div>;
    }

    // Check test authentication first
    if (isTestAuthenticated() && testUser) {
        console.log("🧪 Test user accessing protected route");
        console.log("Required role:", requiredRole);
        console.log("Test user role:", testUser.role);
        
        if (requiredRole && testUser.role !== requiredRole) {
            console.log("⚠️ Test user lacks required role");
            return <Navigate to="/unauthorized" replace />;
        }
        return children;
    }

    // Check Azure SSO authentication
    if (!isAuthenticated) {
        console.log("🔒 Not authenticated, redirecting to login");
        return <Navigate to="/login" replace />;
    }

    const account = accounts[0];
    
    if (requiredRole && !hasRole(account, requiredRole)) {
        console.log("⚠️ Azure user lacks required role:", requiredRole);
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
};

export default ProtectedRoute;
