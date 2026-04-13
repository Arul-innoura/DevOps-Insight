import React from "react";
import { useMsal } from "@azure/msal-react";
import { LogOut, Users, ShieldCheck, Settings, LayoutDashboard } from "lucide-react";
import { useTestAuth } from "../../auth/TestAuthContext";

export const AdminDashboard = () => {
    const { instance, accounts } = useMsal();
    const { testUser, logoutTest, isTestAuthenticated } = useTestAuth();
    
    // Determine user info (Azure SSO or Test user)
    const account = isTestAuthenticated() ? testUser : accounts[0];
    const userName = account?.name || "Administrator";

    const handleLogout = () => {
        if (isTestAuthenticated()) {
            console.log("🧪 Logging out test user");
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
                    <ShieldCheck className="brand-icon" size={32} />
                    <h2 style={{ marginTop: '0.5rem' }}>Admin Portal</h2>
                </div>
                <nav className="sidebar-nav">
                    <a href="#" className="active"><LayoutDashboard size={18} /> Overview</a>
                    <a href="#"><Users size={18} /> User Management</a>
                    <a href="#"><Settings size={18} /> System Settings</a>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-role badge-admin">
                            {isTestAuthenticated() ? "Admin (Test)" : "Admin Access"}
                        </span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            <main className="dashboard-content">
                <header className="content-header">
                    <h1 style={{ fontSize: '2rem', fontWeight: '800' }}>Administrative Overview</h1>
                    <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Monitor system health and manage enterprise-wide permissions.</p>
                </header>
                
                <div className="stats-grid">
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>Active Users</span>
                        <div className="stat-value">2.4k</div>
                        <div style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.5rem' }}>↑ 12% from last month</div>
                    </div>
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>System Uptime</span>
                        <div className="stat-value">99.9%</div>
                        <div style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.5rem' }}>Stable</div>
                    </div>
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>Security Alerts</span>
                        <div className="stat-value" style={{ color: '#dc2626' }}>3</div>
                        <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.5rem' }}>Requires Attention</div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
