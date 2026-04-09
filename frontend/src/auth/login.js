import React, { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "./authConfig";

const Login = () => {
    const { instance, inProgress } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const navigate = useNavigate();
    // Redirect authenticated users
    useEffect(() => {
        if (isAuthenticated && inProgress === "none") {
            navigate("/");
        }
    }, [isAuthenticated, inProgress, navigate]);

    const handleAzureLogin = (e) => {
        if (e) e.preventDefault();
        if (inProgress === "none") {
            instance.loginRedirect(loginRequest).catch(e => {
                const message = e?.errorMessage || e?.message || "Unknown error";
                if (String(message).includes("AADSTS500011")) {
                    alert("Login failed: API scope is not registered in this Azure tenant.");
                } else {
                    alert(`Login Failed: ${message}`);
                }
            });
        }
    };

    // Show loading state while MSAL is processing the redirect
    if (inProgress !== "none") {
        return (
            <div className="login-page">
                <div className="login-card animate-in">
                    <div className="login-loading-state">
                        <h3>Authenticating</h3>
                        <p>Securely connecting to your account...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show loading state if user is authenticated (redirecting to dashboard)
    if (isAuthenticated) {
        return (
            <div className="login-page">
                <div className="login-card animate-in">
                    <div className="login-loading-state">
                        <h3>Welcome Back!</h3>
                        <p>Redirecting to your dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card animate-in">
                <div className="login-brand">
                    <div className="brand-text">
                        <h1>ShipIt</h1>
                        <span className="brand-tagline">Ship Fast. Ship Smart.</span>
                    </div>
                </div>
                <p style={{ margin: "0 0 1rem 0", color: "#6b7280", fontSize: "0.95rem" }}>
                    Sign in with your Microsoft account to continue.
                </p>
                <button 
                    className="azure-login-btn"
                    onClick={handleAzureLogin}
                >
                    Sign in with Microsoft
                </button>

                <div className="login-footer">
                    <p>Protected by Azure Active Directory</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
