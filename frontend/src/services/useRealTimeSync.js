/**
 * Real-Time Synchronization Hook - Production Ready
 * Pure WebSocket - No polling overhead
 * Silent background updates - No spinners for users
 */

import { useEffect, useRef, useCallback, useState } from "react";
import realTimeService, { WS_MESSAGE_TYPES } from "./stompWebSocketService";
import { applyCacheInvalidationHint } from "./ticketService";
import { 
    playShortNotification, 
    playSuccessNotification,
    playNewTicketNotification
} from "./notificationService";

/**
 * Main hook for real-time data synchronization
 * Listens for WebSocket events and triggers refresh callback
 */
export const useRealTimeSync = ({
    onRefresh,
    playNewTicketSound = false,
    playUpdateSound = true,
    enableWebSocket = true,
    pollingInterval = null // Not used - kept for compatibility
}) => {
    const onRefreshRef = useRef(onRefresh);
    const didInitialLoad = useRef(false);
    const debounceRef = useRef(null);
    const lockRef = useRef(false);
    
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
    
    useEffect(() => {
        if (!enableWebSocket) {
            onRefreshRef.current?.();
            const pollMs = pollingInterval || 8000;
            const timer = setInterval(() => onRefreshRef.current?.(), pollMs);
            return () => clearInterval(timer);
        }
        
        // New ticket created — always play the distinctive arrival chime
        const handleNewTicket = (data) => {
            if (didInitialLoad.current && playNewTicketSound) {
                playNewTicketNotification();
            }
            debouncedRefresh();
        };

        // Existing ticket updated (assignment, note, etc.)
        const handleTicketEvent = (data) => {
            if (didInitialLoad.current && playUpdateSound) {
                playShortNotification();
            }
            debouncedRefresh();
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
                    playSuccessNotification();
                } else if (playUpdateSound) {
                    playShortNotification();
                }
            }
            
            debouncedRefresh();
        };
        
        // Subscribe to events
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_CREATED, handleNewTicket);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_UPDATED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_DELETED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleStatusChange);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleTicketEvent);
        realTimeService.on(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
        
        // Initial load
        onRefreshRef.current?.();
        
        // Mark initial load complete after delay
        setTimeout(() => { didInitialLoad.current = true; }, 1000);
        
        // Cleanup
        return () => {
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_CREATED, handleNewTicket);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_UPDATED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_DELETED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleStatusChange);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleTicketEvent);
            realTimeService.off(WS_MESSAGE_TYPES.CACHE_INVALIDATE, handleCacheInvalidation);
            
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [enableWebSocket, playNewTicketSound, playUpdateSound, debouncedRefresh]);
    
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
