import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
    LogOut,
    Terminal,
    Activity,
    RefreshCw,
    Filter,
    CheckCircle,
    Clock,
    AlertCircle,
    PlayCircle,
    Users,
    Ticket,
    BarChart3,
    UserPlus,
    History,
    RotateCcw,
    User as ProfileIcon,
    Inbox,
    StickyNote,
    Plus,
    ArrowRight,
    X,
    User as UserIcon,
    Wifi,
    WifiOff,
    Bell,
    Settings,
    TrendingUp,
    Zap,
    Eye,
    EyeOff,
    Coffee,
    Calendar,
    Moon,
    Shield,
    Database,
    XCircle,
    Send,
    ArrowRightCircle,
    LayoutDashboard
} from "lucide-react";
import { 
    StatusBadge, 
    TicketCard, 
    TicketFilters, 
    TicketDetailsModal,
    HorizontalProgress
} from "../TicketComponents";
import {
    updateTicketStatus,
    addTicketNote,
    assignTicket,
    forwardTicket,
    getTicketStats,
    getUnassignedTickets,
    getActiveTickets,
    getCompletedTickets,
    getAssignedTickets,
    getActiveTicketsForDevOps,
    TICKET_STATUS,
    TICKET_FILTER_BUCKET,
    ticketMatchesPrimaryStatusFilter,
    getDevOpsTeamMembers,
    updateDevOpsAvailability,
    upsertDevOpsTeamMember,
    DEVOPS_AVAILABILITY_STATUS,
    getStandupNotes,
    addStandupNote,
    getRotaSchedule,
    getRotaManagementState,
    subscribeDataChanges
} from "../../services/ticketService";
import RotaCalendarModal from "../admin/RotaCalendarModal";
import { openCostEstimateWindow } from "./openCostEstimateWindow";
import { useRealTimeSync, useConnectionStatus } from "../../services/useRealTimeSync";
import { 
    playShortNotification, 
    playSuccessNotification,
    playStatusChangeSound,
    setSoundEnabled,
    getSoundEnabled,
    setVolume,
    getVolume
} from "../../services/notificationService";
import AnalyticsDashboard from "../admin/AnalyticsDashboard";
import EnvMonitoringDashboard from "../EnvMonitoringDashboard";
import { usePersistedSidebarNav } from "../../services/sidebarNavStorage";
import { NavSectionToggle } from "../../components/NavSectionToggle";
import DashboardProfilePage from "../../components/DashboardProfilePage";
import TicketSearchBar from "../../components/TicketSearchBar";
import { useTheme } from "../../services/ThemeContext";
import { LoadingScreen } from "../../components/LoadingScreen";
import { signOutRedirectToLogin } from "../../auth/logoutHelper";

const DEVOPS_SIDEBAR_NAV_DEFAULTS = { team: true, account: true };

// Status visual configuration
const STATUS_CONFIG = {
    [DEVOPS_AVAILABILITY_STATUS.AVAILABLE]: {
        icon: CheckCircle, color: '#36B37E', bg: '#E3FCEF', label: 'Available',
        description: 'Ready to accept and work on tickets'
    },
    [DEVOPS_AVAILABILITY_STATUS.AWAY]: {
        icon: Coffee, color: '#FF991F', bg: '#FFF7E6', label: 'Away',
        description: 'Temporarily away — read-only mode'
    },
    [DEVOPS_AVAILABILITY_STATUS.BUSY]: {
        icon: AlertCircle, color: '#FF5630', bg: '#FFEBE6', label: 'Busy',
        description: 'Do not disturb — read-only mode'
    },
    [DEVOPS_AVAILABILITY_STATUS.OFFLINE]: {
        icon: Moon, color: '#6B778C', bg: '#F4F5F7', label: 'Offline',
        description: 'Session inactive — dashboard locked'
    }
};

/** Sidebar menu order for availability picker */
const AVAILABILITY_STATUS_ORDER = [
    DEVOPS_AVAILABILITY_STATUS.AVAILABLE,
    DEVOPS_AVAILABILITY_STATUS.AWAY,
    DEVOPS_AVAILABILITY_STATUS.BUSY,
    DEVOPS_AVAILABILITY_STATUS.OFFLINE
];

// ── Forward Ticket Modal ─────────────────────────────────────────────────────
const AVAIL_COLORS = {
    [DEVOPS_AVAILABILITY_STATUS.AVAILABLE]: { dot: '#22c55e', label: 'Available' },
    [DEVOPS_AVAILABILITY_STATUS.AWAY]:      { dot: '#f97316', label: 'Away' },
    [DEVOPS_AVAILABILITY_STATUS.BUSY]:      { dot: '#ef4444', label: 'Busy' },
    [DEVOPS_AVAILABILITY_STATUS.OFFLINE]:   { dot: '#94a3b8', label: 'Offline' },
};

const ForwardTicketModal = ({ ticket, onClose, onForward, currentUser }) => {
    const [selectedMember, setSelectedMember] = useState(null);
    const [forwardNote, setForwardNote] = useState('');
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [forwarding, setForwarding] = useState(false);
    const [success, setSuccess] = useState(null); // { name }

    useEffect(() => {
        getDevOpsTeamMembers()
            .then(all => setMembers(all.filter(m => m.email?.toLowerCase() !== currentUser.email?.toLowerCase())))
            .finally(() => setLoading(false));
    }, [currentUser.email]);

    const handleForward = async () => {
        if (!selectedMember) return;
        setForwarding(true);
        try {
            await onForward(ticket.id, selectedMember.name, selectedMember.email || '', forwardNote);
            setSuccess({ name: selectedMember.name });
            setTimeout(() => onClose(), 2000);
        } finally {
            setForwarding(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="fwd-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="fwd-modal-header">
                    <div className="fwd-modal-title">
                        <ArrowRightCircle size={18} />
                        <span>Forward Ticket</span>
                    </div>
                    <div className="fwd-modal-meta">
                        <span className="fwd-modal-id">{ticket.id}</span>
                        <StatusBadge status={ticket.status} size="small" />
                    </div>
                    <button className="fwd-modal-close" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Success overlay */}
                {success ? (
                    <div className="fwd-success">
                        <div className="fwd-success-icon">✅</div>
                        <h3>Allocated successfully</h3>
                        <p>Ticket forwarded to <strong>{success.name}</strong></p>
                    </div>
                ) : (
                    <div className="fwd-modal-body">
                        {/* Product + currently assigned */}
                        <div className="fwd-ticket-info">
                            <span className="fwd-info-row">
                                <span className="fwd-info-label">Product</span>
                                <span className="fwd-info-val">{ticket.productName || '—'}</span>
                            </span>
                            {ticket.assignedTo && (
                                <span className="fwd-info-row">
                                    <span className="fwd-info-label">Current assignee</span>
                                    <span className="fwd-info-val">{ticket.assignedTo}</span>
                                </span>
                            )}
                        </div>

                        {/* Team member picker */}
                        <p className="fwd-section-label">Select team member to forward to</p>
                        {loading ? (
                            <div className="fwd-loading">Loading team members…</div>
                        ) : (
                            <div className="fwd-member-list">
                                {members.length === 0 && (
                                    <div className="fwd-loading">No other team members found.</div>
                                )}
                                {members.map(m => {
                                    const avail = AVAIL_COLORS[m.availability] || AVAIL_COLORS[DEVOPS_AVAILABILITY_STATUS.OFFLINE];
                                    const isSelected = selectedMember?.email === m.email;
                                    return (
                                        <button
                                            key={m.email || m.name}
                                            type="button"
                                            className={`fwd-member-row${isSelected ? ' selected' : ''}`}
                                            onClick={() => setSelectedMember(m)}
                                        >
                                            <span className="fwd-member-avatar">
                                                {(m.name || '?').charAt(0).toUpperCase()}
                                            </span>
                                            <span className="fwd-member-info">
                                                <span className="fwd-member-name">{m.name || m.email}</span>
                                                <span className="fwd-member-email">{m.email}</span>
                                            </span>
                                            <span className="fwd-member-avail">
                                                <span className="fwd-avail-dot" style={{ background: avail.dot }} />
                                                {avail.label}
                                            </span>
                                            {isSelected && <CheckCircle size={15} className="fwd-check" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Notes */}
                        <p className="fwd-section-label" style={{ marginTop: 14 }}>Note for the assignee <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></p>
                        <textarea
                            className="fwd-note"
                            rows={3}
                            placeholder="e.g. Needs urgent attention — DB migration blocked"
                            value={forwardNote}
                            onChange={e => setForwardNote(e.target.value)}
                        />

                        {/* Actions */}
                        <div className="fwd-modal-actions">
                            <button className="fwd-cancel-btn" onClick={onClose}>Cancel</button>
                            <button
                                className="fwd-submit-btn"
                                disabled={!selectedMember || forwarding}
                                onClick={handleForward}
                            >
                                {forwarding ? (
                                    <><span className="fwd-spinner" /> Forwarding…</>
                                ) : (
                                    <><Send size={14} /> Forward to {selectedMember ? selectedMember.name.split(' ')[0] : '…'}</>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const DevOpsDashboard = () => {
    const { instance, accounts } = useMsal();
    const { theme, setTheme, themes } = useTheme();
    const account = accounts[0];
    const userName = account?.name || "DevOps Engineer";
    const userEmail = account?.username || "devops@company.com";
    const userPrincipalName = account?.username || "";

    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [activeSection, setActiveSection] = useState('requests');
    /** Sub-view inside Request Dashboard (was sidebar: Service Queue + Archive). */
    const [requestTab, setRequestTab] = useState('unassigned');
    const [stats, setStats] = useState({});
    const [forwardingTicket, setForwardingTicket] = useState(null);
    const [myAvailability, setMyAvailability] = useState(DEVOPS_AVAILABILITY_STATUS.AVAILABLE);
    const [teamMembers, setTeamMembers] = useState([]);
    const [standupNotes, setStandupNotes] = useState([]);
    const [standupDate, setStandupDate] = useState(new Date().toISOString().split('T')[0]);
    const [showStandupForm, setShowStandupForm] = useState(false);
    const [standupSummary, setStandupSummary] = useState('');
    const [memberUpdates, setMemberUpdates] = useState({});
    const [selectedStandupNote, setSelectedStandupNote] = useState(null);
    const [rotaSchedule, setRotaSchedule] = useState([]);
    const [rotaCalOpen, setRotaCalOpen] = useState(false);
    const [rotaCalMonth, setRotaCalMonth] = useState(() => new Date());
    const [rotaMeta, setRotaMeta] = useState({ rotationMode: "DAILY", leaveByDate: {} });
    const [actionLoading, setActionLoading] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [ticketSearch, setTicketSearch] = useState({ query: "", remote: null, loading: false });
    const [ticketDataVersion, setTicketDataVersion] = useState(0);
    const [unassignedPage, setUnassignedPage] = useState(1);
    const UNASSIGNED_PAGE_SIZE = 12;
    const ticketSearchRef = useRef(ticketSearch);
    const [soundSettings, setSoundSettings] = useState({
        enabled: getSoundEnabled(),
        volume: getVolume()
    });
    const [navGroups, setNavGroups] = usePersistedSidebarNav("devops", DEVOPS_SIDEBAR_NAV_DEFAULTS);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const isLoadingRef = useRef(false);
    const activeSectionRef = useRef(activeSection);
    const requestTabRef = useRef(requestTab);
    const filtersRef = useRef(filters);
    const didUpsertSelfRef = useRef(false);
    
    // Real-time connection status
    const { isConnected } = useConnectionStatus();
    
    const [showStatusSelector, setShowStatusSelector] = useState(false);
    const statusRowRef = useRef(null);
    const lower = (v) => String(v || "").trim().toLowerCase();
    const isMine = useCallback((ticket) => {
        const byEmail = lower(ticket?.assignedToEmail);
        if (byEmail && byEmail === lower(userEmail)) return true;
        return lower(ticket?.assignedTo) === lower(userName);
    }, [userEmail, userName]);

    // Derived permission state
    const isReadOnly = myAvailability === DEVOPS_AVAILABILITY_STATUS.AWAY || myAvailability === DEVOPS_AVAILABILITY_STATUS.BUSY;
    const canSubmitCostEstimate = true;

    // Section counts
    const [sectionCounts, setSectionCounts] = useState({
        unassigned: 0,
        myTickets: 0,
        active: 0,
        history: 0,
        closed: 0
    });
    
    // Keep ref in sync
    useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
    useEffect(() => { requestTabRef.current = requestTab; }, [requestTab]);
    useEffect(() => {
        ticketSearchRef.current = ticketSearch;
    }, [ticketSearch]);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    // "Assign me" is hidden on Unassigned + My Tickets — drop stale bucket if the list was rebuilt (e.g. ticket back to queue).
    const hideAssignMeForRequestsTab =
        requestTab === "unassigned" || requestTab === "myTickets";
    useEffect(() => {
        if (!hideAssignMeForRequestsTab || filters.status !== TICKET_FILTER_BUCKET.ASSIGNED_ME) return;
        const cleared = { ...filters, status: null };
        setFilters(cleared);
        if (activeSection === "requests") {
            applySectionFilter(tickets, requestTab, cleared);
        }
    }, [requestTab, filters.status, filters, tickets, activeSection, hideAssignMeForRequestsTab]);

    useEffect(() => {
        if (activeSection !== "requests" || requestTab !== "unassigned") return;
        if (filters.status) return;
        const withDefault = { ...filters, status: TICKET_FILTER_BUCKET.UNASSIGNED };
        setFilters(withDefault);
        applySectionFilter(tickets, requestTab, withDefault);
    }, [activeSection, requestTab, filters, tickets]);
    
    useEffect(() => {
        if (didUpsertSelfRef.current) return;
        // Only upsert if we have valid user info from Azure AD
        if (!userEmail || userEmail === 'devops@company.com' || !userName) return;
        didUpsertSelfRef.current = true;
        upsertDevOpsTeamMember({ name: userName, email: userEmail }).catch(() => {
            // Silently ignore errors - member may already exist
        });
    }, [userName, userEmail]);

    const recalcSectionCounts = useCallback((allTickets) => {
        const unassigned = allTickets;
        const myTickets = allTickets.filter(t => isMine(t) && t.status !== TICKET_STATUS.CLOSED);
        const active = allTickets.filter(t =>
            [TICKET_STATUS.ACCEPTED, TICKET_STATUS.MANAGER_APPROVAL_PENDING,
                TICKET_STATUS.MANAGER_APPROVED, TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.COST_APPROVED,
                TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ACTION_REQUIRED,
                TICKET_STATUS.ON_HOLD].includes(t.status) && isMine(t)
        );
        const history = allTickets.filter(t => t.status === TICKET_STATUS.COMPLETED && isMine(t));
        const closed = allTickets.filter(t => t.status === TICKET_STATUS.CLOSED && isMine(t));
        setSectionCounts({
            unassigned: unassigned.length,
            myTickets: myTickets.length,
            active: active.length,
            history: history.length,
            closed: closed.length
        });
    }, [isMine]);

    const upsertTicketLocally = useCallback((updatedTicket) => {
        if (!updatedTicket?.id) return;
        setTickets((prev) => {
            const exists = prev.some((t) => t.id === updatedTicket.id);
            const next = exists
                ? prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
                : [updatedTicket, ...prev];
            recalcSectionCounts(next);
            if (activeSectionRef.current === 'requests') {
                applySectionFilter(next, requestTabRef.current);
            }
            return next;
        });
        setFilteredTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        setSelectedTicket((prev) => (prev && prev.id === updatedTicket.id ? updatedTicket : prev));
    }, [recalcSectionCounts]);

    const loadTickets = useCallback(async (silent = false) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        // Only show syncing on initial load or manual refresh
        if (!silent) setIsSyncing(true);
        try {
            const [allTickets, statsData, members, standups, rota, rotaMgmt] = await Promise.all([
                getActiveTicketsForDevOps(),
                getTicketStats(),
                getDevOpsTeamMembers(),
                getStandupNotes(),
                getRotaSchedule(14, new Date()),
                getRotaManagementState().catch(() => ({})),
            ]);
            setTickets(allTickets);
            setStats(statsData);
            recalcSectionCounts(allTickets);
            setTeamMembers(members);
            setStandupNotes(standups);
            setRotaSchedule(rota);
            setRotaMeta({
                rotationMode: rotaMgmt?.rotationMode || "DAILY",
                leaveByDate: rotaMgmt?.leaveByDate || {},
            });
            const currentMember = members.find(m => m.email?.toLowerCase() === userEmail.toLowerCase());
            if (currentMember?.availability) {
                setMyAvailability(currentMember.availability);
            }
            setSelectedTicket((prev) => {
                if (!prev?.id) return prev;
                const latest = allTickets.find((t) => t.id === prev.id);
                return latest || prev;
            });
        
            if (activeSectionRef.current === 'requests') {
                applySectionFilter(allTickets, requestTabRef.current);
            }
            setTicketDataVersion((v) => v + 1);
            setIsInitialLoading(false);
        } finally {
            isLoadingRef.current = false;
            if (!silent) setIsSyncing(false);
        }
    }, [userEmail, recalcSectionCounts]);

    // Sound settings handlers
    const handleSoundToggle = () => {
        const newEnabled = !soundSettings.enabled;
        setSoundEnabled(newEnabled);
        setSoundSettings(prev => ({ ...prev, enabled: newEnabled }));
        if (newEnabled) {
            playShortNotification();
        }
    };

    const handleVolumeChange = (newVolume) => {
        setVolume(newVolume);
        setSoundSettings(prev => ({ ...prev, volume: newVolume }));
    };

    // Real-time sync via WebSocket - silent background updates
    useRealTimeSync({
        onRefresh: () => loadTickets(true), // Silent refresh
        onPatchEvent: (type, data) => {
            if (!data?.id) return;
            if (
                type !== "ticket:created" &&
                type !== "ticket:updated" &&
                type !== "ticket:status_changed"
            ) return;
            setTickets((prev) => {
                const idx = prev.findIndex((t) => t.id === data.id);
                if (idx < 0) return prev;
                const merged = { ...prev[idx], ...data };
                const next = [...prev];
                next[idx] = merged;
                recalcSectionCounts(next);
                if (activeSectionRef.current === "requests") {
                    applySectionFilter(next, requestTabRef.current, filtersRef.current);
                }
                return next;
            });
        },
        playNewTicketSound: true,
        playUpdateSound: true,
        enableWebSocket: true,
        pollingInterval: null // No polling
    });

    useEffect(() => {
        const unsubscribe = subscribeDataChanges((detail) => {
            if (!detail?.scope) return;
            if (["tickets", "devops-team", "projects", "managers", "rota"].includes(detail.scope)) {
                loadTickets(true);
            }
        });
        return unsubscribe;
    }, [loadTickets]);

    useEffect(() => {
        if (!showStatusSelector) return;
        const onPointerDown = (e) => {
            if (statusRowRef.current?.contains(e.target)) return;
            setShowStatusSelector(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setShowStatusSelector(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [showStatusSelector]);

    // Manual refresh handler
    const handleManualRefresh = () => {
        setIsSyncing(true);
        loadTickets(false); // Show syncing for manual refresh
    };
    
    const applySectionFilter = (fullTicketList, section, filtersOverride = null) => {
        const f = filtersOverride || filtersRef.current;
        const ts = ticketSearchRef.current;
        let result = [...fullTicketList];
        if (ts.query.trim() && !ts.loading && ts.remote != null) {
            const ids = new Set(ts.remote.map((t) => t.id));
            result = result.filter((t) => ids.has(t.id));
        }

        switch (section) {
            case 'unassigned':
                result = result.filter(() => true);
                break;
            case 'myTickets':
                // My Tickets shows all assigned tickets except closed (closed go to Archive > Closed)
                result = result.filter(t => isMine(t) && t.status !== TICKET_STATUS.CLOSED);
                break;
            case 'active':
                result = result.filter(t => 
                    [TICKET_STATUS.ACCEPTED, TICKET_STATUS.MANAGER_APPROVAL_PENDING, 
                     TICKET_STATUS.MANAGER_APPROVED, TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.COST_APPROVED,
                     TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ACTION_REQUIRED, 
                     TICKET_STATUS.ON_HOLD].includes(t.status) && isMine(t)
                );
                break;
            case 'history':
                // Completed only — closed tickets have their own section
                result = result.filter(t => t.status === TICKET_STATUS.COMPLETED && isMine(t));
                break;
            case 'profile':
                result = [];
                break;
            case 'standup':
                result = [];
                break;
            case 'closed':
                result = result.filter(t => t.status === TICKET_STATUS.CLOSED && isMine(t));
                break;
            case 'rota':
                result = [];
                break;
            default:
                break;
        }
        
        // Apply additional filters
        if (f.status) {
            const ctx = { userName, userEmail };
            result = result.filter((t) => ticketMatchesPrimaryStatusFilter(t, f.status, ctx));
        }
        if (f.requestType) {
            result = result.filter(t => t.requestType === f.requestType);
        }
        if (f.environment) {
            result = result.filter(t => t.environment === f.environment);
        }
        if (section === 'unassigned' && f.assignedTo) {
            const assigneeNeedle = String(f.assignedTo).toLowerCase().trim();
            result = result.filter((t) =>
                (t.assignedToEmail || "").toLowerCase() === assigneeNeedle ||
                (t.assignedTo || "").toLowerCase() === assigneeNeedle
            );
        }
        if (f.search) {
            const searchLower = String(f.search).toLowerCase().trim();
            result = result.filter((t) => {
                const id = (t.id || "").toLowerCase();
                const tail = id.includes("-") ? id.split("-").pop() : id;
                return (
                    id.includes(searchLower) ||
                    tail.includes(searchLower) ||
                    (t.productName || "").toLowerCase().includes(searchLower) ||
                    (t.requestedBy || "").toLowerCase().includes(searchLower) ||
                    (t.requesterEmail || "").toLowerCase().includes(searchLower) ||
                    (t.description || "").toLowerCase().includes(searchLower) ||
                    (t.assignedTo || "").toLowerCase().includes(searchLower) ||
                    (t.assignedToEmail || "").toLowerCase().includes(searchLower) ||
                    (t.environment || "").toLowerCase().includes(searchLower) ||
                    (t.projectId || "").toLowerCase().includes(searchLower)
                );
            });
        }
        
        setFilteredTickets(result);
    };

    useEffect(() => {
        if (activeSection !== "requests") return;
        applySectionFilter(tickets, requestTabRef.current, filtersRef.current);
    }, [ticketSearch, tickets, activeSection, requestTab]);
    
    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        if (requestTab === 'unassigned') {
            setUnassignedPage(1);
        }
        if (activeSection === 'requests') {
            applySectionFilter(tickets, requestTab, newFilters);
        }
    };

    const unassignedAssigneeOptions = teamMembers
        .map((member) => ({
            value: String(member.email || member.name || "").trim().toLowerCase(),
            label: member.name && member.email ? `${member.name} (${member.email})` : (member.name || member.email || "")
        }))
        .filter((member) => member.value && member.label)
        .sort((a, b) => a.label.localeCompare(b.label));

    const totalUnassignedPages = requestTab === 'unassigned'
        ? Math.max(1, Math.ceil(filteredTickets.length / UNASSIGNED_PAGE_SIZE))
        : 1;
    const paginatedTickets = requestTab === 'unassigned'
        ? filteredTickets.slice((unassignedPage - 1) * UNASSIGNED_PAGE_SIZE, unassignedPage * UNASSIGNED_PAGE_SIZE)
        : filteredTickets;

    useEffect(() => {
        if (requestTab !== 'unassigned') return;
        if (unassignedPage > totalUnassignedPages) {
            setUnassignedPage(totalUnassignedPages);
        }
    }, [requestTab, unassignedPage, totalUnassignedPages]);
    
    const TICKET_TABS = ['unassigned', 'myTickets', 'active', 'history', 'closed'];

    const handleSectionChange = (section) => {
        if (section === 'requests') {
            setActiveSection('requests');
            applySectionFilter(tickets, requestTabRef.current);
            return;
        }
        if (TICKET_TABS.includes(section)) {
            setActiveSection('requests');
            setRequestTab(section);
            const clearAssignMe =
                (section === 'unassigned' || section === 'myTickets') &&
                filters.status === TICKET_FILTER_BUCKET.ASSIGNED_ME;
            if (clearAssignMe) {
                const cleared = { ...filters, status: null };
                setFilters(cleared);
                applySectionFilter(tickets, section, cleared);
            } else {
                applySectionFilter(tickets, section);
            }
            return;
        }
        setActiveSection(section);
    };
    
    const handleAcceptTicket = async (ticketId) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: TICKET_STATUS.ACCEPTED, assignedTo: userName } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: TICKET_STATUS.ACCEPTED, assignedTo: userName } : ticket
        )));
        try {
            setActionLoading("Assigning ticket...");
            const updated = await assignTicket(ticketId, userName, { name: userName, email: userEmail });
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };
    
    const handleStatusChange = async (ticketId, newStatus, notes, meta = {}) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId
                ? {
                    ...ticket,
                    status: newStatus,
                    ...(meta.reopen ? { assignedTo: null, assignedToEmail: null } : {}),
                }
                : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId
                ? {
                    ...ticket,
                    status: newStatus,
                    ...(meta.reopen ? { assignedTo: null, assignedToEmail: null } : {}),
                }
                : ticket
        )));
        try {
            setActionLoading("Updating ticket status...");
            const updated = await updateTicketStatus(ticketId, newStatus, { name: userName, email: userEmail }, notes, meta);
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };


    const handleApprovalTrigger = (ticket) => {
        const note = window.prompt("Enter approval purpose / note:", "Approval required for implementation");
        if (note === null) return;
        const trimmed = (note || "").trim();
        handleStatusChange(
            ticket.id,
            TICKET_STATUS.MANAGER_APPROVAL_PENDING,
            trimmed || "Approval requested",
            ticket.managerEmail ? { approvalTargetEmail: ticket.managerEmail } : {}
        );
    };
    
    const handleAddNote = async (ticketId, notes, attachments = []) => {
        try {
            setActionLoading("Adding ticket note...");
            const updated = await addTicketNote(ticketId, { name: userName, email: userEmail }, notes, attachments);
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };
    
    const handleForwardTicket = async (ticketId, newAssignee, newAssigneeEmail, forwardNote) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, assignedTo: newAssignee } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, assignedTo: newAssignee } : ticket
        )));
        try {
            setActionLoading("Forwarding ticket...");
            const updated = await forwardTicket(ticketId, newAssignee, newAssigneeEmail, { name: userName, email: userEmail }, forwardNote);
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleAssignToSelf = async (ticketId) => {
        try {
            setActionLoading("Assigning ticket...");
            const updated = await assignTicket(ticketId, userName, { name: userName, email: userEmail });
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleLogout = () => {
        signOutRedirectToLogin(instance);
    };

    const handleAvailabilityChange = async (availability) => {
        setShowStatusSelector(false);
        try {
            setActionLoading("Updating availability...");
            await updateDevOpsAvailability(userEmail, availability, userName);
            setMyAvailability(availability);
            setTeamMembers(await getDevOpsTeamMembers({ force: true }));
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleCreateStandup = async () => {
        try {
            setActionLoading("Saving standup note...");
            await addStandupNote(
                { date: standupDate, summary: standupSummary, updates: memberUpdates },
                { name: userName, email: userEmail }
            );
            setStandupNotes(await getStandupNotes());
            setStandupSummary('');
            setMemberUpdates({});
            setShowStandupForm(false);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };
    
    const QuickActions = ({ ticket }) => {
        if (isReadOnly) return null;

        if (!ticket.assignedTo && ticket.status === TICKET_STATUS.CREATED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button className="quick-btn accept" onClick={() => handleAcceptTicket(ticket.id)}>
                        <UserPlus size={14} /> Assign
                    </button>
                </div>
            );
        }

        // "Assign Me" removed — Assign already takes the ticket to the current user.

        const actions = [];

        if (ticket.status === TICKET_STATUS.ACCEPTED) {
            if (ticket.managerApprovalRequired) {
                actions.push(
                    <button key="pending" className="quick-btn" onClick={() => handleApprovalTrigger(ticket)}>
                        <Clock size={14} /> Pending
                    </button>
                );
            }
            if (!ticket.managerApprovalRequired) {
                actions.push(
                    <button key="progress" className="quick-btn start" onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Started working')}>
                        <PlayCircle size={14} /> Progress
                    </button>
                );
            }
        }

        if (ticket.status === TICKET_STATUS.MANAGER_APPROVED || ticket.status === TICKET_STATUS.COST_APPROVED) {
            actions.push(
                <button key="progress" className="quick-btn start" onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Starting work')}>
                    <PlayCircle size={14} /> Progress
                </button>
            );
        }

        if (canSubmitCostEstimate) {
            actions.push(
                <button
                    key="cost"
                    className="quick-btn"
                    onClick={() => openCostEstimateWindow(ticket.id)}
                    type="button"
                >
                    <Database size={14} /> Cost Estimate
                </button>
            );
        }

        if (ticket.status === TICKET_STATUS.IN_PROGRESS) {
            actions.push(
                <button key="close" className="quick-btn complete" onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.COMPLETED, 'Work completed')}>
                    <CheckCircle size={14} /> Close
                </button>
            );
        }

        if (ticket.status === TICKET_STATUS.COMPLETED) {
            actions.push(
                <button key="close" className="quick-btn" onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.CLOSED, 'Ticket closed')}>
                    Close
                </button>
            );
        }

        if (ticket.status === TICKET_STATUS.ACTION_REQUIRED) {
            actions.push(
                <button key="progress" className="quick-btn start" onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Resuming work')}>
                    <PlayCircle size={14} /> Progress
                </button>
            );
        }

        if (actions.length === 0) return null;

        return (
            <div className="quick-actions" onClick={e => e.stopPropagation()}>
                {actions}
            </div>
        );
    };

    // Animated Status Selector component
    const StatusSelector = ({ compact = false }) => {
        return (
            <div className={`status-selector ${compact ? 'compact' : ''}`} role="listbox" aria-label="Set availability">
                {AVAILABILITY_STATUS_ORDER.map((status) => {
                    const config = STATUS_CONFIG[status];
                    if (!config) return null;
                    const IconComponent = config.icon;
                    const isActive = myAvailability === status;
                    return (
                        <button
                            key={status}
                            type="button"
                            className={`status-option ${isActive ? 'active' : ''}`}
                            onClick={() => handleAvailabilityChange(status)}
                            style={{
                                '--status-color': config.color,
                                '--status-bg': config.bg
                            }}
                            role="option"
                            aria-selected={isActive}
                        >
                            <div className={`status-dot-animated ${isActive ? 'pulse' : ''}`}
                                 style={{ backgroundColor: config.color }} />
                            <IconComponent size={compact ? 14 : 18} aria-hidden />
                            <span className="status-option-text">
                                <span className="status-option-label">{config.label}</span>
                                <span className="status-option-desc">{config.description}</span>
                            </span>
                            {isActive && <div className="status-active-indicator" />}
                        </button>
                    );
                })}
            </div>
        );
    };
    

    // Section header component
    const SectionHeader = ({ title, description, count, icon: Icon }) => (
        <div className="section-header-info">
            <div className="section-icon">
                <Icon size={24} />
            </div>
            <div>
                <h2>{title} <span className="count-badge">{count}</span></h2>
                <p>{description}</p>
            </div>
        </div>
    );

    if (isInitialLoading) return <LoadingScreen role="devops" />;

    return (
        <div className={`dashboard-layout devops-dashboard ${isReadOnly ? 'is-readonly' : ''}`}>


            <aside className="shipit-sidebar">
                {/* Brand */}
                <div className="sb-brand">
                    <div className="sb-brand-icon" style={{ background: '#0891b2' }}>
                        <Terminal size={18} />
                        <span className={`sb-conn-dot ${isConnected ? 'connected' : 'disconnected'}`}
                              title={isConnected ? 'Live connection' : 'Disconnected'} />
                    </div>
                    <div className="sb-brand-meta">
                        <span className="sb-app-name">ShipIt</span>
                        <span className="sb-app-subtitle">Engineering Console</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sb-nav">
                    <div className="sb-group">
                        <a
                            href="#"
                            className={`sb-item ${activeSection === 'requests' ? 'active' : ''}`}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('requests'); }}
                        >
                            <span className="sb-item-icon"><LayoutDashboard size={15} /></span>
                            <span className="sb-item-text">Request Dashboard</span>
                        </a>
                    </div>

                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.team}
                            onToggle={() => setNavGroups(g => ({ ...g, team: !g.team }))}
                            label="Team"
                        />
                        {navGroups.team && (
                            <div className="sb-group-items">
                                <a href="#" className={`sb-item ${activeSection === 'standup' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); handleSectionChange('standup'); }}>
                                    <span className="sb-item-icon"><StickyNote size={15} /></span>
                                    <span className="sb-item-text">Daily Sync</span>
                                </a>
                                <a href="#" className={`sb-item ${activeSection === 'rota' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); handleSectionChange('rota'); }}>
                                    <span className="sb-item-icon"><RotateCcw size={15} /></span>
                                    <span className="sb-item-text">On-Call Schedule</span>
                                </a>
                                <a href="#" className={`sb-item ${activeSection === 'monitoring' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); handleSectionChange('monitoring'); }}>
                                    <span className="sb-item-icon"><BarChart3 size={15} /></span>
                                    <span className="sb-item-text">Analytics</span>
                                </a>
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
                                <a href="#" className={`sb-item ${activeSection === 'settings' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); handleSectionChange('settings'); }}>
                                    <span className="sb-item-icon"><Settings size={15} /></span>
                                    <span className="sb-item-text">Preferences</span>
                                </a>
                                <a href="#" className={`sb-item ${activeSection === 'profile' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); handleSectionChange('profile'); }}>
                                    <span className="sb-item-icon"><ProfileIcon size={15} /></span>
                                    <span className="sb-item-text">My Account</span>
                                </a>
                            </div>
                        )}
                    </div>
                </nav>

                {/* Footer */}
                <div className="sb-footer">
                    {/* My Status selector */}
                    <div className="sb-status-row" ref={statusRowRef}>
                        <button
                            type="button"
                            className="sb-status-btn"
                            aria-expanded={showStatusSelector}
                            aria-haspopup="listbox"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowStatusSelector((v) => !v);
                            }}
                        >
                            {(() => {
                                const cfg = STATUS_CONFIG[myAvailability] || STATUS_CONFIG[DEVOPS_AVAILABILITY_STATUS.OFFLINE];
                                const StatusIcon = cfg.icon;
                                return (
                                    <>
                                        <StatusIcon size={16} style={{ color: cfg.color, flexShrink: 0 }} aria-hidden />
                                        <div className="sb-status-btn-text">
                                            <span className="sb-status-btn-label">My status</span>
                                            <span className="sb-status-btn-value">{cfg.label}</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </button>
                        {showStatusSelector && (
                            <div
                                className="status-selector-popup sb-status-popup"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <StatusSelector compact />
                            </div>
                        )}
                    </div>

                    <div className="sb-user-row">
                        <div className="sb-avatar" style={{ background: '#0e7490' }}>
                            {(userName || '').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?'}
                        </div>
                        <div className="sb-user-meta">
                            <span className="sb-user-name">{userName}</span>
                            <span className="sb-user-email">{userEmail}</span>
                        </div>
                        {requestTab !== 'unassigned' && (
                            <button
                                className={`btn-filter ${showFilters ? 'active' : ''}`}
                                onClick={() => setShowFilters(!showFilters)}
                            >
                                <Filter size={16} />
                                Filters
                            </button>
                        )}
                    </div>
                    <div className="sb-footer-actions">
                        <span className="sb-role-badge devops">DevOps</span>
                        <button className="sb-logout-btn" onClick={handleLogout}>
                            <LogOut size={12} /> Sign Out
                        </button>
                    </div>
                </div>
            </aside>
            
            <main className="dashboard-content">

                {/* Read-Only Banner */}
                {isReadOnly && (
                    <div className={`readonly-banner ${myAvailability === DEVOPS_AVAILABILITY_STATUS.AWAY ? 'away' : 'busy'}`}>
                        <div className="readonly-banner-content">
                            {myAvailability === DEVOPS_AVAILABILITY_STATUS.AWAY ? (
                                <><Coffee size={18} /> <span><strong>Read-only mode</strong> — You are currently <strong>Away</strong>. Change your status to Available to make changes.</span></>
                            ) : (
                                <><AlertCircle size={18} /> <span><strong>Read-only mode</strong> — You are currently <strong>Busy</strong>. Change your status to Available to make changes.</span></>
                            )}
                        </div>
                        <button className="readonly-banner-action" onClick={() => handleAvailabilityChange(DEVOPS_AVAILABILITY_STATUS.AVAILABLE)}>
                            <CheckCircle size={16} /> Go Available
                        </button>
                    </div>
                )}

                <header className="content-header jira-style">
                    <div className="header-top">
                        <div className="header-title-section">
                            <div className="breadcrumb">
                                <span>DevOps Hub</span>
                                <span className="breadcrumb-separator">/</span>
                                <span>
                                    {activeSection === 'requests' && requestTab === 'unassigned' && 'Unassigned'}
                                    {activeSection === 'requests' && requestTab === 'myTickets' && 'My Tickets'}
                                    {activeSection === 'requests' && requestTab === 'active' && 'Active'}
                                    {activeSection === 'requests' && requestTab === 'history' && 'Completed'}
                                    {activeSection === 'requests' && requestTab === 'closed' && 'Closed'}
                                    {activeSection === 'monitoring' && 'Monitoring'}
                                    {activeSection === 'profile' && 'Profile'}
                                    {activeSection === 'standup' && 'Standup'}
                                    {activeSection === 'rota' && 'Rota'}
                                    {activeSection === 'settings' && 'Settings'}
                                </span>
                            </div>
                            <h1>
                                {activeSection === 'requests' && requestTab === 'unassigned' && 'Unassigned Requests'}
                                {activeSection === 'requests' && requestTab === 'myTickets' && 'My Tickets'}
                                {activeSection === 'requests' && requestTab === 'active' && 'Active Requests'}
                                {activeSection === 'requests' && requestTab === 'history' && 'Completed Tickets'}
                                {activeSection === 'requests' && requestTab === 'closed' && 'Closed Tickets'}
                                {activeSection === 'monitoring' && 'Environment Monitoring'}
                                {activeSection === 'profile' && 'My Profile'}
                                {activeSection === 'standup' && 'Daily Standup Notes'}
                                {activeSection === 'rota' && 'Night Shift Rota'}
                                {activeSection === 'settings' && 'Settings'}
                            </h1>
                            {activeSection === 'requests' && (
                                <p className="header-subtitle">
                                    {requestTab === 'unassigned' && 'New tickets waiting to be assigned.'}
                                    {requestTab === 'myTickets' && 'Tickets currently assigned to you.'}
                                    {requestTab === 'active' && 'All active tickets being worked on.'}
                                    {requestTab === 'history' && 'Requests marked completed (not yet closed).'}
                                    {requestTab === 'closed' && 'Requests that are fully closed.'}
                                </p>
                            )}
                        </div>
                        <div className="header-actions">
                            {activeSection === "requests" && (
                                <TicketSearchBar
                                    scope="global"
                                    ticketDataVersion={ticketDataVersion}
                                    onPickTicket={(t) => setSelectedTicket(t)}
                                    onSearchStateChange={setTicketSearch}
                                    className="ticket-search-bar--header"
                                />
                            )}
                            <button 
                                className={`btn-icon ${isSyncing ? 'syncing' : ''}`}
                                onClick={handleManualRefresh}
                                title="Refresh"
                            >
                                <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
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
                            <div className="sound-settings" style={{ marginTop: '1.5rem' }}>
                                <div className="sound-settings-header">
                                    <span className="sound-settings-title">
                                        <Settings size={18} style={{ marginRight: 8 }} />
                                        Theme
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                    {themes.map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setTheme(t)}
                                            style={{
                                                padding: '0.5rem 1.25rem',
                                                borderRadius: 8,
                                                border: theme === t ? '2px solid var(--accent-color)' : '2px solid var(--border-color)',
                                                background: theme === t ? 'var(--accent-light)' : 'var(--card-bg)',
                                                color: 'var(--text-main)',
                                                fontWeight: theme === t ? 600 : 400,
                                                cursor: 'pointer',
                                                textTransform: 'capitalize',
                                                fontSize: '0.875rem',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : t === 'retro' ? '🕹️ Retro' : '🎬 DevOps'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                <>
                {/* Compact Mini Stats Bar — only on ticket sections */}
                {activeSection === 'requests' && (
                <div className="mini-stats-bar">
                    <button
                        className={`mini-stat ${requestTab === 'unassigned' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('unassigned')}
                    >
                        <span className="mini-stat-icon orange"><Inbox size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.unassigned}</span>
                        <span className="mini-stat-label">Unassigned</span>
                        {sectionCounts.unassigned > 0 && <span className="mini-stat-badge">!</span>}
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${requestTab === 'myTickets' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('myTickets')}
                    >
                        <span className="mini-stat-icon blue"><Ticket size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.myTickets}</span>
                        <span className="mini-stat-label">My Tickets</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${requestTab === 'active' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('active')}
                    >
                        <span className="mini-stat-icon purple"><PlayCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.active}</span>
                        <span className="mini-stat-label">Active</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${requestTab === 'history' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('history')}
                    >
                        <span className="mini-stat-icon green"><CheckCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.history}</span>
                        <span className="mini-stat-label">Completed</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${requestTab === 'closed' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('closed')}
                    >
                        <span className="mini-stat-icon red"><XCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.closed}</span>
                        <span className="mini-stat-label">Closed</span>
                    </button>
                </div>
                )}
                 
                {/* Content Sections */}
                {activeSection === 'monitoring' ? (
                    <EnvMonitoringDashboard
                        tickets={tickets}
                        devOpsMembers={teamMembers}
                        userRole="devops"
                    />
                ) : activeSection === 'profile' ? (
                    <div className="tickets-section profile-section-wrap">
                        <DashboardProfilePage
                            userName={userName}
                            userEmail={userEmail}
                            userPrincipalName={userPrincipalName}
                            roleKey="devops"
                            onSignOut={handleLogout}
                            avatarColor="#0e7490"
                        />
                    </div>
                ) : activeSection === 'standup' ? (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <h3>Standup Sticky Notes</h3>
                            <button className="btn-primary" onClick={() => setShowStandupForm(!showStandupForm)}>
                                <Plus size={16} /> {showStandupForm ? 'Cancel' : 'New Standup'}
                            </button>
                        </div>
                        <div className="tickets-list">
                            {showStandupForm && (
                                <div className="team-member-card">
                                    <div className="form-row">
                                        <input type="date" value={standupDate} onChange={(e) => setStandupDate(e.target.value)} />
                                        <input
                                            type="text"
                                            placeholder="Standup summary"
                                            value={standupSummary}
                                            onChange={(e) => setStandupSummary(e.target.value)}
                                        />
                                    </div>
                                    <div className="team-members-grid" style={{ marginTop: '10px' }}>
                                        {teamMembers.map(member => (
                                            <div key={member.email} className="team-member-card">
                                                <strong>{member.name}</strong>
                                                <textarea
                                                    placeholder="Status update..."
                                                    rows={3}
                                                    value={memberUpdates[member.email] || ''}
                                                    onChange={(e) => setMemberUpdates(prev => ({ ...prev, [member.email]: e.target.value }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '10px' }}>
                                        <button className="btn-primary" onClick={handleCreateStandup}>Save Sticky Note</button>
                                    </div>
                                </div>
                            )}

                            {standupNotes.length === 0 ? (
                                <div className="empty-state">
                                    <StickyNote size={48} />
                                    <h3>No standup notes yet</h3>
                                    <p>Create a daily standup sticky note using the + button.</p>
                                </div>
                            ) : (
                                <>
                                    {!selectedStandupNote ? (
                                        <div className="standup-grid">
                                            {standupNotes.map(note => {
                                                const dayName = new Date(note.date).toLocaleDateString('en-US', { weekday: 'short' });
                                                return (
                                                    <button
                                                        key={note.id}
                                                        className="standup-note-mini"
                                                        onClick={() => setSelectedStandupNote(note)}
                                                    >
                                                        <div className="mini-day">{dayName}</div>
                                                        <div className="mini-date">{note.date}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="standup-note-card">
                                            <div className="team-member-head">
                                                <strong>{selectedStandupNote.date}</strong>
                                                <button className="btn-secondary" onClick={() => setSelectedStandupNote(null)}>Back</button>
                                            </div>
                                            <p>{selectedStandupNote.summary || 'Daily standup update'}</p>
                                            <div className="team-members-grid">
                                                {selectedStandupNote.updates?.map(update => (
                                                    <div className="team-member-card" key={`${selectedStandupNote.id}-${update.memberEmail}`}>
                                                        <strong>{update.memberName}</strong>
                                                        <p>{update.statusUpdate || 'No update provided'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ) : activeSection === 'rota' ? (
                    <div className="tickets-section rota-page-wrap">
                        <div className="rota-page rota-page--readonly">
                            <div className="rota-actions-bar">
                                <div className="rota-actions-bar__left">
                                    <span className="rota-mode-badge">
                                        Shift: {String(rotaMeta.rotationMode || "DAILY").toUpperCase() === "WEEKLY" ? "Weekly" : "Daily"}
                                    </span>
                                </div>
                                <div className="rota-actions-bar__btns">
                                    <button type="button" className="rota-icon-btn" onClick={() => { setRotaCalOpen(true); }}>
                                        <Calendar size={18} aria-hidden /> Calendar
                                    </button>
                                </div>
                            </div>
                            <RotaCalendarModal
                                open={rotaCalOpen}
                                onClose={() => setRotaCalOpen(false)}
                                isAdmin={false}
                                initialEdit={false}
                                calMonth={rotaCalMonth}
                                onCalMonthChange={setRotaCalMonth}
                                devOpsMembers={teamMembers}
                                rotationMode={rotaMeta.rotationMode}
                                leaveByDate={rotaMeta.leaveByDate}
                                onUpdated={async () => {
                                    const [r, s] = await Promise.all([
                                        getRotaSchedule(14, new Date()),
                                        getRotaManagementState().catch(() => ({})),
                                    ]);
                                    setRotaSchedule(r);
                                    setRotaMeta({
                                        rotationMode: s?.rotationMode || "DAILY",
                                        leaveByDate: s?.leaveByDate || {},
                                    });
                                }}
                            />
                            <section className="rota-section rota-section--schedule">
                                <div className="rota-schedule-head">
                                    <h3 className="rota-section__title">
                                        <Moon size={18} aria-hidden /> On-call schedule
                                    </h3>
                                    <p>Next 14 nights — same rotation as admin. Open the calendar for a full month view. Contact an admin to change assignments.</p>
                                </div>
                                <div className="rota-schedule-grid">
                                    {(rotaSchedule || []).map((day) => {
                                        const names = (day.members || []).map((m) => m.name).filter(Boolean);
                                        const s = String(day.date || '');
                                        const d = s.length <= 10 ? new Date(`${s}T12:00:00`) : new Date(s);
                                        const short = Number.isNaN(d.getTime()) ? day.date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                        return (
                                            <div className={`rota-day-card${day.isManual ? ' rota-day-card--manual' : ''}`} key={day.date}>
                                                <div className="rota-day-card__meta">
                                                    <span className="rota-day-card__dow">{day.dayName || '—'}</span>
                                                    <span className="rota-day-card__date">{short}</span>
                                                </div>
                                                {names.length > 0 ? (
                                                    <div className="rota-chip-row">
                                                        {names.map((n, i) => (
                                                            <span className="rota-chip" key={`${day.date}-${i}`}>{n}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="rota-empty-shift">No assignee</div>
                                                )}
                                                {day.isManual && <span className="rota-manual-pill">Manual</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    </div>
                ) : <div className="tickets-section">
                    <div className="tickets-header">
                        <div className="section-title">
                            {activeSection === 'requests' && requestTab === 'unassigned' && (
                                <SectionHeader 
                                    title="Unassigned Queue" 
                                    description="Click Assign to take ownership from the queue"
                                    count={sectionCounts.unassigned}
                                    icon={Inbox}
                                />
                            )}
                            {activeSection === 'requests' && requestTab === 'myTickets' && (
                                <SectionHeader 
                                    title="Your Assigned Tickets" 
                                    description="Tickets you are responsible for"
                                    count={sectionCounts.myTickets}
                                    icon={Ticket}
                                />
                            )}
                            {activeSection === 'requests' && requestTab === 'active' && (
                                <SectionHeader 
                                    title="My Active Tickets" 
                                    description="Your active assigned requests"
                                    count={sectionCounts.active}
                                    icon={Activity}
                                />
                            )}
                            {activeSection === 'requests' && requestTab === 'history' && (
                                <SectionHeader 
                                    title="Completed Tickets" 
                                    description="Work finished — awaiting archive or follow-up"
                                    count={sectionCounts.history}
                                    icon={History}
                                />
                            )}
                            {activeSection === 'requests' && requestTab === 'closed' && (
                                <SectionHeader 
                                    title="Closed Tickets" 
                                    description="Fully closed requests (no further action)"
                                    count={sectionCounts.closed}
                                    icon={CheckCircle}
                                />
                            )}
                        </div>
                    </div>
                    
                    {showFilters && requestTab !== 'unassigned' && (
                        <TicketFilters 
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            hideAssignMeOption={
                                requestTab === 'unassigned' || requestTab === 'myTickets'
                            }
                        />
                    )}
                    {requestTab === 'unassigned' && (
                        <TicketFilters
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            hideAssignMeOption
                            showAssigneeFilter
                            assigneeOptions={unassignedAssigneeOptions}
                            searchPlaceholder="Search queue (id, person/email, environment, project id…)"
                        />
                    )}
                    
                    {/* Tickets List */}
                    <div className="tickets-list enhanced">
                        {filteredTickets.length === 0 ? (
                            <div className="empty-state">
                                {requestTab === 'unassigned' && <Inbox size={48} />}
                                {requestTab === 'myTickets' && <Ticket size={48} />}
                                {requestTab === 'active' && <Activity size={48} />}
                                {requestTab === 'history' && <History size={48} />}
                                {requestTab === 'closed' && <CheckCircle size={48} />}
                                <h3>
                                    {requestTab === 'unassigned' && "No tickets found"}
                                    {requestTab === 'myTickets' && "No tickets assigned to you"}
                                    {requestTab === 'active' && "No active tickets"}
                                    {requestTab === 'history' && "No completed tickets yet"}
                                    {requestTab === 'closed' && "No closed tickets yet"}
                                </h3>
                                <p>
                                    {requestTab === 'unassigned' && "No tickets match the current queue filters."}
                                    {requestTab === 'myTickets' && "Assign tickets from the Unassigned queue to get started."}
                                    {requestTab === 'active' && "No tickets are currently being processed."}
                                    {requestTab === 'history' && "Completed tickets will appear here."}
                                    {requestTab === 'closed' && "Closed tickets will appear in this separate section."}
                                </p>
                            </div>
                        ) : (
                            paginatedTickets.map(ticket => (
                                <TicketCard
                                    key={ticket.id}
                                    ticket={ticket}
                                    onClick={() => setSelectedTicket(ticket)}
                                    showActions={false}
                                    highlightAssigned={requestTab === 'unassigned'}
                                />
                            ))
                        )}
                    </div>
                    {requestTab === 'unassigned' && filteredTickets.length > UNASSIGNED_PAGE_SIZE && (
                        <div className="jtc-pagination">
                            <button
                                className="jtc-page-btn"
                                type="button"
                                onClick={() => setUnassignedPage((p) => Math.max(1, p - 1))}
                                disabled={unassignedPage <= 1}
                            >
                                Prev
                            </button>
                            <span className="jtc-page-info">
                                Page {unassignedPage} / {totalUnassignedPages}
                            </span>
                            <button
                                className="jtc-page-btn"
                                type="button"
                                onClick={() => setUnassignedPage((p) => Math.min(totalUnassignedPages, p + 1))}
                                disabled={unassignedPage >= totalUnassignedPages}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>}
                </>
                )}
            </main>
            
            {/* Ticket Details Modal */}
            {selectedTicket && (
                <TicketDetailsModal 
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onStatusChange={handleStatusChange}
                    onAddNote={handleAddNote}
                    user={{ name: userName, email: userEmail }}
                    canManage={true}
                    canSubmitCostEstimate
                    onAssignToSelf={handleAssignToSelf}
                    onRequestCostApproval={(t, opts) => {
                        openCostEstimateWindow(t.id, opts?.costApproverEmail);
                    }}
                    onForward={!isReadOnly ? () => setForwardingTicket(selectedTicket) : undefined}
                />
            )}
            
            {/* Forward Ticket Modal */}
            {forwardingTicket && (
                <ForwardTicketModal
                    ticket={forwardingTicket}
                    onClose={() => setForwardingTicket(null)}
                    onForward={handleForwardTicket}
                    currentUser={{ name: userName, email: userEmail }}
                />
            )}
        </div>
    );
};

export default DevOpsDashboard;
