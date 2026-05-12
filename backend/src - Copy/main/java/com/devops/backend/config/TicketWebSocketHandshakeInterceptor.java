package com.devops.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * Logs WebSocket handshakes and fails fast when reverse proxies strip {@code Upgrade}
 * (symptom in browser: close 1006; upstream may return HTTP 400 from Tomcat).
 */
@Component
public class TicketWebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(TicketWebSocketHandshakeInterceptor.class);

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes) {
        var path = request.getURI().getPath();
        var upgrade = request.getHeaders().getFirst("Upgrade");
        var connection = request.getHeaders().getFirst("Connection");
        if (upgrade == null || upgrade.isBlank()) {
            log.warn(
                    "[WS] Missing Upgrade header on handshake path={}. Outer reverse proxy must forward "
                            + "Upgrade and Connection to this app (see nginx: proxy_set_header Upgrade $http_upgrade).",
                    path);
            return false;
        }
        log.info("[WS] Handshake path={} Upgrade={} Connection={}", path, upgrade, connection);
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception) {
        if (exception != null) {
            log.warn("[WS] Handshake completed with error: {}", exception.getMessage());
        }
    }
}
