/**
 * Real-Time Synchronization Hook - Production Ready
 * Pure WebSocket - No polling overhead
 * Silent background updates - No spinners for users
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import realTimeService, { WS_MESSAGE_TYPES } from "./stompWebSocketService";
import { applyCacheInvalidationHint } from "./ticketService";
import {
    playNewTicketArrival,
    playStatusChangeNotification,
    playSuccessNotification,
    playAssignmentNotification,
    playAvailabilityChangeNotification,
    playTeamRosterUpdateNotification,
    playDataSyncChime,
    playTicketUpdateNotification,
    playWarningNotification,
    isSoundCategoryEnabled
} from "./notificationService";

/**
 * Main hook for real-time data synchronization
 * Listens for WebSocket events and triggers refresh callback
 */
export const useRealTimeSync = ({
    onRefresh,
    onPatchEvent,
    playNewTicketSound = true,
    playUpdateSound = true,
    enableWebSocket = true,
    pollingInterval = null // Used when WS is off or after repeated handshake failures
}) => {
    const onRefreshRef = useRef(onRefresh);
    const didInitialLoad = useRef(false);
    const debounceRef = useRef(null);
    const lockRef = useRef(false);
    const [wsBrokenUsePolling, setWsBrokenUsePolling] = useState(false);
    
    // Keep ref updated
    onRefreshRef.current = onRefresh;
    
    // Near-immediate refresh with light debounce.
    const debouncedRefresh = useCallback(() => {
        if (lockRef.current) return;
        
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        
        debounceRef.current = setTimeout(async () => {
            lockRef.current = true;
            try {
                await onRefreshRef.current?.();
            } finally {
                setTimeout(() => { lockRef.current = false; }, 120);
            }
        }, 1);
    }, []);

    useLayoutEffect(() => {
        if (enableWebSocket && !realTimeService.wsEnabled) {
            setWsBrokenUsePolling(true);
        }
    }, [enableWebSocket]);

    useEffect(() => {
        if (!enableWebSocket) {
            return;
        }
        const onWsDead = () => setWsBrokenUsePolling(true);
        realTimeService.on(WS_MESSAGE_TYPES.TRANSPORT_UNAVAILABLE, onWsDead);
        return () => realTimeService.off(WS_MESSAGE_TYPES.TRANSPORT_UNAVAILABLE, onWsDead);
    }, [enableWebSocket]);
    
    useEffect(() => {
        const usePolling = !enableWebSocket || wsBrokenUsePolling;
        if (usePolling) {
            onRefreshRef.current?.();
            const pollMs = pollingInterval || 15000;
            const timer = setInterval(() => onRefreshRef.current?.(), pollMs);
            return () => clearInterval(timer);
        }
        
        const handleNewTicket = (data) => {
            if (didInitialLoad.current && playNewTicketSound && isSoundCategoryEnabled("newTicket")) {
                playNewTicketArrival();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_CREATED, data);
            debouncedRefresh();
        };

        const handleTicketUpdated = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("ticketUpdate")) {
                playTicketUpdateNotification();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_UPDATED, data);
            debouncedRefresh();
        };

        const handleTicketDeleted = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("ticketUpdate")) {
                playWarningNotification();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_DELETED, data);
            debouncedRefresh();
        };

        const handleTicketAssigned = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("assignment")) {
                playAssignmentNotification();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_ASSIGNED, data);
            debouncedRefresh();
        };

        const handleDevOpsUpdated = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("teamRoster")) {
                playTeamRosterUpdateNotification();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.DEVOPS_UPDATED, data);
            debouncedRefresh();
        };

        const handleAvailabilityChanged = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("availability")) {
                playAvailabilityChangeNotification();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, data);
            debouncedRefresh();
        };

        const handleSyncRequired = (data) => {
            if (didInitialLoad.current && playUpdateSound && isSoundCategoryEnabled("dataSync")) {
                playDataSyncChime();
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.SYNC_REQUIRED, data);
            debouncedRefresh();
        };

        const handleCacheInvalidation = (hint) => {
            applyCacheInvalidationHint(hint);
        };

        const handleStatusChange = (data) => {
            if (didInitialLoad.current && isSoundCategoryEnabled("statusChange")) {
                const status = data?.status;
                if (status === "COMPLETED" || status === "CLOSED") {
                    playSuccessNotification();
                } else if (playUpdateSound) {
                    playStatusChangeNotification();
                }
            }

            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, data);
            debouncedRefresh();
        };

        // Subscribe to events
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_CREATED, handleNewTicket);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_UPDATED, handleTicketUpdated);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_DELETED, handleTicketDeleted);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleStatusChange);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleTicketAssigned);
        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleDevOpsUpdated);
        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleAvailabilityChanged);
        realTimeService.on(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleSyncRequired);
        realTimeService.on(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
        
        // Initial load
        onRefreshRef.current?.();
        
        // Mark initial load complete after delay
        setTimeout(() => {
            didInitialLoad.current = true;
        }, 450);
        
        // Cleanup
        return () => {
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_CREATED, handleNewTicket);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_UPDATED, handleTicketUpdated);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_DELETED, handleTicketDeleted);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleStatusChange);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleTicketAssigned);
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleDevOpsUpdated);
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleAvailabilityChanged);
            realTimeService.off(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleSyncRequired);
            realTimeService.off(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
            
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [enableWebSocket, wsBrokenUsePolling, playNewTicketSound, playUpdateSound, debouncedRefresh, pollingInterval]);
    
    // Refresh on tab visibility
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [debouncedRefresh]);
    
    return {}; // No return values needed - silent operation
};

/**
 * Connection status hook - for debugging only
 */
export const useConnectionStatus = () => {
    const [isConnected, setIsConnected] = useState(() => {
        const state = realTimeService.getState();
        return state.isConnected || state.readyState === WebSocket.OPEN;
    });

    useEffect(() => {
        const onConnected = () => setIsConnected(true);
        const onDisconnected = () => setIsConnected(false);

        realTimeService.on(WS_MESSAGE_TYPES.CONNECTED, onConnected);
        realTimeService.on(WS_MESSAGE_TYPES.DISCONNECTED, onDisconnected);

        const state = realTimeService.getState();
        setIsConnected(state.isConnected || state.readyState === WebSocket.OPEN);

        return () => {
            realTimeService.off(WS_MESSAGE_TYPES.CONNECTED, onConnected);
            realTimeService.off(WS_MESSAGE_TYPES.DISCONNECTED, onDisconnected);
        };
    }, []);

    return {
        isConnected,
        syncMethod: "websocket"
    };
};
