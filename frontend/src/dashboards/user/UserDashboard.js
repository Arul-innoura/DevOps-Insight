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
    Wifi,
    WifiOff,
    Bell,
    Mail,
    Settings,
    TrendingUp,
    Clock,
    CheckCircle,
    AlertCircle,
    XCircle,
    Server,
} from "lucide-react";
import { 
    TicketCard, 
    TicketFilters, 
    TicketDetailsModal,
    CreateTicketModal 
} from "../TicketComponents";
import { 
    getTicketsByUser,
    updateTicketStatus,
    toggleTicketActiveStatus,
    addTicketNote,
    TICKET_STATUS,
    toDisplayTicketStatus,
    ticketMatchesPrimaryStatusFilter,
    getDevOpsTeamMembers,
    getProjects,
    getManagers,
    normalizeEnvironmentLabel,
    normalizeWebSocketTicketPayload,
    mapIncomingTicketRow,
    wsPatchHasMeaningfulAssignee,
    subscribeDataChanges
} from "../../services/ticketService";
import { useRealTimeSync, useConnectionStatus } from "../../services/useRealTimeSync";
import { useToast, SyncIndicator } from "../../services/ToastNotification";
import {
    getSoundSettings,
    setSoundEnabled,
    setVolume
} from "../../services/notificationService";
import { launchPaperCelebration } from "../../utils/celebrationFx";
import {
    getMyNotificationPreferences,
    saveMyNotificationPreferences
} from "../../services/userNotificationService";
import UserInfraPanel from "./UserInfraPanel";
import { usePersistedSidebarNav } from "../../services/sidebarNavStorage";
import { useAnyEnvLive, useLiveEnvSummary } from "../../services/useAnyEnvLive";
import { NavSectionToggle } from "../../components/NavSectionToggle";
import DashboardProfilePage from "../../components/DashboardProfilePage";
import BirthdayHolidayBanner from "../../components/BirthdayHolidayBanner";
import NotificationPermissionBanner from "../../components/NotificationPermissionBanner";
import { getMyProfile } from "../../services/profileService";
import TicketSearchBar from "../../components/TicketSearchBar";
import { ThemePickerRow } from "../../components/ThemePickerRow";
import { LoadingScreen } from "../../components/LoadingScreen";
import { signOutRedirectToLogin } from "../../auth/logoutHelper";
const USER_SIDEBAR_NAV_DEFAULTS = { workspace: true, system: true, account: true };

export const UserDashboard = () => {
    const { instance, accounts } = useMsal();
    const toast = useToast();

    const account = accounts[0];
    const userName = account?.name || "Standard User";
    const idClaims = account?.idTokenClaims || {};
    const userEmail =
        (typeof idClaims.email === "string" && idClaims.email) ||
        (typeof idClaims.preferred_username === "string" && idClaims.preferred_username) ||
        account?.username ||
        "user@company.com";
    const userPrincipalName = account?.username || "";
    const ticketUserIdentity = {
        name: userName,
        email: userEmail,
        username: account?.username,
        preferredUsername: idClaims.preferred_username,
        upn: idClaims.upn,
        uniqueName: idClaims.unique_name,
        emailAliases: Array.isArray(idClaims.emails) ? idClaims.emails : undefined,
    };
    
    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('active');
    const [activeSection, setActiveSection] = useState('requests');
    const [newSeen, setNewSeen] = useState(() => {
        try { return JSON.parse(localStorage.getItem('user_new_seen') || '{}'); } catch { return {}; }
    });
    const markNewSeen = (key) => {
        setNewSeen(prev => {
            const next = { ...prev, [key]: true };
            try { localStorage.setItem('user_new_seen', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const [devOpsMembers, setDevOpsMembers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [managers, setManagers] = useState([]);
    const [actionLoading, setActionLoading] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [ticketSearch, setTicketSearch] = useState({ query: "", remote: null, loading: false });
    const [ticketDataVersion, setTicketDataVersion] = useState(0);
    const ticketSearchRef = useRef(ticketSearch);
    const [showSettings, setShowSettings] = useState(false);
    const [soundSettings, setSoundSettings] = useState(getSoundSettings());
    const [emailNotifPrefs, setEmailNotifPrefs] = useState(null);
    const [emailNotifLoading, setEmailNotifLoading] = useState(false);
    const [emailNotifSaving, setEmailNotifSaving] = useState(false);
    const [navGroups, setNavGroups] = usePersistedSidebarNav("user", USER_SIDEBAR_NAV_DEFAULTS);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [profilePicUrl, setProfilePicUrl] = useState(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const suppressDataChangeRefreshUntilRef = useRef(0);
    const pendingSilentTicketsRefreshRef = useRef(false);
    
    const isLoadingRef = useRef(false);
    const filtersRef = useRef(filters);
    const activeTabRef = useRef(activeTab);
    
    // Keep refs in sync
    useEffect(() => { filtersRef.current = filters; }, [filters]);
    useEffect(() => {
        ticketSearchRef.current = ticketSearch;
    }, [ticketSearch]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    // Load the user's profile once so the sidebar avatar can reflect their photo
    useEffect(() => {
        let cancelled = false;
        getMyProfile()
            .then((p) => { if (!cancelled) setProfilePicUrl(p?.profilePicUrl || null); })
            .catch(() => { /* silent — falls back to initials */ });
        return () => { cancelled = true; };
    }, []);

    const filteredTicketsRef = useRef(filteredTickets);
    filteredTicketsRef.current = filteredTickets;
    const openTicketById = useCallback((id) => {
        const sid = String(id);
        const t = filteredTicketsRef.current.find((x) => String(x.id) === sid);
        if (t) setSelectedTicket(t);
    }, []);

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
        if (isLoadingRef.current) {
            if (silent) pendingSilentTicketsRefreshRef.current = true;
            return;
        }
        isLoadingRef.current = true;
        // Only show syncing on initial load, not on real-time updates
        if (!silent) setIsSyncing(true);
        try {
            const [userTickets, members, projectList, managerList] = await Promise.all([
                getTicketsByUser(userEmail, { force: true }),
                getDevOpsTeamMembers(),
                getProjects({ force: true }),
                getManagers(true, { force: true })
            ]);
            setDevOpsMembers(members);
            setProjects(projectList);
            setManagers(managerList);
            setTickets(userTickets);
            applyFilters(userTickets, filtersRef.current, activeTabRef.current);
            setTicketDataVersion((v) => v + 1);
            setSelectedTicket((prev) => {
                if (!prev?.id) return prev;
                const latest = userTickets.find((t) => String(t.id) === String(prev.id));
                return latest || prev;
            });
            setIsInitialLoading(false);
        } finally {
            isLoadingRef.current = false;
            if (!silent) setIsSyncing(false);
            if (pendingSilentTicketsRefreshRef.current) {
                pendingSilentTicketsRefreshRef.current = false;
                void loadTickets(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userEmail]);

    // Real-time updates via WebSocket - silent background refresh
    useRealTimeSync({
        onRefresh: () => loadTickets(true), // Silent refresh on real-time events
        onPatchEvent: (type, data) => {
            const isTicketEvent =
                type === "ticket:created" ||
                type === "ticket:updated" ||
                type === "ticket:status_changed" ||
                type === "ticket:assigned" ||
                type === "ticket:deleted";
            const isDevOpsEvent = type === "devops:updated" || type === "devops:availability_changed";
            if (!isTicketEvent && !isDevOpsEvent) return;

            if (isDevOpsEvent) {
                const normalizedAvailability = (() => {
                    const raw = String(data?.availability ?? data?.availabilityStatus ?? "").trim().toUpperCase();
                    if (raw === "AVAILABLE") return "Available";
                    if (raw === "BUSY") return "Busy";
                    if (raw === "AWAY") return "Away";
                    if (raw === "OFFLINE") return "Offline";
                    return undefined;
                })();
                const wsMember = {
                    ...data,
                    availability: normalizedAvailability || data?.availability
                };
                setDevOpsMembers((prev) => {
                    const idx = prev.findIndex((m) =>
                        (wsMember?.id && m.id === wsMember.id) ||
                        (wsMember?.email && String(m.email || "").toLowerCase() === String(wsMember.email || "").toLowerCase())
                    );
                    if (idx < 0) return prev;
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...wsMember };
                    return next;
                });
                return;
            }

            const payload = data?.ticket && typeof data.ticket === "object"
                ? { ...data.ticket, action: data?.action }
                : data;
            const effectiveId = payload?.id ?? payload?.ticketId;
            if (effectiveId == null || effectiveId === "") return;
            const incomingAssignedTo =
                payload?.assignedTo ??
                payload?.assigneeName ??
                payload?.assignedEngineerName ??
                payload?.assignee?.name;
            const incomingAssignedToEmail =
                payload?.assignedToEmail ??
                payload?.assigneeEmail ??
                payload?.assignee?.email;
            const incomingManagerName =
                payload?.managerName ??
                payload?.approverName ??
                payload?.approvalTargetName;
            const incomingManagerEmail =
                payload?.managerEmail ??
                payload?.approverEmail ??
                payload?.approvalTargetEmail;
            const wsPatch = {
                ...normalizeWebSocketTicketPayload(payload),
                id: effectiveId,
                ...(incomingAssignedTo != null && String(incomingAssignedTo).trim() !== ""
                    ? { assignedTo: String(incomingAssignedTo).trim() }
                    : {}),
                ...(incomingAssignedToEmail != null && String(incomingAssignedToEmail).trim() !== ""
                    ? { assignedToEmail: String(incomingAssignedToEmail).trim() }
                    : {}),
                ...(incomingManagerName !== undefined ? { managerName: incomingManagerName } : {}),
                ...(incomingManagerEmail !== undefined ? { managerEmail: incomingManagerEmail } : {}),
                ...((payload?.environmentLabel || payload?.environment)
                    ? { environment: normalizeEnvironmentLabel(payload.environmentLabel || payload.environment) }
                    : {}),
                ...(payload?.status ? { status: toDisplayTicketStatus(payload.status) } : {})
            };
            const isSoftRemove =
                type === "ticket:deleted" ||
                (type === "ticket:updated" && Boolean(payload?.deleted));
            const incomingUpdatedMs = wsPatch?.updatedAt ? new Date(wsPatch.updatedAt).getTime() : NaN;
            const assigneePatch = wsPatchHasMeaningfulAssignee(wsPatch);

            setTickets((prev) => {
                if (isSoftRemove) {
                    const next = prev.filter((t) => String(t.id) !== String(effectiveId));
                    if (next.length !== prev.length) {
                        applyFilters(next, filtersRef.current, activeTabRef.current);
                    }
                    return next;
                }
                if (type === "ticket:created") {
                    const existingCreateIdx = prev.findIndex((t) => String(t.id) === String(effectiveId));
                    if (existingCreateIdx < 0) {
                        const row = mapIncomingTicketRow({ ...payload, ...wsPatch, id: effectiveId });
                        if (!row?.id) return prev;
                        const next = [row, ...prev];
                        applyFilters(next, filtersRef.current, activeTabRef.current);
                        return next;
                    }
                }
                const idx = prev.findIndex((t) => String(t.id) === String(effectiveId));
                if (idx < 0) return prev;
                const existingUpdatedMs = prev[idx]?.updatedAt ? new Date(prev[idx].updatedAt).getTime() : NaN;
                const stale =
                    !Number.isNaN(incomingUpdatedMs) &&
                    !Number.isNaN(existingUpdatedMs) &&
                    incomingUpdatedMs < existingUpdatedMs;
                if (stale && !assigneePatch) {
                    return prev;
                }
                const next = [...prev];
                next[idx] = { ...next[idx], ...wsPatch };
                applyFilters(next, filtersRef.current, activeTabRef.current);
                return next;
            });
            setSelectedTicket((prev) => {
                if (!prev?.id) return prev;
                if (isSoftRemove && String(prev.id) === String(effectiveId)) return null;
                if (String(prev.id) !== String(effectiveId)) return prev;
                const existingUpdatedMs = prev?.updatedAt ? new Date(prev.updatedAt).getTime() : NaN;
                const staleSel =
                    !Number.isNaN(incomingUpdatedMs) &&
                    !Number.isNaN(existingUpdatedMs) &&
                    incomingUpdatedMs < existingUpdatedMs;
                if (staleSel && !assigneePatch) {
                    return prev;
                }
                return { ...prev, ...wsPatch };
            });
            suppressDataChangeRefreshUntilRef.current = Date.now() + 3000;
        },
        currentUserEmail: userEmail,
        onNotify: (type, data) => {
            const raw = (data?.ticket && typeof data.ticket === 'object') ? data.ticket : data;
            const title = raw?.title || raw?.summary || "Ticket";
            if (type === "ticket:created") {
                toast.info('New Ticket', title, { playSound: false });
            } else if (type === "ticket:assigned") {
                toast.info('Ticket Assigned', title, { playSound: false });
            } else if (type === "ticket:status_changed") {
                const status = raw?.status ? ` — ${raw.status.replace(/_/g, ' ')}` : '';
                toast.info('Status Changed', `${title}${status}`, { playSound: false });
            } else {
                toast.info('Ticket Updated', title, { playSound: false });
            }
        },
        playUpdateSound: true,
        refreshOnEvents: false,
        eventTypes: [
            "ticket:created",
            "ticket:updated",
            "ticket:status_changed",
            "ticket:deleted",
            "ticket:assigned",
            "devops:updated",
            "devops:availability_changed"
        ],
        enableWebSocket: true,
        enableSSE: false,
        pollingInterval: null // No polling - WebSocket only
    });

    useEffect(() => {
        const unsubscribe = subscribeDataChanges((detail) => {
            if (!detail?.scope) return;
            if (Date.now() < suppressDataChangeRefreshUntilRef.current) return;
            if (["tickets", "projects", "managers", "devops-team"].includes(detail.scope)) {
                loadTickets(true);
            }
        });
        return unsubscribe;
    }, [loadTickets]);

    const { isConnected } = useConnectionStatus();
    const hasLiveEnv = useAnyEnvLive();
    const liveEnvSummary = useLiveEnvSummary();
    const forceRefresh = () => loadTickets(false);
    
    const applyFilters = (fullTicketList, currentFilters, tab) => {
        const ts = ticketSearchRef.current;
        let result = [...fullTicketList];
        if (ts.query.trim() && !ts.loading && ts.remote != null) {
            const ids = new Set(ts.remote.map((t) => t.id));
            result = result.filter((t) => ids.has(t.id));
        }

        // Apply tab filter
        if (tab === 'all') {
            // All tab excludes closed — closed tickets have their own dedicated section
            result = result.filter(t => t.status !== TICKET_STATUS.CLOSED);
        } else if (tab === 'active') {
            // Active tab shows only active tickets (not marked inactive, not terminal)
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
            const ctx = { userName, userEmail };
            result = result.filter((t) => ticketMatchesPrimaryStatusFilter(t, currentFilters.status, ctx));
        }
        if (currentFilters.requestType) {
            result = result.filter(t => t.requestType === currentFilters.requestType);
        }
        if (currentFilters.environment) {
            result = result.filter(t => t.environment === currentFilters.environment);
        }
        if (currentFilters.search) {
            const searchLower = String(currentFilters.search).toLowerCase().trim();
            result = result.filter((t) => {
                const id = (t.id || "").toLowerCase();
                const tail = id.includes("-") ? id.split("-").pop() : id;
                return (
                    id.includes(searchLower) ||
                    tail.includes(searchLower) ||
                    (t.productName || "").toLowerCase().includes(searchLower) ||
                    (t.description || "").toLowerCase().includes(searchLower) ||
                    (t.requestedBy || "").toLowerCase().includes(searchLower)
                );
            });
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

    useEffect(() => {
        if (activeSection !== "requests") return;
        applyFilters(tickets, filtersRef.current, activeTabRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticketSearch, tickets, activeSection, activeTab]);
    
    const handleTicketCreated = (createdTicket) => {
        toast.success('Request Created', 'Your request has been submitted successfully');
        if (createdTicket && typeof createdTicket === "object") {
            setTickets((prev) => {
                const id = createdTicket.id;
                const rest = id != null && id !== ""
                    ? prev.filter((t) => String(t.id) !== String(id))
                    : prev;
                const next = [createdTicket, ...rest];
                applyFilters(next, filtersRef.current, activeTabRef.current);
                return next;
            });
            return;
        }
        loadTickets(true).catch(() => {});
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
            await loadTickets(true);
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
            await loadTickets(true);
            toast.success("Note Added", "Your note has been added to the ticket log.");
        } catch (error) {
            toast.error("Error", error.message || "Could not add note");
        } finally {
            setActionLoading("");
        }
    };

    const handleStatusChange = async (ticketId, newStatus, notes, meta = {}) => {
        try {
            setActionLoading(
                meta.reopen
                    ? "Reopening ticket..."
                    : newStatus === TICKET_STATUS.MANAGER_APPROVAL_PENDING
                        ? "Sending approval request..."
                        : "Updating ticket..."
            );
            await updateTicketStatus(ticketId, newStatus, { name: userName, email: userEmail }, notes, meta);
            await loadTickets(true);
            if (newStatus === TICKET_STATUS.CLOSED) {
                launchPaperCelebration();
            }
            if (meta.reopen) {
                toast.success("Ticket reopened", "Your request is back in the team queue. History is unchanged.");
            } else if (newStatus === TICKET_STATUS.MANAGER_APPROVAL_PENDING) {
                toast.success("Approval triggered", "Approval request has been sent.");
            } else if (newStatus === TICKET_STATUS.CLOSED) {
                toast.success("Ticket closed", "This request is now closed.");
            } else {
                toast.success("Updated", "Your ticket was updated.");
            }
        } catch (error) {
            toast.error("Error", error.message || "Could not update the ticket");
        } finally {
            setActionLoading("");
        }
    };
    
    const handleLogout = () => {
        signOutRedirectToLogin(instance);
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
    if (isInitialLoading) return <LoadingScreen role="user" userName={userName} />;

    return (
        <div className="dashboard-layout user-dashboard">
            {mobileSidebarOpen && <div className="mobile-sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />}
            {/* Unified ShipIt Sidebar */}
            <aside className={`shipit-sidebar${mobileSidebarOpen ? ' sb-mobile-open' : ''}`}>
                {/* Brand */}
                <div className="sb-brand">
                    <div className="sb-brand-icon sb-brand-icon--eye">
                        <img src="/favicon-eye.svg" alt="ShipIt" className="sb-brand-eye-img" />
                        <span className={`sb-conn-dot ${isConnected ? 'connected' : 'disconnected'}`}
                              title={isConnected ? 'Live connection' : 'Reconnecting...'} />
                    </div>
                    <div className="sb-brand-meta">
                        <span className="sb-app-name">ShipIt</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sb-nav" onClick={(e) => { if (e.target.closest('.sb-item')) setMobileSidebarOpen(false); }}>
                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.workspace}
                            onToggle={() => setNavGroups(g => ({ ...g, workspace: !g.workspace }))}
                            label="Workspace"
                        />
                        {navGroups.workspace && (
                            <div className="sb-group-items">
                                <button type="button" className={`sb-item ${activeSection === 'requests' ? 'active' : ''}`}
                                   onClick={() => setActiveSection('requests')}>
                                    <span className="sb-item-icon"><FileText size={15} /></span>
                                    <span className="sb-item-text">My Requests</span>
                                    {(stats.pending > 0 || stats.active > 0) && (
                                        <span className="sb-badge">{stats.active || stats.pending}</span>
                                    )}
                                </button>

                            </div>
                        )}
                    </div>

                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.system}
                            onToggle={() => setNavGroups(g => ({ ...g, system: !g.system }))}
                            label="System"
                        />
                        {navGroups.system && (
                            <div className="sb-group-items">
                                <button type="button" className={`sb-item ${activeSection === 'infrastructure' ? 'active' : ''}`}
                                   onClick={() => { setActiveSection('infrastructure'); markNewSeen('infrastructure'); }}>
                                    <span className="sb-item-icon"><Server size={15} /></span>
                                    <span className="sb-item-text">Infrastructure</span>
                                    {hasLiveEnv && <span className="sb-live-dot" title="A product environment is up" />}
                                    {!newSeen.infrastructure && <span className="sb-new-badge">New</span>}
                                </button>
                                <button type="button" className={`sb-item ${activeSection === 'settings' ? 'active' : ''}`}
                                   onClick={() => setActiveSection('settings')}>
                                    <span className="sb-item-icon"><Settings size={15} /></span>
                                    <span className="sb-item-text">Preferences</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.account}
                            onToggle={() => setNavGroups(g => ({ ...g, account: !g.account }))}
                            label="Account"
                        />
                        {navGroups.account && (
                            <div className="sb-group-items">
                                <button type="button" className={`sb-item ${activeSection === 'profile' ? 'active' : ''}`}
                                   onClick={() => { setActiveSection('profile'); markNewSeen('account'); }}>
                                    <span className="sb-item-icon"><UserCircle size={15} /></span>
                                    <span className="sb-item-text">My Account</span>
                                    {!newSeen.account && <span className="sb-new-badge">New</span>}
                                </button>
                            </div>
                        )}
                    </div>
                </nav>

                {/* Footer */}
                <div className="sb-footer">
                    <div className="sb-user-row">
                        {profilePicUrl ? (
                            <img
                                src={profilePicUrl}
                                alt={userName || 'Profile'}
                                className="sb-avatar sb-avatar--img"
                            />
                        ) : (
                            <div className="sb-avatar" style={{ background: '#6d28d9' }}>
                                {(userName || '?').trim().charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="sb-user-meta">
                            <span className="sb-user-name">{userName}</span>
                            <span className="sb-user-email">{userEmail}</span>
                        </div>
                    </div>
                    <div className="sb-footer-actions">
                        <span className="sb-role-badge user">Standard</span>
                        <button className="sb-logout-btn" onClick={handleLogout}>
                            <LogOut size={12} /> Sign Out
                        </button>
                    </div>
                </div>
            </aside>
            
            <main className="dashboard-content">

                <BirthdayHolidayBanner userName={userName} />
                <NotificationPermissionBanner />

                <header className="content-header">
                    <div className="header-top">
                        <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Toggle menu">
                            <span /><span /><span />
                        </button>
                        <div>
                            {/* Breadcrumb */}
                            <div className="breadcrumb">
                                <span className="breadcrumb-item">Home</span>
                                <span className="breadcrumb-separator">/</span>
                                <span className="breadcrumb-current">
                                    {activeSection === 'infrastructure' ? 'Infrastructure'
                                        : activeSection === 'settings' ? 'Preferences'
                                        : activeSection === 'profile' ? 'My Account'
                                        : 'My Requests'}
                                </span>
                            </div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '8px' }}>
                                {activeSection === 'infrastructure' ? 'Infrastructure'
                                    : activeSection === 'settings' ? 'Preferences'
                                    : activeSection === 'profile' ? 'My Account'
                                    : 'My Requests'}
                            </h1>
                            <p style={{ color: 'var(--text-sub)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                {activeSection === 'infrastructure'
                                    ? 'Live product status and allocated resource specs'
                                    : activeSection === 'settings'
                                    ? 'Manage your notification and display preferences'
                                    : activeSection === 'profile'
                                    ? 'Your account details'
                                    : 'Create and track your infrastructure and deployment requests'}
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
                
                {activeSection === 'infrastructure' ? (
                    <UserInfraPanel />
                ) : activeSection === 'settings' ? (
                    <div className="tickets-section prefs-section">
                        <div className="prefs-page-hdr">
                            <div className="prefs-page-hdr__icon">
                                <Settings size={17} />
                            </div>
                            <div>
                                <h3 className="prefs-page-hdr__title">Preferences</h3>
                                <p className="prefs-page-hdr__sub">Manage sounds, email and display settings</p>
                            </div>
                        </div>
                        <div className="prefs-page-body">
                            <div className="sound-settings pref-card">
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Bell size={17} />
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

                            <div className="sound-settings pref-card">
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Mail size={17} />
                                        Email notifications
                                    </span>
                                </div>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0 0 1rem" }}>
                                    Choose which ticket emails you receive on your account address. Project admins can mark
                                    some channels as mandatory in workflow settings; those messages are always sent.
                                </p>
                                {emailNotifLoading && (
                                    <p style={{ color: "var(--text-sub)", fontSize: "0.875rem" }}>Loading preferences…</p>
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
                                                    color: "var(--text-main)"
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

                            <div className="sound-settings pref-card">
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Settings size={17} />
                                        Theme
                                    </span>
                                </div>
                                <ThemePickerRow />
                            </div>
                        </div>
                    </div>
                ) : activeSection === 'profile' ? (
                    <div className="tickets-section profile-section-wrap">
                        <DashboardProfilePage
                            userName={userName}
                            userEmail={userEmail}
                            userPrincipalName={userPrincipalName}
                            roleKey="user"
                            onSignOut={handleLogout}
                            avatarColor="#6d28d9"
                            onProfileUpdated={(p) => setProfilePicUrl(p?.profilePicUrl || null)}
                        />
                    </div>
                ) : (
                <>
                {/* Compact Stats Bar + DevOps availability inline */}
                {activeSection === 'requests' && (
                <div className="mini-stats-bar">
                    <button className={`mini-stat ${activeTab === 'all' ? 'active' : ''}`} onClick={() => handleTabChange('all')}>
                        <span className="mini-stat-icon blue"><FileText size={13} /></span>
                        <span className="mini-stat-value">{stats.total}</span>
                        <span className="mini-stat-label">Total</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className={`mini-stat ${activeTab === 'active' ? 'active' : ''}`} onClick={() => handleTabChange('active')}>
                        <span className="mini-stat-icon blue"><Clock size={13} /></span>
                        <span className="mini-stat-value">{stats.active}</span>
                        <span className="mini-stat-label">Active</span>
                        {stats.pending > 0 && <span className="mini-stat-badge">{stats.pending} pending</span>}
                    </button>
                    <span className="mini-stat-sep" />
                    <button className={`mini-stat ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => handleTabChange('completed')}>
                        <span className="mini-stat-icon green"><CheckCircle size={13} /></span>
                        <span className="mini-stat-value">{stats.completed}</span>
                        <span className="mini-stat-label">Completed</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className="mini-stat">
                        <span className="mini-stat-icon yellow"><TrendingUp size={13} /></span>
                        <span className="mini-stat-value">{stats.inProgress}</span>
                        <span className="mini-stat-label">In Progress</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className={`mini-stat ${activeTab === 'closed' ? 'active' : ''}`} onClick={() => handleTabChange('closed')}>
                        <span className="mini-stat-icon red"><XCircle size={13} /></span>
                        <span className="mini-stat-value">{stats.closed}</span>
                        <span className="mini-stat-label">Closed</span>
                    </button>

                    {/* DevOps availability — compact avatar dots pushed to the right */}
                    {devOpsMembers.length > 0 && (
                        <>
                            <span className="mini-stat-sep" style={{ marginLeft: 'auto' }} />
                            <div className="devops-avail-strip" title="DevOps team availability">
                                <span className="devops-avail-label">Team</span>
                                {devOpsMembers.slice(0, 6).map((m) => {
                                    const status = (m.availability || '').toLowerCase();
                                    const color = status === 'available' ? '#22c55e'
                                        : status === 'busy' ? '#f59e0b'
                                        : status === 'away' ? '#f97316'
                                        : '#94a3b8';
                                    const initials = (m.name || m.email || '?').charAt(0).toUpperCase();
                                    return (
                                        <span
                                            key={m.email}
                                            className="devops-avail-dot"
                                            title={`${m.name || m.email} — ${m.availability || 'Offline'}`}
                                            style={{ '--dot-color': color }}
                                        >
                                            {initials}
                                        </span>
                                    );
                                })}
                                {devOpsMembers.length > 6 && (
                                    <span className="devops-avail-dot more">+{devOpsMembers.length - 6}</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
                )}
                </>
                )}

                {activeSection === 'requests' && liveEnvSummary.hasLive && (
                    <div className="ud-live-banner" onClick={() => setActiveSection('infrastructure')} role="button" tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setActiveSection('infrastructure')}>
                        <span className="ud-live-banner-dot" />
                        <span className="ud-live-banner-text">
                            {liveEnvSummary.items.map((item, i) => (
                                <span key={item.product}>
                                    {i > 0 && <span className="ud-live-sep">·</span>}
                                    <strong>{item.product}</strong>
                                    {' '}
                                    <span className="ud-live-envs">{item.envs.join(', ')}</span>
                                    {' '}
                                    <span className="ud-live-status">UP</span>
                                </span>
                            ))}
                        </span>
                        <span className="ud-live-cta">View Infrastructure →</span>
                    </div>
                )}

                {activeSection === 'requests' && (
                <>
                {/* Filters only */}
                <div className="tickets-section">
                    <div className="tickets-header user-requests-toolbar">
                        <TicketSearchBar
                            scope="mine"
                            ticketDataVersion={ticketDataVersion}
                            onPickTicket={(t) => setSelectedTicket(t)}
                            onSearchStateChange={setTicketSearch}
                            className="ticket-search-bar--user"
                        />
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
                            hideRefineSearch
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
                                    onOpenById={openTicketById}
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
                user={ticketUserIdentity}
                projects={projects}
                managers={managers}
            />
            
            {selectedTicket && (
                <TicketDetailsModal 
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    user={ticketUserIdentity}
                    onStatusChange={handleStatusChange}
                    canManage={false}
                    onAddNote={handleAddNote}
                    onToggleActiveStatus={handleToggleActiveStatus}
                />
            )}
        </div>
    );
};

export default UserDashboard;
