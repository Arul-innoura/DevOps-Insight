import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { 
    LogOut, 
    Users, 
    Building,
    RotateCcw,
    User as ProfileIcon,
    ShieldCheck, 
    LayoutDashboard,
    RefreshCw,
    Filter,
    Ticket,
    BarChart3,
    Trash2,
    CheckCircle,
    Clock,
    AlertCircle,
    PlayCircle,
    XCircle,
    TrendingUp,
    Activity,
    UserCog,
    Wifi,
    WifiOff,
    Bell,
    Settings,
    Search,
    Zap,
    Calendar,
    Coffee,
    Moon,
    GitBranch,
    ChevronLeft,
    ChevronRight,
    Plus,
    Layers
} from "lucide-react";
import { 
    StatusBadge, 
    TicketCard, 
    TicketFilters, 
    TicketDetailsModal 
} from "../TicketComponents";
import { 
    getAllTickets, 
    updateTicketStatus,
    addTicketNote,
    deleteTicket,
    getTicketStats,
    TICKET_STATUS,
    getDevOpsTeamMembers,
    addDevOpsTeamMember,
    DEVOPS_AVAILABILITY_STATUS,
    getProjects,
    addProject,
    getRotaManagementState,
    setRotaLeaveForDate,
    setRotaManualAssignment,
    getRotaSchedule,
    getManagers,
    addManager,
    deleteManager,
    ENVIRONMENTS
} from "../../services/ticketService";
import { getStatusTimeline } from "../../services/devopsStatusService";
import { useRealTimeSync, useConnectionStatus } from "../../services/useRealTimeSync";
import { useToast } from "../../services/ToastNotification";
import { 
    playShortNotification, 
    playSuccessNotification,
    setSoundEnabled,
    getSoundEnabled,
    setVolume,
    getVolume
} from "../../services/notificationService";
import ProjectWorkflowEditor from "./ProjectWorkflowEditor";
import ActivityLogsView from "./ActivityLogsView";
import AnalyticsDashboard from "./AnalyticsDashboard";
import MonitoringPanel from "../MonitoringPanel";
import NameProductsView from "./NameProductsView";
import { usePersistedSidebarNav } from "../../services/sidebarNavStorage";
import { NavSectionToggle } from "../../components/NavSectionToggle";

const ADMIN_SIDEBAR_NAV_DEFAULTS = { operations: true, configuration: true, account: true };

// Status color mapping for timeline visualization
const TIMELINE_STATUS_COLORS = {
    AVAILABLE: { color: '#36B37E', bg: '#E3FCEF', label: 'Available', icon: '🟢' },
    AWAY: { color: '#FF991F', bg: '#FFF7E6', label: 'Away', icon: '🟡' },
    BUSY: { color: '#FF5630', bg: '#FFEBE6', label: 'Busy', icon: '🔴' },
    OFFLINE: { color: '#6B778C', bg: '#F4F5F7', label: 'Offline', icon: '⚫' }
};

// ==================== Sub-View Components ====================

const TeamManagementView = ({ newMember, setNewMember, handleAddDevOpsMember, devOpsMembers, availabilityStatus }) => (
    <div className="team-management-view">
        <div className="analytics-card">
            <h3><Users size={18} /> Add DevOps Member</h3>
            <form className="team-form" onSubmit={handleAddDevOpsMember}>
                <input
                    type="text"
                    placeholder="Full name"
                    value={newMember.name}
                    onChange={(e) => setNewMember(v => ({ ...v, name: e.target.value }))}
                    required
                />
                <input
                    type="email"
                    placeholder="Work email"
                    value={newMember.email}
                    onChange={(e) => setNewMember(v => ({ ...v, email: e.target.value }))}
                    required
                />
                <button type="submit" className="btn-primary">Add DevOps User</button>
            </form>
        </div>

        <div className="analytics-card">
            <h3><Users size={18} /> DevOps Team Availability</h3>
            <div className="team-members-grid">
                {devOpsMembers.map(member => (
                    <div className="team-member-card" key={member.id || member.email}>
                        <div className="team-member-head">
                            <strong>{member.name}</strong>
                            <span className={`availability-badge availability-${(member.availability || 'Offline').toLowerCase().replace(/\s+/g, '-')}`}>
                                {member.availability || availabilityStatus.OFFLINE}
                            </span>
                        </div>
                        <div className="team-member-email">{member.email}</div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const ProjectManagementView = ({
    newProductName,
    setNewProductName,
    newProductTag,
    setNewProductTag,
    environmentCatalog,
    selectedProductEnvironments,
    onToggleProductEnvironment,
    handleAddProject,
    projects,
    onConfigureWorkflow
}) => (
    <div className="workflow-management-view">
        {/* Register Service Card */}
        <div className="workflow-card workflow-card-register">
            <div className="workflow-card-header">
                <div className="workflow-card-icon">
                    <Building size={20} />
                </div>
                <div>
                    <h3>Register Service</h3>
                    <p>Add a new service to enable request tracking and workflow automation</p>
                </div>
            </div>
            <form className="workflow-form" onSubmit={handleAddProject}>
                <div className="workflow-form-grid">
                    <div className="workflow-form-group">
                        <label>Service Name</label>
                        <input
                            type="text"
                            placeholder="Enter service name"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="workflow-form-group">
                        <label>Service ID <span className="optional-tag">Optional</span></label>
                        <input
                            type="text"
                            placeholder="Unique identifier"
                            value={newProductTag}
                            onChange={(e) => setNewProductTag(e.target.value)}
                        />
                    </div>
                </div>
                <div className="workflow-form-group">
                    <label>Deployment Environments</label>
                    <div className="environment-selector">
                        {environmentCatalog.map((env) => (
                            <label 
                                key={env} 
                                className={`env-checkbox ${selectedProductEnvironments.includes(env) ? 'selected' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedProductEnvironments.includes(env)}
                                    onChange={() => onToggleProductEnvironment(env)}
                                />
                                <span className="env-name">{env}</span>
                                <span className="env-check">✓</span>
                            </label>
                        ))}
                    </div>
                </div>
                <button type="submit" className="btn-primary workflow-submit">
                    <Plus size={16} /> Register Service
                </button>
            </form>
        </div>

        {/* Configured Workflow Summary */}
        <div className="workflow-card workflow-card-summary">
            <div className="workflow-card-header">
                <div className="workflow-card-icon gradient">
                    <Layers size={20} />
                </div>
                <div>
                    <h3>Configured Workflow Summary</h3>
                    <p>Manage approval workflows, notifications, and cost authorization settings</p>
                </div>
            </div>
            
            {projects.length === 0 ? (
                <div className="workflow-empty-state">
                    <div className="empty-icon">
                        <Building size={48} />
                    </div>
                    <h4>No Services Configured</h4>
                    <p>Register your first service above to begin configuring workflows</p>
                </div>
            ) : (
                <div className="workflow-services-grid">
                    {projects.map(project => (
                        <div className="workflow-service-card" key={project.id || project.name}>
                            <div className="service-card-header">
                                <div className="service-avatar">
                                    {(project.name || 'S').charAt(0).toUpperCase()}
                                </div>
                                <div className="service-info">
                                    <h4>{project.name}</h4>
                                    {project.tag && <span className="service-tag">{project.tag}</span>}
                                </div>
                            </div>
                            <div className="service-card-meta">
                                {project.environments && project.environments.length > 0 && (
                                    <div className="service-envs">
                                        {project.environments.slice(0, 3).map(env => (
                                            <span key={env} className="env-badge">{env}</span>
                                        ))}
                                        {project.environments.length > 3 && (
                                            <span className="env-badge more">+{project.environments.length - 3}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                className="btn-workflow-edit"
                                onClick={() => onConfigureWorkflow?.(project)}
                            >
                                <Settings size={14} /> Configure Workflow
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
);

const ManagerManagementView = ({ newManager, setNewManager, handleAddManager, managers, handleDeleteManager }) => (
    <div className="team-management-view">
        <div className="analytics-card">
            <h3><UserCog size={18} /> Add Approver</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Approvers authorize service requests and are automatically notified when approval is needed.
            </p>
            <form className="team-form" onSubmit={handleAddManager}>
                <input
                    type="text"
                    placeholder="Manager name"
                    value={newManager.name}
                    onChange={(e) => setNewManager(v => ({ ...v, name: e.target.value }))}
                    required
                />
                <input
                    type="email"
                    placeholder="Manager email"
                    value={newManager.email}
                    onChange={(e) => setNewManager(v => ({ ...v, email: e.target.value }))}
                    required
                />
                <button type="submit" className="btn-primary">Add Manager</button>
            </form>
        </div>

        <div className="analytics-card">
            <h3><UserCog size={18} /> Manager List</h3>
            <div className="team-members-grid">
                {managers.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No managers added yet.</p>
                ) : (
                    managers.map(manager => (
                        <div className="team-member-card" key={manager.id}>
                            <div className="team-member-head">
                                <strong>{manager.name}</strong>
                                <span className={`availability-badge ${manager.active ? 'availability-available' : 'availability-offline'}`}>
                                    {manager.active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className="team-member-email">{manager.email}</div>
                            <button 
                                className="btn-icon btn-danger" 
                                onClick={() => handleDeleteManager(manager.id)}
                                title="Delete manager"
                                style={{ marginTop: '0.5rem' }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
);

const RotaManagementView = ({ leaveDate, setLeaveDate, devOpsMembers, rotaState, handleToggleDateLeave, manualDate, setManualDate, manualEmails, setManualEmails, handleApplyManualAssignment, rotaSchedule }) => (
    <div className="team-management-view">
        <div className="analytics-card">
            <h3><RotateCcw size={18} /> Date-wise Leave Management</h3>
            <div className="team-form" style={{ marginBottom: '0.75rem' }}>
                <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
            </div>
            <div className="team-members-grid">
                {devOpsMembers.map(member => {
                    const isLeave = (rotaState.leaveByDate?.[leaveDate] || []).includes((member.email || '').toLowerCase());
                    return (
                        <div className="team-member-card" key={member.email}>
                            <div className="team-member-head">
                                <strong>{member.name}</strong>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={isLeave}
                                        onChange={(e) => handleToggleDateLeave(member.email, e.target.checked)}
                                    /> Leave on selected date
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="analytics-card">
            <h3><Users size={18} /> Manual Assignment (Max 2 Members)</h3>
            <form className="team-form" onSubmit={handleApplyManualAssignment}>
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
                <select
                    multiple
                    value={manualEmails}
                    onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map(o => o.value).slice(0, 2);
                        setManualEmails(selected);
                    }}
                >
                    {devOpsMembers.map(member => (
                        <option key={member.email} value={member.email}>{member.name}</option>
                    ))}
                </select>
                <button type="submit" className="btn-primary">Apply Assignment</button>
            </form>
        </div>

        <div className="analytics-card">
            <h3><RotateCcw size={18} /> Rota Preview (14 Days)</h3>
            <div className="team-members-grid">
                {rotaSchedule.map(day => (
                    <div className="team-member-card" key={day.date}>
                        <div className="team-member-head">
                            <strong>{day.date}</strong>
                            <span>{day.dayName}</span>
                        </div>
                        <p>{day.members.length > 0 ? day.members.map(m => m.name).join(', ') : 'No member assigned'}</p>
                        {day.isManual && <span className="availability-badge availability-busy">Manual</span>}
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const StatusTimelineView = ({ devOpsMembers, timelineStatusColors }) => {
    const [timelineDate, setTimelineDate] = useState(new Date().toISOString().split('T')[0]);
    const [timelineLogs, setTimelineLogs] = useState([]);
    const [timelineLoading, setTimelineLoading] = useState(false);

    const loadTimeline = useCallback(async (date) => {
        setTimelineLoading(true);
        try {
            const logs = await getStatusTimeline(date);
            setTimelineLogs(logs || []);
        } catch (err) {
            console.error('[Timeline] Failed to load:', err);
            setTimelineLogs([]);
        } finally {
            setTimelineLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTimeline(timelineDate);
    }, [timelineDate, loadTimeline]);

    // Real-time synchronization for timeline view
    useRealTimeSync({
        onRefresh: () => loadTimeline(timelineDate),
        enableWebSocket: true,
        playUpdateSound: false // Handled globally by AdminDashboard
    });

    const navigateDate = (direction) => {
        const d = new Date(timelineDate);
        d.setDate(d.getDate() + direction);
        setTimelineDate(d.toISOString().split('T')[0]);
    };

    const memberLogs = {};
    timelineLogs.forEach(log => {
        const key = log.memberEmail?.toLowerCase() || 'unknown';
        if (!memberLogs[key]) {
            memberLogs[key] = { name: log.memberName || key, email: key, logs: [] };
        }
        memberLogs[key].logs.push(log);
    });

    devOpsMembers.forEach(m => {
        const key = (m.email || '').toLowerCase();
        if (!memberLogs[key]) {
            memberLogs[key] = { name: m.name || key, email: key, logs: [] };
        }
    });

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const getStatusStyle = (status) => {
        const normalized = (status || 'OFFLINE').toUpperCase();
        return timelineStatusColors[normalized] || timelineStatusColors.OFFLINE;
    };

    const buildSegments = (logs) => {
        if (!logs || logs.length === 0) return [];
        const sortedLogs = [...logs].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
        const startHour = 0;
        const endHour = 24;
        const totalMinutes = (endHour - startHour) * 60;

        const segments = [];
        for (let i = 0; i < sortedLogs.length; i++) {
            const log = sortedLogs[i];
            const startTime = new Date(log.changedAt);
            const startMinutes = startTime.getHours() * 60 + startTime.getMinutes() - startHour * 60;

            let endMinutes;
            if (i < sortedLogs.length - 1) {
                const nextTime = new Date(sortedLogs[i + 1].changedAt);
                endMinutes = nextTime.getHours() * 60 + nextTime.getMinutes() - startHour * 60;
            } else {
                endMinutes = totalMinutes;
            }

            const leftPercent = Math.max(0, (startMinutes / totalMinutes) * 100);
            const widthPercent = Math.max(0.5, ((endMinutes - startMinutes) / totalMinutes) * 100);

            segments.push({
                status: log.newStatus,
                left: leftPercent,
                width: widthPercent,
                startTime: formatTime(log.changedAt),
                reason: log.changeReason,
                changedBy: log.changedBy
            });
        }
        return segments;
    };

    return (
        <div className="status-timeline-view">
            <div className="timeline-date-nav">
                <button className="btn-icon" onClick={() => navigateDate(-1)}>
                    <ChevronLeft size={18} />
                </button>
                <div className="timeline-date-picker">
                    <Calendar size={18} />
                    <input
                        type="date"
                        value={timelineDate}
                        onChange={(e) => setTimelineDate(e.target.value)}
                    />
                    <span className="timeline-date-label">
                        {new Date(timelineDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                </div>
                <button className="btn-icon" onClick={() => navigateDate(1)}>
                    <ChevronRight size={18} />
                </button>
                <button className="btn-icon" onClick={() => setTimelineDate(new Date().toISOString().split('T')[0])} title="Today">
                    Today
                </button>
            </div>

            <div className="timeline-legend">
                {Object.entries(timelineStatusColors).map(([status, config]) => (
                    <div className="legend-item" key={status}>
                        <div className="legend-dot" style={{ backgroundColor: config.color }} />
                        <span>{config.label}</span>
                    </div>
                ))}
            </div>

            <div className="timeline-summary-cards">
                <div className="timeline-summary-card">
                    <div className="summary-value">{Object.keys(memberLogs).length}</div>
                    <div className="summary-label">Team Members</div>
                </div>
                <div className="timeline-summary-card">
                    <div className="summary-value">{timelineLogs.length}</div>
                    <div className="summary-label">Status Changes</div>
                </div>
                <div className="timeline-summary-card">
                    <div className="summary-value">
                        {timelineLogs.filter(l => l.changeReason === 'inactivity_timeout').length}
                    </div>
                    <div className="summary-label">Auto-Offlined</div>
                </div>
                <div className="timeline-summary-card">
                    <div className="summary-value">
                        {timelineLogs.filter(l => l.changeReason === 'session_closed').length}
                    </div>
                    <div className="summary-label">Session Closed</div>
                </div>
            </div>

            {timelineLoading ? (
                <div className="empty-state"><div className="spinner" /><p>Loading timeline...</p></div>
            ) : (
                <div className="timeline-members-list">
                    <div className="timeline-hour-markers">
                        <div className="timeline-member-name" style={{ opacity: 0 }}>—</div>
                        <div className="timeline-bar-container">
                            {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
                                <div
                                    className="hour-marker"
                                    key={hour}
                                    style={{ left: `${(hour / 24) * 100}%` }}
                                >
                                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                                </div>
                            ))}
                        </div>
                    </div>

                    {Object.values(memberLogs).map(member => {
                        const segments = buildSegments(member.logs);
                        const currentMember = devOpsMembers.find(m => (m.email || '').toLowerCase() === member.email);
                        const currentStatus = currentMember?.availability || 'Offline';
                        const currentStatusKey = currentStatus.toUpperCase();

                        return (
                            <div className="timeline-member-row" key={member.email}>
                                <div className="timeline-member-name">
                                    <div className="member-avatar">
                                        <div className={`member-status-dot pulse`}
                                             style={{ backgroundColor: (timelineStatusColors[currentStatusKey] || timelineStatusColors.OFFLINE).color }} />
                                        <span>{member.name}</span>
                                    </div>
                                    <span className={`availability-badge-mini`}
                                          style={{
                                              color: (timelineStatusColors[currentStatusKey] || timelineStatusColors.OFFLINE).color,
                                              backgroundColor: (timelineStatusColors[currentStatusKey] || timelineStatusColors.OFFLINE).bg
                                          }}>
                                        {currentStatus}
                                    </span>
                                </div>
                                <div className="timeline-bar-container">
                                    <div className="timeline-bar-bg">
                                        {segments.length > 0 ? segments.map((seg, i) => (
                                            <div
                                                className="timeline-segment"
                                                key={i}
                                                style={{
                                                    left: `${seg.left}%`,
                                                    width: `${seg.width}%`,
                                                    backgroundColor: getStatusStyle(seg.status).color
                                                }}
                                                title={`${seg.startTime} — ${getStatusStyle(seg.status).label} (${seg.reason || 'manual'})`}
                                            />
                                        )) : (
                                            <div className="timeline-segment" style={{
                                                left: 0, width: '100%',
                                                backgroundColor: timelineStatusColors.OFFLINE.color,
                                                opacity: 0.3
                                            }} title="No activity recorded" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {timelineLogs.length > 0 && (
                        <div className="timeline-event-log">
                            <h4><GitBranch size={16} /> Status Change Events</h4>
                            <div className="event-log-list">
                                {timelineLogs.slice().reverse().map((log, i) => (
                                    <div className="event-log-item" key={log.id || i}>
                                        <div className="event-dot"
                                             style={{ backgroundColor: getStatusStyle(log.newStatus).color }} />
                                        <div className="event-details">
                                            <span className="event-time">{formatTime(log.changedAt)}</span>
                                            <strong>{log.memberName}</strong>
                                            <span className="event-transition">
                                                <span style={{ color: getStatusStyle(log.previousStatus).color }}>
                                                    {getStatusStyle(log.previousStatus).label}
                                                </span>
                                                {' → '}
                                                <span style={{ color: getStatusStyle(log.newStatus).color }}>
                                                    {getStatusStyle(log.newStatus).label}
                                                </span>
                                            </span>
                                            <span className="event-reason">
                                                {log.changeReason === 'manual' && '📝 Manual'}
                                                {log.changeReason === 'inactivity_timeout' && '⏰ Auto (Inactivity)'}
                                                {log.changeReason === 'session_closed' && '🚪 Session Closed'}
                                                {log.changeReason === 'heartbeat_resume' && '💓 Resumed'}
                                                {!['manual', 'inactivity_timeout', 'session_closed', 'heartbeat_resume'].includes(log.changeReason) && (log.changeReason || 'Unknown')}
                                            </span>
                                            {log.changedBy && log.changedBy !== 'SYSTEM' && (
                                                <span className="event-actor">by {log.changedBy}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


export const AdminDashboard = () => {
    const { instance, accounts } = useMsal();
    const { addToast } = useToast();
    
    const account = accounts[0];
    const userName = account?.name || "Administrator";
    const userEmail = account?.username || "admin@company.com";
    const userPrincipalName = account?.username || "";

    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [stats, setStats] = useState({});
    const [viewMode, setViewMode] = useState('tickets'); // 'tickets', 'analytics', 'team', 'projects', 'managers', 'rota', 'statusTimeline', 'activityLogs', 'profile', 'settings'
    const [devOpsMembers, setDevOpsMembers] = useState([]);
    const [newMember, setNewMember] = useState({ name: '', email: '' });
    const [projects, setProjects] = useState([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectTag, setNewProjectTag] = useState('');
    const [newProjectSelectedEnvironments, setNewProjectSelectedEnvironments] = useState([]);
    const [workflowProject, setWorkflowProject] = useState(null);
    const [managers, setManagers] = useState([]);
    const [newManager, setNewManager] = useState({ name: '', email: '' });
    const [rotaState, setRotaState] = useState({ orderEmails: [], sundayLeaveEmails: [], manualAssignments: {} });
    const [rotaSchedule, setRotaSchedule] = useState([]);
    const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
    const [manualEmails, setManualEmails] = useState([]);
    const [leaveDate, setLeaveDate] = useState(new Date().toISOString().split('T')[0]);
    const [actionLoading, setActionLoading] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [soundSettings, setSoundSettings] = useState({
        enabled: getSoundEnabled(),
        volume: getVolume()
    });
    const [navGroups, setNavGroups] = usePersistedSidebarNav("admin", ADMIN_SIDEBAR_NAV_DEFAULTS);
    const isLoadingRef = useRef(false);
    const filtersRef = useRef(filters);
    const activeTabRef = useRef(activeTab);
    
    // Real-time connection status
    const { isConnected, syncMethod } = useConnectionStatus();
    
    // Keep refs in sync
    useEffect(() => { filtersRef.current = filters; }, [filters]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    // Sound settings handlers
    const handleSoundToggle = () => {
        const newEnabled = !soundSettings.enabled;
        setSoundEnabled(newEnabled);
        setSoundSettings(prev => ({ ...prev, enabled: newEnabled }));
        if (newEnabled) playShortNotification();
    };

    const handleVolumeChange = (newVolume) => {
        setVolume(newVolume);
        setSoundSettings(prev => ({ ...prev, volume: newVolume }));
    };

    const loadTickets = useCallback(async (silent = false) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        if (!silent) setIsSyncing(true);
        try {
            const [
                allTickets,
                statsData,
                members,
                projectList,
                managerList,
                rotaMgmt,
                rotaDays
            ] = await Promise.all([
                getAllTickets(),
                getTicketStats(),
                getDevOpsTeamMembers(),
                getProjects({ force: true }),
                getManagers(false, { force: true }),
                getRotaManagementState(),
                getRotaSchedule(14, new Date())
            ]);
            setTickets(allTickets);
            setStats(statsData);
            setDevOpsMembers(members);
            setProjects(projectList);
            setManagers(managerList);
            setRotaState(rotaMgmt);
            setRotaSchedule(rotaDays);
            applyFilters(allTickets, filtersRef.current, activeTabRef.current);
        } finally {
            isLoadingRef.current = false;
            if (!silent) setIsSyncing(false);
        }
    }, []);

    // Real-time sync via WebSocket - silent background updates
    useRealTimeSync({
        onRefresh: () => loadTickets(true), // Silent refresh
        playUpdateSound: true,
        enableWebSocket: true,
        pollingInterval: null // No polling
    });

    // Manual refresh handler
    const handleManualRefresh = () => {
        setIsSyncing(true);
        loadTickets(false);
    };
    
    const applyFilters = (ticketList, currentFilters, tab) => {
        let result = [...ticketList];
        
        // Apply tab filter
        if (tab === 'pending') {
            result = result.filter(t => t.status === TICKET_STATUS.CREATED);
        } else if (tab === 'active') {
            result = result.filter(t => 
                [
                    TICKET_STATUS.ACCEPTED,
                    TICKET_STATUS.MANAGER_APPROVAL_PENDING,
                    TICKET_STATUS.MANAGER_APPROVED,
                    TICKET_STATUS.COST_APPROVAL_PENDING,
                    TICKET_STATUS.COST_APPROVED,
                    TICKET_STATUS.IN_PROGRESS,
                    TICKET_STATUS.ACTION_REQUIRED,
                    TICKET_STATUS.ON_HOLD
                ].includes(t.status)
            );
        } else if (tab === 'completed') {
            result = result.filter(t => 
                [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
            );
        } else if (tab === 'rejected') {
            result = result.filter(t => t.status === TICKET_STATUS.REJECTED);
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
                t.requestedBy?.toLowerCase().includes(searchLower) ||
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
    
    const handleStatusChange = async (ticketId, newStatus, notes, meta = {}) => {
        setTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        )));
        setFilteredTickets((prev) => prev.map((ticket) => (
            ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        )));
        try {
            setActionLoading("Updating ticket status...");
            await updateTicketStatus(ticketId, newStatus, { name: userName, email: userEmail }, notes, meta);
            await loadTickets();
            
            if (selectedTicket && selectedTicket.id === ticketId) {
                const updatedTicket = (await getAllTickets()).find(t => t.id === ticketId);
                setSelectedTicket(updatedTicket);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };
    
    const handleAddNote = async (ticketId, notes) => {
        try {
            setActionLoading("Adding ticket note...");
            await addTicketNote(ticketId, { name: userName, email: userEmail }, notes);
            await loadTickets();
            
            if (selectedTicket && selectedTicket.id === ticketId) {
                const updatedTicket = (await getAllTickets()).find(t => t.id === ticketId);
                setSelectedTicket(updatedTicket);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };
    
    const handleDeleteTicket = async (ticketId) => {
        if (window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
            setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId));
            setFilteredTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId));
            try {
                setActionLoading("Deleting ticket...");
                await deleteTicket(ticketId);
                await loadTickets();
                setSelectedTicket(null);
            } finally {
                setActionLoading("");
            }
        }
    };

    const handleAddDevOpsMember = async (e) => {
        e.preventDefault();
        try {
            setActionLoading("Adding DevOps member...");
            await addDevOpsTeamMember(
                { ...newMember, availability: DEVOPS_AVAILABILITY_STATUS.AVAILABLE },
                { name: userName, email: userEmail }
            );
            setNewMember({ name: '', email: '' });
            setDevOpsMembers(await getDevOpsTeamMembers());
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

    const handleAddProject = async (e) => {
        e.preventDefault();
        try {
            setActionLoading("Creating product...");
            if (!newProjectSelectedEnvironments.length) {
                alert("Select at least one environment for this product.");
                return;
            }
            const environments = ENVIRONMENTS.filter((e) => newProjectSelectedEnvironments.includes(e));
            await addProject(newProjectName, newProjectTag, environments);
            setNewProjectName('');
            setNewProjectTag('');
            setNewProjectSelectedEnvironments([]);
            setProjects(await getProjects({ force: true }));
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleAddManager = async (e) => {
        e.preventDefault();
        try {
            setActionLoading("Adding manager...");
            await addManager(newManager.name, newManager.email);
            setNewManager({ name: '', email: '' });
            setManagers(await getManagers(false, { force: true }));
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleDeleteManager = async (id) => {
        if (!window.confirm('Are you sure you want to delete this manager?')) return;
        try {
            setActionLoading("Deleting manager...");
            await deleteManager(id);
            setManagers(await getManagers(false, { force: true }));
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleToggleDateLeave = async (email, checked) => {
        try {
            setActionLoading("Updating leave schedule...");
            await setRotaLeaveForDate(leaveDate, email, checked);
            const [state, schedule] = await Promise.all([
                getRotaManagementState(),
                getRotaSchedule(14, new Date())
            ]);
            setRotaState(state);
            setRotaSchedule(schedule);
        } finally {
            setActionLoading("");
        }
    };

    const handleApplyManualAssignment = async (e) => {
        e.preventDefault();
        try {
            setActionLoading("Applying manual assignment...");
            await setRotaManualAssignment(manualDate, manualEmails);
            const [state, schedule] = await Promise.all([
                getRotaManagementState(),
                getRotaSchedule(14, new Date())
            ]);
            setRotaState(state);
            setRotaSchedule(schedule);
        } finally {
            setActionLoading("");
        }
    };
    
    // Calculate tab counts
    const tabCounts = {
        all: tickets.length,
        pending: tickets.filter(t => t.status === TICKET_STATUS.CREATED).length,
        active: tickets.filter(t => 
            [
                TICKET_STATUS.ACCEPTED,
                TICKET_STATUS.MANAGER_APPROVAL_PENDING,
                TICKET_STATUS.MANAGER_APPROVED,
                TICKET_STATUS.COST_APPROVAL_PENDING,
                TICKET_STATUS.COST_APPROVED,
                TICKET_STATUS.IN_PROGRESS,
                TICKET_STATUS.ACTION_REQUIRED,
                TICKET_STATUS.ON_HOLD
            ].includes(t.status)
        ).length,
        completed: tickets.filter(t => 
            [TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)
        ).length,
        rejected: tickets.filter(t => t.status === TICKET_STATUS.REJECTED).length
    };
    


    return (
        <div className="dashboard-layout admin-dashboard">


            <aside className="sidebar jira-style">
                <div className="sidebar-brand">
                    <div className="brand-logo" style={{ position: 'relative' }}>
                        <ShieldCheck size={28} />
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
                        <h2>CloudOps Hub</h2>
                        <span className="brand-subtitle">Admin Console</span>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <div className="nav-section">
                        <NavSectionToggle
                            label="Operations"
                            open={navGroups.operations}
                            onToggle={() => setNavGroups((p) => ({ ...p, operations: !p.operations }))}
                        />
                        {navGroups.operations && (
                            <>
                                <a 
                                    href="#" 
                                    className={viewMode === 'tickets' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('tickets'); }}
                                >
                                    <Ticket size={18} /> All Requests
                                    {tabCounts.pending > 0 && <span className="nav-badge urgent">{tabCounts.pending}</span>}
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'analytics' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('analytics'); }}
                                >
                                    <BarChart3 size={18} /> Analytics
                                </a>
                                <a
                                    href="#"
                                    className={viewMode === 'monitoring' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('monitoring'); }}
                                >
                                    <Activity size={18} /> System Monitor
                                </a>
                            </>
                        )}
                    </div>
                    <div className="nav-section">
                        <NavSectionToggle
                            label="Configuration"
                            open={navGroups.configuration}
                            onToggle={() => setNavGroups((p) => ({ ...p, configuration: !p.configuration }))}
                        />
                        {navGroups.configuration && (
                            <>
                                <a 
                                    href="#" 
                                    className={viewMode === 'team' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('team'); }}
                                >
                                    <Users size={18} /> Engineering Team
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'projects' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('projects'); }}
                                >
                                    <Building size={18} /> Services
                                </a>
                                <a
                                    href="#"
                                    className={viewMode === 'nameProducts' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('nameProducts'); }}
                                >
                                    <Layers size={18} /> Name Products
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'managers' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('managers'); }}
                                >
                                    <UserCog size={18} /> Approvers
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'rota' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('rota'); }}
                                >
                                    <RotateCcw size={18} /> On-Call Schedule
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'statusTimeline' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('statusTimeline'); }}
                                >
                                    <Activity size={18} /> Activity Timeline
                                </a>
                                <a 
                                    href="#" 
                                    className={viewMode === 'activityLogs' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('activityLogs'); }}
                                >
                                    <Activity size={18} /> Activity Logs
                                </a>
                            </>
                        )}
                    </div>
                    <div className="nav-section">
                        <NavSectionToggle
                            label="Account"
                            open={navGroups.account}
                            onToggle={() => setNavGroups((p) => ({ ...p, account: !p.account }))}
                        />
                        {navGroups.account && (
                            <>
                                <a 
                                    href="#" 
                                    className={viewMode === 'settings' ? 'active' : ''}
                                    onClick={(e) => { e.preventDefault(); setViewMode('settings'); }}
                                >
                                    <Settings size={18} /> Preferences
                                </a>
                                <a 
                                    href="#" 
                                    className={`nav-profile-link ${viewMode === 'profile' ? 'active' : ''}`}
                                    onClick={(e) => { e.preventDefault(); setViewMode('profile'); }}
                                >
                                    <ProfileIcon size={18} /> My Account
                                </a>
                            </>
                        )}
                    </div>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        <span className="user-email">{userEmail}</span>
                        <span className="user-role badge-admin">
                            Admin Access
                        </span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
            
            <main className="dashboard-content">
                <header className="content-header jira-style">
                    <div className="header-top">
                        <div className="header-title-section">
                            <div className="breadcrumb">
                                <span>Admin Console</span>
                                <span className="breadcrumb-separator">/</span>
                                <span>
                                    {viewMode === 'tickets' && 'Requests'}
                                    {viewMode === 'analytics' && 'Analytics'}
                                    {viewMode === 'monitoring' && 'Monitor'}
                                    {viewMode === 'team' && 'Engineering'}
                                    {viewMode === 'projects' && 'Services'}
                                    {viewMode === 'nameProducts' && 'Name Products'}
                                    {viewMode === 'managers' && 'Approvers'}
                                    {viewMode === 'statusTimeline' && 'Timeline'}
                                    {viewMode === 'rota' && 'Schedule'}
                                    {viewMode === 'activityLogs' && 'Audit Trail'}
                                    {viewMode === 'profile' && 'Account'}
                                    {viewMode === 'settings' && 'Preferences'}
                                </span>
                            </div>
                            <h1>
                                {viewMode === 'tickets' && 'All Service Requests'}
                                {viewMode === 'analytics' && 'System Analytics'}
                                {viewMode === 'monitoring' && 'Environment Monitoring'}
                                {viewMode === 'team' && 'Engineering Team'}
                                {viewMode === 'projects' && 'Configured Workflow Summary'}
                                {viewMode === 'nameProducts' && 'Name Products'}
                                {viewMode === 'managers' && 'Approval Contacts'}
                                {viewMode === 'rota' && 'On-Call Schedule'}
                                {viewMode === 'statusTimeline' && 'Team Activity Timeline'}
                                {viewMode === 'activityLogs' && 'Activity Logs / Audit Trail'}
                                {viewMode === 'profile' && 'My Account'}
                                {viewMode === 'settings' && 'Preferences'}
                            </h1>
                            <p className="header-subtitle">
                                {viewMode === 'tickets' 
                                    ? 'Monitor and manage all service requests with full administrative access.'
                                    : viewMode === 'analytics'
                                        ? 'View system-wide analytics and performance metrics.'
                                        : viewMode === 'monitoring'
                                            ? 'Track monthly service environment availability and utilization.'
                                        : viewMode === 'team'
                                            ? 'Manage engineering team members and monitor current availability.'
                                            : viewMode === 'projects'
                                                ? 'Configure services and workflows for request routing.'
                                                : viewMode === 'nameProducts'
                                                    ? 'Set per-environment contacts, cloud tags, resource utilization, and cost estimates.'
                                                : viewMode === 'managers'
                                                    ? 'Manage approval contacts for workflow notifications.'
                                                    : viewMode === 'rota'
                                                        ? 'Configure on-call rotation and shift assignments.'
                                                        : viewMode === 'statusTimeline'
                                                            ? 'Track team member availability changes with visual timeline.'
                                                            : viewMode === 'activityLogs'
                                                                ? 'Full audit trail of all ticket and system actions.'
                                                            : viewMode === 'settings'
                                                                ? 'Configure notifications and preferences.'
                                                            : 'Azure login details for your account.'}
                            </p>
                        </div>
                        <div className="header-actions">
                            <div className="search-box-mini">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search..." 
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

                {/* Settings Section */}
                {viewMode === 'settings' ? (
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
                {!['profile', 'settings', 'monitoring', 'activityLogs'].includes(viewMode) && (
                <div className="stats-grid">
                    <div className="stat-card jira-style">
                        <div className="stat-icon blue">
                            <Ticket size={24} />
                        </div>
                        <div className="stat-value">{stats.total || 0}</div>
                        <span className="stat-label">Total Tickets</span>
                    </div>
                    <div className="stat-card jira-style">
                        <div className="stat-icon orange">
                            <Clock size={24} />
                        </div>
                        <div className="stat-value">{tabCounts.pending}</div>
                        <span className="stat-label">Pending</span>
                    </div>
                    <div className="stat-card jira-style">
                        <div className="stat-icon purple">
                            <PlayCircle size={24} />
                        </div>
                        <div className="stat-value">{tabCounts.active}</div>
                        <span className="stat-label">Active</span>
                    </div>
                    <div className="stat-card jira-style">
                        <div className="stat-icon green">
                            <CheckCircle size={24} />
                        </div>
                        <div className="stat-value">{tabCounts.completed}</div>
                        <span className="stat-label">Completed</span>
                    </div>
                </div>
                )}
                
                {viewMode === 'monitoring' ? (
                    <MonitoringPanel adminMode />
                ) : viewMode === 'analytics' ? (
                    <AnalyticsDashboard
                        tickets={tickets}
                        stats={stats}
                        devOpsMembers={devOpsMembers}
                        projects={projects}
                    />
                ) : viewMode === 'team' ? (
                    <TeamManagementView 
                        newMember={newMember}
                        setNewMember={setNewMember}
                        handleAddDevOpsMember={handleAddDevOpsMember}
                        devOpsMembers={devOpsMembers}
                        availabilityStatus={DEVOPS_AVAILABILITY_STATUS}
                    />
                ) : viewMode === 'projects' ? (
                    <>
                    <ProjectManagementView 
                        newProductName={newProjectName}
                        setNewProductName={setNewProjectName}
                        newProductTag={newProjectTag}
                        setNewProductTag={setNewProjectTag}
                        environmentCatalog={ENVIRONMENTS}
                        selectedProductEnvironments={newProjectSelectedEnvironments}
                        onToggleProductEnvironment={(env) =>
                            setNewProjectSelectedEnvironments((prev) =>
                                prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
                            )
                        }
                        handleAddProject={handleAddProject}
                        projects={projects}
                        onConfigureWorkflow={(p) => setWorkflowProject(p)}
                    />
                    {workflowProject && (
                        <ProjectWorkflowEditor
                            project={workflowProject}
                            onClose={() => setWorkflowProject(null)}
                            onSaved={() => loadTickets(false)}
                        />
                    )}
                    </>
                ) : viewMode === 'nameProducts' ? (
                    <NameProductsView />
                ) : viewMode === 'managers' ? (
                    <ManagerManagementView 
                        newManager={newManager}
                        setNewManager={setNewManager}
                        handleAddManager={handleAddManager}
                        managers={managers}
                        handleDeleteManager={handleDeleteManager}
                    />
                ) : viewMode === 'rota' ? (
                    <RotaManagementView 
                        leaveDate={leaveDate}
                        setLeaveDate={setLeaveDate}
                        devOpsMembers={devOpsMembers}
                        rotaState={rotaState}
                        handleToggleDateLeave={handleToggleDateLeave}
                        manualDate={manualDate}
                        setManualDate={setManualDate}
                        manualEmails={manualEmails}
                        setManualEmails={setManualEmails}
                        handleApplyManualAssignment={handleApplyManualAssignment}
                        rotaSchedule={rotaSchedule}
                    />
                ) : viewMode === 'statusTimeline' ? (
                    <StatusTimelineView 
                        devOpsMembers={devOpsMembers}
                        timelineStatusColors={TIMELINE_STATUS_COLORS}
                    />
                ) : viewMode === 'activityLogs' ? (
                    <ActivityLogsView />
                ) : viewMode === 'profile' ? (
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
                ) : (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <div className="tickets-tabs">
                                <button 
                                    className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('all')}
                                >
                                    All ({tabCounts.all})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('pending')}
                                >
                                    <Clock size={14} />
                                    Pending ({tabCounts.pending})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('active')}
                                >
                                    <PlayCircle size={14} />
                                    Active ({tabCounts.active})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('completed')}
                                >
                                    <CheckCircle size={14} />
                                    Completed ({tabCounts.completed})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'rejected' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('rejected')}
                                >
                                    <XCircle size={14} />
                                    Rejected ({tabCounts.rejected})
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
                                    <Ticket size={48} />
                                    <h3>No tickets found</h3>
                                    <p>No tickets match your current filters.</p>
                                </div>
                            ) : (
                                filteredTickets.map(ticket => (
                                    <div key={ticket.id} className="ticket-card-wrapper admin-view">
                                        <TicketCard 
                                            ticket={ticket}
                                            onClick={() => setSelectedTicket(ticket)}
                                            showActions={true}
                                        />
                                        <div className="admin-actions" onClick={e => e.stopPropagation()}>
                                            <button 
                                                className="admin-btn delete"
                                                onClick={() => handleDeleteTicket(ticket.id)}
                                                title="Delete Ticket"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
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
                />
            )}
        </div>
    );
};

export default AdminDashboard;
