package com.devops.backend.service.autobuild;

import com.devops.backend.model.autobuild.JenkinsConnection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thin wrapper around the Jenkins HTTP API used by the auto-build orchestrator.
 *
 * <p>All methods take an explicit {@link JenkinsConnection} so a single backend
 * can talk to multiple Jenkins instances (one per project).
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class JenkinsClient {

    /**
     * Shared cookie jar ensures the JSESSIONID obtained during the crumb fetch
     * is re-sent on the subsequent POST, which fixes HTTP 401 on Jenkins
     * instances that tie the crumb to a session cookie.
     */
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    /** Result of a buildWithParameters call (queue location). */
    @Data
    public static class TriggerResult {
        private final String queueLocation;
    }

    /** Result of polling a queue item. */
    @Data
    public static class QueueItem {
        private final boolean cancelled;
        private final boolean executable;
        private final Long buildNumber;
        private final String buildUrl;
        private final String why;
    }

    /** Result of polling a build. */
    @Data
    public static class BuildStatus {
        private final boolean building;
        private final String result; // SUCCESS, FAILURE, ABORTED, UNSTABLE, null while building
        private final long durationMs;
        private final long estimatedDurationMs;
        private final long timestamp;
    }

    /** Result of progressive console fetch. */
    @Data
    public static class ConsoleChunk {
        private final String text;
        private final boolean hasMore;
        private final long nextStart;
    }

    /** Connectivity check (used by "Test Connection" in admin UI). */
    @Data
    public static class ConnectionCheck {
        private final boolean ok;
        private final String version;
        private final String message;
    }

    /**
     * GET /api/json — confirms the connection works and returns the Jenkins version header.
     */
    public ConnectionCheck testConnection(JenkinsConnection conn) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(joinUrl(conn.getJenkinsUrl(), "/api/json")))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", basicAuth(conn))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 401) {
                return new ConnectionCheck(false, null,
                        "Jenkins returned HTTP 401 — check your Jenkins username (not email) and API token. "
                        + "Generate the token at: Jenkins → User → Configure → API Token → Add new Token.");
            }
            if (resp.statusCode() == 403) {
                return new ConnectionCheck(false, null,
                        "Jenkins returned HTTP 403 — the user exists but lacks permission. "
                        + "Ensure the account has 'Overall/Read' and 'Job/Build' permissions.");
            }
            if (resp.statusCode() / 100 != 2) {
                return new ConnectionCheck(false, null,
                        "Jenkins returned HTTP " + resp.statusCode());
            }
            String version = resp.headers().firstValue("X-Jenkins").orElse("unknown");
            return new ConnectionCheck(true, version, "Connected");
        } catch (Exception e) {
            log.warn("[JenkinsClient] testConnection failed: {}", e.getMessage());
            return new ConnectionCheck(false, null, e.getMessage());
        }
    }

    /**
     * Trigger a build — convenience overload that passes {@code useParameters=true}.
     */
    public TriggerResult triggerBuild(JenkinsConnection conn, String jobPath, Map<String, String> params)
            throws Exception {
        return triggerBuild(conn, jobPath, params, true);
    }

    /**
     * Trigger a build.
     *
     * @param useParameters when {@code true}, POST to buildWithParameters (auto-falls back to
     *                      /build on HTTP 400 if the job is not parameterized).
     *                      When {@code false}, POST directly to /build with no form body.
     */
    public TriggerResult triggerBuild(JenkinsConnection conn, String jobPath, Map<String, String> params,
                                      boolean useParameters) throws Exception {
        if (!useParameters) {
            return triggerPlainBuild(conn, jobPath);
        }
        String url = joinUrl(conn.getJenkinsUrl(), jobUrl(jobPath) + "/buildWithParameters");
        StringBuilder form = new StringBuilder();
        for (Map.Entry<String, String> e : params.entrySet()) {
            if (form.length() > 0) form.append('&');
            form.append(java.net.URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8))
                    .append('=')
                    .append(java.net.URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), StandardCharsets.UTF_8));
        }
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", basicAuth(conn))
                .header("Content-Type", "application/x-www-form-urlencoded");
        addCrumb(conn, req);
        HttpRequest built = req.POST(HttpRequest.BodyPublishers.ofString(form.toString())).build();

        HttpResponse<String> resp = http.send(built, HttpResponse.BodyHandlers.ofString());

        // Jenkins returns 400 when the job has no parameters defined.
        // Transparently fall back to the plain /build endpoint.
        if (resp.statusCode() == 400) {
            log.info("[JenkinsClient] {} is not parameterized — falling back to /build", jobPath);
            return triggerPlainBuild(conn, jobPath);
        }

        if (resp.statusCode() / 100 != 2 && resp.statusCode() != 201) {
            throw new RuntimeException("Jenkins trigger failed: HTTP " + resp.statusCode() + " " + resp.body());
        }
        String location = resp.headers().firstValue("Location").orElse(null);
        if (location == null) {
            throw new RuntimeException("Jenkins trigger missing Location header");
        }
        return new TriggerResult(location);
    }

    /**
     * Trigger a plain (non-parameterized) build: POST {jobPath}/build
     */
    public TriggerResult triggerPlainBuild(JenkinsConnection conn, String jobPath) throws Exception {
        String url = joinUrl(conn.getJenkinsUrl(), jobUrl(jobPath) + "/build");
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", basicAuth(conn))
                .header("Content-Type", "application/x-www-form-urlencoded");
        addCrumb(conn, req);
        HttpResponse<String> resp = http.send(
                req.POST(HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2 && resp.statusCode() != 201) {
            throw new RuntimeException("Jenkins trigger failed: HTTP " + resp.statusCode() + " " + resp.body());
        }
        String location = resp.headers().firstValue("Location").orElse(null);
        if (location == null) {
            throw new RuntimeException("Jenkins trigger missing Location header");
        }
        return new TriggerResult(location);
    }

    /**
     * Poll a queue item to discover whether the build has been picked up by an executor.
     */
    public QueueItem pollQueue(JenkinsConnection conn, String queueLocation) throws Exception {
        String url = queueLocation;
        if (!url.endsWith("/api/json")) {
            url = url + (url.endsWith("/") ? "api/json" : "/api/json");
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", basicAuth(conn))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            throw new RuntimeException("Queue poll failed: HTTP " + resp.statusCode());
        }
        JsonNode root = mapper.readTree(resp.body());
        boolean cancelled = root.path("cancelled").asBoolean(false);
        JsonNode exec = root.path("executable");
        boolean executable = exec != null && !exec.isMissingNode() && !exec.isNull();
        Long buildNumber = executable ? exec.path("number").asLong() : null;
        String buildUrl = executable ? exec.path("url").asText(null) : null;
        String why = root.path("why").asText(null);
        return new QueueItem(cancelled, executable, buildNumber, buildUrl, why);
    }

    /**
     * Fetch build status via GET {buildUrl}api/json.
     */
    public BuildStatus getBuildStatus(JenkinsConnection conn, String buildUrl) throws Exception {
        String url = buildUrl.endsWith("/") ? buildUrl + "api/json" : buildUrl + "/api/json";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", basicAuth(conn))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            throw new RuntimeException("Build status poll failed: HTTP " + resp.statusCode());
        }
        JsonNode root = mapper.readTree(resp.body());
        return new BuildStatus(
                root.path("building").asBoolean(false),
                root.hasNonNull("result") ? root.path("result").asText() : null,
                root.path("duration").asLong(0L),
                root.path("estimatedDuration").asLong(0L),
                root.path("timestamp").asLong(0L)
        );
    }

    /**
     * Fetch the next chunk of progressive console text (Jenkins streams logs as they grow).
     * Returns the new text, plus the next start offset and whether more is coming.
     */
    public ConsoleChunk getProgressiveLog(JenkinsConnection conn, String buildUrl, long start) throws Exception {
        String url = buildUrl + (buildUrl.endsWith("/") ? "" : "/") + "logText/progressiveText?start=" + start;
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", basicAuth(conn))
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            throw new RuntimeException("Progressive log fetch failed: HTTP " + resp.statusCode());
        }
        long nextStart = Long.parseLong(resp.headers().firstValue("X-Text-Size").orElse(String.valueOf(start)));
        boolean hasMore = "true".equalsIgnoreCase(resp.headers().firstValue("X-More-Data").orElse("false"));
        return new ConsoleChunk(resp.body(), hasMore, nextStart);
    }

    /**
     * Stop a running build: POST {buildUrl}stop.
     */
    public void stopBuild(JenkinsConnection conn, String buildUrl) throws Exception {
        String url = buildUrl + (buildUrl.endsWith("/") ? "" : "/") + "stop";
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", basicAuth(conn));
        addCrumb(conn, req);
        HttpResponse<String> resp = http.send(req.POST(HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2 && resp.statusCode() != 302) {
            throw new RuntimeException("Stop build failed: HTTP " + resp.statusCode());
        }
    }

    /**
     * GET {jobUrl}/lastSuccessfulBuild/api/json — used to seed an ETA before the build starts.
     */
    public Long getEstimatedDuration(JenkinsConnection conn, String jobPath) {
        try {
            String url = joinUrl(conn.getJenkinsUrl(),
                    jobUrl(jobPath) + "/lastSuccessfulBuild/api/json");
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", basicAuth(conn))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) return null;
            JsonNode root = mapper.readTree(resp.body());
            long est = root.path("duration").asLong(0L);
            return est > 0 ? est : null;
        } catch (Exception e) {
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stage detection — best-effort parser for typical Jenkinsfile output.
    // ─────────────────────────────────────────────────────────────────────────

    private static final Pattern STAGE_PATTERN = Pattern.compile("\\[Pipeline\\]\\s*(?:\\{\\s*)?\\(([^)]+)\\)");

    /**
     * Scan a console chunk for the most recent "[Pipeline] ( Stage Name )" marker.
     * Returns null if none found.
     */
    public String detectStage(String text) {
        if (text == null || text.isEmpty()) return null;
        Matcher m = STAGE_PATTERN.matcher(text);
        String last = null;
        while (m.find()) {
            last = m.group(1).trim();
        }
        return last;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // helpers
    // ─────────────────────────────────────────────────────────────────────────

    private static String basicAuth(JenkinsConnection conn) {
        String creds = (conn.getJenkinsUser() == null ? "" : conn.getJenkinsUser())
                + ":" + (conn.getJenkinsApiToken() == null ? "" : conn.getJenkinsApiToken());
        return "Basic " + Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8));
    }

    private void addCrumb(JenkinsConnection conn, HttpRequest.Builder req) {
        try {
            String crumbPath = conn.getCrumbPath() == null || conn.getCrumbPath().isBlank()
                    ? "/crumbIssuer/api/json"
                    : conn.getCrumbPath();
            HttpRequest crumbReq = HttpRequest.newBuilder(URI.create(joinUrl(conn.getJenkinsUrl(), crumbPath)))
                    .timeout(Duration.ofSeconds(8))
                    .header("Authorization", basicAuth(conn))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(crumbReq, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 == 2) {
                JsonNode root = mapper.readTree(resp.body());
                String field = root.path("crumbRequestField").asText("Jenkins-Crumb");
                String value = root.path("crumb").asText(null);
                if (value != null) {
                    req.header(field, value);
                }
            }
        } catch (Exception e) {
            // Crumb is optional; many Jenkins setups disable CSRF for API calls.
            log.debug("[JenkinsClient] crumb fetch skipped: {}", e.getMessage());
        }
    }

    /** Convert a "folder/job" path to "/job/folder/job/job". */
    private static String jobUrl(String jobPath) {
        if (jobPath == null || jobPath.isBlank()) return "";
        String trimmed = jobPath.replaceAll("^/+", "").replaceAll("/+$", "");
        StringBuilder sb = new StringBuilder();
        for (String seg : trimmed.split("/")) {
            if (seg.isBlank()) continue;
            sb.append("/job/").append(java.net.URLEncoder.encode(seg, StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private static String joinUrl(String base, String path) {
        if (base == null) base = "";
        String b = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        String p = path.startsWith("/") ? path : "/" + path;
        return b + p;
    }

    /** Convenience map builder used by orchestrator. */
    public static Map<String, String> params() {
        return new LinkedHashMap<>();
    }
}
