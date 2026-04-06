import React, { useEffect, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "./authConfig";
import { ShieldCheck, User, Terminal, Shield } from "lucide-react";
import { useTestAuth } from "./TestAuthContext";

const Login = () => {
    const { instance, inProgress } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const navigate = useNavigate();
    const { loginAsTest, isTestAuthenticated } = useTestAuth();
    const [showTestLogins, setShowTestLogins] = useState(false);

    // Redirect authenticated users (both Azure SSO and Test users)
    useEffect(() => {
        console.log("=== Login Page State ===");
        console.log("Azure isAuthenticated:", isAuthenticated);
        console.log("Test isAuthenticated:", isTestAuthenticated());
        console.log("inProgress:", inProgress);
        console.log("========================");
        
        if ((isAuthenticated || isTestAuthenticated()) && inProgress === "none") {
            console.log("✅ User is authenticated, redirecting to dashboard...");
            navigate("/");
        }
    }, [isAuthenticated, isTestAuthenticated, inProgress, navigate]);

    const handleAzureLogin = (e) => {
        if (e) e.preventDefault();
        if (inProgress === "none") {
            instance.loginRedirect(loginRequest).catch(e => {
                console.error("=== Azure SSO Login Error ===");
                console.error("Error Type:", e.errorCode);
                console.error("Error Message:", e.errorMessage);
                console.error("Full Error Object:", e);
                console.error("============================");
                alert(`Login Failed: ${e.errorMessage || e.message || 'Unknown error'}`);
            });
        }
    };

    const handleTestLogin = (role, name) => {
        console.log(`🧪 Test login as ${role}: ${name}`);
        loginAsTest(role, name);
        navigate("/");
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
    if (isAuthenticated || isTestAuthenticated()) {
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
                    <p>Select your login method</p>
                </div>

                {/* Azure SSO Login - For Admin */}
                <div style={{ marginBottom: '1rem' }}>
                    <button className="microsoft-btn" onClick={handleAzureLogin} style={{ background: '#2563eb', color: 'white', border: 'none' }}>
                        <Shield size={18} />
                        Admin Login (Azure SSO)
                    </button>
                </div>

                <div className="separator">Test Accounts (No Azure Required)</div>

                {/* Test Login Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button 
                        className="test-btn devops-btn"
                        onClick={() => handleTestLogin("DevOps Team", "DevOps Engineer")}
                    >
                        <Terminal size={18} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>DevOps Team Login</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Test Account - Engineering Access</div>
                        </div>
                    </button>

                    <button 
                        className="test-btn user-btn"
                        onClick={() => handleTestLogin("User", "Standard User")}
                    >
                        <User size={18} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>User Login</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Test Account - Personal Access</div>
                        </div>
                    </button>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.75rem', color: '#92400e' }}>
                    <strong>Note:</strong> Test accounts are for demo purposes only. Admin role uses real Azure SSO authentication.
                </div>
            </div>
        </div>
    );
};

export default Login;
