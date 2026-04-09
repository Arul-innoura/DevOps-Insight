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
    Forward,
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
    Search,
    TrendingUp,
    Zap,
    Eye,
    EyeOff,
    Coffee,
    Moon,
    Shield,
    Database,
    XCircle
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
    getDevOpsTeamMembers,
    updateDevOpsAvailability,
    upsertDevOpsTeamMember,
    DEVOPS_AVAILABILITY_STATUS,
    getStandupNotes,
    addStandupNote,
    getRotaSchedule,
    subscribeDataChanges
} from "../../services/ticketService";
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
import { usePersistedSidebarNav } from "../../services/sidebarNavStorage";
import { NavSectionToggle } from "../../components/NavSectionToggle";
import DashboardProfilePage from "../../components/DashboardProfilePage";
import { useTheme } from "../../services/ThemeContext";

const DEVOPS_SIDEBAR_NAV_DEFAULTS = { queue: true, archive: true, team: true, account: true };

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

// Forward Ticket Modal Component
const ForwardTicketModal = ({ ticket, onClose, onForward, currentUser }) => {
    const [selectedEngineer, setSelectedEngineer] = useState('');
    const [forwardNote, setForwardNote] = useState('');
    const [availableEngineers, setAvailableEngineers] = useState([]);
    
    useEffect(() => {
        const loadEngineers = async () => {
            const members = await getDevOpsTeamMembers();
            const engineers = members
                .filter(e => e.name !== currentUser.name)
                .filter(e => e.availability !== DEVOPS_AVAILABILITY_STATUS.OFFLINE);
            setAvailableEngineers(engineers);
        };
        loadEngineers();
    }, [currentUser.name]);
    
    const handleForward = () => {
        if (!selectedEngineer) {
            alert('Please select an engineer to forward to');
            return;
        }
        const engineer = availableEngineers.find(e => e.name === selectedEngineer);
        onForward(ticket.id, selectedEngineer, engineer?.email || '', forwardNote);
        onClose();
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content forward-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Forward size={20} /> Forward Ticket</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="forward-ticket-info">
                        <p><strong>Ticket:</strong> {ticket.id}</p>
                        <p><strong>Current Status:</strong> <StatusBadge status={ticket.status} size="small" /></p>
                        {ticket.assignedTo && (
                            <p><strong>Currently Assigned:</strong> {ticket.assignedTo}</p>
                        )}
                    </div>
                    
                    <div className="form-field">
                        <label>Forward to Engineer *</label>
                        <select 
                            value={selectedEngineer}
                            onChange={e => setSelectedEngineer(e.target.value)}
                            required
                        >
                            <option value="">Select Engineer...</option>
                            {availableEngineers.map(eng => (
                                <option key={eng.email} value={eng.name}>
                                    {eng.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="form-field">
                        <label>Forward Note</label>
                        <textarea
                            value={forwardNote}
                            onChange={e => setForwardNote(e.target.value)}
                            placeholder="Add a note for the receiving engineer..."
                            rows={3}
                        />
                    </div>
                    
                    <div className="modal-actions">
                        <button className="btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="btn-primary" onClick={handleForward}>
                            <Forward size={16} /> Forward Ticket
                        </button>
                    </div>
                </div>
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
    const [activeSection, setActiveSection] = useState('unassigned');
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
    const [actionLoading, setActionLoading] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [soundSettings, setSoundSettings] = useState({
        enabled: getSoundEnabled(),
        volume: getVolume()
    });
    const [navGroups, setNavGroups] = usePersistedSidebarNav("devops", DEVOPS_SIDEBAR_NAV_DEFAULTS);
    const isLoadingRef = useRef(false);
    const activeSectionRef = useRef(activeSection);
    const didUpsertSelfRef = useRef(false);
    
    // Real-time connection status
    const { isConnected, syncMethod } = useConnectionStatus();
    
    const [showStatusSelector, setShowStatusSelector] = useState(false);
    const statusRowRef = useRef(null);

    // Derived permission state
    const isReadOnly = myAvailability === DEVOPS_AVAILABILITY_STATUS.AWAY || myAvailability === DEVOPS_AVAILABILITY_STATUS.BUSY;
    const canSubmitCostEstimate = true;

    // Section counts
    const [sectionCounts, setSectionCounts] = useState({
        unassigned: 0,
        myTickets: 0,
        active: 0,
        history: 0
    });
    
    // Keep ref in sync
    useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
    
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
        const unassigned = allTickets.filter(t => !t.assignedTo && t.status === TICKET_STATUS.CREATED);
        const myTickets = allTickets.filter(t => t.assignedTo === userName);
        const active = allTickets.filter(t =>
            [TICKET_STATUS.ACCEPTED, TICKET_STATUS.MANAGER_APPROVAL_PENDING,
                TICKET_STATUS.MANAGER_APPROVED, TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.COST_APPROVED,
                TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ACTION_REQUIRED,
                TICKET_STATUS.ON_HOLD].includes(t.status)
        );
        const history = allTickets.filter(t =>
            [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
        );
        setSectionCounts({
            unassigned: unassigned.length,
            myTickets: myTickets.length,
            active: active.length,
            history: history.length
        });
    }, [userName]);

    const upsertTicketLocally = useCallback((updatedTicket) => {
        if (!updatedTicket?.id) return;
        setTickets((prev) => {
            const exists = prev.some((t) => t.id === updatedTicket.id);
            const next = exists
                ? prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
                : [updatedTicket, ...prev];
            recalcSectionCounts(next);
            applySectionFilter(next, activeSectionRef.current);
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
            const [allTickets, statsData, members, standups, rota] = await Promise.all([
                getActiveTicketsForDevOps(),
                getTicketStats(),
                getDevOpsTeamMembers(),
                getStandupNotes(),
                getRotaSchedule(14, new Date())
            ]);
            setTickets(allTickets);
            setStats(statsData);
            recalcSectionCounts(allTickets);
            setTeamMembers(members);
            setStandupNotes(standups);
            setRotaSchedule(rota);
            const currentMember = members.find(m => m.email?.toLowerCase() === userEmail.toLowerCase());
            if (currentMember?.availability) {
                setMyAvailability(currentMember.availability);
            }
            setSelectedTicket((prev) => {
                if (!prev?.id) return prev;
                const latest = allTickets.find((t) => t.id === prev.id);
                return latest || prev;
            });
        
            applySectionFilter(allTickets, activeSectionRef.current);
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
        playNewTicketSound: true,
        playUpdateSound: true,
        enableWebSocket: true,
        pollingInterval: null // No polling
    });

    useEffect(() => {
        const unsubscribe = subscribeDataChanges((detail) => {
            if (!detail?.scope) return;
            if (["tickets", "devops-team", "projects", "managers"].includes(detail.scope)) {
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
    
    const applySectionFilter = (ticketList, section) => {
        let result = [...ticketList];
        
        switch (section) {
            case 'unassigned':
                result = result.filter(t => !t.assignedTo && t.status === TICKET_STATUS.CREATED);
                break;
            case 'myTickets':
                result = result.filter(t => t.assignedTo === userName);
                break;
            case 'active':
                result = result.filter(t => 
                    [TICKET_STATUS.ACCEPTED, TICKET_STATUS.MANAGER_APPROVAL_PENDING, 
                     TICKET_STATUS.MANAGER_APPROVED, TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.COST_APPROVED,
                     TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ACTION_REQUIRED, 
                     TICKET_STATUS.ON_HOLD].includes(t.status)
                );
                break;
            case 'history':
                result = result.filter(t => 
                    [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
                );
                break;
            case 'profile':
                result = [];
                break;
            case 'standup':
                result = [];
                break;
            case 'closed':
                result = result.filter(t => t.status === TICKET_STATUS.CLOSED);
                break;
            case 'rota':
                result = [];
                break;
            default:
                break;
        }
        
        // Apply additional filters
        if (filters.status) {
            result = result.filter(t => t.status === filters.status);
        }
        if (filters.requestType) {
            result = result.filter(t => t.requestType === filters.requestType);
        }
        if (filters.environment) {
            result = result.filter(t => t.environment === filters.environment);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            result = result.filter(t => 
                t.id.toLowerCase().includes(searchLower) ||
                t.productName?.toLowerCase().includes(searchLower) ||
                t.requestedBy?.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            );
        }
        
        setFilteredTickets(result);
    };
    
    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        applySectionFilter(tickets, activeSection);
    };
    
    const handleSectionChange = (section) => {
        setActiveSection(section);
        applySectionFilter(tickets, section);
    };
    
    const handleAcceptTicket = async (ticketId) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: TICKET_STATUS.ACCEPTED, assignedTo: userName } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: TICKET_STATUS.ACCEPTED, assignedTo: userName } : ticket
        )));
        try {
            setActionLoading("Accepting ticket...");
            // First update status to ACCEPTED
            await updateTicketStatus(ticketId, TICKET_STATUS.ACCEPTED, { name: userName, email: userEmail }, 'Ticket accepted for processing');
            // Then assign to current user
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
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
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
        instance.logoutRedirect({
            postLogoutRedirectUri: `${window.location.origin}/login`,
        });
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
                        <UserPlus size={14} /> Accept
                    </button>
                </div>
            );
        }

        if (!ticket.assignedTo && ticket.status !== TICKET_STATUS.CREATED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button className="quick-btn accept" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                        onClick={() => handleAssignToSelf(ticket.id)}>
                        <UserPlus size={14} /> Assign Me
                    </button>
                </div>
            );
        }

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
                        <span className="sb-group-label">Service Queue</span>
                        <a href="#" className={`sb-item ${activeSection === 'unassigned' ? 'active' : ''}`}
                           onClick={(e) => { e.preventDefault(); handleSectionChange('unassigned'); }}>
                            <span className="sb-item-icon"><Inbox size={15} /></span>
                            <span className="sb-item-text">New Requests</span>
                            {sectionCounts.unassigned > 0 && <span className="sb-badge urgent">{sectionCounts.unassigned}</span>}
                        </a>
                        <a href="#" className={`sb-item ${activeSection === 'myTickets' ? 'active' : ''}`}
                           onClick={(e) => { e.preventDefault(); handleSectionChange('myTickets'); }}>
                            <span className="sb-item-icon"><Ticket size={15} /></span>
                            <span className="sb-item-text">Assigned to Me</span>
                            {sectionCounts.myTickets > 0 && <span className="sb-badge">{sectionCounts.myTickets}</span>}
                        </a>
                        <a href="#" className={`sb-item ${activeSection === 'active' ? 'active' : ''}`}
                           onClick={(e) => { e.preventDefault(); handleSectionChange('active'); }}>
                            <span className="sb-item-icon"><Activity size={15} /></span>
                            <span className="sb-item-text">In Progress</span>
                            {sectionCounts.active > 0 && <span className="sb-badge">{sectionCounts.active}</span>}
                        </a>
                    </div>

                    <div className="sb-group">
                        <span className="sb-group-label">Archive</span>
                        <a href="#" className={`sb-item ${activeSection === 'history' ? 'active' : ''}`}
                           onClick={(e) => { e.preventDefault(); handleSectionChange('history'); }}>
                            <span className="sb-item-icon"><History size={15} /></span>
                            <span className="sb-item-text">Completed</span>
                        </a>
                        <a href="#" className={`sb-item ${activeSection === 'closed' ? 'active' : ''}`}
                           onClick={(e) => { e.preventDefault(); handleSectionChange('closed'); }}>
                            <span className="sb-item-icon"><CheckCircle size={15} /></span>
                            <span className="sb-item-text">Closed</span>
                        </a>
                    </div>

                    <div className="sb-group">
                        <span className="sb-group-label">Team</span>
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

                    <div className="sb-group">
                        <span className="sb-group-label">Account</span>
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
                                    {activeSection === 'unassigned' && 'Unassigned'}
                                    {activeSection === 'myTickets' && 'My Tickets'}
                                    {activeSection === 'active' && 'Active'}
                                    {activeSection === 'history' && 'History'}
                                    {activeSection === 'closed' && 'Closed'}
                                    {activeSection === 'monitoring' && 'Monitoring'}
                                    {activeSection === 'profile' && 'Profile'}
                                    {activeSection === 'standup' && 'Standup'}
                                    {activeSection === 'rota' && 'Rota'}
                                    {activeSection === 'settings' && 'Settings'}
                                </span>
                            </div>
                            <h1>
                                {activeSection === 'unassigned' && 'Unassigned Requests'}
                                {activeSection === 'myTickets' && 'My Tickets'}
                                {activeSection === 'active' && 'Active Requests'}
                                {activeSection === 'history' && 'Completed History'}
                                {activeSection === 'closed' && 'Closed Tickets'}
                                {activeSection === 'monitoring' && 'Environment Monitoring'}
                                {activeSection === 'profile' && 'My Profile'}
                                {activeSection === 'standup' && 'Daily Standup Notes'}
                                {activeSection === 'rota' && 'Night Shift Rota'}
                                {activeSection === 'settings' && 'Settings'}
                            </h1>
                            {['unassigned', 'myTickets', 'active'].includes(activeSection) && (
                                <p className="header-subtitle">
                                    {activeSection === 'unassigned' && 'New tickets waiting to be assigned.'}
                                    {activeSection === 'myTickets' && 'Tickets currently assigned to you.'}
                                    {activeSection === 'active' && 'All active tickets being worked on.'}
                                </p>
                            )}
                        </div>
                        <div className="header-actions">
                            <div className="search-box-mini">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search tickets..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
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
                                            {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : '🕹️ Retro'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: 8 }}>
                                <h4 style={{ marginBottom: '0.5rem', color: '#111827' }}>Connection Status</h4>
                                <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                                    Sync Method: <strong>WebSocket (Fastest)</strong>
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>
                                    Status: <strong style={{ color: isConnected ? '#059669' : '#dc2626' }}>
                                        {isConnected ? 'Connected' : 'Connecting...'}
                                    </strong>
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                <>
                {/* Compact Mini Stats Bar — only on ticket sections */}
                {['unassigned', 'myTickets', 'active', 'history', 'closed'].includes(activeSection) && (
                <div className="mini-stats-bar">
                    <button
                        className={`mini-stat ${activeSection === 'unassigned' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('unassigned')}
                    >
                        <span className="mini-stat-icon orange"><Inbox size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.unassigned}</span>
                        <span className="mini-stat-label">Unassigned</span>
                        {sectionCounts.unassigned > 0 && <span className="mini-stat-badge">!</span>}
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${activeSection === 'myTickets' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('myTickets')}
                    >
                        <span className="mini-stat-icon blue"><Ticket size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.myTickets}</span>
                        <span className="mini-stat-label">My Tickets</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${activeSection === 'active' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('active')}
                    >
                        <span className="mini-stat-icon purple"><PlayCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.active}</span>
                        <span className="mini-stat-label">Active</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${activeSection === 'history' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('history')}
                    >
                        <span className="mini-stat-icon green"><CheckCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.history}</span>
                        <span className="mini-stat-label">Completed</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button
                        className={`mini-stat ${activeSection === 'closed' ? 'active' : ''}`}
                        onClick={() => handleSectionChange('closed')}
                    >
                        <span className="mini-stat-icon red"><XCircle size={13} /></span>
                        <span className="mini-stat-value">{sectionCounts.closed ?? 0}</span>
                        <span className="mini-stat-label">Closed</span>
                    </button>
                </div>
                )}
                 
                {/* Content Sections */}
                {activeSection === 'monitoring' ? (
                    <AnalyticsDashboard
                        tickets={tickets}
                        devOpsMembers={teamMembers}
                        showCost={true}
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
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <h3>Rota (Night Shift)</h3>
                        </div>
                        <div className="tickets-list">
                            <div className="team-members-grid">
                                {rotaSchedule.map(day => (
                                    <div className="team-member-card" key={day.date}>
                                        <div className="team-member-head">
                                            <strong>{day.date}</strong>
                                            <span>{day.dayName}</span>
                                        </div>
                                        <p>
                                            {day.members.length > 0
                                                ? day.members.map(m => m.name).join(', ')
                                                : 'No assigned member'}
                                        </p>
                                        {day.isManual && <span className="availability-badge availability-busy">Manual</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : <div className="tickets-section">
                    <div className="tickets-header">
                        <div className="section-title">
                            {activeSection === 'unassigned' && (
                                <SectionHeader 
                                    title="Unassigned Queue" 
                                    description="Click 'Accept Ticket' to take ownership"
                                    count={sectionCounts.unassigned}
                                    icon={Inbox}
                                />
                            )}
                            {activeSection === 'myTickets' && (
                                <SectionHeader 
                                    title="Your Assigned Tickets" 
                                    description="Tickets you are responsible for"
                                    count={sectionCounts.myTickets}
                                    icon={Ticket}
                                />
                            )}
                            {activeSection === 'active' && (
                                <SectionHeader 
                                    title="All Active Tickets" 
                                    description="Team-wide active requests"
                                    count={sectionCounts.active}
                                    icon={Activity}
                                />
                            )}
                            {activeSection === 'history' && (
                                <SectionHeader 
                                    title="Ticket History" 
                                    description="Completed and closed requests"
                                    count={sectionCounts.history}
                                    icon={History}
                                />
                            )}
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
                    <div className="tickets-list enhanced">
                        {filteredTickets.length === 0 ? (
                            <div className="empty-state">
                                {activeSection === 'unassigned' && <Inbox size={48} />}
                                {activeSection === 'myTickets' && <Ticket size={48} />}
                                {activeSection === 'active' && <Activity size={48} />}
                                {activeSection === 'history' && <History size={48} />}
                                {activeSection === 'closed' && <CheckCircle size={48} />}
                                <h3>
                                    {activeSection === 'unassigned' && "No unassigned tickets"}
                                    {activeSection === 'myTickets' && "No tickets assigned to you"}
                                    {activeSection === 'active' && "No active tickets"}
                                    {activeSection === 'history' && "No completed tickets yet"}
                                    {activeSection === 'closed' && "No closed tickets yet"}
                                </h3>
                                <p>
                                    {activeSection === 'unassigned' && "All tickets have been assigned. Great job, team!"}
                                    {activeSection === 'myTickets' && "Accept tickets from the Unassigned queue to get started."}
                                    {activeSection === 'active' && "No tickets are currently being processed."}
                                    {activeSection === 'history' && "Completed tickets will appear here."}
                                    {activeSection === 'closed' && "Closed tickets will appear in this separate section."}
                                </p>
                            </div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <div key={ticket.id} className="ticket-card-wrapper">
                                    <TicketCard
                                        ticket={ticket}
                                        onClick={() => setSelectedTicket(ticket)}
                                        showActions={false}
                                    />
                                    <QuickActions ticket={ticket} />
                                </div>
                            ))
                        )}
                    </div>
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
                    onRequestCostApproval={(t, opts) => {
                        openCostEstimateWindow(t.id, opts?.costApproverEmail);
                    }}
                    onForward={() => setForwardingTicket(selectedTicket)}
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
