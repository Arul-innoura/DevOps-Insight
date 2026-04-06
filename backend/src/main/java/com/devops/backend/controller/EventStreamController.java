package com.devops.backend.controller;

import com.devops.backend.service.EventPublisherService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

/**
 * Controller for Server-Sent Events (SSE) streaming.
 * Provides real-time event subscription for clients.
 */
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
@Slf4j
public class EventStreamController {

    private final EventPublisherService eventPublisherService;

    // Timeout: 30 minutes (in milliseconds)
    private static final long SSE_TIMEOUT = 30 * 60 * 1000L;

    /**
     * Subscribe to real-time events via SSE.
     * Connection stays open until client disconnects or timeout.
     */
    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public SseEmitter subscribe() {
        log.info("New SSE subscription request");
        
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        eventPublisherService.addEmitter(emitter);
        
        // Send initial connection confirmation
        try {
            emitter.send(SseEmitter.event()
                .name("connected")
                .data(Map.of(
                    "status", "connected",
                    "timestamp", System.currentTimeMillis()
                )));
        } catch (IOException e) {
            log.error("Failed to send initial SSE event", e);
        }
        
        return emitter;
    }

    /**
     * Get current connection status (for debugging/monitoring).
     */
    @GetMapping("/status")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin')")
    public Map<String, Object> getStatus() {
        return Map.of(
            "activeConnections", eventPublisherService.getActiveConnectionCount(),
            "timestamp", System.currentTimeMillis()
        );
    }
}
