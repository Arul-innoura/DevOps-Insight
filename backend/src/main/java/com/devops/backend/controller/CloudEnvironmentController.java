package com.devops.backend.controller;

import com.devops.backend.config.CloudEnvironmentSeeder;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.service.CloudEnvironmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Managed Azure environments — admin-curated top level of the
 * Environment → Project → Microservice hierarchy.
 *
 * <p>Admin creates/edits; Admin & DevOps read (for dashboards and project configuration).
 */
@RestController
@RequestMapping("/api/environments")
@RequiredArgsConstructor
public class CloudEnvironmentController {

    private final CloudEnvironmentService service;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<CloudEnvironment> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public ResponseEntity<CloudEnvironment> get(@PathVariable String id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public CloudEnvironment create(@RequestBody CloudEnvironment body, @AuthenticationPrincipal Jwt jwt) {
        return service.create(body, actorFrom(jwt));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public CloudEnvironment update(@PathVariable String id,
                                   @RequestBody CloudEnvironment body,
                                   @AuthenticationPrincipal Jwt jwt) {
        return service.update(id, body, actorFrom(jwt));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public Map<String, Object> delete(@PathVariable String id) {
        service.delete(id);
        return Map.of("ok", true, "id", id);
    }

    @PostMapping("/refresh-prices")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public Map<String, Object> refreshPrices() {
        int updated = service.applyLatestPrices();
        return Map.of("ok", true, "refreshed", updated);
    }

    /**
     * Cloud Services tree: provider → environments[] (with sharedScope flag).
     * Drives the redesigned admin "Cloud Services" left nav.
     * AWS / GCP appear as visible-but-empty buckets until populated.
     */
    @GetMapping("/tree")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<Map<String, Object>> tree() {
        Map<String, List<CloudEnvironment>> byProvider = new LinkedHashMap<>();
        byProvider.put("AZURE", new ArrayList<>());
        byProvider.put("AWS", new ArrayList<>());
        byProvider.put("GCP", new ArrayList<>());
        for (CloudEnvironment env : service.list()) {
            String p = env.getProvider() == null ? "AZURE" : env.getProvider().toUpperCase(Locale.ROOT);
            byProvider.computeIfAbsent(p, k -> new ArrayList<>()).add(env);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, List<CloudEnvironment>> e : byProvider.entrySet()) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("provider", e.getKey());
            node.put("environments", e.getValue());
            node.put("enabled", "AZURE".equals(e.getKey()));
            out.add(node);
        }
        return out;
    }

    /** Default category template (compute, ai, storage, security, aks, network, …). */
    @GetMapping("/category-template")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<Map<String, Object>> categoryTemplate() {
        List<Map<String, Object>> out = new ArrayList<>();
        int i = 0;
        for (String[] kv : CloudEnvironmentSeeder.DEFAULT_CATEGORIES) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", kv[0]);
            row.put("displayName", kv[1]);
            row.put("order", i++);
            out.add(row);
        }
        return out;
    }

    private String actorFrom(Jwt jwt) {
        if (jwt == null) return "admin";
        String name = jwt.getClaimAsString("name");
        return name != null ? name : "admin";
    }
}
