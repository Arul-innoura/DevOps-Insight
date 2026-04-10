import React, { useState, useEffect } from 'react';

const MESSAGES = [
    "Warming up the engines...",
    "Syncing your workspace...",
    "Fetching live data...",
    "Almost ready to ship! 🎯",
];

const ROLE_GRADIENTS = {
    admin:  { a: '#0f172a', b: '#1e3a8a', c: '#1d4ed8' },
    devops: { a: '#042f2e', b: '#0e4f6b', c: '#0891b2' },
    user:   { a: '#1e1b4b', b: '#3730a3', c: '#7c3aed' },
};

export const LoadingScreen = ({ role = 'user' }) => {
    const [msgIdx, setMsgIdx] = useState(0);

    useEffect(() => {
        const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1500);
        return () => clearInterval(msgTimer);
    }, []);

    const g = ROLE_GRADIENTS[role] || ROLE_GRADIENTS.user;

    return (
        <div
            className="sl-screen"
            style={{ background: `linear-gradient(145deg, ${g.a} 0%, ${g.b} 55%, ${g.c} 100%)` }}
        >
            {/* Floating orbs */}
            <div className="sl-orb sl-orb1" />
            <div className="sl-orb sl-orb2" />
            <div className="sl-orb sl-orb3" />

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
