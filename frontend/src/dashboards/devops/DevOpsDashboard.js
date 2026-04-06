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
    Send,
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
    Database
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
    submitCostEstimation,
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
import { useRealTimeSync, useConnectionStatus } from "../../services/useRealTimeSync";
import { useToast } from "../../services/ToastNotification";
import { 
    playShortNotification, 
    playSuccessNotification,
    playStatusChangeSound,
    setSoundEnabled,
    getSoundEnabled,
    setVolume,
    getVolume
} from "../../services/notificationService";
import { useActivityTracker } from "../../services/useActivityTracker";

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

const CostApprovalModal = ({ ticket, onClose, onSubmit }) => {
    const [estimatedCost, setEstimatedCost] = useState(ticket?.estimatedCost || "");
    const [currency, setCurrency] = useState(ticket?.costCurrency || "USD");
    const [notes, setNotes] = useState("");

    const handleSubmit = () => {
        if (!estimatedCost || Number(estimatedCost) <= 0) {
            alert("Please enter a valid estimated cost");
            return;
        }
        onSubmit(ticket.id, Number(estimatedCost), currency, notes);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content forward-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Database size={20} /> Submit Cost for Approval</h2>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    <div className="forward-ticket-info">
                        <p><strong>Ticket:</strong> {ticket.id}</p>
                        <p><strong>Product:</strong> {ticket.productName}</p>
                    </div>
                    <div className="form-field">
                        <label>Estimated Cost *</label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={estimatedCost}
                            onChange={(e) => setEstimatedCost(e.target.value)}
                            placeholder="Enter estimated cost"
                        />
                    </div>
                    <div className="form-field">
                        <label>Currency *</label>
                        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                            <option value="USD">USD</option>
                            <option value="INR">INR</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                        </select>
                    </div>
                    <div className="form-field">
                        <label>Notes (Optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Cost breakdown or notes for manager..."
                            rows={3}
                        />
                    </div>
                    <div className="modal-actions">
                        <button className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button className="btn-primary" onClick={handleSubmit}>
                            <Send size={16} /> Send Cost Approval
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const DevOpsDashboard = () => {
    const { instance, accounts } = useMsal();
    const { addToast } = useToast();
    
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
    const [costApprovalTicket, setCostApprovalTicket] = useState(null);
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
    const isLoadingRef = useRef(false);
    const activeSectionRef = useRef(activeSection);
    const didUpsertSelfRef = useRef(false);
    
    // Real-time connection status
    const { isConnected, syncMethod } = useConnectionStatus();
    
    // Inactivity warning state
    const [inactivityWarning, setInactivityWarning] = useState(false);
    const [showStatusSelector, setShowStatusSelector] = useState(false);
    
    // Activity tracker - sends heartbeats and detects inactivity
    useActivityTracker({
        userEmail: userEmail,
        userName: userName,
        currentStatus: myAvailability,
        onStatusChange: (newStatus) => {
            setMyAvailability(newStatus);
        },
        onInactivityWarning: (minutesLeft) => {
            setInactivityWarning(true);
            addToast(`⏰ You'll be marked Offline in ${minutesLeft} minutes due to inactivity. Move your mouse to stay active.`, 'warning');
            // Auto-dismiss warning after 30 seconds
            setTimeout(() => setInactivityWarning(false), 30000);
        },
        onAutoOffline: () => {
            setInactivityWarning(false);
            addToast('🔴 You have been automatically set to Offline due to inactivity.', 'error');
        },
        enabled: userEmail && userEmail !== 'devops@company.com'
    });
    
    // Derived permission state
    const isReadOnly = myAvailability === DEVOPS_AVAILABILITY_STATUS.AWAY || myAvailability === DEVOPS_AVAILABILITY_STATUS.BUSY;
    const isOffline = myAvailability === DEVOPS_AVAILABILITY_STATUS.OFFLINE;
    
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
    
    const handleStatusChange = async (ticketId, newStatus, notes) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        )));
        try {
            setActionLoading("Updating ticket status...");
            const updated = await updateTicketStatus(ticketId, newStatus, { name: userName, email: userEmail }, notes);
            upsertTicketLocally(updated);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
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

    const handleSubmitCostApproval = async (ticketId, estimatedCost, currency, notes) => {
        try {
            setActionLoading("Submitting cost approval...");
            const updated = await submitCostEstimation(ticketId, estimatedCost, currency, notes);
            upsertTicketLocally(updated);
            addToast("Cost approval email sent to manager", "success");
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
    
    // Quick action buttons for ticket management - disabled when read-only or offline
    const QuickActions = ({ ticket }) => {
        if (isReadOnly || isOffline) return null; // No actions in read-only or offline mode
        const requiresCostApproval = !!ticket.costApprovalRequired || !!ticket.workflowConfiguration?.costApprovalRequired;
        
        // For unassigned tickets
        if (!ticket.assignedTo && ticket.status === TICKET_STATUS.CREATED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button 
                        className="quick-btn accept"
                        onClick={() => handleAcceptTicket(ticket.id)}
                    >
                        <UserPlus size={14} />
                        Accept Ticket
                    </button>
                </div>
            );
        }
        
        if (ticket.status === TICKET_STATUS.ACCEPTED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    {ticket.managerApprovalRequired && (
                        <button 
                            className="quick-btn"
                            onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.MANAGER_APPROVAL_PENDING, 'Sent for manager approval')}
                        >
                            Request Approval
                        </button>
                    )}
                    {!ticket.managerApprovalRequired && (
                        <button
                            className="quick-btn start"
                            onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Started working on ticket')}
                        >
                            <PlayCircle size={14} />
                            Start
                        </button>
                    )}
                    <button 
                        className="quick-btn forward"
                        onClick={() => setForwardingTicket(ticket)}
                    >
                        <Forward size={14} />
                        Forward
                    </button>
                </div>
            );
        }
        
        if (ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button className="quick-btn" disabled>
                        <Clock size={14} />
                        Waiting Approval
                        {ticket.currentApprovalLevel && ticket.totalApprovalLevels
                            ? ` L${ticket.currentApprovalLevel}/${ticket.totalApprovalLevels}`
                            : ""}
                    </button>
                    <button 
                        className="quick-btn forward"
                        onClick={() => setForwardingTicket(ticket)}
                    >
                        <Forward size={14} />
                        Forward
                    </button>
                </div>
            );
        }

        if (ticket.status === TICKET_STATUS.MANAGER_APPROVED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    {requiresCostApproval ? (
                        <button
                            className="quick-btn"
                            onClick={() => setCostApprovalTicket(ticket)}
                        >
                            <Database size={14} />
                            Raise Cost Approval
                        </button>
                    ) : (
                        <>
                            <button
                                className="quick-btn"
                                onClick={() => setCostApprovalTicket(ticket)}
                            >
                                <Database size={14} />
                                Raise Cost Approval
                            </button>
                            <button
                                className="quick-btn start"
                                onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'No cost approval needed. Starting work.')}
                            >
                                <PlayCircle size={14} />
                                Start Implementation
                            </button>
                        </>
                    )}
                </div>
            );
        }

        if (ticket.status === TICKET_STATUS.COST_APPROVAL_PENDING) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button className="quick-btn" disabled>
                        <Clock size={14} />
                        Pending Cost Approval
                    </button>
                </div>
            );
        }

        if (ticket.status === TICKET_STATUS.COST_APPROVED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button
                        className="quick-btn start"
                        onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Cost approved. Starting work.')}
                    >
                        <PlayCircle size={14} />
                        Start Work
                    </button>
                </div>
            );
        }
        
        if (ticket.status === TICKET_STATUS.IN_PROGRESS) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button 
                        className="quick-btn complete"
                        onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.COMPLETED, 'Work completed')}
                    >
                        <CheckCircle size={14} />
                        Complete
                    </button>
                    <button 
                        className="quick-btn"
                        onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.ACTION_REQUIRED, 'Action required from requester')}
                    >
                        <AlertCircle size={14} />
                        Need Info
                    </button>
                    <button 
                        className="quick-btn forward"
                        onClick={() => setForwardingTicket(ticket)}
                    >
                        <Forward size={14} />
                        Forward
                    </button>
                </div>
            );
        }
        
        if (ticket.status === TICKET_STATUS.ACTION_REQUIRED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button 
                        className="quick-btn start"
                        onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.IN_PROGRESS, 'Resuming work')}
                    >
                        <PlayCircle size={14} />
                        Resume
                    </button>
                </div>
            );
        }
        
        if (ticket.status === TICKET_STATUS.COMPLETED) {
            return (
                <div className="quick-actions" onClick={e => e.stopPropagation()}>
                    <button 
                        className="quick-btn"
                        onClick={() => handleStatusChange(ticket.id, TICKET_STATUS.CLOSED, 'Ticket closed')}
                    >
                        Close Ticket
                    </button>
                </div>
            );
        }
        
        return null;
    };

    // Animated Status Selector component
    const StatusSelector = ({ compact = false }) => {
        return (
            <div className={`status-selector ${compact ? 'compact' : ''}`}>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                    const IconComponent = config.icon;
                    const isActive = myAvailability === status;
                    return (
                        <button
                            key={status}
                            className={`status-option ${isActive ? 'active' : ''}`}
                            onClick={() => handleAvailabilityChange(status)}
                            style={{
                                '--status-color': config.color,
                                '--status-bg': config.bg
                            }}
                        >
                            <div className={`status-dot-animated ${isActive ? 'pulse' : ''}`}
                                 style={{ backgroundColor: config.color }} />
                            <IconComponent size={compact ? 14 : 18} />
                            <span className="status-option-label">{config.label}</span>
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
        <div className={`dashboard-layout devops-dashboard ${isOffline ? 'is-offline' : ''} ${isReadOnly ? 'is-readonly' : ''}`}>


            <aside className="sidebar jira-style">
                <div className="sidebar-brand">
                    <div className="brand-logo" style={{ position: 'relative' }}>
                        <Terminal size={28} />
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
                    <div className="brand-text">
                        <h2>DevOps Hub</h2>
                        <span className="brand-subtitle">Engineering Console</span>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <div className="nav-section">
                        <span className="nav-section-title">Work Queue</span>
                        <a 
                            href="#" 
                            className={activeSection === 'unassigned' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('unassigned'); }}
                        >
                            <Inbox size={18} /> 
                            Unassigned
                            {sectionCounts.unassigned > 0 && (
                                <span className="nav-badge urgent">{sectionCounts.unassigned}</span>
                            )}
                        </a>
                        <a 
                            href="#" 
                            className={activeSection === 'myTickets' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('myTickets'); }}
                        >
                            <Ticket size={18} /> 
                            My Tickets
                            {sectionCounts.myTickets > 0 && (
                                <span className="nav-badge">{sectionCounts.myTickets}</span>
                            )}
                        </a>
                        <a 
                            href="#" 
                            className={activeSection === 'active' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('active'); }}
                        >
                            <Activity size={18} /> 
                            Active Requests
                            {sectionCounts.active > 0 && (
                                <span className="nav-badge">{sectionCounts.active}</span>
                            )}
                        </a>
                    </div>
                    <div className="nav-section">
                        <span className="nav-section-title">Archive</span>
                        <a 
                            href="#" 
                            className={activeSection === 'history' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('history'); }}
                        >
                            <History size={18} /> 
                            History
                        </a>
                        <a 
                            href="#" 
                            className={activeSection === 'closed' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('closed'); }}
                        >
                            <CheckCircle size={18} /> 
                            Closed Tickets
                        </a>
                    </div>
                    <div className="nav-section">
                        <span className="nav-section-title">Team</span>
                        <a 
                            href="#" 
                            className={activeSection === 'standup' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('standup'); }}
                        >
                            <StickyNote size={18} /> 
                            Standup
                        </a>
                        <a 
                            href="#" 
                            className={activeSection === 'rota' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('rota'); }}
                        >
                            <RotateCcw size={18} /> 
                            Rota
                        </a>
                        <a href="#"><BarChart3 size={18} /> Reports</a>
                    </div>
                    <div className="nav-section">
                        <span className="nav-section-title">Account</span>
                        <a 
                            href="#" 
                            className={activeSection === 'settings' ? 'active' : ''}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('settings'); }}
                        >
                            <Settings size={18} />
                            Settings
                        </a>
                        <a 
                            href="#" 
                            className={`nav-profile-link ${activeSection === 'profile' ? 'active' : ''}`}
                            onClick={(e) => { e.preventDefault(); handleSectionChange('profile'); }}
                        >
                            <ProfileIcon size={18} />
                            Profile
                        </a>
                    </div>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-email">{userEmail}</span>
                        <span className="user-role badge-devops">
                            Engineering Access
                        </span>
                        <div className="availability-control">
                            <label htmlFor="devops-availability">My Status</label>
                            <button
                                className="status-trigger-btn"
                                onClick={() => setShowStatusSelector(!showStatusSelector)}
                                style={{ '--status-color': STATUS_CONFIG[myAvailability]?.color || '#6B778C' }}
                            >
                                <div className={`status-dot-animated pulse`}
                                     style={{ backgroundColor: STATUS_CONFIG[myAvailability]?.color || '#6B778C' }} />
                                <span>{STATUS_CONFIG[myAvailability]?.label || myAvailability}</span>
                            </button>
                            {showStatusSelector && (
                                <div className="status-selector-popup">
                                    <StatusSelector compact />
                                </div>
                            )}
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            
            <main className={`dashboard-content ${isOffline ? 'offline-blur' : ''}`}>
                {/* Offline Overlay */}
                {isOffline && (
                    <div className="offline-overlay">
                        <div className="offline-card">
                            <div className="offline-icon">
                                <Moon size={48} />
                            </div>
                            <h2>You are currently Offline</h2>
                            <p>Your dashboard is locked. Change your status to resume work.</p>
                            <StatusSelector />
                        </div>
                    </div>
                )}

                {/* Read-Only Banner */}
                {isReadOnly && !isOffline && (
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

                {/* Inactivity Warning */}
                {inactivityWarning && (
                    <div className="inactivity-warning-bar">
                        <Clock size={16} />
                        <span>⏰ You will be marked <strong>Offline</strong> in 3 minutes due to inactivity. Move your mouse to stay active.</span>
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
                                {activeSection === 'profile' && 'My Profile'}
                                {activeSection === 'standup' && 'Daily Standup Notes'}
                                {activeSection === 'rota' && 'Night Shift Rota'}
                                {activeSection === 'settings' && 'Settings'}
                            </h1>
                            <p className="header-subtitle">
                                {activeSection === 'unassigned' && 'New tickets waiting to be assigned to a DevOps engineer.'}
                                {activeSection === 'myTickets' && 'Tickets currently assigned to you.'}
                                {activeSection === 'active' && 'All tickets currently being worked on by the team.'}
                                {activeSection === 'history' && 'Completed and closed tickets.'}
                                {activeSection === 'closed' && 'Tickets with closed status only.'}
                                {activeSection === 'profile' && 'Azure login details for your account.'}
                                {activeSection === 'standup' && 'Date-wise sticky notes for daily standup updates by each DevOps member.'}
                                {activeSection === 'rota' && 'Auto-assigned night shift rota in alphabetical order.'}
                                {activeSection === 'settings' && 'Configure notifications and preferences.'}
                            </p>
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
                ) : (
                <>
                {/* Professional Stats Cards */}
                {!['profile', 'standup', 'rota', 'settings'].includes(activeSection) && (
                <div className="stats-grid">
                    <div className={`stat-card jira-style ${activeSection === 'unassigned' ? 'highlight' : ''}`}
                         onClick={() => handleSectionChange('unassigned')}>
                        <div className="stat-icon orange">
                            <Inbox size={24} />
                        </div>
                        <div className="stat-value">{sectionCounts.unassigned}</div>
                        <span className="stat-label">Unassigned</span>
                        {sectionCounts.unassigned > 0 && (
                            <div className="stat-trend warning">
                                <AlertCircle size={14} />
                                Needs attention
                            </div>
                        )}
                    </div>
                    <div className={`stat-card jira-style ${activeSection === 'myTickets' ? 'highlight' : ''}`}
                         onClick={() => handleSectionChange('myTickets')}>
                        <div className="stat-icon blue">
                            <Ticket size={24} />
                        </div>
                        <div className="stat-value">{sectionCounts.myTickets}</div>
                        <span className="stat-label">My Tickets</span>
                    </div>
                    <div className={`stat-card jira-style ${activeSection === 'active' ? 'highlight' : ''}`}
                         onClick={() => handleSectionChange('active')}>
                        <div className="stat-icon purple">
                            <PlayCircle size={24} />
                        </div>
                        <div className="stat-value">{sectionCounts.active}</div>
                        <span className="stat-label">Active</span>
                    </div>
                    <div className={`stat-card jira-style ${activeSection === 'history' ? 'highlight' : ''}`}
                         onClick={() => handleSectionChange('history')}>
                        <div className="stat-icon green">
                            <CheckCircle size={24} />
                        </div>
                        <div className="stat-value">{sectionCounts.history}</div>
                        <span className="stat-label">Completed</span>
                    </div>
                </div>
                )}
                 
                {/* Content Sections */}
                {activeSection === 'profile' ? (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <h3>Profile</h3>
                        </div>
                        <div className="tickets-list">
                            <div className="team-member-card">
                                <div className="team-member-head"><strong>Name</strong><span>{userName}</span></div>
                                <div className="team-member-head"><strong>Email</strong><span>{userEmail}</span></div>
                                {userPrincipalName && (
                                    <div className="team-member-head"><strong>Username</strong><span>{userPrincipalName}</span></div>
                                )}
                            </div>
                        </div>
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
                    onRequestCostApproval={(t) => setCostApprovalTicket(t)}
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

            {costApprovalTicket && (
                <CostApprovalModal
                    ticket={costApprovalTicket}
                    onClose={() => setCostApprovalTicket(null)}
                    onSubmit={handleSubmitCostApproval}
                />
            )}
        </div>
    );
};

export default DevOpsDashboard;
