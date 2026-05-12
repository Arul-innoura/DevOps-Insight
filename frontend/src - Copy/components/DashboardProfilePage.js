import React from "react";
import { LogOut } from "lucide-react";

function initialsFromName(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DEFAULT_ROLE_LABELS = {
    admin: "Administrator",
    devops: "DevOps Team",
    user: "Standard User"
};

/**
 * Profile view aligned with ShipIt sidebar footer / navbar: identity strip + account details card.
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
    children
}) {
    const badgeLabel = roleLabel || DEFAULT_ROLE_LABELS[roleKey] || "Member";

    return (
        <div className="profile-page">
            <div className="profile-page-navbar" role="region" aria-label="Signed-in user">
                <div className="profile-page-navbar-main">
                    <div className="profile-page-avatar" style={{ background: avatarColor }} aria-hidden>
                        {initialsFromName(userName)}
                    </div>
                    <div className="profile-page-navbar-text">
                        <span className="profile-page-navbar-name">{userName}</span>
                        <span className="profile-page-navbar-email" title={userEmail}>
                            {userEmail}
                        </span>
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
            </div>

            <div className="analytics-card profile-page-panel">
                <h3 className="profile-page-panel-title">Account details</h3>
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
                            <span className={`sb-role-badge ${roleKey} profile-page-badge-inline`}>{badgeLabel}</span>
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
