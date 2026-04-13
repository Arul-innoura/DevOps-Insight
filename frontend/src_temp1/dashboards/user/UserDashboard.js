import React from "react";
import { useMsal } from "@azure/msal-react";
import { LogOut, User, FileText, Settings, Heart } from "lucide-react";
import { useTestAuth } from "../../auth/TestAuthContext";

export const UserDashboard = () => {
    const { instance, accounts } = useMsal();
    const { testUser, logoutTest, isTestAuthenticated } = useTestAuth();
    
    const account = isTestAuthenticated() ? testUser : accounts[0];
    const userName = account?.name || "Standard User";

    const handleLogout = () => {
        if (isTestAuthenticated()) {
            logoutTest();
            window.location.href = "/login";
        } else {
            instance.logoutRedirect({
                postLogoutRedirectUri: `${window.location.origin}/login`,
            });
        }
    };

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <User className="brand-icon" size={32} style={{ color: '#2563eb' }} />
                    <h2 style={{ marginTop: '0.5rem' }}>My Portal</h2>
                </div>
                <nav className="sidebar-nav">
                    <a href="#" className="active"><FileText size={18} /> My Requests</a>
                    <a href="#"><Settings size={18} /> Profile Settings</a>
                    <a href="#"><Heart size={18} /> Favorites</a>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-role badge-user">
                            {isTestAuthenticated() ? "User (Test)" : "Personal Access"}
                        </span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            <main className="dashboard-content">
                <header className="content-header">
                    <h1 style={{ fontSize: '2rem', fontWeight: '800' }}>Self-Service Hub</h1>
                    <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Manage your personal workspace and track infrastructure requests.</p>
                </header>

                <div style={{ marginTop: '2.5rem' }}>
                    <button className="microsoft-btn" style={{ background: '#2563eb', color: 'white', maxWidth: '200px', border: 'none' }}>
                        Create New Ticket
                    </button>
                </div>

                <div style={{ marginTop: '3rem' }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Your Recently Submitted Requests</h3>
                    <div style={{ padding: '3rem', border: '2px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                        No records found in your workspace history.
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UserDashboard;
