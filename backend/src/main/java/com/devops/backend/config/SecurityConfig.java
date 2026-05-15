package com.devops.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collection;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.stream.Collectors;

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           JwtAuthenticationConverter jwtAuthenticationConverter) throws Exception {
        http
            .cors(cors -> cors.configure(http))
            .csrf(csrf -> csrf.disable()) // Since it's a stateless API using POSTs
            .addFilterBefore(new SseTokenFilter(), BearerTokenAuthenticationFilter.class)
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/ws/**", "/api/ws/**").permitAll()
                .requestMatchers("/api/cluster-metrics/**").permitAll() // open for testing — lock down before prod
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
            );

        return http.build();
    }

    /**
     * Extracts 'roles' claim from Azure AD JWT and maps them into Spring Security GrantedAuthorities.
     * By default, it adds the prefix "APPROLE_" so that @PreAuthorize("hasAuthority('APPROLE_Admin')") works.
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new AzureAdRoleConverter());
        return converter;
    }

    /**
     * For SSE, EventSource cannot set Authorization; token is passed as {@code ?token=} and mapped to a Bearer header.
     */
    private static final class SseTokenFilter extends OncePerRequestFilter {

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain filterChain) throws ServletException, IOException {

            if (request.getRequestURI().contains("/api/events/stream")) {
                String token = request.getParameter("token");

                if (token != null && !token.isEmpty()) {
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

    private static class AzureAdRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>> {
        @Override
        public Collection<GrantedAuthority> convert(Jwt source) {
            List<String> roles = source.getClaimAsStringList("roles");
            if (roles == null || roles.isEmpty()) {
                return List.of();
            }

            return roles.stream()
                    .map(role -> new SimpleGrantedAuthority("APPROLE_" + role))
                    .collect(Collectors.toList());
        }
    }
}
