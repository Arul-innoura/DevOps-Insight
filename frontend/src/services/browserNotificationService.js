/**
 * OS-level browser notifications via the registered Service Worker.
 *
 * sw.js already handles notificationclick (focuses the tab).
 * Using reg.showNotification() instead of new Notification() is the key
 * difference — it delivers notifications outside the browser window and
 * outside the current tab, even when the page is minimised.
 *
 * silent: true  → we play shipt.aac ourselves; OS must not double-beep
 * requireInteraction: true → stays until user clicks X (WhatsApp style)
 */

const NOTIFICATION_ICON = '/favicon-eye.svg';
const NOTIFICATION_BADGE = '/favicon.ico';

let _swReg = null;

/** Register /sw.js once; called at module init. */
const initSW = () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
        .register('/sw.js')
        .then(reg => { _swReg = reg; })
        .catch(() => {});
};
initSW();

/** Returns the active SW registration (waits for 'ready' if not cached). */
const getSwReg = async () => {
    if (_swReg) return _swReg;
    if ('serviceWorker' in navigator) {
        try {
            _swReg = await navigator.serviceWorker.ready;
            return _swReg;
        } catch {}
    }
    return null;
};

export const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch {
        return false;
    }
};

export const isNotificationGranted = () =>
    typeof Notification !== 'undefined' && Notification.permission === 'granted';

/**
 * Show a native OS notification.
 * Uses the Service Worker's showNotification() for true outside-browser delivery.
 * Falls back to new Notification() if SW is unavailable.
 */
export const showBrowserNotification = async (title, body, opts = {}) => {
    if (!isNotificationGranted()) return;

    const options = {
        body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        silent: true,
        requireInteraction: true,   // stays until user clicks X
        ...opts
    };

    // Primary path: service worker showNotification (works outside browser window)
    const reg = await getSwReg();
    if (reg) {
        try {
            await reg.showNotification(title, options);
            return;
        } catch {}
    }

    // Fallback: direct Notification API (works only when tab is active/visible)
    try {
        const n = new Notification(title, options);
        n.onclick = () => { try { window.focus(); } catch {} n.close(); };
    } catch {}
};

/** Helper — extract a human-readable ticket title/id from WS event data. */
export const extractTicketLabel = (data) => {
    const raw = (data?.ticket && typeof data.ticket === 'object') ? data.ticket : data;
    return raw?.title || raw?.subject || raw?.ticketTitle
        || (raw?.id ? `Ticket #${raw.id}` : null)
        || 'Ticket';
};
