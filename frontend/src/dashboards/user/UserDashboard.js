import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { 
    LogOut, 
    User, 
    FileText, 
    UserCircle,
    Plus,
    RefreshCw,
    Filter,
    LayoutDashboard,
    Wifi,
    WifiOff,
    Bell,
    Mail,
    Search,
    Settings,
    TrendingUp,
    Clock,
    CheckCircle,
    AlertCircle,
    Zap
} from "lucide-react";
import { 
    TicketCard, 
    TicketFilters, 
    TicketDetailsModal,
    CreateTicketModal 
} from "../TicketComponents";
import { 
    getTicketsByUser,
    toggleTicketActiveStatus,
    addTicketNote,
    TICKET_STATUS,
    getDevOpsTeamMembers,
    DEVOPS_AVAILABILITY_STATUS,
    getProjects,
    getManagers,
    subscribeDataChanges
} from "../../services/ticketService";
import { useRealTimeSync, useConnectionStatus } from "../../services/useRealTimeSync";
import { useToast, SyncIndicator } from "../../services/ToastNotification";
import { getSoundSettings, setSoundEnabled, setVolume } from "../../services/notificationService";
import {
    getMyNotificationPreferences,
    saveMyNotificationPreferences
} from "../../services/userNotificationService";

export const UserDashboard = () => {
    const { instance, accounts } = useMsal();
    const toast = useToast();
    
    const account = accounts[0];
    const userName = account?.name || "Standard User";
    const userEmail = account?.username || "user@company.com";
    const userPrincipalName = account?.username || "";
    
    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('active');
    const [activeSection, setActiveSection] = useState('dashboard');
    const [devOpsMembers, setDevOpsMembers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [managers, setManagers] = useState([]);
    const [actionLoading, setActionLoading] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [soundSettings, setSoundSettings] = useState(getSoundSettings());
    const [emailNotifPrefs, setEmailNotifPrefs] = useState(null);
    const [emailNotifLoading, setEmailNotifLoading] = useState(false);
    const [emailNotifSaving, setEmailNotifSaving] = useState(false);
    
    const isLoadingRef = useRef(false);
    const filtersRef = useRef(filters);
    const activeTabRef = useRef(activeTab);
    
    // Keep refs in sync
    useEffect(() => { filtersRef.current = filters; }, [filters]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    useEffect(() => {
        if (activeSection !== "settings") return;
        let cancelled = false;
        setEmailNotifLoading(true);
        getMyNotificationPreferences()
            .then((p) => {
                if (!cancelled) {
                    setEmailNotifPrefs(p);
                    setEmailNotifLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setEmailNotifPrefs(null);
                    setEmailNotifLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [activeSection]);

    const handleEmailPrefToggle = (key) => {
        setEmailNotifPrefs((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
    };

    const handleSaveEmailPrefs = async () => {
        if (!emailNotifPrefs) return;
        setEmailNotifSaving(true);
        try {
            const saved = await saveMyNotificationPreferences({
                ticketStatusChanges: !!emailNotifPrefs.ticketStatusChanges,
                approvalRequests: !!emailNotifPrefs.approvalRequests,
                approvalCompleted: !!emailNotifPrefs.approvalCompleted,
                costApprovalUpdates: !!emailNotifPrefs.costApprovalUpdates,
                commentsAndUpdates: !!emailNotifPrefs.commentsAndUpdates
            });
            setEmailNotifPrefs(saved);
            toast.success("Saved", "Email notification preferences updated.");
        } catch (e) {
            toast.error("Error", e.message || "Could not save preferences");
        } finally {
            setEmailNotifSaving(false);
        }
    };

    const loadTickets = useCallback(async (silent = false) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        // Only show syncing on initial load, not on real-time updates
        if (!silent) setIsSyncing(true);
        try {
            const [userTickets, members, projectList, managerList] = await Promise.all([
                getTicketsByUser(userEmail),
                getDevOpsTeamMembers(),
                getProjects({ force: true }),
                getManagers(true, { force: true })
            ]);
            setDevOpsMembers(members);
            setProjects(projectList);
            setManagers(managerList);
            setTickets(userTickets);
            applyFilters(userTickets, filtersRef.current, activeTabRef.current);
            setSelectedTicket((prev) => {
                if (!prev?.id) return prev;
                const latest = userTickets.find((t) => t.id === prev.id);
                return latest || prev;
            });
        } finally {
            isLoadingRef.current = false;
            if (!silent) setIsSyncing(false);
        }
    }, [userEmail]);

    // Real-time updates via WebSocket - silent background refresh
    useRealTimeSync({
        onRefresh: () => loadTickets(true), // Silent refresh on real-time events
        playUpdateSound: true,
        enableWebSocket: true,
        enableSSE: false,
        pollingInterval: null // No polling - WebSocket only
    });

    useEffect(() => {
        const unsubscribe = subscribeDataChanges((detail) => {
            if (!detail?.scope) return;
            if (["tickets", "projects", "managers", "devops-team"].includes(detail.scope)) {
                loadTickets(true);
            }
        });
        return unsubscribe;
    }, [loadTickets]);

    const { isConnected, syncMethod } = useConnectionStatus();
    const lastSyncTime = null;
    const forceRefresh = () => loadTickets(false);
    
    const applyFilters = (ticketList, currentFilters, tab) => {
        let result = [...ticketList];
        
        // Apply tab filter
        if (tab === 'active') {
            // Active tab shows only active tickets (not marked inactive)
            result = result.filter(t => 
                t.isActive !== false && 
                ![TICKET_STATUS.COMPLETED, TICKET_STATUS.REJECTED, TICKET_STATUS.CLOSED].includes(t.status)
            );
        } else if (tab === 'completed') {
            result = result.filter(t => t.status === TICKET_STATUS.COMPLETED);
        } else if (tab === 'closed') {
            result = result.filter(t => t.status === TICKET_STATUS.CLOSED);
        } else if (tab === 'inactive') {
            // Show tickets marked as inactive by user
            result = result.filter(t => t.isActive === false);
        }
        
        // Apply other filters
        if (currentFilters.status) {
            result = result.filter(t => t.status === currentFilters.status);
        }
        if (currentFilters.requestType) {
            result = result.filter(t => t.requestType === currentFilters.requestType);
        }
        if (currentFilters.environment) {
            result = result.filter(t => t.environment === currentFilters.environment);
        }
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            result = result.filter(t => 
                t.id.toLowerCase().includes(searchLower) ||
                t.productName?.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            );
        }
        
        setFilteredTickets(result);
    };
    
    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        applyFilters(tickets, newFilters, activeTab);
    };
    
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        applyFilters(tickets, filters, tab);
    };
    
    const handleTicketCreated = () => {
        toast.success('Request Created', 'Your request has been submitted successfully');
        loadTickets().catch(() => {});
    };
    
    const handleToggleActiveStatus = async (ticketId, isActive) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, isActive: !!isActive } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, isActive: !!isActive } : ticket
        )));
        try {
            setActionLoading(isActive ? "Activating ticket..." : "Marking ticket inactive...");
            await toggleTicketActiveStatus(
                ticketId,
                { name: userName, email: userEmail },
                isActive
            );
            await loadTickets();
            setSelectedTicket(null); // Close the modal
            toast.success('Status Updated', isActive ? 'Ticket activated' : 'Ticket marked inactive');
        } catch (error) {
            toast.error('Error', error.message);
        } finally {
            setActionLoading("");
        }
    };

    const handleAddNote = async (ticketId, notes, attachments = []) => {
        try {
            setActionLoading("Adding note...");
            await addTicketNote(ticketId, { name: userName, email: userEmail }, notes, attachments);
            await loadTickets();
            toast.success("Note Added", "Your note has been added to the ticket log.");
        } catch (error) {
            toast.error("Error", error.message || "Could not add note");
        } finally {
            setActionLoading("");
        }
    };
    
    const handleLogout = () => {
        instance.logoutRedirect({
            postLogoutRedirectUri: `${window.location.origin}/login`,
        });
    };

    const handleSoundToggle = () => {
        const newEnabled = !soundSettings.enabled;
        setSoundEnabled(newEnabled);
        setSoundSettings({ ...soundSettings, enabled: newEnabled });
    };

    const handleVolumeChange = (newVolume) => {
        setVolume(newVolume);
        setSoundSettings({ ...soundSettings, volume: newVolume });
    };
    
    // Calculate stats (including inactive count)
    const stats = {
        total: tickets.length,
        active: tickets.filter(t => 
            t.isActive !== false && 
            ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED, TICKET_STATUS.REJECTED].includes(t.status)
        ).length,
        completed: tickets.filter(t => t.status === TICKET_STATUS.COMPLETED).length,
        closed: tickets.filter(t => t.status === TICKET_STATUS.CLOSED).length,
        pending: tickets.filter(t => t.status === TICKET_STATUS.CREATED).length,
        inProgress: tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length,
        inactive: tickets.filter(t => t.isActive === false).length
    };
    const availableCount = devOpsMembers.filter(
        m => m.availability === DEVOPS_AVAILABILITY_STATUS.AVAILABLE
    ).length;

    return (
        <div className="dashboard-layout">
            {/* Professional Jira-Style Sidebar */}
            <aside className="sidebar jira-style">
                <div className="sidebar-brand">
                    <div style={{ 
                        position: 'relative',
                        width: 40, 
                        height: 40, 
                        background: 'linear-gradient(135deg, #fff 0%, #e8f0fe 100%)', 
                        borderRadius: 8, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center'
                    }}>
                        <Zap size={24} style={{ color: '#0052CC' }} />
                        <div 
                            title={isConnected ? 'Connected' : 'Disconnected'}
                            style={{
                                position: 'absolute',
                                top: -2,
                                right: -2,
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                backgroundColor: isConnected ? '#36B37E' : '#FF5630',
                                border: '2px solid #fff'
                            }} 
                        />
                    </div>
                    <h2 style={{ marginTop: '0.75rem', fontSize: '1.1rem', letterSpacing: '-0.5px' }}>DevOps Portal</h2>
                    <span style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '2px' }}>Service Requests</span>
                </div>
                <nav className="sidebar-nav">
                    <a 
                        href="#" 
                        className={activeSection === 'dashboard' ? 'active' : ''}
                        onClick={(e) => { e.preventDefault(); setActiveSection('dashboard'); }}
                    >
                        <LayoutDashboard size={18} /> Dashboard
                        {stats.pending > 0 && <span className="nav-badge">{stats.pending}</span>}
                    </a>
                    <a 
                        href="#" 
                        className={activeSection === 'requests' ? 'active' : ''}
                        onClick={(e) => { e.preventDefault(); setActiveSection('requests'); }}
                    >
                        <FileText size={18} /> My Requests
                        {stats.active > 0 && <span className="nav-badge">{stats.active}</span>}
                    </a>
                    <a 
                        href="#" 
                        className={activeSection === 'settings' ? 'active' : ''}
                        onClick={(e) => { e.preventDefault(); setActiveSection('settings'); }}
                    >
                        <Settings size={18} /> Settings
                    </a>
                    <a 
                        href="#" 
                        className={`nav-profile-link ${activeSection === 'profile' ? 'active' : ''}`}
                        onClick={(e) => { e.preventDefault(); setActiveSection('profile'); }}
                    >
                        <UserCircle size={18} /> Profile
                    </a>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-email">{userEmail}</span>
                        <span className="user-role badge-user" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                            Personal Access
                        </span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            
            <main className="dashboard-content">


                <header className="content-header">
                    <div className="header-top">
                        <div>
                            {/* Breadcrumb */}
                            <div className="breadcrumb">
                                <span className="breadcrumb-item"><a href="#">Home</a></span>
                                <span className="breadcrumb-separator">/</span>
                                <span className="breadcrumb-current">My Requests</span>
                            </div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#172B4D', marginTop: '8px' }}>
                                My Service Requests
                            </h1>
                            <p style={{ color: '#5E6C84', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                Create and track your infrastructure and deployment requests
                            </p>
                        </div>
                        <div className="header-actions">
                            <button 
                                className={`btn-icon ${isSyncing ? 'syncing' : ''}`}
                                onClick={() => forceRefresh()}
                                title="Refresh"
                                style={{ position: 'relative' }}
                            >
                                <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
                            </button>
                            <button 
                                className="btn-jira primary"
                                onClick={() => setIsCreateModalOpen(true)}
                            >
                                <Plus size={18} />
                                New Request
                            </button>
                        </div>
                    </div>
                    {actionLoading && (
                        <div className="action-loading-overlay">
                            <div className="action-loading-card">
                                <div className="spinner"></div>
                                <p>{actionLoading}</p>
                            </div>
                        </div>
                    )}
                </header>
                
                {activeSection === 'settings' ? (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <h3>Settings</h3>
                        </div>
                        <div className="tickets-list" style={{ padding: '1.5rem' }}>
                            <div className="sound-settings">
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Bell size={18} style={{ marginRight: 8 }} />
                                        Notification Sounds
                                    </span>
                                    <button 
                                        className={`sound-toggle ${soundSettings.enabled ? 'active' : ''}`}
                                        onClick={handleSoundToggle}
                                    >
                                        <span className="sound-toggle-knob" />
                                    </button>
                                </div>
                                {soundSettings.enabled && (
                                    <div className="volume-slider">
                                        <Bell size={16} style={{ opacity: 0.5 }} />
                                        <div 
                                            className="volume-slider-track"
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX - rect.left;
                                                handleVolumeChange(Math.max(0, Math.min(1, x / rect.width)));
                                            }}
                                        >
                                            <div className="volume-slider-fill" style={{ width: `${soundSettings.volume * 100}%` }} />
                                            <div className="volume-slider-thumb" style={{ left: `${soundSettings.volume * 100}%` }} />
                                        </div>
                                        <Bell size={16} />
                                    </div>
                                )}
                            </div>

                            <div className="sound-settings" style={{ marginTop: "1.5rem" }}>
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Mail size={18} style={{ marginRight: 8 }} />
                                        Email notifications
                                    </span>
                                </div>
                                <p style={{ fontSize: "0.8rem", color: "#5E6C84", margin: "0 0 1rem" }}>
                                    Choose which ticket emails you receive on your account address. Project admins can mark
                                    some channels as mandatory in workflow settings; those messages are always sent.
                                </p>
                                {emailNotifLoading && (
                                    <p style={{ color: "#5E6C84", fontSize: "0.875rem" }}>Loading preferences…</p>
                                )}
                                {!emailNotifLoading && emailNotifPrefs && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                                        {[
                                            {
                                                key: "ticketStatusChanges",
                                                label: "Ticket status changes"
                                            },
                                            {
                                                key: "approvalRequests",
                                                label: "Approval stage updates (e.g. waiting for approval)"
                                            },
                                            {
                                                key: "approvalCompleted",
                                                label: "Approval completed or declined"
                                            },
                                            {
                                                key: "costApprovalUpdates",
                                                label: "Cost approval updates"
                                            },
                                            {
                                                key: "commentsAndUpdates",
                                                label: "Comments and updates on the ticket thread"
                                            }
                                        ].map((row) => (
                                            <label
                                                key={row.key}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    cursor: emailNotifSaving ? "default" : "pointer",
                                                    fontSize: "0.875rem",
                                                    color: "#172B4D"
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!emailNotifPrefs[row.key]}
                                                    disabled={emailNotifSaving}
                                                    onChange={() => handleEmailPrefToggle(row.key)}
                                                />
                                                {row.label}
                                            </label>
                                        ))}
                                        <button
                                            type="button"
                                            className="btn-jira primary"
                                            style={{ marginTop: "0.5rem", alignSelf: "flex-start" }}
                                            disabled={emailNotifSaving}
                                            onClick={() => handleSaveEmailPrefs()}
                                        >
                                            {emailNotifSaving ? "Saving…" : "Save email preferences"}
                                        </button>
                                    </div>
                                )}
                                {!emailNotifLoading && !emailNotifPrefs && (
                                    <p style={{ color: "#FF5630", fontSize: "0.875rem" }}>
                                        Could not load email preferences. Try again later.
                                    </p>
                                )}
                            </div>

                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#F4F5F7', borderRadius: 8 }}>
                                <h4 style={{ marginBottom: '0.5rem', color: '#172B4D' }}>Connection Status</h4>
                                <p style={{ fontSize: '0.875rem', color: '#5E6C84' }}>
                                    Sync Method: <strong>WebSocket (Fastest)</strong>
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#5E6C84', marginTop: '0.25rem' }}>
                                    Status: <strong style={{ color: isConnected ? '#36B37E' : '#FF5630' }}>
                                        {isConnected ? 'Connected' : 'Connecting...'}
                                    </strong>
                                </p>
                            </div>
                        </div>
                    </div>
                ) : activeSection === 'profile' ? (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <h3>Profile</h3>
                        </div>
                        <div className="tickets-list">
                            <div className="team-member-card" style={{ maxWidth: 400 }}>
                                <div className="activity-avatar" style={{ width: 64, height: 64, fontSize: 24, margin: '0 auto 1rem' }}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="team-member-head"><strong>Name</strong><span>{userName}</span></div>
                                <div className="team-member-head"><strong>Email</strong><span>{userEmail}</span></div>
                                {userPrincipalName && (
                                    <div className="team-member-head"><strong>Username</strong><span>{userPrincipalName}</span></div>
                                )}
                                <div className="team-member-head"><strong>Role</strong><span>Standard User</span></div>
                            </div>
                        </div>
                    </div>
                ) : (
                <>
                {/* Professional Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card jira-style" onClick={() => handleTabChange('all')}>
                        <div className="stat-icon blue">
                            <FileText size={24} />
                        </div>
                        <div className="stat-value">{stats.total}</div>
                        <span className="stat-label">Total Requests</span>
                    </div>
                    <div className="stat-card jira-style" onClick={() => handleTabChange('active')}>
                        <div className="stat-icon blue">
                            <Clock size={24} />
                        </div>
                        <div className="stat-value">{stats.active}</div>
                        <span className="stat-label">Active</span>
                        {stats.pending > 0 && (
                            <div className="stat-trend">
                                <AlertCircle size={14} />
                                {stats.pending} pending review
                            </div>
                        )}
                    </div>
                    <div className="stat-card jira-style" onClick={() => handleTabChange('completed')}>
                        <div className="stat-icon green">
                            <CheckCircle size={24} />
                        </div>
                        <div className="stat-value">{stats.completed}</div>
                        <span className="stat-label">Completed</span>
                    </div>
                    <div className="stat-card jira-style">
                        <div className="stat-icon yellow">
                            <TrendingUp size={24} />
                        </div>
                        <div className="stat-value">{stats.inProgress}</div>
                        <span className="stat-label">In Progress</span>
                    </div>
                    <div className="stat-card jira-style">
                        <div className="stat-icon green">
                            <User size={24} />
                        </div>
                        <div className="stat-value">{availableCount}</div>
                        <span className="stat-label">DevOps Available</span>
                    </div>
                </div>
                </>
                )}

                {activeSection !== 'settings' && activeSection !== 'profile' && (
                <>
                <div className="tickets-section">
                    <div className="tickets-header">
                        <h3>DevOps Team Availability</h3>
                    </div>
                    <div className="tickets-list">
                        {devOpsMembers.length === 0 ? (
                            <p style={{ color: '#64748b' }}>No DevOps users found.</p>
                        ) : (
                            <div className="team-members-grid">
                                {devOpsMembers.map(member => (
                                    <div className="team-member-card" key={member.id || member.email}>
                                        <div className="team-member-head">
                                            <strong>{member.name}</strong>
                                            <span className={`availability-badge availability-${(member.availability || DEVOPS_AVAILABILITY_STATUS.OFFLINE).toLowerCase().replace(/\s+/g, '-')}`}>
                                                {member.availability || DEVOPS_AVAILABILITY_STATUS.OFFLINE}
                                            </span>
                                        </div>
                                        <div className="team-member-email">{member.email}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Tabs and Filters */}
                <div className="tickets-section">
                    <div className="tickets-header">
                        <div className="tickets-tabs">
                            <button 
                                className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                                onClick={() => handleTabChange('active')}
                            >
                                Active ({stats.active})
                            </button>
                            <button 
                                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                                onClick={() => handleTabChange('all')}
                            >
                                All ({tickets.length})
                            </button>
                            <button 
                                className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                                onClick={() => handleTabChange('completed')}
                            >
                                Completed ({stats.completed})
                            </button>
                            <button 
                                className={`tab-btn ${activeTab === 'closed' ? 'active' : ''}`}
                                onClick={() => handleTabChange('closed')}
                            >
                                Closed ({stats.closed})
                            </button>
                            <button 
                                className={`tab-btn ${activeTab === 'inactive' ? 'active' : ''}`}
                                onClick={() => handleTabChange('inactive')}
                            >
                                Inactive ({stats.inactive})
                            </button>
                        </div>
                        <button 
                            className={`btn-filter ${showFilters ? 'active' : ''}`}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter size={16} />
                            Filters
                        </button>
                    </div>
                    
                    {showFilters && (
                        <TicketFilters 
                            filters={filters}
                            onFilterChange={handleFilterChange}
                        />
                    )}
                    
                    {/* Tickets List */}
                    <div className="tickets-list">
                        {filteredTickets.length === 0 ? (
                            <div className="empty-state">
                                <FileText size={48} />
                                <h3>No requests found</h3>
                                <p>
                                    {tickets.length === 0 
                                        ? "You haven't created any requests yet. Click 'New Request' to get started."
                                        : "No requests match your current filters."}
                                </p>
                                {tickets.length === 0 && (
                                    <button 
                                        className="btn-primary"
                                        onClick={() => setIsCreateModalOpen(true)}
                                    >
                                        <Plus size={18} />
                                        Create Your First Request
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <TicketCard 
                                    key={ticket.id}
                                    ticket={ticket}
                                    onClick={() => setSelectedTicket(ticket)}
                                    showActions={true}
                                />
                            ))
                        )}
                    </div>
                </div>
                </>
                )}
            </main>
            
            {/* Modals */}
            <CreateTicketModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleTicketCreated}
                user={{ name: userName, email: userEmail }}
                projects={projects}
                managers={managers}
            />
            
            {selectedTicket && (
                <TicketDetailsModal 
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    user={{ name: userName, email: userEmail }}
                    canManage={false}
                    onAddNote={handleAddNote}
                    onToggleActiveStatus={handleToggleActiveStatus}
                />
            )}
        </div>
    );
};

export default UserDashboard;
