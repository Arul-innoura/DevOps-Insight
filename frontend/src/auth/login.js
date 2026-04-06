import React, { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "./authConfig";
import { ShieldCheck, Shield } from "lucide-react";

const Login = () => {
    const { instance, inProgress } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const navigate = useNavigate();

    // Redirect authenticated users
    useEffect(() => {
        console.log("=== Login Page State ===");
        console.log("Azure isAuthenticated:", isAuthenticated);
        console.log("inProgress:", inProgress);
        console.log("========================");
        
        if (isAuthenticated && inProgress === "none") {
            console.log("✅ User is authenticated, redirecting to dashboard...");
            navigate("/");
        }
    }, [isAuthenticated, inProgress, navigate]);

    const handleAzureLogin = (e) => {
        if (e) e.preventDefault();
        if (inProgress === "none") {
            instance.loginRedirect(loginRequest).catch(e => {
                console.error("=== Azure SSO Login Error ===");
                console.error("Error Type:", e.errorCode);
                console.error("Error Message:", e.errorMessage);
                console.error("Full Error Object:", e);
                console.error("============================");
                const message = e?.errorMessage || e?.message || "Unknown error";
                if (String(message).includes("AADSTS500011")) {
                    alert("Login failed: API scope is not registered in this Azure tenant. Set REACT_APP_AZURE_API_SCOPE correctly or use default OIDC scopes.");
                } else {
                    alert(`Login Failed: ${message}`);
                }
            });
        }
    };

    // Show loading state while MSAL is processing the redirect
    if (inProgress !== "none") {
        return (
            <div className="login-container">
                <div className="login-card">
                    <div className="loading-screen">
                        <div className="spinner"></div>
                        <p>Processing authentication...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show loading state if user is authenticated (redirecting to dashboard)
    if (isAuthenticated) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <div className="loading-screen">
                        <div className="spinner"></div>
                        <p>Redirecting to your dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <ShieldCheck size={48} className="logo-icon" />
                    <h1>DevOps Portal</h1>
                    <p>Sign in with your Microsoft account</p>
                </div>

                {/* Azure SSO Login */}
                <div style={{ marginBottom: '1rem' }}>
                    <button className="microsoft-btn" onClick={handleAzureLogin} style={{ background: '#2563eb', color: 'white', border: 'none' }}>
                        <Shield size={18} />
                        Azure SSO Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
