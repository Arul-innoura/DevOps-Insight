package com.devops.backend.service;

import com.devops.backend.config.TicketWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Service for publishing real-time events to connected clients via WebSocket and SSE.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class EventPublisherService {

    private final TicketWebSocketHandler webSocketHandler;
    
    // All connected SSE clients (legacy support)
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    /**
     * Register a new SSE emitter for a client connection.
     */
    public void addEmitter(SseEmitter emitter) {
        emitters.add(emitter);
        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            log.debug("SSE client disconnected (completion). Active clients: {}", emitters.size());
        });
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            log.debug("SSE client disconnected (timeout). Active clients: {}", emitters.size());
        });
        emitter.onError(e -> {
            emitters.remove(emitter);
            log.debug("SSE client disconnected (error). Active clients: {}", emitters.size());
        });
        log.info("SSE client connected. Active clients: {}", emitters.size());
    }

    /**
     * Publish an event to all connected clients via WebSocket (primary) and SSE (legacy).
     */
    public void publishEvent(String eventType, Object data) {
        // Primary: Broadcast via WebSocket for instant real-time updates
        try {
            webSocketHandler.broadcast(eventType, data);
        } catch (Exception e) {
            log.warn("Failed to broadcast via WebSocket: {}", e.getMessage());
        }
        
        // Legacy: Also send via SSE for backwards compatibility
        Map<String, Object> payload = Map.of(
            "type", eventType,
            "data", data,
            "timestamp", System.currentTimeMillis()
        );

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                    .name(eventType)
                    .data(payload));
            } catch (IOException e) {
                emitters.remove(emitter);
                log.debug("Failed to send SSE event, removing client. Remaining: {}", emitters.size());
            }
        }
        log.debug("Published event '{}' to {} WS + {} SSE clients", eventType, webSocketHandler.getActiveConnectionCount(), emitters.size());
    }

    /**
     * Publish ticket-related events.
     */
    public void publishTicketEvent(String action, Object ticketData) {
        String eventType = mapActionToEventType("ticket", action);
        publishEvent(eventType, Map.of("action", action, "ticket", ticketData));
    }

    /**
     * Publish project-related events.
     */
    public void publishProjectEvent(String action, Object projectData) {
        publishEvent("project:updated", Map.of("action", action, "project", projectData));
    }

    /**
     * Publish DevOps team-related events.
     */
    public void publishDevOpsTeamEvent(String action, Object memberData) {
        String eventType = "availability-updated".equals(action) ? "devops:availability_changed" : "devops:updated";
        publishEvent(eventType, Map.of("action", action, "member", memberData));
    }

    /**
     * Publish standup-related events.
     */
    public void publishStandupEvent(String action, Object standupData) {
        publishEvent("standup:updated", Map.of("action", action, "standup", standupData));
    }

    /**
     * Publish rota-related events.
     */
    public void publishRotaEvent(String action, Object rotaData) {
        publishEvent("rota:updated", Map.of("action", action, "rota", rotaData));
    }

    /**
     * Publish manager-related events.
     */
    public void publishManagerEvent(String action, Object managerData) {
        publishEvent("manager:updated", Map.of("action", action, "manager", managerData));
    }

    /**
     * Publish email notification events.
     */
    public void publishEmailEvent(String action, Object emailData) {
        publishEvent("email:sent", Map.of("action", action, "email", emailData));
    }

    /**
     * Get number of active connections.
     */
    public int getActiveConnectionCount() {
        return webSocketHandler.getActiveConnectionCount() + emitters.size();
    }
    
    /**
     * Map action to WebSocket event type for frontend compatibility.
     */
    private String mapActionToEventType(String entity, String action) {
        return switch (action) {
            case "created" -> entity + ":created";
            case "updated" -> entity + ":updated";
            case "deleted" -> entity + ":deleted";
            case "status-changed" -> entity + ":status_changed";
            case "assigned" -> entity + ":assigned";
            default -> entity + ":updated";
        };
    }
}
