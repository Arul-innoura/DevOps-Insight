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
    ArchiveRestore,
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
    Zap,
    Calendar,
    Coffee,
    Moon,
    Pencil,
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
    getDeletedTickets,
    restoreTicket,
    updateTicketStatus,
    addTicketNote,
    deleteTicket,
    getTicketStats,
    TICKET_STATUS,
    ticketMatchesPrimaryStatusFilter,
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
import RotaCalendarModal from "./RotaCalendarModal";
import TicketSearchBar from "../../components/TicketSearchBar";
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
import EnvMonitoringDashboard from "../EnvMonitoringDashboard";
import { usePersistedSidebarNav } from "../../services/sidebarNavStorage";
import { NavSectionToggle } from "../../components/NavSectionToggle";
import DashboardProfilePage from "../../components/DashboardProfilePage";
import { useTheme } from "../../services/ThemeContext";
import { LoadingScreen } from "../../components/LoadingScreen";
import { signOutRedirectToLogin } from "../../auth/logoutHelper";

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
                    <h3>Register Product</h3>
                    <p>Add a new product to enable request tracking and workflow automation</p>
                </div>
            </div>
            <form className="workflow-form" onSubmit={handleAddProject}>
                <div className="workflow-form-grid">
                    <div className="workflow-form-group">
                        <label>Product Name</label>
                        <input
                            type="text"
                            placeholder="Enter product name"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="workflow-form-group">
                        <label>Product ID <span className="optional-tag">Optional</span></label>
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
                    <Plus size={16} /> Register Product
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
                    <p>Register your first product above to begin configuring workflows</p>
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
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
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
                    <p style={{ color: '#6b7280' }}>No managers added yet.</p>
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

function rotaFormatShortDate(dateStr) {
    if (!dateStr) return '';
    const s = String(dateStr);
    const d = s.length <= 10 ? new Date(`${s}T12:00:00`) : new Date(s);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function RotaDayCard({ day }) {
    const names = (day.members || []).map((m) => m.name).filter(Boolean);
    return (
        <div className={`rota-day-card${day.isManual ? ' rota-day-card--manual' : ''}`}>
            <div className="rota-day-card__meta">
                <span className="rota-day-card__dow">{day.dayName || '—'}</span>
                <span className="rota-day-card__date">{rotaFormatShortDate(day.date)}</span>
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
}

function RotaManagementView({
    leaveDate,
    setLeaveDate,
    devOpsMembers,
    rotaState,
    handleToggleDateLeave,
    manualDate,
    setManualDate,
    manualEmails,
    setManualEmails,
    handleApplyManualAssignment,
    rotaSchedule,
    refreshRota,
}) {
    const [calOpen, setCalOpen] = useState(false);
    const [calEdit, setCalEdit] = useState(false);
    const [calMonth, setCalMonth] = useState(() => new Date());

    const modeLabel = String(rotaState.rotationMode || "DAILY").toUpperCase() === "WEEKLY"
        ? "Weekly (Mon–Sun)"
        : "Daily";

    return (
    <div className="rota-page">
        <div className="rota-actions-bar">
            <div className="rota-actions-bar__left">
                <span className="rota-mode-badge">Shift: {modeLabel}</span>
                <span className="rota-actions-hint">Open the calendar to see who is on duty or edit assignments by day.</span>
            </div>
            <div className="rota-actions-bar__btns">
                <button type="button" className="rota-icon-btn" onClick={() => { setCalEdit(false); setCalOpen(true); }}>
                    <Calendar size={18} aria-hidden /> Calendar
                </button>
                <button type="button" className="rota-icon-btn rota-icon-btn--primary" onClick={() => { setCalEdit(true); setCalOpen(true); }}>
                    <Pencil size={18} aria-hidden /> Edit calendar
                </button>
            </div>
        </div>
        <RotaCalendarModal
            open={calOpen}
            onClose={() => setCalOpen(false)}
            isAdmin
            initialEdit={calEdit}
            calMonth={calMonth}
            onCalMonthChange={setCalMonth}
            devOpsMembers={devOpsMembers}
            rotationMode={rotaState.rotationMode}
            leaveByDate={rotaState.leaveByDate || {}}
            onUpdated={refreshRota}
        />
        <div className="rota-toolbar-row">
            <section className="rota-section" aria-labelledby="rota-leave-heading">
                <h3 id="rota-leave-heading" className="rota-section__title">
                    <Calendar size={18} aria-hidden /> Leave by date
                </h3>
                <p className="rota-section__lede">Pick a date, then mark who is on leave. The schedule below updates after save.</p>
                <label className="rota-field-label" htmlFor="rota-leave-date">Date</label>
                <input
                    id="rota-leave-date"
                    className="rota-date-input"
                    type="date"
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                />
                <div className="rota-leave-grid">
                    {devOpsMembers.map((member) => {
                        const isLeave = (rotaState.leaveByDate?.[leaveDate] || []).includes((member.email || '').toLowerCase());
                        return (
                            <div className="rota-member-row" key={member.email}>
                                <strong>{member.name}</strong>
                                <label className="rota-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={isLeave}
                                        onChange={(e) => handleToggleDateLeave(member.email, e.target.checked)}
                                    />
                                    On leave
                                </label>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="rota-section" aria-labelledby="rota-manual-heading">
                <h3 id="rota-manual-heading" className="rota-section__title">
                    <Users size={18} aria-hidden /> Manual on-call (up to 4)
                </h3>
                <p className="rota-section__lede">Override the rotation for a specific night. Hold Ctrl/Cmd to pick up to four people (primary + coverage).</p>
                <form className="rota-manual-form" onSubmit={handleApplyManualAssignment}>
                    <div className="rota-manual-row">
                        <div className="rota-manual-field">
                            <label className="rota-field-label" htmlFor="rota-manual-date">Date</label>
                            <input
                                id="rota-manual-date"
                                type="date"
                                value={manualDate}
                                onChange={(e) => setManualDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="rota-manual-field rota-manual-field--grow">
                            <label className="rota-field-label" htmlFor="rota-manual-members">Members</label>
                            <select
                                id="rota-manual-members"
                                className="rota-multiselect"
                                multiple
                                size={5}
                                value={manualEmails}
                                onChange={(e) => {
                                    const selected = Array.from(e.target.selectedOptions).map((o) => o.value).slice(0, 4);
                                    setManualEmails(selected);
                                }}
                            >
                                {devOpsMembers.map((member) => (
                                    <option key={member.email} value={member.email}>{member.name}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="btn-primary rota-apply-btn">Apply</button>
                    </div>
                </form>
            </section>
        </div>

        <section className="rota-section rota-section--schedule" aria-labelledby="rota-schedule-heading">
            <div className="rota-schedule-head">
                <h3 id="rota-schedule-heading" className="rota-section__title">
                    <RotateCcw size={18} aria-hidden /> 14-day on-call preview
                </h3>
                <p>Calendar order is week-based (7 columns). Manual rows are highlighted.</p>
            </div>
            <div className="rota-schedule-grid">
                {(rotaSchedule || []).map((day) => (
                    <RotaDayCard key={day.date} day={day} />
                ))}
            </div>
        </section>
    </div>
    );
}

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
        refreshDebounceMs: 2000,
        minRefreshIntervalMs: 5000,
        eventTypes: [
            "devops:availability_changed",
            "devops:updated",
            "sync:required"
        ],
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
    const { theme, setTheme, themes } = useTheme();
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
    const [viewMode, setViewMode] = useState('tickets'); // 'tickets', 'deletedTickets', 'analytics', ...
    const [deletedTicketsList, setDeletedTicketsList] = useState([]);
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
    const [ticketSearch, setTicketSearch] = useState({ query: "", remote: null, loading: false });
    const [ticketDataVersion, setTicketDataVersion] = useState(0);
    const ticketSearchRef = useRef(ticketSearch);
    const [soundSettings, setSoundSettings] = useState({
        enabled: getSoundEnabled(),
        volume: getVolume()
    });
    const [navGroups, setNavGroups] = usePersistedSidebarNav("admin", ADMIN_SIDEBAR_NAV_DEFAULTS);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const isLoadingRef = useRef(false);
    const filtersRef = useRef(filters);
    const activeTabRef = useRef(activeTab);
    const viewModeRef = useRef(viewMode);
    
    // Real-time connection status
    const { isConnected } = useConnectionStatus();
    
    // Keep refs in sync
    useEffect(() => { filtersRef.current = filters; }, [filters]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
    useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
    useEffect(() => {
        ticketSearchRef.current = ticketSearch;
    }, [ticketSearch]);


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
            setTicketDataVersion((v) => v + 1);
            setIsInitialLoading(false);
        } finally {
            isLoadingRef.current = false;
            if (!silent) setIsSyncing(false);
        }
    }, []);

    const loadDeletedTickets = useCallback(async () => {
        try {
            setDeletedTicketsList(await getDeletedTickets());
        } catch (e) {
            console.error(e);
            alert(e?.message || "Could not load deleted tickets");
        }
    }, []);

    useEffect(() => {
        if (viewMode === "deletedTickets") {
            void loadDeletedTickets();
        }
    }, [viewMode, loadDeletedTickets]);

    // Real-time sync via WebSocket - silent background updates
    useRealTimeSync({
        onRefresh: async () => {
            await loadTickets(true);
            if (viewModeRef.current === "deletedTickets") {
                await loadDeletedTickets();
            }
        },
        playUpdateSound: true,
        refreshOnEvents: true,
        refreshDebounceMs: 1200,
        minRefreshIntervalMs: 3500,
        eventTypes: [
            "ticket:created",
            "ticket:updated",
            "ticket:status_changed",
            "ticket:deleted",
            "ticket:assigned"
        ],
        enableWebSocket: true,
        pollingInterval: null // No polling
    });

    // Manual refresh handler
    const handleManualRefresh = () => {
        setIsSyncing(true);
        loadTickets(false);
    };
    
    const applyFilters = (fullTicketList, currentFilters, tab) => {
        const ts = ticketSearchRef.current;
        let result = [...fullTicketList];
        if (ts.query.trim() && !ts.loading && ts.remote != null) {
            const ids = new Set(ts.remote.map((t) => t.id));
            result = result.filter((t) => ids.has(t.id));
        }

        // Apply tab filter
        if (tab === 'all') {
            // All tab excludes closed — closed tickets have their own dedicated tab
            result = result.filter(t => t.status !== TICKET_STATUS.CLOSED);
        } else if (tab === 'pending') {
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
            // Completed only — closed tickets are in the Closed tab
            result = result.filter(t => t.status === TICKET_STATUS.COMPLETED);
        } else if (tab === 'closed') {
            result = result.filter(t => t.status === TICKET_STATUS.CLOSED);
        } else if (tab === 'rejected') {
            result = result.filter(t => t.status === TICKET_STATUS.REJECTED);
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
            const searchLower = currentFilters.search.toLowerCase().trim();
            result = result.filter((t) => {
                const id = (t.id || "").toLowerCase();
                const tail = id.includes("-") ? id.split("-").pop() : id;
                return (
                    id.includes(searchLower) ||
                    tail.includes(searchLower) ||
                    (t.productName || "").toLowerCase().includes(searchLower) ||
                    (t.requestedBy || "").toLowerCase().includes(searchLower) ||
                    (t.description || "").toLowerCase().includes(searchLower) ||
                    (t.assignedTo || "").toLowerCase().includes(searchLower)
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
        if (viewMode !== "tickets") return;
        applyFilters(tickets, filtersRef.current, activeTabRef.current);
    }, [ticketSearch, tickets, viewMode]);
    
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
    
    const handleAddNote = async (ticketId, notes, attachments = []) => {
        try {
            setActionLoading("Adding ticket note...");
            await addTicketNote(ticketId, { name: userName, email: userEmail }, notes, attachments);
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
        if (
            !window.confirm(
                "Move this ticket to the recycle bin? It will be hidden from queues and cannot be edited until an admin restores it."
            )
        ) {
            return;
        }
        try {
            setActionLoading("Moving ticket to recycle bin...");
            await deleteTicket(ticketId);
            await loadTickets(true);
            if (viewMode === "deletedTickets") {
                await loadDeletedTickets();
            }
            setSelectedTicket(null);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
        }
    };

    const handleRestoreTicket = async (ticketId) => {
        try {
            setActionLoading("Restoring ticket...");
            const updated = await restoreTicket(ticketId);
            await loadTickets(true);
            await loadDeletedTickets();
            if (selectedTicket?.id === ticketId) {
                setSelectedTicket(updated);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setActionLoading("");
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
        signOutRedirectToLogin(instance);
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

    const refreshRota = useCallback(async () => {
        const [state, schedule] = await Promise.all([
            getRotaManagementState(),
            getRotaSchedule(14, new Date()),
        ]);
        setRotaState(state);
        setRotaSchedule(schedule);
    }, []);
    
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
        completed: tickets.filter(t => t.status === TICKET_STATUS.COMPLETED).length,
        closed: tickets.filter(t => t.status === TICKET_STATUS.CLOSED).length,
        rejected: tickets.filter(t => t.status === TICKET_STATUS.REJECTED).length
    };
    


    if (isInitialLoading) return <LoadingScreen role="admin" />;

    return (
        <div className="dashboard-layout admin-dashboard">


            <aside className="shipit-sidebar">
                {/* Brand */}
                <div className="sb-brand">
                    <div className="sb-brand-icon">
                        <ShieldCheck size={18} />
                        <span className={`sb-conn-dot ${isConnected ? 'connected' : 'disconnected'}`}
                              title={isConnected ? 'Live connection' : 'Disconnected'} />
                    </div>
                    <div className="sb-brand-meta">
                        <span className="sb-app-name">ShipIt</span>
                        <span className="sb-app-subtitle">Admin Console</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sb-nav">
                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.operations}
                            onToggle={() => setNavGroups(g => ({ ...g, operations: !g.operations }))}
                            label="Operations"
                        />
                        {navGroups.operations && (
                            <div className="sb-group-items">
                                <a href="#" className={`sb-item ${viewMode === 'tickets' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('tickets'); }}>
                                    <span className="sb-item-icon"><Ticket size={15} /></span>
                                    <span className="sb-item-text">All Requests</span>
                                    {tabCounts.pending > 0 && <span className="sb-badge urgent">{tabCounts.pending}</span>}
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'deletedTickets' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('deletedTickets'); }}>
                                    <span className="sb-item-icon"><ArchiveRestore size={15} /></span>
                                    <span className="sb-item-text">Deleted tickets</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'analytics' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('analytics'); }}>
                                    <span className="sb-item-icon"><BarChart3 size={15} /></span>
                                    <span className="sb-item-text">Analytics</span>
                                </a>
                            </div>
                        )}
                    </div>

                    <div className="sb-group">
                        <NavSectionToggle
                            open={navGroups.configuration}
                            onToggle={() => setNavGroups(g => ({ ...g, configuration: !g.configuration }))}
                            label="Configuration"
                        />
                        {navGroups.configuration && (
                            <div className="sb-group-items">
                                <a href="#" className={`sb-item ${viewMode === 'team' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('team'); }}>
                                    <span className="sb-item-icon"><Users size={15} /></span>
                                    <span className="sb-item-text">Engineering Team</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'projects' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('projects'); }}>
                                    <span className="sb-item-icon"><Building size={15} /></span>
                                    <span className="sb-item-text">Products</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'rota' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('rota'); }}>
                                    <span className="sb-item-icon"><RotateCcw size={15} /></span>
                                    <span className="sb-item-text">On-Call Schedule</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'statusTimeline' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('statusTimeline'); }}>
                                    <span className="sb-item-icon"><Activity size={15} /></span>
                                    <span className="sb-item-text">Activity Timeline</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'activityLogs' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('activityLogs'); }}>
                                    <span className="sb-item-icon"><Activity size={15} /></span>
                                    <span className="sb-item-text">Activity Logs</span>
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
                                <a href="#" className={`sb-item ${viewMode === 'settings' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('settings'); }}>
                                    <span className="sb-item-icon"><Settings size={15} /></span>
                                    <span className="sb-item-text">Preferences</span>
                                </a>
                                <a href="#" className={`sb-item ${viewMode === 'profile' ? 'active' : ''}`}
                                   onClick={(e) => { e.preventDefault(); setViewMode('profile'); }}>
                                    <span className="sb-item-icon"><ProfileIcon size={15} /></span>
                                    <span className="sb-item-text">My Account</span>
                                </a>
                            </div>
                        )}
                    </div>
                </nav>

                {/* Footer */}
                <div className="sb-footer">
                    <div className="sb-user-row">
                        <div className="sb-avatar">
                            {(userName || '').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?'}
                        </div>
                        <div className="sb-user-meta">
                            <span className="sb-user-name">{userName}</span>
                            <span className="sb-user-email">{userEmail}</span>
                        </div>
                    </div>
                    <div className="sb-footer-actions">
                        <span className="sb-role-badge admin">Admin</span>
                        <button className="sb-logout-btn" onClick={handleLogout}>
                            <LogOut size={12} /> Sign Out
                        </button>
                    </div>
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
                                    {viewMode === 'deletedTickets' && 'Recycle bin'}
                                    {viewMode === 'analytics' && 'Analytics'}
                                    {viewMode === 'monitoring' && 'Monitor'}
                                    {viewMode === 'team' && 'Engineering'}
                                    {viewMode === 'projects' && 'Products'}
                                    {viewMode === 'managers' && 'Approvers'}
                                    {viewMode === 'statusTimeline' && 'Timeline'}
                                    {viewMode === 'rota' && 'Schedule'}
                                    {viewMode === 'activityLogs' && 'Audit Trail'}
                                    {viewMode === 'profile' && 'Account'}
                                    {viewMode === 'settings' && 'Preferences'}
                                </span>
                            </div>
                            <h1>
                                {viewMode === 'tickets' && 'All Requests'}
                                {viewMode === 'deletedTickets' && 'Deleted tickets'}
                                {viewMode === 'analytics' && 'System Analytics'}
                                {viewMode === 'monitoring' && 'Environment Monitoring'}
                                {viewMode === 'team' && 'Engineering Team'}
                                {viewMode === 'projects' && 'Product Workflow Summary'}
                                {viewMode === 'managers' && 'Approval Contacts'}
                                {viewMode === 'rota' && 'On-Call Schedule'}
                                {viewMode === 'statusTimeline' && 'Team Activity Timeline'}
                                {viewMode === 'activityLogs' && 'Activity Logs / Audit Trail'}
                                {viewMode === 'profile' && 'My Account'}
                                {viewMode === 'settings' && 'Preferences'}
                            </h1>
                            {viewMode === 'tickets' && (
                                <p className="header-subtitle">
                                    Monitor and manage all requests with full administrative access.
                                </p>
                            )}
                            {viewMode === 'deletedTickets' && (
                                <p className="header-subtitle">
                                    Soft-deleted tickets are read-only here. Restore a ticket to return it to active queues.
                                </p>
                            )}
                        </div>
                        <div className="header-actions">
                            {viewMode === "tickets" && (
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
                {/* Compact Mini Stats Bar — tickets section only */}
                {viewMode === 'tickets' && (
                <div className="mini-stats-bar">
                    <button className="mini-stat">
                        <span className="mini-stat-icon blue"><Ticket size={13} /></span>
                        <span className="mini-stat-value">{stats.total || 0}</span>
                        <span className="mini-stat-label">Total</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className="mini-stat">
                        <span className="mini-stat-icon orange"><Clock size={13} /></span>
                        <span className="mini-stat-value">{tabCounts.pending}</span>
                        <span className="mini-stat-label">Pending</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className="mini-stat">
                        <span className="mini-stat-icon purple"><PlayCircle size={13} /></span>
                        <span className="mini-stat-value">{tabCounts.active}</span>
                        <span className="mini-stat-label">Active</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className="mini-stat">
                        <span className="mini-stat-icon green"><CheckCircle size={13} /></span>
                        <span className="mini-stat-value">{tabCounts.completed}</span>
                        <span className="mini-stat-label">Completed</span>
                    </button>
                    <span className="mini-stat-sep" />
                    <button className="mini-stat">
                        <span className="mini-stat-icon red"><XCircle size={13} /></span>
                        <span className="mini-stat-value">{tabCounts.closed ?? 0}</span>
                        <span className="mini-stat-label">Closed</span>
                    </button>
                </div>
                )}
                
                {viewMode === 'monitoring' ? (
                    <EnvMonitoringDashboard
                        tickets={tickets}
                        projects={projects}
                        devOpsMembers={devOpsMembers}
                        userRole="admin"
                    />
                ) : viewMode === 'analytics' ? (
                    <AnalyticsDashboard
                        tickets={tickets}
                        stats={stats}
                        devOpsMembers={devOpsMembers}
                        projects={projects}
                        showCost={true}
                        userRole="admin"
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
                            onSaved={async () => {
                                await loadTickets(false);
                                try {
                                    setProjects(await getProjects({ force: true }));
                                } catch (_) { /* ignore */ }
                            }}
                        />
                    )}
                    </>
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
                        refreshRota={refreshRota}
                    />
                ) : viewMode === 'statusTimeline' ? (
                    <StatusTimelineView 
                        devOpsMembers={devOpsMembers}
                        timelineStatusColors={TIMELINE_STATUS_COLORS}
                    />
                ) : viewMode === 'activityLogs' ? (
                    <ActivityLogsView />
                ) : viewMode === 'deletedTickets' ? (
                    <div className="tickets-section">
                        <div className="tickets-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
                            <p className="jdm-hint-text" style={{ margin: 0, maxWidth: 640 }}>
                                These tickets are hidden from DevOps queues and cannot be edited. Use{" "}
                                <strong>Restore</strong> to bring a ticket back.
                            </p>
                            <button type="button" className="btn-filter" onClick={() => void loadDeletedTickets()}>
                                <RefreshCw size={16} /> Refresh
                            </button>
                        </div>
                        <div className="tickets-list">
                            {deletedTicketsList.length === 0 ? (
                                <div className="empty-state">
                                    <ArchiveRestore size={48} />
                                    <h3>No deleted tickets</h3>
                                    <p>The recycle bin is empty.</p>
                                </div>
                            ) : (
                                deletedTicketsList.map((ticket) => (
                                    <div key={ticket.id} className="ticket-card-wrapper admin-view">
                                        <TicketCard
                                            ticket={ticket}
                                            onClick={() => setSelectedTicket(ticket)}
                                            showActions={true}
                                        />
                                        <div className="admin-actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="admin-btn"
                                                style={{ background: "#15803d", color: "#fff" }}
                                                onClick={() => handleRestoreTicket(ticket.id)}
                                                title="Restore ticket"
                                            >
                                                <ArchiveRestore size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : viewMode === 'profile' ? (
                    <div className="tickets-section profile-section-wrap">
                        <DashboardProfilePage
                            userName={userName}
                            userEmail={userEmail}
                            userPrincipalName={userPrincipalName}
                            roleKey="admin"
                            onSignOut={handleLogout}
                            avatarColor="#1d4ed8"
                        />
                    </div>
                ) : (
                    <div className="tickets-section">
                        <div className="tickets-header">
                            <div className="tickets-tabs">
                                <button 
                                    className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('all')}
                                >
                                    All ({tabCounts.all - tabCounts.closed})
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
                                    className={`tab-btn ${activeTab === 'closed' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('closed')}
                                >
                                    <XCircle size={14} />
                                    Closed ({tabCounts.closed})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'rejected' ? 'active' : ''}`}
                                    onClick={() => handleTabChange('rejected')}
                                >
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
                    onRestoreTicket={selectedTicket.deleted ? handleRestoreTicket : undefined}
                />
            )}
        </div>
    );
};

export default AdminDashboard;
