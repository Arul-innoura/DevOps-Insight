/**
 * Shared first-name parsing + Web Speech "Hi, {name}" for post–initial-load greeting.
 */

/** First segment of an email local part: "john.doe" / "john_doe" → "john" for greeting */
function firstTokenFromEmailLocal(local) {
    if (!local || typeof local !== "string") return null;
    const segment = local.split(/[._+-]/)[0]?.trim();
    if (!segment || segment.length > 32) return null;
    if (/^\d+$/.test(segment)) return null;
    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

/** First token of display name — safe for greeting / TTS (handles email-style names from Azure AD). */
export function firstNameFromDisplay(name) {
    if (!name || typeof name !== "string") return null;
    const t = name.trim().split(/\s+/)[0];
    if (!t) return null;
    if (t.includes("@")) {
        const local = t.split("@")[0];
        return firstTokenFromEmailLocal(local);
    }
    if (t.length > 32) return null;
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Prefer a soft, friendly English voice when the OS exposes several (names vary by platform). */
function pickWarmGreetingVoice(voices) {
    if (!voices?.length) return null;
    const en = voices.filter((v) => /^en(-|$)/i.test(v.lang || ""));
    const pool = en.length ? en : voices;

    const score = (v) => {
        const n = (v.name || "").toLowerCase();
        let s = 0;
        if (/female|zira|samantha|karen|moira|aria|jenny|hazel|susan|sarah|victoria|nicole|amy|flo|ivy|joanna|kimberly|linda|lisa|emma|olivia|sophie|google.*female|microsoft.*zira|natural.*english.*female/i.test(n)) {
            s += 12;
        }
        if (v.localService) s += 2;
        if (/neural|natural|premium|enhanced/i.test(n)) s += 1;
        if (/male|david\b|mark\b|fred\b|daniel\b|alex\b|james\b|brian\b|thomas\b/i.test(n)) s -= 6;
        return s;
    };

    return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Speak "Hi, {firstName}" using browser text-to-speech (no network). */
export function speakHiName(firstName) {
    if (typeof window === "undefined" || !window.speechSynthesis || !firstName) return;

    const run = () => {
        try {
            window.speechSynthesis.cancel();
            const text = `Hi, ${firstName}`;
            const u = new SpeechSynthesisUtterance(text);
            // Slightly brighter + softer than default — reads warmer / more “cute” on most engines
            u.rate = 0.94;
            u.pitch = 1.12;
            u.volume = 0.98;
            const voices = window.speechSynthesis.getVoices();
            const voice = pickWarmGreetingVoice(voices);
            if (voice) u.voice = voice;
            window.speechSynthesis.speak(u);
        } catch {
            /* optional feature */
        }
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
        run();
    } else {
        window.speechSynthesis.addEventListener("voiceschanged", run, { once: true });
    }
}
