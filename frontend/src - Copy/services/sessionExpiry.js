/**
 * Single-flight session expiry: parallel 401s should not spam redirects.
 */

let sessionExpiredDispatched = false;

export function resetSessionExpiryDispatchFlag() {
    sessionExpiredDispatched = false;
}

/**
 * @returns {boolean} true if this was the first dispatch (caller may redirect)
 */
export function markSessionExpired() {
    if (sessionExpiredDispatched) return false;
    sessionExpiredDispatched = true;
    try {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("app:session-expired", { detail: { at: Date.now() } }));
        }
    } catch {
        /* ignore */
    }
    return true;
}

export function isSessionExpiredError(err) {
    if (!err) return false;
    return err.code === "SESSION_EXPIRED" || err.message === "SESSION_EXPIRED";
}
