import React from "react";
import { useMsal } from "@azure/msal-react";
import { LogOut, Activity, Monitor, Terminal, Cpu } from "lucide-react";
import { useTestAuth } from "../../auth/TestAuthContext";

export const DevOpsDashboard = () => {
    const { instance, accounts } = useMsal();
    const { testUser, logoutTest, isTestAuthenticated } = useTestAuth();
    
    const account = isTestAuthenticated() ? testUser : accounts[0];
    const userName = account?.name || "DevOps Engineer";

    const handleLogout = () => {
        if (isTestAuthenticated()) {
            logoutTest();
            window.location.href = "/";
        } else {
            instance.logoutRedirect({
                postLogoutRedirectUri: "/",
            });
        }
    };

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <Terminal className="brand-icon" size={32} />
                    <h2 style={{ marginTop: '0.5rem' }}>DevOps Hub</h2>
                </div>
                <nav className="sidebar-nav">
                    <a href="#" className="active"><Activity size={18} /> Pipelines</a>
                    <a href="#"><Monitor size={18} /> Infrastructure</a>
                    <a href="#"><Cpu size={18} /> Clusters</a>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-role badge-devops">
                            {isTestAuthenticated() ? "DevOps (Test)" : "Engineering Access"}
                        </span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            <main className="dashboard-content">
                <header className="content-header">
                    <h1 style={{ fontSize: '2rem', fontWeight: '800' }}>Infrastructure & Deployment</h1>
                    <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Monitor and manage automated pipelines and cloud resources.</p>
                </header>

                <div className="stats-grid">
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>Build Success Rate</span>
                        <div className="stat-value">94%</div>
                        <div style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.5rem' }}>↑ 2% increase</div>
                    </div>
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>Avg. Deploy Time</span>
                        <div className="stat-value">4m 12s</div>
                        <div style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.5rem' }}>Efficient</div>
                    </div>
                    <div className="stat-card">
                        <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '600' }}>Active Clusters</span>
                        <div className="stat-value">8</div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.5rem' }}>All Healthy</div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DevOpsDashboard;
