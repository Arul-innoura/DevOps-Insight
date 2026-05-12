import React, { useState, useEffect } from 'react';
import { Bell, X, AlertTriangle } from 'lucide-react';

/**
 * Shows a one-time banner asking the user to allow browser notifications.
 * - Auto-attempts the permission dialog on mount (works in Firefox/Safari without gesture).
 * - Shows an "Enable" button for Chrome/Edge (requires click gesture).
 * - Shows "blocked" guidance if the user previously denied.
 * Disappears once granted or permanently dismissed.
 */
export default function NotificationPermissionBanner() {
    const [perm, setPerm]           = useState('granted'); // start hidden; hydrate below
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof Notification === 'undefined') return;

        const current = Notification.permission;
        setPerm(current);

        // Auto-attempt for Firefox / Safari — they allow requestPermission() without a gesture.
        // Chrome silently ignores this call (no gesture), so the "Enable" button handles Chrome.
        if (current === 'default') {
            Notification.requestPermission()
                .then(result => setPerm(result))
                .catch(() => {});
        }

        // Poll for external changes (user revokes / grants from browser settings)
        const id = setInterval(() => setPerm(Notification.permission), 3000);
        return () => clearInterval(id);
    }, []);

    if (dismissed || perm === 'granted') return null;

    // --- Denied state: guide the user to re-enable from browser settings ---
    if (perm === 'denied') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 16px',
                background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 500,
                borderRadius: 8,
                margin: '0 0 12px 0',
                boxShadow: '0 2px 8px rgba(109,40,217,0.18)',
                flexShrink: 0
            }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, opacity: 0.9 }} />
                <span style={{ flex: 1 }}>
                    Notifications are blocked. To receive alerts outside this tab, click the
                    <strong> lock / info icon</strong> in your browser's address bar and
                    set <strong>Notifications → Allow</strong>.
                </span>
                <button
                    onClick={() => setDismissed(true)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0
                    }}
                    aria-label="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
        );
    }

    // --- Default state: ask the user to enable ---
    const handleEnable = async () => {
        try {
            const result = await Notification.requestPermission();
            setPerm(result);
        } catch {
            setDismissed(true);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 16px',
            background: 'linear-gradient(90deg, #1e40af 0%, #1d4ed8 100%)',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 500,
            borderRadius: 8,
            margin: '0 0 12px 0',
            boxShadow: '0 2px 8px rgba(30,64,175,0.18)',
            flexShrink: 0
        }}>
            <Bell size={14} style={{ flexShrink: 0, opacity: 0.9 }} />
            <span style={{ flex: 1 }}>
                Enable desktop notifications to get alerts even when you are in another tab or app.
            </span>
            <button
                onClick={handleEnable}
                style={{
                    background: '#fff',
                    color: '#1d4ed8',
                    border: 'none',
                    borderRadius: 5,
                    padding: '4px 12px',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    flexShrink: 0
                }}
            >
                Enable
            </button>
            <button
                onClick={() => setDismissed(true)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0
                }}
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}
