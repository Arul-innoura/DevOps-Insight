/**
 * Real-Time Synchronization Hook - Production Ready
 * Pure WebSocket - No polling overhead
 * Silent background updates - No spinners for users
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import realTimeService, { WS_MESSAGE_TYPES } from "./stompWebSocketService";
import { applyCacheInvalidationHint } from "./ticketService";
import { 
    playShortNotification, 
    playSuccessNotification,
    playNewTicketNotification,
    primeAudioContext
} from "./notificationService";

/**
 * Main hook for real-time data synchronization
 * Listens for WebSocket events and triggers refresh callback
 */
export const useRealTimeSync = ({
    onRefresh,
    onPatchEvent,
    playNewTicketSound = false,
    playUpdateSound = true,
    enableWebSocket = true,
    pollingInterval = null, // Used when WS is off or after repeated handshake failures
    refreshOnEvents = true,
    refreshDebounceMs = 900,
    minRefreshIntervalMs = 2500,
    eventTypes = null
}) => {
    const onRefreshRef = useRef(onRefresh);
    const didInitialLoad = useRef(false);
    const debounceRef = useRef(null);
    const lockRef = useRef(false);
    const pendingRefreshRef = useRef(false);
    const lastRefreshAtRef = useRef(0);
    const initialLoadKeyRef = useRef("");
    const [wsBrokenUsePolling, setWsBrokenUsePolling] = useState(false);
    
    // Keep ref updated
    onRefreshRef.current = onRefresh;
    
    const debouncedRefresh = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
            if (document.visibilityState !== "visible") {
                return;
            }
            if (lockRef.current) {
                pendingRefreshRef.current = true;
                return;
            }

            const now = Date.now();
            const elapsed = now - lastRefreshAtRef.current;
            if (elapsed < minRefreshIntervalMs) {
                pendingRefreshRef.current = true;
                debounceRef.current = setTimeout(() => {
                    debouncedRefresh();
                }, minRefreshIntervalMs - elapsed);
                return;
            }

            lockRef.current = true;
            try {
                await onRefreshRef.current?.();
                lastRefreshAtRef.current = Date.now();
            } finally {
                lockRef.current = false;
                if (pendingRefreshRef.current) {
                    pendingRefreshRef.current = false;
                    debouncedRefresh();
                }
            }
        }, Math.max(100, refreshDebounceMs));
    }, [minRefreshIntervalMs, refreshDebounceMs]);

    useLayoutEffect(() => {
        if (enableWebSocket && !realTimeService.wsEnabled) {
            setWsBrokenUsePolling(true);
        }
    }, [enableWebSocket]);

    const eventTypesSignature = Array.isArray(eventTypes) && eventTypes.length > 0
        ? eventTypes.join("|")
        : "";
    const watchedEventTypes = useMemo(() => {
        if (eventTypesSignature) {
            return eventTypesSignature.split("|");
        }
        return [
            WS_MESSAGE_TYPES.TICKET_CREATED,
            WS_MESSAGE_TYPES.TICKET_UPDATED,
            WS_MESSAGE_TYPES.TICKET_DELETED,
            WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED,
            WS_MESSAGE_TYPES.TICKET_ASSIGNED,
            WS_MESSAGE_TYPES.DEVOPS_UPDATED,
            WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED,
            WS_MESSAGE_TYPES.SYNC_REQUIRED
        ];
    }, [eventTypesSignature]);

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
        
        // New ticket created — always play the distinctive arrival chime
        const handleNewTicket = (data) => {
            if (didInitialLoad.current && playNewTicketSound) {
                void primeAudioContext().then(() => playNewTicketNotification());
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_CREATED, data);
            if (refreshOnEvents) {
                debouncedRefresh();
            }
        };

        // Existing ticket updated (assignment, note, etc.)
        const handleTicketEvent = (data) => {
            if (didInitialLoad.current && playUpdateSound) {
                void primeAudioContext().then(() => playShortNotification());
            }
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_UPDATED, data);
            if (refreshOnEvents) {
                debouncedRefresh();
            }
        };

        const handleTicketDeleted = (data) => {
            if (didInitialLoad.current && playUpdateSound) {
                void primeAudioContext().then(() => playShortNotification());
            }
            const id = data?.id ?? data?.ticketId;
            const normalized = id != null && id !== "" ? { ...data, id, ticketId: data?.ticketId ?? id } : data;
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_DELETED, normalized);
            if (refreshOnEvents) {
                debouncedRefresh();
            }
        };

        const handleCacheInvalidation = (hint) => {
            applyCacheInvalidationHint(hint);
        };
        
        // Handler for status change events
        const handleStatusChange = (data) => {
            console.log('[RealTimeSync] Status changed:', data);
            
            if (didInitialLoad.current) {
                const status = data?.status;
                if (status === 'COMPLETED' || status === 'CLOSED') {
                    void primeAudioContext().then(() => playSuccessNotification());
                } else if (playUpdateSound) {
                    void primeAudioContext().then(() => playShortNotification());
                }
            }
            
            onPatchEvent?.(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, data);
            if (refreshOnEvents) {
                debouncedRefresh();
            }
        };

        const handlersByType = new Map([
            [WS_MESSAGE_TYPES.TICKET_CREATED, handleNewTicket],
            [WS_MESSAGE_TYPES.TICKET_UPDATED, handleTicketEvent],
            [WS_MESSAGE_TYPES.TICKET_DELETED, handleTicketDeleted],
            [WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleStatusChange],
            [WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleTicketEvent],
            [WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleTicketEvent],
            [WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleTicketEvent],
            [WS_MESSAGE_TYPES.SYNC_REQUIRED, handleTicketEvent]
        ]);

        // Subscribe only to relevant events for this view
        watchedEventTypes.forEach((type) => {
            const handler = handlersByType.get(type);
            if (handler) {
                realTimeService.on(type, handler);
            }
        });
        realTimeService.on(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
        
        // Initial load only once per transport mode (prevents request loops on re-render/re-subscribe)
        const initialLoadKey = usePolling ? "polling" : "websocket";
        if (initialLoadKeyRef.current !== initialLoadKey) {
            initialLoadKeyRef.current = initialLoadKey;
            onRefreshRef.current?.();
        }
        
        // Mark initial load complete after delay
        setTimeout(() => { didInitialLoad.current = true; }, 1000);
        
        // Cleanup
        return () => {
            watchedEventTypes.forEach((type) => {
                const handler = handlersByType.get(type);
                if (handler) {
                    realTimeService.off(type, handler);
                }
            });
            realTimeService.off(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
            
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [
        enableWebSocket,
        wsBrokenUsePolling,
        playNewTicketSound,
        playUpdateSound,
        debouncedRefresh,
        pollingInterval,
        refreshOnEvents,
        watchedEventTypes
    ]);
    
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
