/**
 * Browser Push Notification Service
 * Requests permission once and shows system notifications when the tab is not focused.
 */

const PERM_ASKED_KEY = 'shipit_notif_perm_asked';

export const getNotificationPermission = () => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
};

/**
 * Ask the user for notification permission (only once — remembers denial in localStorage).
 * Safe to call on mount; no-ops if already granted or denied.
 */
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    if (localStorage.getItem(PERM_ASKED_KEY) === 'denied') return 'denied';

    const result = await Notification.requestPermission();
    localStorage.setItem(PERM_ASKED_KEY, result);
    return result;
};

/**
 * Register the ShipIt service worker for push/click handling.
 */
export const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        return reg;
    } catch (err) {
        console.warn('[PushNotification] SW registration failed:', err?.message);
        return null;
    }
};

/**
 * Show a native OS notification. Only fires when:
 *  - Permission is granted
 *  - The tab is NOT currently visible (no duplicate with on-screen toast)
 */
export const showBrowserNotification = (title, { body = '', tag = 'shipit', icon = '/favicon-eye.svg', onClick = null } = {}) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // On-screen toast is enough

    const n = new Notification(title, {
        body,
        tag,
        icon,
        badge: '/favicon.ico',
        renotify: true
    });

    n.onclick = () => {
        window.focus();
        n.close();
        onClick?.();
    };

    // Auto-dismiss after 10 s
    setTimeout(() => n.close(), 10_000);
};
