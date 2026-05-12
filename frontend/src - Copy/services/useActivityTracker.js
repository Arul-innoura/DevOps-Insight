/**
 * useActivityTracker — React hook for user activity and heartbeat management.
 *
 * Features:
 * - Sends heartbeat to backend every 60 seconds while active
 * - Sends "going offline" beacon only on actual tab/browser close (beforeunload)
 * - Status changes to Offline ONLY via manual user action — no auto-offline on inactivity
 */

import { useEffect, useRef, useCallback } from "react";
import { sendHeartbeat, sendGoingOfflineBeacon } from "./devopsStatusService";
import { DEVOPS_AVAILABILITY_STATUS } from "./ticketService";

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/**
 * @param {Object} options
 * @param {string} options.userEmail - The current user's email
 * @param {string} options.userName - The current user's name
 * @param {string} options.currentStatus - The current availability status
 * @param {function} options.onStatusChange - Callback when status changes (status) => void
 * @param {boolean} options.enabled - Whether tracking is enabled (default true)
 */
export const useActivityTracker = ({
    userEmail,
    userName,
    currentStatus,
    onStatusChange,
    // Legacy params kept for API compatibility — no longer used
    onInactivityWarning,
    onAutoOffline,
    enabled = true
}) => {
    const lastActivityRef = useRef(Date.now());
    const heartbeatTimerRef = useRef(null);
    const currentStatusRef = useRef(currentStatus);

    // Keep ref in sync
    useEffect(() => {
        currentStatusRef.current = currentStatus;
    }, [currentStatus]);

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
    }, []);

    // Heartbeat sender — keeps session alive on backend
    useEffect(() => {
        if (!enabled || !userEmail) return;

        const sendHb = async () => {
            try {
                if (currentStatusRef.current !== DEVOPS_AVAILABILITY_STATUS.OFFLINE) {
                    await sendHeartbeat();
                }
            } catch (err) {
                console.warn("[ActivityTracker] Heartbeat failed:", err?.message);
            }
        };

        sendHb();
        heartbeatTimerRef.current = setInterval(sendHb, HEARTBEAT_INTERVAL);

        return () => {
            if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        };
    }, [enabled, userEmail]);

    // Activity event listeners — update last-active timestamp only
    useEffect(() => {
        if (!enabled) return;

        const handleActivity = () => resetActivity();
        ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
        resetActivity();

        return () => {
            ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, handleActivity));
        };
    }, [enabled, resetActivity]);

    // Tab/browser close — send offline beacon on intentional close only
    useEffect(() => {
        if (!enabled || !userEmail) return;

        const handleBeforeUnload = () => sendGoingOfflineBeacon();

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [enabled, userEmail]);

    return {
        isAutoOfflined: false,
        resetActivity
    };
};

export default useActivityTracker;
