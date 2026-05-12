/**
 * User-profile API client.
 *
 * Talks to the /api/profile/* endpoints introduced for date-of-birth,
 * bio, and avatar (Azure Blob) management. Avatar upload bypasses
 * the JSON `apiRequest` helper because FormData needs the browser
 * to set its own Content-Type with a multipart boundary.
 */

import { apiRequest, fetchWithAuth } from "./apiClient";

const HARD_AVATAR_LIMIT_BYTES = 1024 * 1024; // keep client-side guard aligned with backend

export const getMyProfile = () => apiRequest("/profile/me");

export const updateMyProfile = ({ bio, dateOfBirth }) =>
    apiRequest("/profile/me", {
        method: "PUT",
        body: JSON.stringify({
            bio: bio == null ? "" : String(bio),
            dateOfBirth: dateOfBirth == null ? "" : String(dateOfBirth)
        })
    });

export async function uploadMyAvatar(file) {
    if (!file) throw new Error("No file selected");
    if (!file.type || !file.type.startsWith("image/")) {
        throw new Error("Please choose an image file");
    }
    if (file.size > HARD_AVATAR_LIMIT_BYTES) {
        throw new Error("Image must be under 1 MB");
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetchWithAuth("/profile/me/avatar", {
        method: "POST",
        body: form
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
    }
    return res.json();
}

export async function removeMyAvatar() {
    const res = await fetchWithAuth("/profile/me/avatar", { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
        throw new Error(`Failed to remove avatar (${res.status})`);
    }
    return true;
}

/** Lookup someone else's profile (for displaying their avatar elsewhere in the UI). */
export const getProfileByEmail = (email) =>
    apiRequest(`/profile/by-email?email=${encodeURIComponent(email)}`);
