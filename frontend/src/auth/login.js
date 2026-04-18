import React, { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loginRequest } from "./authConfig";
import { ShipItEyeIcon } from "../components/ShipItEyeIcon";

const LOGIN_HERO_VIDEO = `${process.env.PUBLIC_URL || ""}/login-devops-hero.mp4`;

const LoginPageShell = ({ children, pageClassName = "" }) => (
    <div className={`login-page${pageClassName ? ` ${pageClassName}` : ""}`.trim()}>
        <LoginBackdrop />
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
    const [searchParams, setSearchParams] = useSearchParams();
    const sessionExpired = searchParams.get("session") === "expired";

    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Shipt It";
        return () => {
            document.title = previousTitle;
        };
    }, []);

    /* Dark app theme can paint native inputs black; force light controls while /login is mounted */
    useEffect(() => {
        document.documentElement.classList.add("login-route-active");
        return () => document.documentElement.classList.remove("login-route-active");
    }, []);

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
        <LoginPageShell pageClassName="login-page--video-split">
            <div className="login-auth-layout login-auth-layout--video-split animate-in">
                <div className="login-video-split">
                    <div className="login-video-split__media" aria-hidden="true">
                        <video
                            className="login-hero-video"
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            disablePictureInPicture
                            tabIndex={-1}
                        >
                            <source src={LOGIN_HERO_VIDEO} type="video/mp4" />
                        </video>
                    </div>
                    <div className="login-video-split__panel">
                        <div className="login-video-split__panel-inner login-stagger login-stagger-1">
                            <p className="login-jenkins-sr-hint">
                                Email and password fields are for display only. Use Sign in with Microsoft to continue.
                            </p>
                            <div className="login-jenkins-logo" aria-hidden="true">
                                <ShipItEyeIcon className="login-jenkins-eye" blink />
                            </div>
                            <h1 className="login-video-split-title">Welcome to Shipt It</h1>
                            <p className="login-video-split-tagline">
                                DevOps workspace — use your Microsoft work account to sign in.
                            </p>

                            {sessionExpired && (
                                <div className="login-session-expired-banner" role="alert">
                                    Your session expired or your sign-in is no longer valid. Please sign in with Microsoft
                                    again to continue.
                                    <button
                                        type="button"
                                        className="login-session-expired-dismiss"
                                        onClick={() => {
                                            const next = new URLSearchParams(searchParams);
                                            next.delete("session");
                                            setSearchParams(next, { replace: true });
                                        }}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            <div className="login-jenkins-showcase" aria-hidden="true">
                                <input
                                    type="email"
                                    className="login-jenkins-input"
                                    placeholder="Email"
                                    readOnly
                                    tabIndex={-1}
                                    autoComplete="off"
                                />
                                <input
                                    type="password"
                                    className="login-jenkins-input"
                                    placeholder="Password"
                                    readOnly
                                    tabIndex={-1}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="login-jenkins-btn login-jenkins-btn--primary"
                                    tabIndex={-1}
                                    onClick={(e) => e.preventDefault()}
                                >
                                    Login
                                </button>
                                <div className="login-jenkins-or">OR</div>
                            </div>

                            <button
                                type="button"
                                className="login-jenkins-btn login-jenkins-btn--sso"
                                onClick={handleAzureLogin}
                            >
                                <MicrosoftLogo />
                                <span>Sign in with Microsoft</span>
                            </button>

                            <p className="login-jenkins-foot">Microsoft Entra ID</p>
                        </div>
                    </div>
                </div>
            </div>
        </LoginPageShell>
    );
};

export default Login;
