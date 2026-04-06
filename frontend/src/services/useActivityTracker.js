/**
 * useActivityTracker — React hook for detecting user inactivity and managing
 * automatic offline status transitions.
 * 
 * Features:
 * - Sends heartbeat to backend every 60 seconds while user is active
 * - Detects inactivity after 15 minutes and auto-sets status to Offline
 * - Shows warning toast at 12 minutes (3 min before auto-offline)
 * - Sends "going offline" beacon on tab close / browser close
 * - Resumes tracking when tab becomes visible again
 */

import { useEffect, useRef, useCallback } from "react";
import { sendHeartbeat, sendGoingOfflineBeacon } from "./devopsStatusService";
import { updateDevOpsAvailability, DEVOPS_AVAILABILITY_STATUS } from "./ticketService";

const HEARTBEAT_INTERVAL = 60_000;        // 60 seconds
const INACTIVITY_TIMEOUT = 15 * 60_000;   // 15 minutes
const WARNING_TIMEOUT = 12 * 60_000;      // 12 minutes (warning at 3 min before offline)
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/**
 * @param {Object} options
 * @param {string} options.userEmail - The current user's email
 * @param {string} options.userName - The current user's name
 * @param {string} options.currentStatus - The current availability status
 * @param {function} options.onStatusChange - Callback when status changes (status) => void
 * @param {function} options.onInactivityWarning - Callback when 12 min idle (minutesLeft) => void
 * @param {function} options.onAutoOffline - Callback when auto-offlined
 * @param {boolean} options.enabled - Whether tracking is enabled (default true)
 */
export const useActivityTracker = ({
    userEmail,
    userName,
    currentStatus,
    onStatusChange,
    onInactivityWarning,
    onAutoOffline,
    enabled = true
}) => {
    const lastActivityRef = useRef(Date.now());
    const heartbeatTimerRef = useRef(null);
    const inactivityTimerRef = useRef(null);
    const warningTimerRef = useRef(null);
    const isAutoOfflinedRef = useRef(false);
    const currentStatusRef = useRef(currentStatus);

    // Keep ref in sync
    useEffect(() => {
        currentStatusRef.current = currentStatus;
    }, [currentStatus]);

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();

        // If user was auto-offlined and they interact, clear the flag
        // (but don't auto-change status — let them choose)
        if (isAutoOfflinedRef.current) {
            isAutoOfflinedRef.current = false;
        }

        // Reset warning timer
        if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
        }
        warningTimerRef.current = setTimeout(() => {
            if (onInactivityWarning && currentStatusRef.current !== DEVOPS_AVAILABILITY_STATUS.OFFLINE) {
                onInactivityWarning(3); // 3 minutes left
            }
        }, WARNING_TIMEOUT);

        // Reset inactivity timer
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
        }
        inactivityTimerRef.current = setTimeout(async () => {
            if (currentStatusRef.current === DEVOPS_AVAILABILITY_STATUS.OFFLINE) return;

            try {
                await updateDevOpsAvailability(userEmail, DEVOPS_AVAILABILITY_STATUS.OFFLINE);
                isAutoOfflinedRef.current = true;
                onStatusChange?.(DEVOPS_AVAILABILITY_STATUS.OFFLINE);
                onAutoOffline?.();
            } catch (err) {
                console.error("[ActivityTracker] Failed to auto-offline:", err);
            }
        }, INACTIVITY_TIMEOUT);
    }, [userEmail, onStatusChange, onInactivityWarning, onAutoOffline]);

    // Heartbeat sender
    useEffect(() => {
        if (!enabled || !userEmail) return;

        const sendHb = async () => {
            try {
                // Only send heartbeat if not offline
                if (currentStatusRef.current !== DEVOPS_AVAILABILITY_STATUS.OFFLINE) {
                    await sendHeartbeat();
                }
            } catch (err) {
                console.warn("[ActivityTracker] Heartbeat failed:", err?.message);
            }
        };

        // Send initial heartbeat
        sendHb();

        heartbeatTimerRef.current = setInterval(sendHb, HEARTBEAT_INTERVAL);

        return () => {
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
            }
        };
    }, [enabled, userEmail]);

    // Activity event listeners
    useEffect(() => {
        if (!enabled) return;

        const handleActivity = () => {
            resetActivity();
        };

        // Attach activity listeners
        ACTIVITY_EVENTS.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Initial activity reset
        resetActivity();

        return () => {
            ACTIVITY_EVENTS.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        };
    }, [enabled, resetActivity]);

    // Tab close / visibility change handling
    useEffect(() => {
        if (!enabled || !userEmail) return;

        const handleBeforeUnload = () => {
            sendGoingOfflineBeacon();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                // Tab hidden — try to send going offline
                sendGoingOfflineBeacon();
            } else if (document.visibilityState === "visible") {
                // Tab became visible — reset activity
                resetActivity();
                // Send a heartbeat immediately
                if (currentStatusRef.current !== DEVOPS_AVAILABILITY_STATUS.OFFLINE) {
                    sendHeartbeat().catch(() => {});
                }
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [enabled, userEmail, resetActivity]);

    return {
        isAutoOfflined: isAutoOfflinedRef.current,
        resetActivity
    };
};

export default useActivityTracker;
