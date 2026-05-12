import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loginRequest } from "./authConfig";

/* ── DevOps character SVGs — real logo shapes with built-in eye sockets ── */

const DockerSvg = () => (
    <svg viewBox="0 0 200 155" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Whale body */}
        <path d="M18 92 Q12 72 32 56 L52 46 L148 46 L168 56 Q188 72 182 92 Q172 132 100 136 Q28 132 18 92Z"
              fill="#2496ED"/>
        {/* Container boxes on back — bottom row (coloured like real Docker containers) */}
        <rect x="43" y="30" width="19" height="16" rx="2.5" fill="#3fcf8e"/>
        <rect x="66" y="30" width="19" height="16" rx="2.5" fill="#ffd93d"/>
        <rect x="89" y="30" width="19" height="16" rx="2.5" fill="#ff6b6b"/>
        <rect x="112" y="30" width="19" height="16" rx="2.5" fill="#4ecdc4"/>
        {/* Container boxes — top row */}
        <rect x="43" y="14" width="19" height="16" rx="2.5" fill="#ffd93d"/>
        <rect x="66" y="14" width="19" height="16" rx="2.5" fill="#ff6b6b"/>
        <rect x="89" y="14" width="19" height="16" rx="2.5" fill="#3fcf8e"/>
        {/* Spout */}
        <path d="M160 48 Q174 28 186 24 Q188 38 172 48Z" fill="white" fillOpacity="0.72"/>
        {/* Tail */}
        <path d="M20 106 Q6 122 14 136 Q22 130 26 114Z" fill="#1a7bc4"/>
        {/* Fin */}
        <path d="M140 132 Q158 128 164 114 Q152 116 140 132Z" fill="#1a7bc4"/>
        {/* Eye sockets */}
        <circle cx="74"  cy="88" r="11" fill="white"/>
        <circle cx="112" cy="88" r="11" fill="white"/>
    </svg>
);

const K8sSvg = () => {
    const spokes = 7;
    return (
        <svg viewBox="0 0 180 180" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background circle */}
            <circle cx="90" cy="90" r="84" fill="#326CE5"/>
            {/* Spokes */}
            {Array.from({ length: spokes }).map((_, i) => {
                const a = ((360 / spokes) * i - 90) * Math.PI / 180;
                return (
                    <line key={i} x1="90" y1="90"
                        x2={90 + 68 * Math.cos(a)} y2={90 + 68 * Math.sin(a)}
                        stroke="white" strokeWidth="8" strokeOpacity="0.88" strokeLinecap="round"/>
                );
            })}
            {/* Grip circles at spoke tips */}
            {Array.from({ length: spokes }).map((_, i) => {
                const a = ((360 / spokes) * i - 90) * Math.PI / 180;
                return (
                    <circle key={i}
                        cx={90 + 68 * Math.cos(a)} cy={90 + 68 * Math.sin(a)}
                        r="10" fill="white" fillOpacity="0.9"/>
                );
            })}
            {/* Hub */}
            <circle cx="90" cy="90" r="17" fill="white" fillOpacity="0.92"/>
            {/* Rim ring */}
            <circle cx="90" cy="90" r="78" stroke="white" strokeWidth="5" strokeOpacity="0.35" fill="none"/>
            {/* Eye sockets — in lower section of the wheel */}
            <circle cx="62"  cy="120" r="11" fill="white"/>
            <circle cx="118" cy="120" r="11" fill="white"/>
        </svg>
    );
};

const JenkinsSvg = () => (
    <svg viewBox="0 0 180 215" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Top hat crown */}
        <rect x="58" y="6" width="64" height="46" rx="7" fill="#222222"/>
        {/* Hat band */}
        <rect x="58" y="44" width="64" height="10" fill="#c8302f"/>
        {/* Hat brim */}
        <ellipse cx="90" cy="55" rx="66" ry="14" fill="#222222"/>
        {/* Head / face */}
        <ellipse cx="90" cy="132" rx="58" ry="68" fill="#f5d0a9"/>
        {/* Left ear */}
        <ellipse cx="32" cy="116" rx="13" ry="17" fill="#f5d0a9"/>
        {/* Right ear */}
        <ellipse cx="148" cy="116" rx="13" ry="17" fill="#f5d0a9"/>
        {/* Sideburns */}
        <path d="M32 96 Q24 108 28 128 Q38 118 38 96Z" fill="#8b6943"/>
        <path d="M148 96 Q156 108 152 128 Q142 118 142 96Z" fill="#8b6943"/>
        {/* Nose */}
        <ellipse cx="90" cy="148" rx="7" ry="5" fill="#d4a070" fillOpacity="0.75"/>
        {/* Smile */}
        <path d="M70 163 Q90 176 110 163" stroke="#8b6943" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        {/* Collar */}
        <path d="M45 188 Q56 176 90 182 Q124 176 135 188 L130 210 Q90 222 50 210Z" fill="#f0f0f0"/>
        {/* Collar crease */}
        <line x1="90" y1="182" x2="90" y2="210" stroke="#ccc" strokeWidth="2"/>
        {/* Bowtie */}
        <path d="M66 193 L76 186 L90 193 L76 200Z M114 193 L104 186 L90 193 L104 200Z"
              fill="#c8302f"/>
        {/* Eye sockets */}
        <circle cx="66"  cy="116" r="11" fill="white"/>
        <circle cx="114" cy="116" r="11" fill="white"/>
    </svg>
);

const GitSvg = () => (
    <svg viewBox="0 0 200 200" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Diamond body */}
        <path d="M100 6 L194 100 L100 194 L6 100Z" fill="#F05033"/>
        {/* Branch nodes (lower) */}
        <circle cx="64"  cy="122" r="10" fill="white" fillOpacity="0.75"/>
        <circle cx="136" cy="122" r="10" fill="white" fillOpacity="0.75"/>
        <circle cx="100" cy="156" r="13" fill="white" fillOpacity="0.88"/>
        {/* Branch lines from eyes to lower nodes */}
        <line x1="72"  y1="86" x2="64"  y2="111" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        <line x1="128" y1="86" x2="136" y2="111" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        <line x1="64"  y1="132" x2="100" y2="143" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        <line x1="136" y1="132" x2="100" y2="143" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        {/* Merge dot at top (connects to both eyes) */}
        <line x1="100" y1="42" x2="72"  y2="64" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        <line x1="100" y1="42" x2="128" y2="64" stroke="white" strokeWidth="5" strokeOpacity="0.82" strokeLinecap="round"/>
        <circle cx="100" cy="40" r="10" fill="white" fillOpacity="0.82"/>
        {/* Eye sockets */}
        <circle cx="72"  cy="76" r="11" fill="white"/>
        <circle cx="128" cy="76" r="11" fill="white"/>
    </svg>
);

const AnsibleSvg = () => (
    <svg viewBox="0 0 180 180" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Main circle */}
        <circle cx="90" cy="90" r="84" fill="#EE0000"/>
        {/* A letter strokes */}
        <path d="M58 148 L90 38 L122 148" stroke="white" strokeWidth="16" strokeLinecap="round"
              strokeLinejoin="round" fill="none"/>
        {/* A crossbar */}
        <line x1="70" y1="108" x2="120" y2="108" stroke="white" strokeWidth="14" strokeLinecap="round"/>
        {/* Eye sockets — on either side of the A's upper arms */}
        <circle cx="57"  cy="74" r="11" fill="white"/>
        <circle cx="123" cy="74" r="11" fill="white"/>
    </svg>
);

/* ── Character config — centered cluster, small gaps (not overlapping corners) ── */
const CHARS = [
    {
        id: 'docker', Svg: DockerSvg,
        w: 134, h: 106,
        top: 8, left: 10, rot: -10, dur: '3s', del: '0s',
        e1: ['37%', '56.8%'], e2: ['56%', '56.8%'],
    },
    {
        id: 'k8s', Svg: K8sSvg,
        w: 118, h: 118,
        top: 6, left: 154, rot: 8, dur: '3.4s', del: '0.5s',
        e1: ['34.4%', '66.7%'], e2: ['65.6%', '66.7%'],
    },
    {
        id: 'ansible', Svg: AnsibleSvg,
        w: 100, h: 100,
        top: 132, left: 88, rot: -6, dur: '3.6s', del: '0.8s',
        e1: ['31.7%', '41.1%'], e2: ['68.3%', '41.1%'],
    },
    {
        id: 'jenkins', Svg: JenkinsSvg,
        w: 90, h: 108,
        top: 238, left: 14, rot: 9, dur: '2.9s', del: '1s',
        e1: ['36.7%', '54%'], e2: ['63.3%', '54%'],
    },
    {
        id: 'git', Svg: GitSvg,
        w: 108, h: 108,
        top: 238, left: 122, rot: -18, dur: '3.2s', del: '0.3s',
        e1: ['36%', '38%'], e2: ['64%', '38%'],
    },
];

/* ── Shells ──────────────────────────────────────────────────── */
const LoginPageShell = ({ children }) => (
    <div className="login-page login-page--chars">
        <div className="login-page-backdrop" aria-hidden="true">
            <div className="login-mesh-gradient"/>
            <div className="login-grid-overlay"/>
            <div className="login-orb login-orb--1"/>
            <div className="login-orb login-orb--2"/>
            <div className="login-orb login-orb--3"/>
        </div>
        {children}
    </div>
);

const MicrosoftLogo = () => (
    <svg className="login-ms-logo" viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
);

/* ── Main component ──────────────────────────────────────────── */
const Login = () => {
    const { instance, inProgress } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const sessionExpired = searchParams.get("session") === "expired";
    const charsRef = useRef(null);
    const [shaking, setShaking] = useState(false);
    const [nodding, setNodding] = useState(false);
    const [eyeSpinDone, setEyeSpinDone] = useState(false);
    const eyeSpinDoneRef = useRef(false);

    const handlePupilSpinEnd = useCallback((e) => {
        if (e.animationName === 'lc-eye-spin') {
            eyeSpinDoneRef.current = true;
            setEyeSpinDone(true);
        }
    }, []);

    useEffect(() => {
        const prev = document.title;
        document.title = "ShipIt";
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        document.documentElement.classList.add("login-route-active");
        return () => document.documentElement.classList.remove("login-route-active");
    }, []);

    useEffect(() => {
        if (isAuthenticated && inProgress === "none") navigate("/");
    }, [isAuthenticated, inProgress, navigate]);

    /* Eye tracking — cursor drives all pupils (blocked while spin intro plays) */
    useEffect(() => {
        const onMove = (e) => {
            if (!eyeSpinDoneRef.current) return;
            const el = charsRef.current;
            if (!el) return;
            el.querySelectorAll('[data-pupil]').forEach(pupil => {
                const eye = pupil.parentElement;
                const r = eye.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const dx = e.clientX - cx;
                const dy = e.clientY - cy;
                const angle = Math.atan2(dy, dx);
                const dist = Math.min(4, Math.sqrt(dx * dx + dy * dy) / 18);
                pupil.style.transform =
                    `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
            });
        };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, []);

    const handleAzureLogin = (e) => {
        if (e) e.preventDefault();
        if (inProgress !== "none") return;
        setNodding(true);
        setTimeout(() => setNodding(false), 1000);
        instance.loginRedirect(loginRequest).catch(err => {
            setShaking(true);
            setTimeout(() => setShaking(false), 820);
            const msg = err?.errorMessage || err?.message || "Unknown error";
            if (String(msg).includes("AADSTS500011")) {
                alert("Login failed: API scope is not registered in this Azure tenant.");
            } else {
                alert(`Login Failed: ${msg}`);
            }
        });
    };

    /* Loading — MSAL processing redirect */
    if (inProgress !== "none") {
        return (
            <LoginPageShell>
                <div className="login-auth-layout animate-in">
                    <div className="login-state-center">
                        <div className="login-loading-state">
                            <div className="loading-rings" aria-busy="true" aria-label="Loading">
                                <div className="ring ring-1"/>
                                <div className="ring ring-2"/>
                                <div className="ring ring-3"/>
                            </div>
                            <h3>Authenticating</h3>
                            <p>Securely connecting to your account…</p>
                        </div>
                    </div>
                </div>
            </LoginPageShell>
        );
    }

    /* Redirecting — already authenticated */
    if (isAuthenticated) {
        return (
            <LoginPageShell>
                <div className="login-auth-layout animate-in">
                    <div className="login-state-center">
                        <div className="login-loading-state">
                            <div className="loading-rings success" aria-busy="true" aria-label="Loading">
                                <div className="ring ring-1"/>
                                <div className="ring ring-2"/>
                                <div className="ring ring-3"/>
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
            <div className="lc-layout animate-in">

                {/* LEFT — animated DevOps characters */}
                <div className="lc-left" ref={charsRef} aria-hidden="true">
                    <div className="lc-char-cluster">
                    {CHARS.map(({ id, Svg, w, h, top, left, rot, dur, del, e1, e2 }) => (
                        <div
                            key={id}
                            className={`lc-char${shaking ? ' lc-shake' : ''}${nodding ? ' lc-nod' : ''}`}
                            style={{
                                width: w,
                                height: h,
                                top,
                                left,
                                '--lc-rot': `${rot}deg`,
                                '--lc-dur': dur,
                                '--lc-del': del,
                            }}
                        >
                            <Svg/>
                            {/* Eye 1 */}
                            <div className="lc-eye"
                                style={{ position: 'absolute', left: e1[0], top: e1[1], transform: 'translate(-50%,-50%)' }}>
                                <div className={`lc-pupil${!eyeSpinDone ? ' lc-pupil-spin' : ''}`}
                                    data-pupil
                                    onAnimationEnd={!eyeSpinDone ? handlePupilSpinEnd : undefined}/>
                            </div>
                            {/* Eye 2 */}
                            <div className="lc-eye"
                                style={{ position: 'absolute', left: e2[0], top: e2[1], transform: 'translate(-50%,-50%)' }}>
                                <div className={`lc-pupil${!eyeSpinDone ? ' lc-pupil-spin' : ''}`}
                                    data-pupil/>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>

                {/* RIGHT — sign-in panel */}
                <div className="lc-right">
                    <div className="lc-form-inner">
                        <div className="lc-login-brand">
                            <div className="lc-login-eye-wrap" aria-hidden="true">
                                <img src="/favicon-eye.svg" alt="" className="lc-login-eye" />
                            </div>
                            <h2 className="lc-title">
                                Welcome to{' '}
                                <span className="lc-shipit-hl">ShipIt</span>
                            </h2>
                        </div>
                        <p className="lc-tagline">DevOps workspace · Use your Microsoft work account</p>

                        {sessionExpired && (
                            <div className="login-session-expired-banner" role="alert">
                                Your session expired. Please sign in again.
                                <button
                                    type="button"
                                    className="login-session-expired-dismiss"
                                    onClick={() => {
                                        const next = new URLSearchParams(searchParams);
                                        next.delete("session");
                                        setSearchParams(next, { replace: true });
                                    }}
                                >Dismiss</button>
                            </div>
                        )}

                        {/* Screen-reader note — decorative fields below are non-interactive */}
                        <p className="login-jenkins-sr-hint">
                            Email and password fields are for display only.
                            Use Sign in with Microsoft to continue.
                        </p>

                        {/* Decorative display fields */}
                        <div className="lc-fields" aria-hidden="true">
                            <input type="email"    className="lc-input" placeholder="Email"
                                readOnly tabIndex={-1} autoComplete="off"/>
                            <input type="password" className="lc-input" placeholder="Password"
                                readOnly tabIndex={-1} autoComplete="off"/>
                            <button type="button" className="lc-btn-primary"
                                tabIndex={-1} onClick={e => e.preventDefault()}>
                                Log in
                            </button>
                            <p className="lc-or">— OR —</p>
                        </div>

                        <button type="button" className="lc-btn-ms" onClick={handleAzureLogin}>
                            <MicrosoftLogo/>
                            <span>Sign in with Microsoft</span>
                        </button>

                        <p className="lc-foot">Microsoft Entra ID · Secure SSO</p>
                    </div>
                </div>

            </div>
        </LoginPageShell>
    );
};

export default Login;
