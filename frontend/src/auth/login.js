import React, { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "./authConfig";
import SplashCursor from "./SplashCursor";

const LoginPageShell = ({ children }) => (
    <div className="login-page">
        <LoginBackdrop />
        <SplashCursor
            SIM_RESOLUTION={96}
            DYE_RESOLUTION={512}
            SPLAT_FORCE={3600}
            CURL={2.8}
            DENSITY_DISSIPATION={3.2}
            COLOR_UPDATE_SPEED={6}
            BACK_COLOR={{ r: 0.94, g: 0.96, b: 0.99 }}
            TRANSPARENT
            SHADING
        />
        {children}
    </div>
);

const LoginBackdrop = () => (
    <div className="login-page-backdrop" aria-hidden="true">
        <div className="login-mesh-gradient" />
        <div className="login-grid-overlay" />
        <div className="login-orb login-orb--1" />
        <div className="login-orb login-orb--2" />
        <div className="login-orb login-orb--3" />
    </div>
);

const MicrosoftLogo = () => (
    <svg className="login-ms-logo" viewBox="0 0 21 21" width="20" height="20" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
);

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
            <LoginPageShell>
                <div className="login-auth-layout animate-in">
                    <div className="login-state-center">
                        <div className="login-loading-state">
                            <div className="loading-rings" aria-busy="true" aria-label="Loading">
                                <div className="ring ring-1" />
                                <div className="ring ring-2" />
                                <div className="ring ring-3" />
                            </div>
                            <h3>Authenticating</h3>
                            <p>Securely connecting to your account…</p>
                        </div>
                    </div>
                </div>
            </LoginPageShell>
        );
    }

    // Show loading state if user is authenticated (redirecting to dashboard)
    if (isAuthenticated) {
        return (
            <LoginPageShell>
                <div className="login-auth-layout animate-in">
                    <div className="login-state-center">
                        <div className="login-loading-state">
                            <div className="loading-rings success" aria-busy="true" aria-label="Loading">
                                <div className="ring ring-1" />
                                <div className="ring ring-2" />
                                <div className="ring ring-3" />
                            </div>
                            <h3>Welcome back</h3>
                            <p>Redirecting to your workspace…</p>
                        </div>
                    </div>
                </div>
            </LoginPageShell>
        );
    }

    return (
        <LoginPageShell>
            <div className="login-auth-layout animate-in">
                <header className="login-top-brand login-stagger login-stagger-1">
                    <div className="brand-logo" aria-hidden="true">
                        <span className="logo-glow" />
                        <svg className="brand-logo-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 22V10l6 6 6-6v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 26h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
                        </svg>
                    </div>
                    <div className="brand-text">
                        <h1>ShipIt</h1>
                        <span className="brand-tagline">Ship fast. Ship smart.</span>
                    </div>
                </header>

                <main className="login-main">
                    <div className="login-main-inner login-stagger login-stagger-2">
                        <button
                            type="button"
                            className="azure-login-btn"
                            onClick={handleAzureLogin}
                        >
                            <span className="azure-login-btn-shine" aria-hidden="true" />
                            <span className="btn-content">
                                <MicrosoftLogo />
                                <span>Sign in with Microsoft</span>
                            </span>
                        </button>
                    </div>
                </main>

                <footer className="login-bottom-hint login-stagger login-stagger-3">
                    <p>Microsoft Entra ID</p>
                </footer>
            </div>
        </LoginPageShell>
    );
};

export default Login;
