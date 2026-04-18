import { useEffect, useRef } from "react";
import { firstNameFromDisplay, speakHiName } from "../services/loadingGreetingTts";
import { getGreetingTtsEnabled } from "../services/notificationService";

/**
 * "Hi, {firstName}" once per page load (refresh = new mount).
 * - Fast initial load: speak after the loading screen closes (user sees dashboard first).
 * - Slow initial load: speak once while still on the loading screen so there is no long silent wait.
 */
const LONG_LOAD_SPEAK_AFTER_MS = 2800;

export function usePostInitialLoadHiTts(isInitialLoading, userName, userEmail, greetingTtsEnabled) {
    const playedRef = useRef(false);

    useEffect(() => {
        const allowHi =
            typeof greetingTtsEnabled === "boolean" ? greetingTtsEnabled : getGreetingTtsEnabled();
        if (!allowHi) return;

        const first =
            firstNameFromDisplay(userName) ??
            (typeof userEmail === "string" ? firstNameFromDisplay(userEmail) : null);
        if (!first) return;

        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            return;
        }

        let cancelled = false;

        const doSpeak = () => {
            if (cancelled || playedRef.current) return;
            const ok =
                typeof greetingTtsEnabled === "boolean" ? greetingTtsEnabled : getGreetingTtsEnabled();
            if (!ok) return;
            playedRef.current = true;
            speakHiName(first);
        };

        if (!isInitialLoading) {
            if (playedRef.current) return;

            const id = window.requestAnimationFrame(() => {
                if (!cancelled) doSpeak();
            });
            return () => {
                cancelled = true;
                window.cancelAnimationFrame(id);
                try {
                    window.speechSynthesis?.cancel();
                } catch {
                    /* ignore */
                }
            };
        }

        const tid = window.setTimeout(() => {
            if (!cancelled) doSpeak();
        }, LONG_LOAD_SPEAK_AFTER_MS);

        // Only clear the timer when loading finishes — do not cancel speech here or the in-loading greeting gets cut off.
        return () => {
            cancelled = true;
            window.clearTimeout(tid);
        };
    }, [isInitialLoading, userName, userEmail, greetingTtsEnabled]);
}
