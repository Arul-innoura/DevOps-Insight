package com.devops.backend.service.prometheus;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thin HTTP wrapper around the Prometheus HTTP API ({@code /api/v1/query}).
 * One instance per JVM; one endpoint URL per environment, configured under
 * {@code app.prometheus.endpoints.<envKey>} in application.yml.
 *
 * <p>No auth — assumed to be on a network-restricted endpoint. Returns the
 * raw {@code data.result} JSON node so callers can decode arbitrary
 * label sets without needing typed DTOs for every metric we consume.
 */
@Component
@Slf4j
public class PrometheusClient {

    private final Map<String, String> endpoints = new ConcurrentHashMap<>();
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private final int timeoutSec;

    public PrometheusClient(PrometheusProperties props) {
        if (props.getEndpoints() != null) {
            props.getEndpoints().forEach((k, v) -> {
                if (v != null && !v.isBlank()) this.endpoints.put(k.toLowerCase(Locale.ROOT), v.trim());
            });
        }
        this.timeoutSec = Math.max(2, props.getRequestTimeoutSeconds());
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.max(2, timeoutSec / 2)))
                .build();
        log.info("PrometheusClient initialised — configured envs: {}", this.endpoints.keySet());
    }

    /** Lower-cased env keys with a non-empty endpoint URL. */
    public Set<String> availableEnvs() {
        return Collections.unmodifiableSet(endpoints.keySet());
    }

    public boolean hasEnv(String env) {
        return env != null && endpoints.containsKey(env.toLowerCase(Locale.ROOT));
    }

    /**
     * Run an instant Prometheus query. Returns the {@code data.result} JSON
     * array (vector / matrix / scalar / string per the API spec) or an empty
     * node on any error so callers can keep going.
     */
    public JsonNode query(String env, String promQL) {
        String url = endpoints.get(env == null ? "" : env.toLowerCase(Locale.ROOT));
        if (url == null) {
            log.debug("Prometheus query skipped — no endpoint configured for env={}", env);
            return mapper.createArrayNode();
        }
        try {
            String full = url + "?query=" + URLEncoder.encode(promQL, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(full))
                    .timeout(Duration.ofSeconds(timeoutSec))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("Prometheus {} {} -> HTTP {}", env, abbreviate(promQL), res.statusCode());
                return mapper.createArrayNode();
            }
            JsonNode root = mapper.readTree(res.body());
            if (!"success".equals(root.path("status").asText())) {
                log.warn("Prometheus {} {} -> status={} error={}", env, abbreviate(promQL),
                        root.path("status").asText(), root.path("error").asText());
                return mapper.createArrayNode();
            }
            JsonNode data = root.path("data").path("result");
            return data.isMissingNode() ? mapper.createArrayNode() : data;
        } catch (Exception ex) {
            log.warn("Prometheus query failed env={} q={}: {}", env, abbreviate(promQL), ex.getMessage());
            return mapper.createArrayNode();
        }
    }

    /**
     * Convenience: instant query → list of (labels, value) tuples for vector results.
     * Non-vector / NaN values are skipped.
     */
    public List<Sample> queryVector(String env, String promQL) {
        JsonNode arr = query(env, promQL);
        List<Sample> out = new ArrayList<>();
        if (!arr.isArray()) return out;
        for (JsonNode row : arr) {
            JsonNode metric = row.path("metric");
            JsonNode value = row.path("value");
            if (!value.isArray() || value.size() < 2) continue;
            double v;
            try { v = Double.parseDouble(value.get(1).asText()); }
            catch (Exception ex) { continue; }
            if (Double.isNaN(v) || Double.isInfinite(v)) continue;
            Map<String, String> labels = new HashMap<>();
            metric.fields().forEachRemaining(e -> labels.put(e.getKey(), e.getValue().asText()));
            out.add(new Sample(labels, v));
        }
        return out;
    }

    private static String abbreviate(String s) {
        if (s == null) return "";
        return s.length() <= 80 ? s : s.substring(0, 77) + "...";
    }

    /** Single instant-query result row. */
    public record Sample(Map<String, String> labels, double value) {
        public String label(String key) { return labels.getOrDefault(key, ""); }
        public String label(String key, String fallback) {
            String v = labels.get(key);
            return (v == null || v.isBlank()) ? fallback : v;
        }
    }
}
