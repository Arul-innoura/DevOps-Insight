import React, { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, RefreshCw, X } from "lucide-react";
import { issueCaptcha, triggerBuild } from "../services/codeCutService";
import "../dashboards/LiveBuildView.css";

/**
 * "Verify human" captcha modal that appears after clicking "Trigger Build".
 *
 * Flow:
 *   1. On open, ask backend to issue a fresh challenge string.
 *   2. Render the challenge as an SVG with subtle distortion lines.
 *   3. User types it back; submit → backend verifies + starts the BuildExecution.
 *   4. On success, opens the live-build view in a new window/tab.
 */
export default function BuildCaptchaModal({ codeCutId, projectName, onClose, onTriggered }) {
    const [challenge, setChallenge] = useState("");
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    const refresh = async () => {
        if (!codeCutId) return;
        setLoading(true);
        setInput("");
        try {
            const data = await issueCaptcha(codeCutId);
            setChallenge(data?.challenge || "");
            setError(null); // clear error only after a successful refresh
        } catch (e) {
            setError(e.message || "Failed to load captcha");
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeCutId]);

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!input || submitting) return;

        // Open a blank tab synchronously — browsers only allow window.open in a
        // direct user-event handler (before any await).
        // IMPORTANT: Do NOT include "noopener" — the HTML spec requires browsers
        // to return null from window.open when noopener is set, making it
        // impossible to navigate the tab after the async call.
        const newWin = window.open("", "_blank", "width=1280,height=820");

        setSubmitting(true);
        setError(null);
        try {
            const exec = await triggerBuild(codeCutId, input);
            if (exec?.id) {
                const liveUrl = `${window.location.origin}/build/${exec.id}`;
                if (newWin) {
                    newWin.location.href = liveUrl;
                } else {
                    // newWin is null only if the user's browser blocked the popup.
                    // Best effort: try opening directly (user will need to allow popups).
                    window.open(liveUrl, "_blank");
                }
                onTriggered?.(exec);
                onClose?.();
            } else {
                // Backend returned no execution ID — keep modal open with a message.
                if (newWin) newWin.close();
                setError("Build triggered but no execution ID was returned. Please try again.");
            }
        } catch (err) {
            if (newWin) newWin.close();
            // Show the error and let the user read it — do NOT call refresh()
            // here because refresh() starts with setError(null) which would
            // immediately clear the message before the user sees it.
            setError(err.message || "Verification failed. Check the characters and try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="captcha-modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="captcha-modal" onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        position: "absolute", top: 14, right: 14,
                        background: "transparent", border: "none", cursor: "pointer", color: "#6b7280"
                    }}
                >
                    <X size={20} />
                </button>
                <h3 className="captcha-modal-title">
                    <ShieldCheck size={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "#6366f1" }} />
                    Verify human to trigger build
                </h3>
                <p className="captcha-modal-sub">
                    Project <strong>{projectName}</strong> — type the characters below to confirm
                    you're triggering this auto-build intentionally.
                </p>

                <div className="captcha-svg-wrap">
                    <CaptchaSvg text={challenge} loading={loading} />
                    <button type="button" className="captcha-refresh" onClick={refresh} disabled={loading}>
                        <RefreshCw size={11} /> New challenge
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        className="captcha-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        maxLength={8}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="•••••"
                        disabled={loading || submitting}
                    />
                    {error && <div className="captcha-error">{error}</div>}

                    <div className="captcha-actions">
                        <button
                            type="button"
                            className="captcha-btn captcha-btn-secondary"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="captcha-btn captcha-btn-primary"
                            disabled={!input || submitting || loading}
                        >
                            {submitting ? "Triggering…" : "Verify & Build"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/** Render the captcha challenge as a styled SVG with distortion lines. */
function CaptchaSvg({ text, loading }) {
    const chars = useMemo(() => (text || "").split(""), [text]);
    if (loading) {
        return (
            <svg viewBox="0 0 280 80" preserveAspectRatio="xMidYMid meet">
                <text x="140" y="48" textAnchor="middle" fontSize="14" fill="#94a3b8" fontFamily="sans-serif">
                    Generating challenge…
                </text>
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 280 80" preserveAspectRatio="xMidYMid meet">
            {/* speckle background */}
            {Array.from({ length: 36 }).map((_, i) => (
                <circle
                    key={`d-${i}`}
                    cx={(i * 37) % 280}
                    cy={(i * 19) % 80}
                    r={1.2 + ((i * 7) % 3) * 0.4}
                    fill={["#a5b4fc", "#fcd34d", "#fda4af"][i % 3]}
                    opacity={0.45}
                />
            ))}
            {/* distortion lines */}
            <path
                d="M 6 50 C 80 12, 200 70, 274 38"
                stroke="#6366f1"
                strokeWidth="1.6"
                fill="none"
                opacity="0.55"
            />
            <path
                d="M 8 28 C 80 60, 220 18, 272 56"
                stroke="#f59e0b"
                strokeWidth="1.4"
                fill="none"
                opacity="0.45"
            />
            {chars.map((c, i) => {
                const cx = 30 + i * 50;
                const rotate = ((i * 17) % 30) - 15;
                const colors = ["#1e3a8a", "#7c3aed", "#0f766e", "#b45309", "#9d174d"];
                return (
                    <text
                        key={`c-${i}`}
                        x={cx}
                        y={56}
                        textAnchor="middle"
                        fontSize="38"
                        fontFamily="Georgia, 'Times New Roman', serif"
                        fontWeight="700"
                        fill={colors[i % colors.length]}
                        transform={`rotate(${rotate}, ${cx}, 50)`}
                        style={{ userSelect: "none" }}
                    >
                        {c}
                    </text>
                );
            })}
        </svg>
    );
}
