package com.devops.backend.service;

import com.devops.backend.config.TicketWebSocketHandler;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.DevOpsMember;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * WebSocket event broadcaster for real-time updates
 * Broadcasts events to all connected clients instantly
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventService {

    private final TicketWebSocketHandler webSocketHandler;

    public void broadcastTicketCreated(Ticket ticket) {
        webSocketHandler.broadcast("ticket:created", ticketToMap(ticket));
    }

    public void broadcastTicketUpdated(Ticket ticket) {
        webSocketHandler.broadcast("ticket:updated", ticketToMap(ticket));
    }

    public void broadcastTicketDeleted(String ticketId) {
        Map<String, String> payload = new HashMap<>();
        payload.put("ticketId", ticketId);
        webSocketHandler.broadcast("ticket:deleted", payload);
    }

    public void broadcastTicketStatusChanged(Ticket ticket) {
        webSocketHandler.broadcast("ticket:status_changed", ticketToMap(ticket));
    }

    public void broadcastTicketAssigned(Ticket ticket) {
        webSocketHandler.broadcast("ticket:assigned", ticketToMap(ticket));
    }

    public void broadcastDevOpsTeamUpdated(DevOpsMember member) {
        webSocketHandler.broadcast("devops:updated", memberToMap(member));
    }

    public void broadcastDevOpsAvailabilityChanged(DevOpsMember member) {
        webSocketHandler.broadcast("devops:availability_changed", memberToMap(member));
    }

    public void broadcastSyncRequired() {
        Map<String, String> payload = new HashMap<>();
        payload.put("message", "Data updated");
        webSocketHandler.broadcast("sync:required", payload);
    }

    private Map<String, Object> ticketToMap(Ticket ticket) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", ticket.getId());
        map.put("requestType", ticket.getRequestType() != null ? ticket.getRequestType().name() : null);
        map.put("productName", ticket.getProductName());
        map.put("status", ticket.getStatus() != null ? ticket.getStatus().name() : null);
        map.put("assignedTo", ticket.getAssignedTo());
        map.put("requestedBy", ticket.getRequestedBy());
        map.put("updatedAt", ticket.getUpdatedAt() != null ? ticket.getUpdatedAt().toString() : null);
        map.put("deleted", ticket.isDeleted());
        return map;
    }

    private Map<String, Object> memberToMap(DevOpsMember member) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", member.getId());
        map.put("name", member.getName());
        map.put("email", member.getEmail());
        map.put("availabilityStatus", member.getAvailability() != null ? member.getAvailability().name() : null);
        return map;
    }
}
