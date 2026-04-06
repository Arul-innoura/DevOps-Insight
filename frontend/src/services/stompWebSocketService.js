/**
 * Enterprise WebSocket Service - Production Ready for 100+ Users
 * - Native WebSocket (no external dependencies like SockJS)
 * - Silent background operation - no UI spinners
 * - Instant data updates without page refresh
 * - Auto-reconnect with exponential backoff
 */

const resolveWsCandidates = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
    const explicit = (process.env.REACT_APP_WS_URL || "").trim();
    const candidates = [];

    if (explicit) {
        candidates.push(explicit);
    }

    if (isDev) {
        // Local dev direct backend websocket.
        candidates.push(`${protocol}//localhost:8080/ws/tickets`);
        candidates.push(`${protocol}//localhost:8080/api/ws/tickets`);
    } else {
        // Production first through nginx websocket proxy, then direct backend path.
        candidates.push(`${protocol}//${host}/api/ws/tickets`);
        candidates.push(`${protocol}//${host}/ws/tickets`);
    }

    return [...new Set(candidates)];
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
        this.wsEnabled = process.env.REACT_APP_USE_WEBSOCKET !== 'false';
        this.consecutiveAbnormalCloses = 0;
        this.wsCandidates = [];
        this.wsCandidateIndex = 0;
    }

    connect() {
        if (!this.wsEnabled) {
            return;
        }
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        if (!this.wsCandidates.length) {
            this.wsCandidates = resolveWsCandidates();
            this.wsCandidateIndex = 0;
        }
        const wsUrl = this.wsCandidates[Math.min(this.wsCandidateIndex, this.wsCandidates.length - 1)];
        console.log('[WS] Connecting to:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[WS] ✅ Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.consecutiveAbnormalCloses = 0;
                // Lock to the successful candidate after connect.
                this.wsCandidateIndex = Math.min(this.wsCandidateIndex, this.wsCandidates.length - 1);
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
                if (event.code === 1006) {
                    this.consecutiveAbnormalCloses += 1;
                } else {
                    this.consecutiveAbnormalCloses = 0;
                }
                if (this.consecutiveAbnormalCloses >= 3) {
                    this.wsEnabled = false;
                    this.shouldReconnect = false;
                    console.warn('[WS] Disabled after repeated abnormal disconnects. Falling back to non-WS refresh.');
                    return;
                }
                if (!this.isConnected && this.wsCandidateIndex < this.wsCandidates.length - 1) {
                    this.wsCandidateIndex += 1;
                }
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
        if (!this.wsEnabled || !this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
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
        this.wsCandidates = [];
        this.wsCandidateIndex = 0;
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
    if (realTimeService.wsEnabled) {
        realTimeService.connect();
    }
}

export default realTimeService;
