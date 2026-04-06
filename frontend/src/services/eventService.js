/**
 * Real-time Event Service using Server-Sent Events (SSE)
 * Connects to backend SSE stream for instant updates without polling.
 */

import { msalInstance, initializeMsal } from "../auth/msalInstance";

const resolveApiBaseUrl = () => {
    const envUrl = (process.env.REACT_APP_API_URL || "").trim();
    const origin = window.location.origin.replace(/\/$/, "");
    const isProdHost = !/localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const envPointsLocal = /localhost|127\.0\.0\.1/i.test(envUrl);
    if (isProdHost && envPointsLocal) {
        return `${origin}/api`;
    }
    return envUrl || `${origin}/api`;
};
const API_BASE_URL = resolveApiBaseUrl();

// Event types we listen to
export const EVENT_TYPES = {
    TICKET: "ticket",
    PROJECT: "project",
    DEVOPS_TEAM: "devops-team",
    STANDUP: "standup",
    ROTA: "rota",
    CONNECTED: "connected"
};

// Action types for events
export const EVENT_ACTIONS = {
    CREATED: "created",
    STATUS_UPDATED: "status-updated",
    ACTIVE_TOGGLED: "active-toggled",
    NOTE_ADDED: "note-added",
    ASSIGNED: "assigned",
    FORWARDED: "forwarded",
    DELETED: "deleted",
    MEMBER_ADDED: "member-added",
    MEMBER_UPSERTED: "member-upserted",
    AVAILABILITY_UPDATED: "availability-updated"
};

class EventService {
    constructor() {
        this.eventSource = null;
        this.listeners = new Map(); // Map<eventType, Set<callback>>
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
        this.connectionId = null;
        this.disabled = false;
    }

    /**
     * Get auth token for SSE connection
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
            console.error("[EventService] Failed to get auth token:", error);
            return null;
        }
    }

    /**
     * Connect to SSE stream
     */
    async connect() {
        if (this.disabled) {
            return;
        }
        if (this.eventSource || this.isConnecting) {
            console.log("[EventService] Already connected or connecting");
            return;
        }

        this.isConnecting = true;
        const token = await this.getAuthToken();
        
        if (!token) {
            console.warn("[EventService] No auth token, cannot connect to SSE");
            this.isConnecting = false;
            return;
        }

        try {
            // Use fetch with EventSource polyfill approach for auth header support
            // Standard EventSource doesn't support custom headers, so we use a workaround
            const url = `${API_BASE_URL}/events/stream`;
            
            // Create EventSource with token in query param (backend should validate)
            // Alternative: Use fetch-event-source library, but for simplicity we'll use polling fallback
            this.eventSource = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
            
            this.eventSource.onopen = () => {
                console.log("[EventService] SSE connection opened");
                this.reconnectAttempts = 0;
                this.isConnecting = false;
            };

            this.eventSource.onerror = (error) => {
                console.error("[EventService] SSE error:", error);
                if (this.eventSource?.readyState === EventSource.CLOSED) {
                    this.disable("SSE endpoint unavailable from gateway");
                    return;
                }
                this.handleDisconnect();
            };

            // Listen for specific event types
            Object.values(EVENT_TYPES).forEach(eventType => {
                this.eventSource.addEventListener(eventType, (event) => {
                    this.handleEvent(eventType, event);
                });
            });

            // Default message handler
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.notifyListeners("message", data);
                } catch (e) {
                    console.warn("[EventService] Failed to parse message:", e);
                }
            };

        } catch (error) {
            console.error("[EventService] Failed to connect:", error);
            this.isConnecting = false;
            this.handleDisconnect();
        }
    }

    /**
     * Handle incoming SSE event
     */
    handleEvent(eventType, event) {
        try {
            const data = JSON.parse(event.data);
            console.log(`[EventService] Received ${eventType} event:`, data);
            this.notifyListeners(eventType, data);
        } catch (e) {
            console.warn(`[EventService] Failed to parse ${eventType} event:`, e);
        }
    }

    /**
     * Handle disconnection and auto-reconnect
     */
    handleDisconnect() {
        if (this.disabled) {
            return;
        }
        this.isConnecting = false;
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
            console.log(`[EventService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        } else {
            console.error("[EventService] Max reconnect attempts reached, falling back to polling");
            this.notifyListeners("connection-lost", { fallbackToPolling: true });
        }
    }

    /**
     * Disconnect from SSE stream
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
        console.log("[EventService] Disconnected");
    }

    disable(reason = "SSE disabled") {
        this.disabled = true;
        this.isConnecting = false;
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.reconnectAttempts = this.maxReconnectAttempts;
        console.warn(`[EventService] ${reason}. Falling back to polling only.`);
        this.notifyListeners("connection-lost", { fallbackToPolling: true, reason });
    }

    /**
     * Subscribe to events
     * @param {string} eventType - Type of event to listen to (or "*" for all)
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);

        // Return unsubscribe function
        return () => {
            const typeListeners = this.listeners.get(eventType);
            if (typeListeners) {
                typeListeners.delete(callback);
            }
        };
    }

    /**
     * Subscribe to all events
     */
    subscribeAll(callback) {
        return this.subscribe("*", callback);
    }

    /**
     * Notify all listeners of an event
     */
    notifyListeners(eventType, data) {
        // Notify specific listeners
        const typeListeners = this.listeners.get(eventType);
        if (typeListeners) {
            typeListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error("[EventService] Listener error:", e);
                }
            });
        }

        // Notify "all" listeners
        const allListeners = this.listeners.get("*");
        if (allListeners) {
            allListeners.forEach(callback => {
                try {
                    callback({ type: eventType, ...data });
                } catch (e) {
                    console.error("[EventService] All-listener error:", e);
                }
            });
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return !this.disabled && this.eventSource && this.eventSource.readyState === EventSource.OPEN;
    }
}

// Singleton instance
export const eventService = new EventService();

// Auto-connect when module loads (if in browser and enabled)
const ENABLE_SSE = process.env.REACT_APP_ENABLE_SSE === "true";
if (typeof window !== "undefined" && ENABLE_SSE) {
    // Delay connection slightly to ensure auth is ready
    setTimeout(() => {
        eventService.connect().catch(console.error);
    }, 1000);
    
    // Reconnect on visibility change
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && !eventService.isConnected()) {
            eventService.connect().catch(console.error);
        }
    });
} else if (typeof window !== "undefined") {
    eventService.disable("SSE disabled by configuration");
}
