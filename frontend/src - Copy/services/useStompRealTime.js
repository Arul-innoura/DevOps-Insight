/**
 * Professional Real-Time Hook for Dashboards
 * - Zero polling - instant WebSocket updates
 * - Silent background operation - no spinners
 * - Auto-refresh data when events received
 */

import { useEffect, useCallback, useRef } from 'react';
import realTimeService, { WS_MESSAGE_TYPES } from './stompWebSocketService';

/**
 * Hook to subscribe to real-time ticket updates
 * Calls onUpdate callback when any ticket event is received
 */
export function useTicketUpdates(onUpdate) {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        const handleEvent = (data) => {
            if (onUpdateRef.current) {
                onUpdateRef.current(data);
            }
        };

        // Subscribe to all ticket events
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_CREATED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_UPDATED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_DELETED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleEvent);

        return () => {
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_CREATED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_UPDATED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_DELETED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.TICKET_ASSIGNED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.SYNC_REQUIRED, handleEvent);
        };
    }, []);
}

/**
 * Hook to subscribe to DevOps team updates
 */
export function useDevOpsUpdates(onUpdate) {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        const handleEvent = (data) => {
            if (onUpdateRef.current) {
                onUpdateRef.current(data);
            }
        };

        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleEvent);
        realTimeService.on(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleEvent);

        return () => {
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_UPDATED, handleEvent);
            realTimeService.off(WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED, handleEvent);
        };
    }, []);
}

/**
 * Legacy compatibility exports for existing dashboards
 */
export function useRealTimeSync() {
    // Return empty object - no longer shows syncing state
    return {};
}

export function useConnectionStatus() {
    return { isConnected: realTimeService.getState().isConnected };
}

export { WS_MESSAGE_TYPES };
