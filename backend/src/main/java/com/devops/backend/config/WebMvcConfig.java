package com.devops.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Allow requests from React frontend
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:3000",
                        "http://localhost:8080",
                        "http://shipit.encipherhealth.com",
                        "https://shipit.encipherhealth.com"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
        
        // Also allow WebSocket handshake (HTTP Upgrade)
        var wsOrigins = new String[]{
                "http://localhost:3000",
                "http://localhost:8080",
                "http://shipit.encipherhealth.com",
                "https://shipit.encipherhealth.com"
        };
        registry.addMapping("/ws/**")
                .allowedOrigins(wsOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
        registry.addMapping("/api/ws/**")
                .allowedOrigins(wsOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
