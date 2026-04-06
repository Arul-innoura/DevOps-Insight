package com.devops.backend.config;

import com.devops.backend.security.SseTokenFilter;
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

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final SseTokenFilter sseTokenFilter;

    public SecurityConfig(SseTokenFilter sseTokenFilter) {
        this.sseTokenFilter = sseTokenFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configure(http))
            .csrf(csrf -> csrf.disable()) // Since it's a stateless API using POSTs
            .addFilterBefore(sseTokenFilter, BearerTokenAuthenticationFilter.class)
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/public/**").permitAll() // Public endpoints
                .requestMatchers("/ws/**").permitAll() // WebSocket endpoints don't use JWT
                .anyRequest().authenticated() // Everything else needs a generic authenticated JWT
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
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
