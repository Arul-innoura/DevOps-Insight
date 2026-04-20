/**
 * Shared first-name parsing for loading UI. (Spoken greeting removed.)
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

/** @deprecated No-op; spoken greeting removed. */
export function speakHiName(_firstName) {}
