package com.devops.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Lazy;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

/**
 * WebSocket configuration for real-time bi-directional communication
 * Uses native WebSocket for maximum performance with 100+ concurrent users
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final TicketWebSocketHandler ticketWebSocketHandler;
    private final TicketWebSocketHandshakeInterceptor handshakeInterceptor;

    public WebSocketConfig(
            TicketWebSocketHandler ticketWebSocketHandler,
            TicketWebSocketHandshakeInterceptor handshakeInterceptor) {
        this.ticketWebSocketHandler = ticketWebSocketHandler;
        this.handshakeInterceptor = handshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // REST controllers live under /api; some gateways forward the browser path unchanged
        // (e.g. wss://host/api/ws/tickets → /api/ws/tickets on Spring). Register both paths.
        registry.addHandler(ticketWebSocketHandler, "/ws/tickets", "/api/ws/tickets")
                .addInterceptors(handshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    @Lazy
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(8192);
        container.setMaxBinaryMessageBufferSize(8192);
        // Keep connections alive across typical proxy/browser idle windows.
        // Client pings every ~25s; give generous idle timeout to avoid random disconnects.
        container.setMaxSessionIdleTimeout(10 * 60 * 1000L); // 10 minutes
        return container;
    }
}
