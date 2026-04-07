/**
 * Enterprise WebSocket Service for Real-Time Data Synchronization
 * Provides instant bi-directional communication with automatic reconnection
 * and optimistic UI update support.
 */

import { msalInstance, initializeMsal } from "../auth/msalInstance";
import { resolveApiBaseUrl } from "../config/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl();
const WS_BASE_URL = API_BASE_URL.replace(/^https?/i, (scheme) =>
    scheme.toLowerCase() === "https" ? "wss" : "ws"
);

// WebSocket message types
export const WS_MESSAGE_TYPES = {
    // Client -> Server
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',
    PING: 'ping',
    
    // Server -> Client
    PONG: 'pong',
    TICKET_CREATED: 'ticket:created',
    TICKET_UPDATED: 'ticket:updated',
    TICKET_DELETED: 'ticket:deleted',
    TICKET_STATUS_CHANGED: 'ticket:status_changed',
    TICKET_ASSIGNED: 'ticket:assigned',
    TICKET_NOTE_ADDED: 'ticket:note_added',
    PROJECT_UPDATED: 'project:updated',
    DEVOPS_TEAM_UPDATED: 'devops:updated',
    DEVOPS_AVAILABILITY_CHANGED: 'devops:availability_changed',
    SYNC_REQUIRED: 'sync:required',
    CONNECTED: 'connected',
    ERROR: 'error'
};

// Connection states
export const CONNECTION_STATES = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed'
};

class WebSocketService {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
        this.baseReconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.pingInterval = null;
        this.pongTimeout = null;
        this.connectionId = null;
        this.lastMessageTime = 0;
        this.messageQueue = [];
        this.subscriptions = new Set();
        this.onStateChangeCallbacks = new Set();
        this.useWebSocket = process.env.REACT_APP_USE_WEBSOCKET !== 'false';
        this.hasEverConnected = false;
        this.initialConnectFailures = 0;
    }

    /**
     * Get authentication token
     */
    async getAuthToken() {
        try {
            await initializeMsal();
            const accounts = msalInstance.getAllAccounts();
            const active = msalInstance.getActiveAccount() || accounts[0];
            if (!active) return null;
            const tokenResponse = await msalInstance.acquireTokenSilent({
                account: active,
                scopes: ["openid", "profile", "email"]
            });
            return tokenResponse.idToken;
        } catch (error) {
            console.error("[WebSocketService] Auth token error:", error);
            return null;
        }
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (!this.useWebSocket) {
            this.setConnectionState(CONNECTION_STATES.FAILED);
            return false;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log("[WebSocketService] Already connected");
            return true;
        }

        if (
            this.connectionState === CONNECTION_STATES.CONNECTING ||
            this.connectionState === CONNECTION_STATES.RECONNECTING
        ) {
            return false;
        }

        this.setConnectionState(CONNECTION_STATES.CONNECTING);
        const token = await this.getAuthToken();

        if (!token) {
            console.warn("[WebSocketService] No auth token available");
            this.setConnectionState(CONNECTION_STATES.FAILED);
            return false;
        }

        return new Promise((resolve) => {
            try {
                const wsUrl = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`;
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log("[WebSocketService] Connected");
                    this.connectionId = Date.now().toString(36);
                    this.reconnectAttempts = 0;
                    this.initialConnectFailures = 0;
                    this.hasEverConnected = true;
                    this.setConnectionState(CONNECTION_STATES.CONNECTED);
                    this.startPingInterval();
                    this.flushMessageQueue();
                    this.resubscribeAll();
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };

                this.ws.onerror = (error) => {
                    console.error("[WebSocketService] Error:", error);
                };

                this.ws.onclose = (event) => {
                    console.log("[WebSocketService] Disconnected:", event.code, event.reason);
                    this.handleDisconnect(event);
                    resolve(false);
                };

                // Connection timeout
                setTimeout(() => {
                    if (this.ws?.readyState === WebSocket.CONNECTING) {
                        console.warn("[WebSocketService] Connection timeout");
                        this.ws.close();
                        resolve(false);
                    }
                }, 10000);

            } catch (error) {
                console.error("[WebSocketService] Connection failed:", error);
                this.setConnectionState(CONNECTION_STATES.FAILED);
                resolve(false);
            }
        });
    }

    /**
     * Handle incoming WebSocket message
     */
    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.lastMessageTime = Date.now();

            // Handle pong
            if (message.type === WS_MESSAGE_TYPES.PONG) {
                this.clearPongTimeout();
                return;
            }

            // Handle connection confirmation
            if (message.type === WS_MESSAGE_TYPES.CONNECTED) {
                console.log("[WebSocketService] Server confirmed connection:", message.connectionId);
                return;
            }

            // Notify listeners
            this.notifyListeners(message.type, message.data || message);

            // Also notify "all" listeners
            this.notifyListeners('*', { type: message.type, data: message.data || message });

        } catch (error) {
            console.error("[WebSocketService] Message parse error:", error);
        }
    }

    /**
     * Handle disconnection with automatic reconnect
     */
    handleDisconnect(event = null) {
        this.stopPingInterval();
        this.clearPongTimeout();
        this.ws = null;

        // If WebSocket endpoint is unavailable, disable WS for this session and use SSE/polling.
        if (!this.hasEverConnected) {
            this.initialConnectFailures += 1;
            const closedAbnormally = event?.code === 1006 || event?.code === 1002 || event?.code === 1003;
            if (closedAbnormally || this.initialConnectFailures >= 2) {
                this.useWebSocket = false;
                this.setConnectionState(CONNECTION_STATES.FAILED);
                this.notifyListeners('connection-lost', { fallbackToPolling: true, websocketDisabled: true });
                console.warn("[WebSocketService] WebSocket endpoint unavailable. Falling back to SSE/polling.");
                return;
            }
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.setConnectionState(CONNECTION_STATES.RECONNECTING);
            const delay = Math.min(
                this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
                this.maxReconnectDelay
            );
            this.reconnectAttempts++;
            console.log(`[WebSocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        } else {
            console.error("[WebSocketService] Max reconnect attempts reached");
            this.setConnectionState(CONNECTION_STATES.FAILED);
            this.notifyListeners('connection-lost', { fallbackToPolling: true });
        }
    }

    /**
     * Send message through WebSocket
     */
    send(type, data = {}) {
        const message = { type, data, timestamp: Date.now() };

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        }

        // Queue message for later delivery
        this.messageQueue.push(message);
        return false;
    }

    /**
     * Flush queued messages after reconnection
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const message = this.messageQueue.shift();
            // Don't send stale messages (older than 30 seconds)
            if (Date.now() - message.timestamp < 30000) {
                this.ws.send(JSON.stringify(message));
            }
        }
    }

    /**
     * Subscribe to specific channels
     */
    subscribe(channel) {
        this.subscriptions.add(channel);
        this.send(WS_MESSAGE_TYPES.SUBSCRIBE, { channel });
    }

    /**
     * Unsubscribe from channel
     */
    unsubscribe(channel) {
        this.subscriptions.delete(channel);
        this.send(WS_MESSAGE_TYPES.UNSUBSCRIBE, { channel });
    }

    /**
     * Resubscribe to all channels after reconnection
     */
    resubscribeAll() {
        this.subscriptions.forEach(channel => {
            this.send(WS_MESSAGE_TYPES.SUBSCRIBE, { channel });
        });
    }

    /**
     * Start ping interval for keepalive
     */
    startPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send(WS_MESSAGE_TYPES.PING);
                this.setPongTimeout();
            }
        }, 25000); // Ping every 25 seconds
    }

    /**
     * Stop ping interval
     */
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Set timeout for pong response
     */
    setPongTimeout() {
        this.clearPongTimeout();
        this.pongTimeout = setTimeout(() => {
            console.warn("[WebSocketService] Pong timeout, reconnecting...");
            this.ws?.close();
        }, 5000);
    }

    /**
     * Clear pong timeout
     */
    clearPongTimeout() {
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
    }

    /**
     * Set connection state and notify listeners
     */
    setConnectionState(state) {
        this.connectionState = state;
        this.onStateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (e) {
                console.error("[WebSocketService] State change callback error:", e);
            }
        });
    }

    /**
     * Register listener for message type
     */
    on(messageType, callback) {
        if (!this.listeners.has(messageType)) {
            this.listeners.set(messageType, new Set());
        }
        this.listeners.get(messageType).add(callback);
        return () => this.off(messageType, callback);
    }

    /**
     * Remove listener
     */
    off(messageType, callback) {
        const typeListeners = this.listeners.get(messageType);
        if (typeListeners) {
            typeListeners.delete(callback);
        }
    }

    /**
     * Subscribe to all messages
     */
    onAll(callback) {
        return this.on('*', callback);
    }

    /**
     * Register connection state change listener
     */
    onStateChange(callback) {
        this.onStateChangeCallbacks.add(callback);
        return () => this.onStateChangeCallbacks.delete(callback);
    }

    /**
     * Notify listeners of message
     */
    notifyListeners(messageType, data) {
        const typeListeners = this.listeners.get(messageType);
        if (typeListeners) {
            typeListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error("[WebSocketService] Listener error:", e);
                }
            });
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Get current connection state
     */
    getConnectionState() {
        return this.connectionState;
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
        this.stopPingInterval();
        this.clearPongTimeout();
        if (this.ws) {
            this.ws.close(1000, "Client disconnect");
            this.ws = null;
        }
        this.setConnectionState(CONNECTION_STATES.DISCONNECTED);
    }

    /**
     * Force reconnect
     */
    reconnect() {
        this.reconnectAttempts = 0;
        this.disconnect();
        this.connect();
    }
}

// Singleton instance
export const websocketService = new WebSocketService();

// Auto-connect on visibility change
if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
        if (
            document.visibilityState === "visible" &&
            websocketService.useWebSocket &&
            websocketService.getConnectionState() !== CONNECTION_STATES.RECONNECTING &&
            websocketService.getConnectionState() !== CONNECTION_STATES.CONNECTING &&
            !websocketService.isConnected()
        ) {
            websocketService.connect().catch(console.error);
        }
    });
}

export default websocketService;
