package com.devops.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

/**
 * Filter to extract JWT token from query parameter for SSE endpoints.
 * EventSource API doesn't support custom headers, so we pass token via query param.
 */
@Component
public class SseTokenFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, 
                                    FilterChain filterChain) throws ServletException, IOException {
        
        // Only process SSE event stream requests
        if (request.getRequestURI().contains("/api/events/stream")) {
            String token = request.getParameter("token");
            
            if (token != null && !token.isEmpty()) {
                // Wrap request to add Authorization header
                HttpServletRequest wrappedRequest = new HttpServletRequestWrapper(request) {
                    @Override
                    public String getHeader(String name) {
                        if ("Authorization".equalsIgnoreCase(name)) {
                            return "Bearer " + token;
                        }
                        return super.getHeader(name);
                    }

                    @Override
                    public Enumeration<String> getHeaders(String name) {
                        if ("Authorization".equalsIgnoreCase(name)) {
                            return Collections.enumeration(List.of("Bearer " + token));
                        }
                        return super.getHeaders(name);
                    }

                    @Override
                    public Enumeration<String> getHeaderNames() {
                        List<String> names = Collections.list(super.getHeaderNames());
                        if (!names.contains("Authorization")) {
                            names.add("Authorization");
                        }
                        return Collections.enumeration(names);
                    }
                };
                
                filterChain.doFilter(wrappedRequest, response);
                return;
            }
        }
        
        filterChain.doFilter(request, response);
    }
}
