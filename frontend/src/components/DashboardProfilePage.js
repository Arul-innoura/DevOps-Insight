import React, { useEffect, useRef, useState } from "react";
import { LogOut, Camera, Trash2, Check, X } from "lucide-react";
import {
    getMyProfile,
    updateMyProfile,
    uploadMyAvatar,
    removeMyAvatar
} from "../services/profileService";

function initialsFromName(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstLetterFromName(name) {
    const trimmed = String(name || "").trim();
    return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

const DEFAULT_ROLE_LABELS = {
    admin: "Administrator",
    devops: "DevOps Team",
    user: "Standard User"
};

const MAX_AVATAR_BYTES = 1024 * 1024;

/**
 * Profile view aligned with ShipIt sidebar footer / navbar.
 * Now supports avatar upload (Azure Blob via /api/profile/me/avatar),
 * date-of-birth, and bio. Existing callers pass the same props — no
 * external interface change.
 */
export default function DashboardProfilePage({
    userName,
    userEmail,
    userPrincipalName,
    roleKey = "user",
    roleLabel,
    onSignOut,
    avatarColor = "#2563eb",
    signInHint = "Microsoft Entra ID (Azure AD)",
    onProfileUpdated, // optional — fires after avatar/bio/DOB changes
    children
}) {
    const badgeLabel = roleLabel || DEFAULT_ROLE_LABELS[roleKey] || "Member";

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [err, setErr] = useState("");
    const [ok, setOk] = useState("");

    // Edit-mode buffer (separate from persisted profile so we can cancel)
    const [bioDraft, setBioDraft] = useState("");
    const [dobDraft, setDobDraft] = useState("");
    const [editing, setEditing] = useState(false);

    const fileRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getMyProfile()
            .then((p) => {
                if (cancelled) return;
                setProfile(p || {});
                setBioDraft(p?.bio || "");
                setDobDraft(p?.dateOfBirth || "");
            })
            .catch((e) => {
                if (!cancelled) setErr(e?.message || "Failed to load profile");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const flashOk = (m) => {
        setOk(m);
        setErr("");
        setTimeout(() => setOk(""), 2500);
    };
    const flashErr = (m) => {
        setErr(m);
        setOk("");
    };

    const handleFileChange = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ""; // allow re-selecting the same file later
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            flashErr("Please choose an image file");
            return;
        }
        if (file.size > MAX_AVATAR_BYTES) {
            flashErr("Image must be under 1 MB");
            return;
        }
        setUploading(true);
        try {
            const { url } = await uploadMyAvatar(file);
            const next = { ...(profile || {}), profilePicUrl: url };
            setProfile(next);
            onProfileUpdated && onProfileUpdated(next);
            flashOk("Profile picture updated");
        } catch (e2) {
            flashErr(e2?.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        if (!profile?.profilePicUrl) return;
        setRemoving(true);
        try {
            await removeMyAvatar();
            const next = { ...(profile || {}), profilePicUrl: null };
            setProfile(next);
            onProfileUpdated && onProfileUpdated(next);
            flashOk("Profile picture removed");
        } catch (e2) {
            flashErr(e2?.message || "Remove failed");
        } finally {
            setRemoving(false);
        }
    };

    const handleStartEdit = () => {
        setBioDraft(profile?.bio || "");
        setDobDraft(profile?.dateOfBirth || "");
        setEditing(true);
        setErr("");
        setOk("");
    };

    const handleCancelEdit = () => {
        setEditing(false);
        setBioDraft(profile?.bio || "");
        setDobDraft(profile?.dateOfBirth || "");
        setErr("");
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await updateMyProfile({
                bio: bioDraft,
                dateOfBirth: dobDraft || ""
            });
            setProfile(updated);
            onProfileUpdated && onProfileUpdated(updated);
            setEditing(false);
            flashOk("Profile saved");
        } catch (e) {
            flashErr(e?.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const avatarUrl = profile?.profilePicUrl || null;
    const showInitialFallback = !avatarUrl;
    const fallbackLetter = firstLetterFromName(userName);

    return (
        <div className="profile-page">
            <div className="profile-page-navbar profile-hero" role="region" aria-label="Signed-in user">
                <div className={`profile-hero-accent profile-hero-accent--${roleKey}`} aria-hidden />
                <div className="profile-hero-body">
                <div className="profile-page-navbar-main">
                    <div className="profile-page-avatar-wrap">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={userName || "Profile"}
                                className="profile-page-avatar profile-page-avatar--img"
                            />
                        ) : (
                            <div
                                className="profile-page-avatar"
                                style={{ background: avatarColor }}
                                aria-hidden
                            >
                                {fallbackLetter}
                            </div>
                        )}
                        <button
                            type="button"
                            className="profile-page-avatar-edit"
                            onClick={() => fileRef.current?.click()}
                            title="Change profile picture"
                            disabled={uploading || removing}
                            aria-label="Change profile picture"
                        >
                            <Camera size={14} />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                            hidden
                            onChange={handleFileChange}
                        />
                    </div>
                    <div className="profile-page-navbar-text">
                        <span className="profile-page-navbar-name">{userName}</span>
                        <span className="profile-page-navbar-email" title={userEmail}>
                            {userEmail}
                        </span>
                        {avatarUrl && (
                            <button
                                type="button"
                                className="profile-page-avatar-remove-btn"
                                onClick={handleRemoveAvatar}
                                disabled={removing || uploading}
                            >
                                <Trash2 size={11} />
                                {removing ? "Removing…" : "Remove photo"}
                            </button>
                        )}
                    </div>
                </div>
                <div className="profile-page-navbar-actions">
                    <span className={`sb-role-badge ${roleKey}`}>{badgeLabel}</span>
                    {onSignOut && (
                        <button type="button" className="sb-logout-btn" onClick={onSignOut}>
                            <LogOut size={12} /> Sign out
                        </button>
                    )}
                </div>
                </div>{/* profile-hero-body */}
            </div>

            {(err || ok) && (
                <div
                    className={`profile-page-toast ${ok ? "is-ok" : "is-err"}`}
                    role="status"
                >
                    {ok || err}
                </div>
            )}

            <div className="profile-page-panel">
                <div className="profile-page-panel-header">
                    <h3 className="profile-page-panel-title">Personal details</h3>
                    {!editing ? (
                        <button
                            type="button"
                            className="profile-page-edit-btn"
                            onClick={handleStartEdit}
                            disabled={loading}
                        >
                            Edit
                        </button>
                    ) : (
                        <div className="profile-page-edit-actions">
                            <button
                                type="button"
                                className="profile-page-edit-btn cancel"
                                onClick={handleCancelEdit}
                                disabled={saving}
                            >
                                <X size={12} /> Cancel
                            </button>
                            <button
                                type="button"
                                className="profile-page-edit-btn save"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <Check size={12} /> {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    )}
                </div>

                <dl className="profile-page-dl">
                    <div className="profile-page-dl-row">
                        <dt>Display name</dt>
                        <dd>{userName}</dd>
                    </div>
                    <div className="profile-page-dl-row">
                        <dt>Email</dt>
                        <dd className="profile-page-wrap">{userEmail}</dd>
                    </div>
                    {userPrincipalName && userPrincipalName !== userEmail && (
                        <div className="profile-page-dl-row">
                            <dt>Sign-in ID</dt>
                            <dd className="profile-page-wrap">{userPrincipalName}</dd>
                        </div>
                    )}
                    <div className="profile-page-dl-row">
                        <dt>Role</dt>
                        <dd>
                            <span className={`sb-role-badge ${roleKey} profile-page-badge-inline`}>
                                {badgeLabel}
                            </span>
                        </dd>
                    </div>

                    <div className="profile-page-dl-row">
                        <dt>Date of birth</dt>
                        <dd>
                            {editing ? (
                                <input
                                    type="date"
                                    className="profile-page-input"
                                    value={dobDraft || ""}
                                    onChange={(e) => setDobDraft(e.target.value)}
                                    max={new Date().toISOString().slice(0, 10)}
                                />
                            ) : profile?.dateOfBirth ? (
                                new Date(profile.dateOfBirth + "T00:00:00").toLocaleDateString(
                                    undefined,
                                    { year: "numeric", month: "long", day: "numeric" }
                                )
                            ) : (
                                <span className="profile-page-empty">Not set</span>
                            )}
                        </dd>
                    </div>

                    <div className="profile-page-dl-row profile-page-dl-row--block">
                        <dt>Bio</dt>
                        <dd>
                            {editing ? (
                                <textarea
                                    className="profile-page-textarea"
                                    rows={3}
                                    value={bioDraft || ""}
                                    onChange={(e) => setBioDraft(e.target.value)}
                                    placeholder="A short bio shown on your profile…"
                                    maxLength={500}
                                />
                            ) : profile?.bio ? (
                                <span className="profile-page-bio">{profile.bio}</span>
                            ) : (
                                <span className="profile-page-empty">No bio yet</span>
                            )}
                        </dd>
                    </div>

                    <div className="profile-page-dl-row">
                        <dt>Authentication</dt>
                        <dd>{signInHint}</dd>
                    </div>
                </dl>
            </div>
            {children}
        </div>
    );
}

export { initialsFromName, firstLetterFromName };
