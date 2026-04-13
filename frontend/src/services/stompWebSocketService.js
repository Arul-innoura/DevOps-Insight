/**
 * Enterprise WebSocket Service - Production Ready for 100+ Users
 * - Native WebSocket (no external dependencies like SockJS)
 * - Silent background operation - no UI spinners
 * - Instant data updates without page refresh
 * - Auto-reconnect with exponential backoff
 */

import { resolveApiBaseUrl } from "../config/apiBaseUrl";

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
        // Match REST API origin (REACT_APP_API_URL may be absolute or /api on same host).
        const apiBase = resolveApiBaseUrl().replace(/\/$/, "");
        if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
            const wsApiBase = apiBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
            candidates.push(`${wsApiBase}/ws/tickets`);
            const withoutApiSuffix = wsApiBase.replace(/\/api$/i, "");
            if (withoutApiSuffix !== wsApiBase) {
                candidates.push(`${withoutApiSuffix}/ws/tickets`);
            }
        }
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
    DISCONNECTED: 'disconnected',
    CACHE_INVALIDATE: 'cache:invalidate'
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
        this.pongTimeout = null;
        this.shouldReconnect = true;
        this.wsEnabled = process.env.REACT_APP_USE_WEBSOCKET !== 'false';
        this.consecutiveAbnormalCloses = 0;
        this.wsCandidates = [];
        this.wsCandidateIndex = 0;
        this.lastPongAt = 0;
        this.lastPingAt = 0;
        this.abnormalCloseTimestamps = [];
        this.recentMessages = new Map();
        this.messageDedupWindowMs = 500;
    }

    connect() {
        if (!this.wsEnabled) {
            return;
        }
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        // Clear any scheduled reconnect once we actively try to connect.
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
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
                this.abnormalCloseTimestamps = [];
                // Lock to the successful candidate after connect.
                this.wsCandidateIndex = Math.min(this.wsCandidateIndex, this.wsCandidates.length - 1);
                this.startPing();
                this.emit(WS_MESSAGE_TYPES.CONNECTED, { connected: true });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'pong') {
                        this.lastPongAt = Date.now();
                        this.clearPongTimeout();
                        return;
                    }
                    if (message.type && message.type !== 'pong') {
                        if (this.isDuplicateMessage(message)) {
                            return;
                        }
                        const invalidateHint = this.getCacheInvalidationHint(message.type);
                        if (invalidateHint) {
                            this.emit(WS_MESSAGE_TYPES.CACHE_INVALIDATE, invalidateHint);
                        }
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
                this.clearPongTimeout();
                this.emit(WS_MESSAGE_TYPES.DISCONNECTED, { connected: false });
                if (event.code === 1006) {
                    this.consecutiveAbnormalCloses += 1;
                    this.abnormalCloseTimestamps.push(Date.now());
                    // Keep only recent abnormal closes (rolling window).
                    this.abnormalCloseTimestamps = this.abnormalCloseTimestamps.filter(ts => Date.now() - ts < 60000);
                } else {
                    this.consecutiveAbnormalCloses = 0;
                    this.abnormalCloseTimestamps = [];
                }
                // Do not permanently disable WS on flaky networks; just back off.
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

        const base = Math.min(this.baseDelay * Math.pow(1.6, this.reconnectAttempts), this.maxDelay);
        // Add jitter to avoid reconnect storms when many clients drop together.
        const jitter = Math.floor(Math.random() * 400);
        const delay = base + jitter;
        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    startPing() {
        this.stopPing();
        this.clearPongTimeout();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.lastPingAt = Date.now();
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (_e) {
                    // If send fails, close and let reconnect handle it.
                    try { this.ws.close(); } catch {}
                    return;
                }
                this.setPongTimeout();
            }
        }, 25000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    setPongTimeout() {
        this.clearPongTimeout();
        // If server/proxy drops the connection silently, force a reconnect quickly.
        this.pongTimeout = setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            console.warn('[WS] Pong timeout, closing socket to reconnect.');
            try { this.ws.close(); } catch {}
        }, 7000);
    }

    clearPongTimeout() {
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        this.stopPing();
        this.clearPongTimeout();
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

    getCacheInvalidationHint(eventType) {
        if (!eventType) return null;
        if (
            eventType === WS_MESSAGE_TYPES.TICKET_CREATED ||
            eventType === WS_MESSAGE_TYPES.TICKET_UPDATED ||
            eventType === WS_MESSAGE_TYPES.TICKET_DELETED ||
            eventType === WS_MESSAGE_TYPES.TICKET_STATUS_CHANGED ||
            eventType === WS_MESSAGE_TYPES.TICKET_ASSIGNED ||
            eventType === WS_MESSAGE_TYPES.SYNC_REQUIRED
        ) {
            return { scope: 'tickets', reason: eventType };
        }
        if (
            eventType === WS_MESSAGE_TYPES.DEVOPS_UPDATED ||
            eventType === WS_MESSAGE_TYPES.DEVOPS_AVAILABILITY_CHANGED
        ) {
            return { scope: 'devops-team', reason: eventType };
        }
        return null;
    }

    isDuplicateMessage(message) {
        const type = message?.type || "unknown";
        const payload = message?.data ?? null;
        let payloadKey = "";
        try {
            payloadKey = JSON.stringify(payload);
        } catch {
            payloadKey = String(payload);
        }
        const key = `${type}|${payloadKey}`;
        const now = Date.now();
        const lastTs = this.recentMessages.get(key);
        this.recentMessages.set(key, now);

        if (this.recentMessages.size > 250) {
            for (const [k, ts] of this.recentMessages.entries()) {
                if (now - ts > this.messageDedupWindowMs * 5) {
                    this.recentMessages.delete(k);
                }
            }
        }

        return typeof lastTs === "number" && (now - lastTs) <= this.messageDedupWindowMs;
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

    // Reconnect quickly when the browser comes back online.
    window.addEventListener('online', () => {
        if (realTimeService.wsEnabled) {
            realTimeService.shouldReconnect = true;
            realTimeService.reconnectAttempts = 0;
            realTimeService.connect();
        }
    });

    // When tab becomes visible again, refresh connection if needed.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && realTimeService.wsEnabled) {
            realTimeService.connect();
        }
    });
}

export default realTimeService;
