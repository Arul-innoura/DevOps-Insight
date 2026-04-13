import React, { useState, useEffect } from 'react';
import SplashCursor from '../auth/SplashCursor';

const MESSAGES = [
    "Warming up the engines...",
    "Syncing your workspace...",
    "Fetching live data...",
    "Almost ready to ship! 🎯",
];

export const LoadingScreen = ({ role = 'user' }) => {
    const [msgIdx, setMsgIdx] = useState(0);

    useEffect(() => {
        const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1500);
        return () => clearInterval(msgTimer);
    }, []);

    return (
        <div className="sl-screen sl-screen--light">
            <SplashCursor
                SIM_RESOLUTION={128}
                DYE_RESOLUTION={768}
                SPLAT_FORCE={4800}
                CURL={2.8}
                DENSITY_DISSIPATION={3.2}
                COLOR_UPDATE_SPEED={8}
                BACK_COLOR={{ r: 0.94, g: 0.96, b: 0.99 }}
                TRANSPARENT
                SHADING
            />
            <div className="sl-card">
                {/* Rocket scene */}
                <div className="sl-rocket-scene">
                    <div className="sl-stars">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className={`sl-star sl-star-${(i % 4) + 1}`} />
                        ))}
                    </div>
                    <div className="sl-rocket-wrap">
                        <span className="sl-rocket" role="img" aria-label="rocket">🚀</span>
                        <div className="sl-exhaust">
                            <span className="sl-flame sl-f1">🔥</span>
                            <span className="sl-flame sl-f2">✨</span>
                            <span className="sl-flame sl-f3">💨</span>
                        </div>
                    </div>
                </div>

                {/* Brand */}
                <div className="sl-brand">
                    <span className="sl-brand-text">ShipIt</span>
                    <span className="sl-brand-badge">
                        {role === 'admin' ? '⚡ Admin' : role === 'devops' ? '🛠 DevOps' : '👤 Portal'}
                    </span>
                </div>

                {/* Cycling message */}
                <p className="sl-msg" key={msgIdx}>{MESSAGES[msgIdx]}</p>

                {/* Progress bar */}
                <div className="sl-progress-track">
                    <div className="sl-progress-fill" />
                </div>

                {/* Dots */}
                <div className="sl-dots">
                    <span className="sl-dot" />
                    <span className="sl-dot" />
                    <span className="sl-dot" />
                </div>
            </div>
        </div>
    );
};
