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
                        "http://opspilot.encipherhealht.com",
                        "https://opspilot.encipherhealht.com",
                        "http://opspilot.encipherhealth.com",
                        "https://opspilot.encipherhealth.com"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
        
        // Also allow WebSocket handshake (HTTP Upgrade)
        registry.addMapping("/ws/**")
                .allowedOrigins(
                        "http://localhost:3000",
                        "http://localhost:8080",
                        "http://opspilot.encipherhealht.com",
                        "https://opspilot.encipherhealht.com",
                        "http://opspilot.encipherhealth.com",
                        "https://opspilot.encipherhealth.com"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
