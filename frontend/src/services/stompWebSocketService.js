/**
 * Enterprise WebSocket Service - Production Ready for 100+ Users
 * - Native WebSocket (no external dependencies like SockJS)
 * - Silent background operation - no UI spinners
 * - Instant data updates without page refresh
 * - Auto-reconnect with exponential backoff
 */

const resolveWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In development, the proxy only handles HTTP, not WebSocket
    // Connect directly to backend for WebSocket
    const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
    const host = isDev ? 'localhost:8080' : window.location.host;
    return `${protocol}//${host}/ws/tickets`;
};

export const WS_MESSAGE_TYPES = {
    TICKET_CREATED: 'ticket:created',
    TICKET_UPDATED: 'ticket:updated',
    TICKET_DELETED: 'ticket:deleted',
    TICKET_STATUS_CHANGED: 'ticket:status_changed',
    TICKET_ASSIGNED: 'ticket:assigned',
    DEVOPS_UPDATED: 'devops:updated',
    DEVOPS_AVAILABILITY_CHANGED: 'devops:availability_changed',
    SYNC_REQUIRED: 'sync:required',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected'
};

class RealTimeService {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
        this.baseDelay = 1000;
        this.maxDelay = 30000;
        this.listeners = new Map();
        this.reconnectTimer = null;
        this.pingInterval = null;
        this.shouldReconnect = true;
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = resolveWsUrl();
        console.log('[WS] Connecting to:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[WS] ✅ Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startPing();
                this.emit(WS_MESSAGE_TYPES.CONNECTED, { connected: true });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type && message.type !== 'pong') {
                        console.log('[WS] 📨', message.type);
                        this.emit(message.type, message.data);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };

            this.ws.onclose = (event) => {
                console.log('[WS] Disconnected:', event.code);
                this.isConnected = false;
                this.stopPing();
                this.emit(WS_MESSAGE_TYPES.DISCONNECTED, { connected: false });
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                // Error handling is done in onclose
            };
        } catch (e) {
            console.error('[WS] Connection error:', e);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }

        const delay = Math.min(this.baseDelay * Math.pow(1.5, this.reconnectAttempts), this.maxDelay);
        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        this.stopPing();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
    }

    off(eventType, callback) {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(callback);
        }
    }

    emit(eventType, data) {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('[WS] Listener error:', e);
                }
            });
        }
    }

    getState() {
        return {
            isConnected: this.isConnected,
            readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED
        };
    }
}

// Singleton instance
const realTimeService = new RealTimeService();

// Auto-connect on load
if (typeof window !== 'undefined') {
    realTimeService.connect();
}

export default realTimeService;
