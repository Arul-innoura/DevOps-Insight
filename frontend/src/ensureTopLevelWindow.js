/**
 * Azure AD redirect + MSAL auth must run in a top-level browsing context.
 * Embedded iframes (intranet portals, Teams, etc.) trigger browser security errors
 * when OAuth tries to navigate this origin inside a frame.
 */
export let skipReactBootstrap = false;

(function ensureTopLevelWindow() {
    if (typeof window === "undefined") return;
    try {
        if (window.self !== window.top) {
            window.top.location.replace(window.self.location.href);
        }
    } catch {
        skipReactBootstrap = true;
        const href = window.location.href;
        const showFallback = () => {
            const root = document.getElementById("root");
            if (!root) return;
            root.innerHTML = [
                '<div style="font-family:system-ui,sans-serif;padding:2rem;max-width:28rem;margin:2rem auto;line-height:1.5">',
                "<h2 style=\"margin-top:0\">Open in a full browser tab</h2>",
                "<p>This portal cannot run inside an embedded frame (browser security). Open it directly or use the button below.</p>",
                "<p><a href=\"",
                href.replace(/"/g, "&quot;"),
                "\" target=\"_blank\" rel=\"noopener noreferrer\" ",
                'style="display:inline-block;margin-top:0.5rem;padding:0.65rem 1.1rem;background:#2563eb;color:#fff;',
                'text-decoration:none;border-radius:6px;font-weight:600">Open DevOps Portal</a></p>',
                "</div>"
            ].join("");
        };
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", showFallback);
        } else {
            showFallback();
        }
    }
})();
