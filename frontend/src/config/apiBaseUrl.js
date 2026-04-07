/**
 * Resolves the API base URL for fetch, EventSource, and WebSocket-derived URLs.
 * Docker builds often set REACT_APP_API_URL=/api (relative). fetch() resolves that,
 * but WebSocket code needs an absolute URL (https → wss).
 */
export const resolveApiBaseUrl = () => {
    const envUrl = (process.env.REACT_APP_API_URL || "").trim();

    if (typeof window === "undefined") {
        if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) {
            return envUrl.replace(/\/$/, "");
        }
        return envUrl || "http://localhost:8080/api";
    }

    const origin = window.location.origin.replace(/\/$/, "");
    const isLocalhost = /localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const envPointsLocal = /localhost|127\.0\.0\.1/i.test(envUrl);

    if (!isLocalhost && envPointsLocal) {
        return `${origin}/api`;
    }

    if (envUrl.startsWith("/")) {
        return `${origin}${envUrl.replace(/\/$/, "")}`;
    }

    if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) {
        return envUrl.replace(/\/$/, "");
    }

    return envUrl ? envUrl.replace(/\/$/, "") : `${origin}/api`;
};
