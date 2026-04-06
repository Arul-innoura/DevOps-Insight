package com.devops.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket Handler for real-time ticket updates
 * Manages all connected clients and broadcasts updates instantly
 * Production-ready for 100+ concurrent users
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class TicketWebSocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("[WS] Client connected: {} (Total: {})", session.getId(), sessions.size());
        
        // Send connection confirmation
        sendToSession(session, Map.of(
            "type", "connected",
            "data", Map.of("sessionId", session.getId())
        ));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("[WS] Client disconnected: {} (Total: {})", session.getId(), sessions.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            Map<String, Object> payload = objectMapper.readValue(message.getPayload(), Map.class);
            String type = (String) payload.get("type");
            
            // Handle ping/pong for keep-alive
            if ("ping".equals(type)) {
                sendToSession(session, Map.of("type", "pong"));
            }
        } catch (Exception e) {
            log.debug("[WS] Failed to parse message: {}", e.getMessage());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.warn("[WS] Transport error for session {}: {}", session.getId(), exception.getMessage());
        sessions.remove(session);
    }

    /**
     * Broadcast message to all connected clients
     * Used by TicketService when tickets are created/updated/deleted
     */
    public void broadcast(String eventType, Object data) {
        Map<String, Object> message = Map.of(
            "type", eventType,
            "data", data,
            "timestamp", System.currentTimeMillis()
        );
        
        int sentCount = 0;
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                sendToSession(session, message);
                sentCount++;
            }
        }
        
        log.debug("[WS] Broadcasted {} to {} clients", eventType, sentCount);
    }

    private void sendToSession(WebSocketSession session, Object message) {
        try {
            if (session.isOpen()) {
                String json = objectMapper.writeValueAsString(message);
                session.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.warn("[WS] Failed to send message to session {}: {}", session.getId(), e.getMessage());
            sessions.remove(session);
        }
    }

    public int getActiveConnectionCount() {
        return sessions.size();
    }
}
