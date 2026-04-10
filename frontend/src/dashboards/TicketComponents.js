import React, { useState, useEffect, useRef, useMemo } from 'react';
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { 
    X, 
    Clock, 
    CheckCircle, 
    AlertCircle, 
    Pause, 
    XCircle, 
    PlayCircle,
    UserCheck,
    FileCheck,
    ChevronDown,
    ChevronUp,
    Send,
    MessageSquare,
    Upload,
    Calendar,
    User,
    Mail,
    Building,
    GitBranch,
    Server,
    Database,
    Cpu,
    HardDrive,
    Globe,
    FileText,
    AlertTriangle,
    Tag,
    CircleDot,
    Rocket,
    ShieldCheck,
    DollarSign,
    Loader2,
    Ban,
    Forward
} from 'lucide-react';
import { 
    TICKET_STATUS, 
    STATUS_COLORS, 
    REQUEST_TYPES,
    REQUEST_TYPE_TO_API_ENUM,
    ENVIRONMENTS,
    normalizeEnvironmentLabel,
    getDynamicAllowedTransitions,
    STATUS_TRANSITIONS,
    createTicket,
    updateTicketStatus,
    addTicketNote,
    getSavedCcEmails,
    saveCcEmail,
    toDisplayTicketStatus
} from '../services/ticketService';
import { getEffectiveWorkflow } from '../services/projectWorkflowService';
import EmailChipsInput from "../components/EmailChipsInput";

// Status configuration with icons and simplified labels for dropdowns
export const STATUS_DISPLAY_CONFIG = {
    [TICKET_STATUS.CREATED]: { 
        icon: CircleDot, 
        label: 'New Request',
        shortLabel: 'New'
    },
    [TICKET_STATUS.ACCEPTED]: { 
        icon: Rocket, 
        label: 'Accepted',
        shortLabel: 'Accepted'
    },
    [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: { 
        icon: Clock, 
        label: 'Pending Approval',
        shortLabel: 'Pending'
    },
    [TICKET_STATUS.MANAGER_APPROVED]: { 
        icon: ShieldCheck, 
        label: 'Approved',
        shortLabel: 'Approved'
    },
    [TICKET_STATUS.COST_APPROVAL_PENDING]: { 
        icon: DollarSign, 
        label: 'Cost Review',
        shortLabel: 'Cost Review'
    },
    [TICKET_STATUS.COST_APPROVED]: { 
        icon: CheckCircle, 
        label: 'Cost Approved',
        shortLabel: 'Cost OK'
    },
    [TICKET_STATUS.IN_PROGRESS]: { 
        icon: Loader2, 
        label: 'In Progress',
        shortLabel: 'Active'
    },
    [TICKET_STATUS.ACTION_REQUIRED]: { 
        icon: AlertCircle, 
        label: 'Action Needed',
        shortLabel: 'Action'
    },
    [TICKET_STATUS.ON_HOLD]: { 
        icon: Pause, 
        label: 'On Hold',
        shortLabel: 'Hold'
    },
    [TICKET_STATUS.COMPLETED]: { 
        icon: CheckCircle, 
        label: 'Completed',
        shortLabel: 'Done'
    },
    [TICKET_STATUS.CLOSED]: { 
        icon: Ban, 
        label: 'Closed',
        shortLabel: 'Closed'
    }
};

// Helper to get display label for status
export const getStatusDisplayLabel = (status) => {
    return STATUS_DISPLAY_CONFIG[status]?.label || status;
};

/** Timeline entries use display labels (e.g. "Waiting for Manager Approval"), not API enums. */
const TICKET_STATUS_DISPLAY_TO_KEY = Object.fromEntries(
    Object.entries(TICKET_STATUS).map(([enumKey, label]) => [label, enumKey])
);

function timelineStatusKey(displayStatus) {
    if (!displayStatus) return "";
    if (TICKET_STATUS_DISPLAY_TO_KEY[displayStatus]) return TICKET_STATUS_DISPLAY_TO_KEY[displayStatus];
    const normalized = String(displayStatus).toUpperCase().replace(/\s+/g, "_");
    if (Object.prototype.hasOwnProperty.call(TICKET_STATUS, normalized)) return normalized;
    return normalized;
}

function normalizeFlowNotes(notes) {
    return String(notes || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Remove back-to-back timeline rows that repeat the same status and same note (common duplicate writes). */
function dedupeConsecutiveStatusTimeline(entries) {
    const out = [];
    for (const entry of entries) {
        const st = timelineStatusKey(entry?.status);
        const norm = normalizeFlowNotes(entry?.notes);
        const prev = out[out.length - 1];
        if (prev) {
            const pst = timelineStatusKey(prev?.status);
            const pn = normalizeFlowNotes(prev?.notes);
            if (st === pst && norm === pn) continue;
        }
        out.push(entry);
    }
    return out;
}

function extractPurposeSnippet(notes) {
    const s = String(notes || "");
    const m = s.match(/Purpose:\s*([\s\S]+?)(?=\.\s+[A-Z]|$)/i) || s.match(/Purpose:\s*(.+)/i);
    if (!m) return "";
    const t = normalizeFlowNotes(m[1]);
    if (!t) return "";
    return t.length > 88 ? `${t.slice(0, 85)}…` : t;
}

// ============ ENHANCED STATUS BADGE COMPONENT ============
export const StatusBadge = ({ status, size = 'medium', animated = true }) => {
    const colors = STATUS_COLORS[status] || { bg: '#e5e7eb', text: '#4b5563' };
    
    // Simplified display labels for cleaner UI
    const getDisplayLabel = () => {
        switch (status) {
            case TICKET_STATUS.CREATED:
                return 'New';
            case TICKET_STATUS.ACCEPTED:
                return 'Accepted';
            case TICKET_STATUS.MANAGER_APPROVAL_PENDING:
                return 'Pending Approval';
            case TICKET_STATUS.MANAGER_APPROVED:
                return 'Approved';
            case TICKET_STATUS.COST_APPROVAL_PENDING:
                return 'Cost Review';
            case TICKET_STATUS.COST_APPROVED:
                return 'Cost Approved';
            case TICKET_STATUS.IN_PROGRESS:
                return 'In Progress';
            case TICKET_STATUS.ACTION_REQUIRED:
                return 'Action Needed';
            case TICKET_STATUS.ON_HOLD:
                return 'On Hold';
            case TICKET_STATUS.COMPLETED:
                return 'Completed';
            case TICKET_STATUS.CLOSED:
                return 'Closed';
            case TICKET_STATUS.REJECTED:
                return 'Rejected';
            default:
                return status;
        }
    };
    
    const getIcon = () => {
        const iconSize = size === 'small' ? 12 : size === 'large' ? 16 : 14;
        switch (status) {
            case TICKET_STATUS.CREATED:
                return <Clock size={iconSize} />;
            case TICKET_STATUS.ACCEPTED:
                return <FileCheck size={iconSize} />;
            case TICKET_STATUS.MANAGER_APPROVAL_PENDING:
                return <UserCheck size={iconSize} />;
            case TICKET_STATUS.MANAGER_APPROVED:
                return <CheckCircle size={iconSize} />;
            case TICKET_STATUS.COST_APPROVAL_PENDING:
                return <Clock size={iconSize} />;
            case TICKET_STATUS.COST_APPROVED:
                return <CheckCircle size={iconSize} />;
            case TICKET_STATUS.IN_PROGRESS:
                return <PlayCircle size={iconSize} />;
            case TICKET_STATUS.ACTION_REQUIRED:
                return <AlertCircle size={iconSize} />;
            case TICKET_STATUS.ON_HOLD:
                return <Pause size={iconSize} />;
            case TICKET_STATUS.COMPLETED:
                return <CheckCircle size={iconSize} />;
            case TICKET_STATUS.CLOSED:
                return <CheckCircle size={iconSize} />;
            default:
                return <Clock size={iconSize} />;
        }
    };

    // Check if status needs attention indicator (pulsing animation)
    const needsAttention = [
        TICKET_STATUS.ACTION_REQUIRED,
        TICKET_STATUS.MANAGER_APPROVAL_PENDING,
        TICKET_STATUS.COST_APPROVAL_PENDING
    ].includes(status);
    
    const sizeClasses = {
        small: { padding: '3px 10px', fontSize: '0.7rem', gap: '5px' },
        medium: { padding: '5px 12px', fontSize: '0.75rem', gap: '6px' },
        large: { padding: '7px 14px', fontSize: '0.85rem', gap: '8px' }
    };
    
    const sizeStyle = sizeClasses[size] || sizeClasses.medium;
    
    return (
        <span
            className={`status-badge-enhanced ${animated && needsAttention ? 'pulse' : ''}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: sizeStyle.gap,
                padding: sizeStyle.padding,
                borderRadius: '6px',
                fontSize: sizeStyle.fontSize,
                fontWeight: 600,
                backgroundColor: colors.bg,
                color: colors.text,
                whiteSpace: 'nowrap',
                border: `1px solid ${colors.text}22`,
                boxShadow: 'none',
                transition: 'background 0.15s, color 0.15s'
            }}
        >
            <span className={animated && needsAttention ? 'icon-pulse' : ''}>
                {getIcon()}
            </span>
            {getDisplayLabel()}
        </span>
    );
};

// ============ HORIZONTAL PROGRESS COMPONENT ============
export const HorizontalProgress = ({ timeline = [], currentStatus, workflowStages: dynamicStages }) => {
    // Simplified stage labels for cleaner display
    const staticStages = [
        { key: TICKET_STATUS.CREATED, label: 'Submitted' },
        { key: TICKET_STATUS.ACCEPTED, label: 'Reviewed' },
        { key: TICKET_STATUS.MANAGER_APPROVAL_PENDING, label: 'Approval' },
        { key: TICKET_STATUS.MANAGER_APPROVED, label: 'Verified' },
        { key: TICKET_STATUS.COST_APPROVAL_PENDING, label: 'Cost Review' },
        { key: TICKET_STATUS.COST_APPROVED, label: 'Authorized' },
        { key: TICKET_STATUS.IN_PROGRESS, label: 'Processing' },
        { key: TICKET_STATUS.COMPLETED, label: 'Complete' },
        { key: TICKET_STATUS.CLOSED, label: 'Closed' }
    ];

    const useDynamic = Array.isArray(dynamicStages) && dynamicStages.length > 0;

    const getStaticStageIndex = () => {
        const index = staticStages.findIndex(stage => stage.key === currentStatus);
        if (index !== -1) return index;
        if (currentStatus === TICKET_STATUS.ACTION_REQUIRED || currentStatus === TICKET_STATUS.ON_HOLD) {
            return staticStages.findIndex(stage => stage.key === TICKET_STATUS.IN_PROGRESS);
        }
        return 0;
    };

    const staticIndex = getStaticStageIndex();

    return (
        <div className="horizontal-progress">
            <div className="progress-stages">
                {useDynamic
                    ? dynamicStages.map((stage, index) => {
                          const isCompleted = stage.state === 'done';
                          const isCurrent = stage.state === 'current';
                          const isPending = stage.state === 'pending';
                          return (
                              <React.Fragment key={stage.id || index}>
                                  <div className={`progress-stage ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                                      <div className="stage-marker">
                                          {isCompleted ? (
                                              <CheckCircle size={24} />
                                          ) : isCurrent ? (
                                              <PlayCircle size={24} />
                                          ) : (
                                              <Clock size={24} />
                                          )}
                                      </div>
                                      <div className="stage-label">{stage.label}</div>
                                  </div>
                                  {index < dynamicStages.length - 1 && (
                                      <div className={`progress-connector ${isCompleted ? 'completed' : ''}`}>
                                          <div className="connector-line"></div>
                                      </div>
                                  )}
                              </React.Fragment>
                          );
                      })
                    : staticStages.map((stage, index) => {
                          const isCompleted = index < staticIndex;
                          const isCurrent = index === staticIndex;
                          const isPending = index > staticIndex;
                          return (
                              <React.Fragment key={stage.key}>
                                  <div className={`progress-stage ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                                      <div className="stage-marker">
                                          {isCompleted ? (
                                              <CheckCircle size={24} />
                                          ) : isCurrent ? (
                                              <PlayCircle size={24} />
                                          ) : (
                                              <Clock size={24} />
                                          )}
                                      </div>
                                      <div className="stage-label">{stage.label}</div>
                                  </div>
                                  {index < staticStages.length - 1 && (
                                      <div className={`progress-connector ${isCompleted ? 'completed' : ''}`}>
                                          <div className="connector-line"></div>
                                      </div>
                                  )}
                              </React.Fragment>
                          );
                      })}
            </div>

            {!useDynamic && (currentStatus === TICKET_STATUS.ACTION_REQUIRED || currentStatus === TICKET_STATUS.ON_HOLD) && (
                <div className="progress-status-note">
                    <StatusBadge status={currentStatus} size="large" />
                </div>
            )}
        </div>
    );
};

// ============ TICKET TIMELINE COMPONENT ============
const maskCostText = (text) => {
    const raw = String(text || "");
    return raw
        .replace(/(Cost estimation submitted:\s*)([A-Z]{3}\s*)?[\d,]+(?:\.\d+)?/gi, "$1***")
        .replace(/(Cost approved:\s*)([A-Z]{3}\s*)?[\d,]+(?:\.\d+)?/gi, "$1***")
        .replace(/(Cost approval declined; ticket closed\.\s*)([A-Z]{3}\s*)?[\d,]+(?:\.\d+)?/gi, "$1***")
        .replace(/\b(USD|INR)\s*[\d,]+(?:\.\d+)?\b/gi, "***");
};

export const TicketTimeline = ({ timeline = [], maskSensitive = false }) => {
    if (!timeline || timeline.length === 0) {
        return <div className="timeline-empty">No timeline entries</div>;
    }
    
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    return (
        <div className="ticket-timeline">
            {timeline.map((entry, index) => (
                <div key={index} className={`timeline-entry ${entry.isNote ? 'is-note' : ''}`}>
                    <div className="timeline-marker">
                        <div className="timeline-dot" style={{
                            background: entry.isNote ? '#d1d5db' : (STATUS_COLORS[entry.status]?.text || '#d1d5db')
                        }} />
                        {index < timeline.length - 1 && <div className="timeline-line" />}
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <span className="timeline-user">
                                <User size={12} />
                                {entry.user}
                            </span>
                            <span className="timeline-time">
                                <Clock size={12} />
                                {formatDate(entry.timestamp)}
                            </span>
                        </div>
                        {!entry.isNote && (
                            <div className="timeline-status">
                                <StatusBadge status={entry.status} size="small" />
                            </div>
                        )}
                        {entry.notes && (
                            <div className="timeline-notes">
                                {entry.isNote && <MessageSquare size={12} />}
                                {maskSensitive ? maskCostText(entry.notes) : entry.notes}
                            </div>
                        )}
                        {Array.isArray(entry.attachments) && entry.attachments.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {entry.attachments.map((att, idx) => (
                                    <a
                                        key={`${entry.timestamp || index}-att-${idx}`}
                                        href={att}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ fontSize: '0.8rem', color: '#2563eb', textDecoration: 'underline' }}
                                    >
                                        Attachment {idx + 1}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ============ TYPE ACCENT COLORS ============
const TYPE_ACCENT = {
    'New Environment':       { border: '#6d28d9', bg: '#f5f3ff', icon: '#6d28d9' },
    'Environment Up':        { border: '#15803d', bg: '#f0fdf4', icon: '#15803d' },
    'Environment Down':      { border: '#dc2626', bg: '#fef2f2', icon: '#dc2626' },
    'Release Deployment':    { border: '#1d4ed8', bg: '#eff6ff', icon: '#1d4ed8' },
    'Issue Fix':             { border: '#b45309', bg: '#fffbeb', icon: '#b45309' },
    'Build Request':         { border: '#0e7490', bg: '#ecfeff', icon: '#0e7490' },
    'Code Cut':              { border: '#9d174d', bg: '#fdf2f8', icon: '#9d174d' },
    'Other Queries':         { border: '#4b5563', bg: '#f9fafb', icon: '#4b5563' },
};

const getTypeAccent = (requestType) =>
    TYPE_ACCENT[requestType] || { border: '#4b5563', bg: '#f9fafb', icon: '#4b5563' };

const getRequestTypeIcon = (requestType, size = 16) => {
    switch (requestType) {
        case 'New Environment':       return <Server size={size} />;
        case 'Environment Up':        return <Database size={size} />;
        case 'Environment Down':      return <Database size={size} />;
        case 'Release Deployment':    return <Upload size={size} />;
        case 'Issue Fix':             return <AlertTriangle size={size} />;
        case 'Build Request':         return <GitBranch size={size} />;
        case 'Code Cut':              return <Tag size={size} />;
        default:                      return <FileText size={size} />;
    }
};

// ============ TICKET CARD COMPONENT ============
export const TicketCard = ({ ticket, onClick, showActions = false, onStatusChange, user }) => {
    const [expanded, setExpanded] = useState(false);
    const accent = getTypeAccent(ticket.requestType);
    const ageDays = ticket?.createdAt ? Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 86400000) : 0;
    const ageClass = ageDays >= 6 ? "old" : ageDays >= 3 ? "mid" : "new";
    const isActionRequired = [
        TICKET_STATUS.ACTION_REQUIRED,
        TICKET_STATUS.MANAGER_APPROVAL_PENDING,
        TICKET_STATUS.COST_APPROVAL_PENDING
    ].includes(ticket?.status);

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const timeSince = (dateString) => {
        if (!dateString) return '';
        const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    // Pick up the most relevant service detail 
    const serviceDetail = ticket.releaseVersion || ticket.branchName || ticket.issueType || ticket.databaseType || ticket.deploymentStrategy || null;

    return (
        <div
            className={`jira-ticket-card ${isActionRequired ? 'status-glow' : ''}`}
            onClick={onClick}
            style={{
                borderLeftColor: accent.border,
                borderLeftWidth: 4,
                background: `linear-gradient(135deg, ${accent.bg} 0%, ${accent.bg}88 35%, rgba(255,255,255,0.15) 65%, transparent 100%), #ffffff`
            }}
        >
            {/* ── Main row ── */}
            <div className="jtc-row">

                {/* Left: type icon */}
                <div className="jtc-icon" style={{ background: `${accent.icon}18`, color: accent.icon }}>
                    {getRequestTypeIcon(ticket.requestType, 13)}
                </div>

                {/* Centre: title + meta chips */}
                <div className="jtc-centre">
                    <h3 className="jtc-title">{ticket.productName || '(No product)'}</h3>
                    <div className="jtc-meta">
                        <span className="jtc-type-badge" style={{ color: accent.icon, borderColor: `${accent.icon}44`, background: `${accent.icon}14` }}>
                            {ticket.requestType || "General Request"}
                        </span>
                        <span className="jtc-id">{ticket.id}</span>
                        {ticket.environment && (
                            <span className="jtc-chip env">{ticket.environment}</span>
                        )}
                        {serviceDetail && (
                            <span className="jtc-chip service">{serviceDetail}</span>
                        )}
                        {ticket.managerApprovalRequired && (
                            <span className="jtc-chip approval">Approval</span>
                        )}
                    </div>
                </div>

                {/* Right: status + people + date */}
                <div className="jtc-right">
                    <StatusBadge status={ticket.status} size="small" />
                    <div className="jtc-right-bottom">
                        <div className="jtc-people">
                            <span className="jtc-avatar" title={ticket.requestedBy}>
                                {(ticket.requestedBy || 'U').charAt(0).toUpperCase()}
                            </span>
                            {ticket.assignedTo && (
                                <>
                                    <span className="jtc-arrow">›</span>
                                    <span className="jtc-avatar assigned" title={ticket.assignedTo}>
                                        {ticket.assignedTo.charAt(0).toUpperCase()}
                                    </span>
                                </>
                            )}
                        </div>
                        <span className="jtc-date" title={formatDate(ticket.createdAt)}>
                            {timeSince(ticket.createdAt)}
                        </span>
                        <span className={`jtc-age-dot ${ageClass}`} title={`Ticket age: ${Math.max(ageDays, 0)} day(s)`} />
                    </div>
                </div>

                {/* Expand toggle */}
                {showActions && (
                    <button
                        className="jtc-toggle"
                        onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                )}
            </div>

            {/* ── Expanded timeline ── */}
            {expanded && (
                <div className="jtc-expanded" onClick={e => e.stopPropagation()}>
                    <TicketTimeline timeline={ticket.timeline} />
                </div>
            )}
        </div>
    );
};

// ============ TICKET FILTERS COMPONENT ============
export const TicketFilters = ({ filters, onFilterChange }) => {
    return (
        <div className="ticket-filters">
            <div className="filter-group">
                <label>Status</label>
                <select 
                    value={filters.status || ''} 
                    onChange={e => onFilterChange({ ...filters, status: e.target.value || null })}
                >
                    <option value="">All</option>
                    {Object.values(TICKET_STATUS).map(status => (
                        <option key={status} value={status}>
                            {STATUS_DISPLAY_CONFIG[status]?.label || status}
                        </option>
                    ))}
                </select>
            </div>
            
            <div className="filter-group">
                <label>Type</label>
                <select 
                    value={filters.requestType || ''} 
                    onChange={e => onFilterChange({ ...filters, requestType: e.target.value || null })}
                >
                    <option value="">All</option>
                    {Object.values(REQUEST_TYPES).map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>
            
            <div className="filter-group">
                <label>Environment</label>
                <select 
                    value={filters.environment || ''} 
                    onChange={e => onFilterChange({ ...filters, environment: e.target.value || null })}
                >
                    <option value="">All</option>
                    {ENVIRONMENTS.map(env => (
                        <option key={env} value={env}>{env}</option>
                    ))}
                </select>
            </div>
            
            <div className="filter-group">
                <label>Search</label>
                <input 
                    type="text"
                    placeholder="Search tickets..."
                    value={filters.search || ''}
                    onChange={e => onFilterChange({ ...filters, search: e.target.value || null })}
                />
            </div>
        </div>
    );
};

// ============ DETAIL FIELD COMPONENT (for modal) ============
const DetailField = ({ icon: Icon, label, value, mono = false, pill = false, pillColor }) => {
    if (!value && value !== 0) return null;
    return (
        <div className="jdm-field">
            <div className="jdm-field-label">
                {Icon && <Icon size={12} />}
                {label}
            </div>
            {pill ? (
                <span className="jdm-pill" style={pillColor ? { background: pillColor.bg, color: pillColor.text } : {}}>
                    {value}
                </span>
            ) : (
                <div className={`jdm-field-value ${mono ? 'mono' : ''}`}>{value}</div>
            )}
        </div>
    );
};

// ============ TICKET DETAILS MODAL ============
const COST_APPROVAL_PREFIX = "COST_APPROVAL::";
/** Dropdown row when workflow has no named cost approvers — still opens the cost tool. */
const OPEN_COST_TOOL_ACTION = "OPEN_COST_TOOL";

export const TicketDetailsModal = ({
    ticket,
    onClose,
    onStatusChange,
    onAddNote,
    user,
    canManage = false,
    /** Only DevOps: cost approver picker, cost estimate window, and cost-related status transitions */
    canSubmitCostEstimate = false,
    onToggleActiveStatus,
    onRequestCostApproval,
    /** DevOps: open forward-to-teammate flow (parent shows picker modal). */
    onForward
}) => {
    const [note, setNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [noteAttachments, setNoteAttachments] = useState([]);
    const [showApprovalEditor, setShowApprovalEditor] = useState(false);
    const [approvalEditorText, setApprovalEditorText] = useState('');
    const [approvalEditorHtml, setApprovalEditorHtml] = useState('');
    /** DevOps: workflow cost approver chosen in Actions dropdown (sent with cost submission). */
    const [pendingCostApproverEmail, setPendingCostApproverEmail] = useState(null);

    useEffect(() => {
        if (ticket?.id) setPendingCostApproverEmail(null);
    }, [ticket?.id]);

    if (!ticket) return null;

    const accent = getTypeAccent(ticket.requestType);
    const allowedTransitions = getDynamicAllowedTransitions(ticket);

    // Get simplified action label with icon indicator
    const getStatusActionLabel = (status) => {
        const config = STATUS_DISPLAY_CONFIG[status];
        if (status === TICKET_STATUS.COST_APPROVAL_PENDING) return "💰 Submit Cost Estimate";
        if (!config) return status;
        return config.label;
    };
    
    const configuredApprovalPeople = (ticket.workflowConfiguration?.approvalLevels || [])
        .slice()
        .sort((a, b) => (a.level || 0) - (b.level || 0))
        .map((lvl, idx) => {
            const a = (lvl.approvers || [])[0] || {};
            return {
                key: `approval-${lvl.level || idx + 1}-${a?.email || a?.name || ''}`,
                level: lvl.level || (idx + 1),
                role: a?.role || "Approver",
                name: a?.name || '',
                email: a?.email || ''
            };
        })
        .filter((p) => p.email);

    const approvalActions = configuredApprovalPeople.map((p) => {
        const role = (p.role || "Approver").trim();
        const name = (p.name || "").trim() || p.email;
        const label = canManage ? `${role} — ${name} · ${p.email}` : `${role} — ${name}`;
        return {
            value: `APPROVAL::${p.email}`,
            label,
            type: "approval",
            person: p
        };
    });

    const configuredCostApprovers = (ticket.workflowConfiguration?.costApprovers || [])
        .map((ap, idx) => ({
            key: `cost-${idx}-${ap?.email || ""}`,
            role: (ap?.role || "Cost approver").trim() || "Cost approver",
            name: (ap?.name || "").trim(),
            email: String(ap?.email || "").trim()
        }))
        .filter((p) => p.email);

    const requiresCostApproval =
        !!ticket.costApprovalRequired ||
        !!ticket.workflowConfiguration?.costApprovalRequired ||
        configuredCostApprovers.length > 0;

    const costApprovalActions =
        canSubmitCostEstimate
            ? configuredCostApprovers.length > 0
                ? configuredCostApprovers.map((p) => {
                      const role = p.role || "Cost approver";
                      const name = (p.name || "").trim() || p.email;
                      return {
                          value: `${COST_APPROVAL_PREFIX}${p.email}`,
                          label: `${role} — ${name} · ${p.email}`,
                          type: "costApprover",
                          person: p
                      };
                  })
                : [
                      {
                          value: OPEN_COST_TOOL_ACTION,
                          label: "💰 Cost approval — open estimate tool",
                          type: "openCostTool"
                      }
                  ]
            : [];

    const managerRespondedApproved = String(ticket.managerApprovalStatus || "").toUpperCase() === "APPROVED";
    // Users can always trigger an approval action regardless of ticket state
    const approvalActionsForUser = approvalActions;

    // Users can always close their own ticket (unless already closed)
    const userCloseAction = ticket.status !== TICKET_STATUS.CLOSED
        ? [{ value: `STATUS::${TICKET_STATUS.CLOSED}`, label: '🔒 Close Ticket', type: 'status', status: TICKET_STATUS.CLOSED }]
        : [];

    // DevOps-friendly short action labels based on destination status
    const getDevOpsActionLabel = (status) => {
        switch (status) {
            case TICKET_STATUS.ACCEPTED:               return '✅ Accept';
            case TICKET_STATUS.MANAGER_APPROVAL_PENDING: return '📤 Send for Approval';
            case TICKET_STATUS.MANAGER_APPROVED:       return '✔ Mark Approved';
            case TICKET_STATUS.COST_APPROVAL_PENDING:  return '💰 Cost Estimate';
            case TICKET_STATUS.COST_APPROVED:          return '✔ Cost Approved';
            case TICKET_STATUS.IN_PROGRESS:            return '▶ In Progress';
            case TICKET_STATUS.ACTION_REQUIRED:        return '⚠ Action Required';
            case TICKET_STATUS.COMPLETED:              return '✅ Complete';
            case TICKET_STATUS.CLOSED:                 return '🔒 Close';
            default: return getStatusActionLabel(status);
        }
    };

    // Context-aware transitions — no more dumping all statuses.
    // MANAGER_APPROVAL_PENDING is excluded from status actions for both DevOps and users
    // because sending for approval is handled by the "Request Approval" optgroup (pick the person directly).
    const normalizedTicketStatus = toDisplayTicketStatus(ticket.status);
    const devOpsTransitionBase =
        STATUS_TRANSITIONS[ticket.status] ||
        STATUS_TRANSITIONS[normalizedTicketStatus] ||
        [];
    let smartTransitions = (canManage ? devOpsTransitionBase : getDynamicAllowedTransitions(ticket))
        .filter((s) => s !== TICKET_STATUS.MANAGER_APPROVAL_PENDING)
        .filter((s) => !(s === TICKET_STATUS.COST_APPROVAL_PENDING && !canSubmitCostEstimate));
    if (
        canManage &&
        canSubmitCostEstimate &&
        normalizedTicketStatus !== TICKET_STATUS.CLOSED &&
        !smartTransitions.includes(TICKET_STATUS.COST_APPROVAL_PENDING)
    ) {
        smartTransitions = [...smartTransitions, TICKET_STATUS.COST_APPROVAL_PENDING];
    }

    const defaultActions = smartTransitions.map((s) => ({
        value: `STATUS::${s}`,
        label: canManage ? getDevOpsActionLabel(s) : getStatusActionLabel(s),
        type: "status",
        status: s
    }));

    // Users: approval requests + close only. DevOps: status + manager approval + cost approver targets.
    const selectableActions = canManage
        ? [...defaultActions, ...approvalActions, ...costApprovalActions]
        : [...userCloseAction, ...approvalActionsForUser];

    const selectedApprovalAction = selectedStatus.startsWith("APPROVAL::")
        ? approvalActions.find((a) => a.value === selectedStatus)
        : null;

    const applySelectedAction = (actionNoteText) => {
        if (!selectedStatus) return;

        if (selectedStatus === OPEN_COST_TOOL_ACTION) {
            if (!canSubmitCostEstimate || !onRequestCostApproval) return;
            onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
            setSelectedStatus("");
            return;
        }

        if (selectedStatus.startsWith(COST_APPROVAL_PREFIX)) {
            if (!canSubmitCostEstimate || !onRequestCostApproval) return;
            const email = selectedStatus.slice(COST_APPROVAL_PREFIX.length).trim();
            if (email) {
                setPendingCostApproverEmail(email);
                onRequestCostApproval(ticket, { costApproverEmail: email });
            }
            setSelectedStatus("");
            return;
        }

        if (!onStatusChange) return;

        if (selectedStatus.startsWith("STATUS::")) {
            const statusValue = selectedStatus.replace("STATUS::", "");
            if (statusValue === TICKET_STATUS.COST_APPROVAL_PENDING && canSubmitCostEstimate && onRequestCostApproval) {
                onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
                setSelectedStatus('');
                return;
            }
            onStatusChange(ticket.id, statusValue, actionNoteText || note, {});
            setNote('');
            setSelectedStatus('');
            return;
        }
        if (selectedStatus.startsWith("APPROVAL::")) {
            const targetEmail = selectedStatus.replace("APPROVAL::", "");
            const target = configuredApprovalPeople.find(
                (p) => String(p.email || "").toLowerCase() === String(targetEmail).toLowerCase()
            );
            const resolvedEmail = (target?.email || targetEmail || "").trim();
            const approvalNote = [
                `Designation: ${target?.role || "Approver"} — ${target?.name || resolvedEmail} · ${resolvedEmail}`,
                actionNoteText ? `Purpose: ${actionNoteText}` : null
            ].filter(Boolean).join(". ");
            onStatusChange(ticket.id, TICKET_STATUS.MANAGER_APPROVAL_PENDING, approvalNote, {
                approvalTargetEmail: resolvedEmail
            });
            setNote('');
            setSelectedStatus('');
            return;
        }
        if (selectedStatus === TICKET_STATUS.COST_APPROVAL_PENDING && canSubmitCostEstimate && onRequestCostApproval) {
            onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
            setSelectedStatus('');
            return;
        }
        onStatusChange(ticket.id, selectedStatus, actionNoteText || note, {});
        setNote('');
        setSelectedStatus('');
    };

    /** Choosing a cost approver opens the same cost tool window as the primary button (auto-calc / autofill / send). */
    const handleActionSelectChange = (value) => {
        if (value === OPEN_COST_TOOL_ACTION && canSubmitCostEstimate && onRequestCostApproval) {
            onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
            setSelectedStatus("");
            return;
        }
        if (canSubmitCostEstimate && onRequestCostApproval && value.startsWith(COST_APPROVAL_PREFIX)) {
            const email = value.slice(COST_APPROVAL_PREFIX.length).trim();
            if (email) {
                setPendingCostApproverEmail(email);
                onRequestCostApproval(ticket, { costApproverEmail: email });
            }
            setSelectedStatus("");
            return;
        }
        setSelectedStatus(value);
    };

    const handleStatusChange = () => {
        if (selectedApprovalAction) {
            setApprovalEditorText(note || '');
            setApprovalEditorHtml('');
            setShowApprovalEditor(true);
            return;
        }
        applySelectedAction(note);
    };
    
    const handleAddNote = () => {
        if (note.trim() && onAddNote) {
            onAddNote(ticket.id, note, noteAttachments);
            setNote('');
            setNoteAttachments([]);
        }
    };

    const handleNoteFiles = async (files) => {
        const list = Array.from(files || []);
        const allowed = list.filter((f) =>
            /^image\//.test(f.type)
            || /pdf|msword|officedocument|text\//i.test(f.type)
            || /\.(pdf|doc|docx|txt|png|jpg|jpeg|gif|webp)$/i.test(f.name)
        );
        const toDataUrl = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const urls = await Promise.all(allowed.slice(0, 5).map(toDataUrl));
        setNoteAttachments(urls);
    };
    
    const handleToggleActive = (isActive) => {
        if (!onToggleActiveStatus) return;
        onToggleActiveStatus(ticket.id, isActive);
    };
    
    const fmt = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };
    const latestTimelineEntry = Array.isArray(ticket.timeline) && ticket.timeline.length > 0
        ? ticket.timeline[ticket.timeline.length - 1]
        : null;
    const flowTimelineSource = dedupeConsecutiveStatusTimeline(
        (ticket.timeline || []).filter((entry) => !entry?.isNote)
    );
    let mgrPendingRound = 0;
    let mgrApprovedRound = 0;
    let costPendingRound = 0;
    let costApprovedRound = 0;

    const actionFlowItems = flowTimelineSource.map((entry, idx) => {
            const st = timelineStatusKey(entry?.status);
            let label = entry?.status || "Updated";
            if (st === "MANAGER_APPROVAL_PENDING") {
                mgrPendingRound += 1;
                label = mgrPendingRound > 1 ? `Pending #${mgrPendingRound}` : "Pending";
            } else if (st === "MANAGER_APPROVED") {
                mgrApprovedRound += 1;
                label = mgrApprovedRound > 1 ? `Approved #${mgrApprovedRound}` : "Approved";
            } else if (st === "COST_APPROVAL_PENDING") {
                costPendingRound += 1;
                label = costPendingRound > 1 ? `Cost #${costPendingRound}` : "Cost Review";
            } else if (st === "COST_APPROVED") {
                costApprovedRound += 1;
                label = costApprovedRound > 1 ? `Cost OK #${costApprovedRound}` : "Cost OK";
            } else if (st === "CREATED") {
                label = "New";
            } else if (st === "ACCEPTED") {
                label = "Accepted";
            } else if (st === "IN_PROGRESS") {
                label = "Active";
            } else if (st === "COMPLETED") {
                label = "Done";
            } else if (st === "CLOSED") {
                label = "Closed";
            } else if (st === "ACTION_REQUIRED") {
                label = "Action";
            } else if (st === "ON_HOLD") {
                label = "Hold";
            }
            const tone = (() => {
                if (st === "CLOSED" || st === "REJECTED") return "red";
                if (st === "MANAGER_APPROVAL_PENDING" || st === "COST_APPROVAL_PENDING") return "red";
                if (st === "MANAGER_APPROVED" || st === "COST_APPROVED") return "green";
                if (st === "COMPLETED" || st === "IN_PROGRESS" || st === "ACCEPTED") return "green";
                if (st === "ACTION_REQUIRED" || st === "ON_HOLD") return "amber";
                return "blue";
            })();
            return { id: `${entry?.timestamp || "x"}-${idx}`, label, tone, user: entry?.user || '', timestamp: entry?.timestamp || '', notes: entry?.notes ? normalizeFlowNotes(entry.notes).slice(0, 80) : '' };
        });
    const canForwardTicket =
        typeof onForward === "function" &&
        !!ticket.assignedTo &&
        ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(ticket.status);

    const runtimeBarTone = (() => {
        const st = timelineStatusKey(ticket.status);
        if (st === "CLOSED" || st === "REJECTED")          return { color: "#6b7280", bg: "#f9fafb", label: "Closed" };
        if (st === "MANAGER_APPROVAL_PENDING")              return { color: "#b45309", bg: "#fffbeb", label: "Pending Approval" };
        if (st === "COST_APPROVAL_PENDING")                 return { color: "#c2410c", bg: "#fff7ed", label: "Cost Review" };
        if (st === "MANAGER_APPROVED")                      return { color: "#15803d", bg: "#f0fdf4", label: "Approved" };
        if (st === "COST_APPROVED")                         return { color: "#059669", bg: "#ecfdf5", label: "Cost Approved" };
        if (st === "COMPLETED" || st === "IN_PROGRESS")     return { color: "#059669", bg: "#ecfdf5", label: "Processing" };
        if (st === "ACTION_REQUIRED" || st === "ON_HOLD")   return { color: "#b45309", bg: "#fffbeb", label: "Waiting" };
        return { color: "#1d4ed8", bg: "#eff6ff", label: "Active" };
    })();
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="jdm-modal" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="jdm-header" style={{ borderTopColor: accent.border }}>
                    <div className="jdm-header-left">
                        <div className="jdm-type-icon" style={{ background: accent.bg, color: accent.icon }}>
                            {getRequestTypeIcon(ticket.requestType, 20)}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span className="jdm-ticket-id">{ticket.id}</span>
                                <StatusBadge status={ticket.status} size="medium" />
                                <span className="jdm-type-label" style={{ background: accent.bg, color: accent.icon }}>
                                    {ticket.requestType}
                                </span>
                            </div>
                            <h2 className="jdm-title">{ticket.productName}</h2>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #e5e7eb", background: runtimeBarTone.bg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ height: 6, borderRadius: 999, background: runtimeBarTone.color, flex: 1 }} />
                        <span style={{ color: runtimeBarTone.color, fontWeight: 600, fontSize: "0.78rem" }}>
                            {runtimeBarTone.label}
                        </span>
                    </div>
                </div>

                {/* ── Two-panel body ── */}
                <div className="jdm-body">

                    {/* LEFT: Main content */}
                    <div className="jdm-main">

                        {/* Description */}
                        {ticket.description && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><FileText size={14} /> Details</div>
                                <p className="jdm-description">{ticket.description}</p>
                            </div>
                        )}

                        <div className="jdm-section">
                            <div className="jdm-section-title"><Clock size={14} /> Progress</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                {actionFlowItems.length === 0 && (
                                    <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Pending</span>
                                )}
                                {actionFlowItems.map((item, index) => {
                                    const toneStyle = item.tone === "green"
                                        ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }
                                        : item.tone === "red"
                                            ? { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }
                                            : item.tone === "amber"
                                                ? { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }
                                                : { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
                                    return (
                                        <React.Fragment key={item.id}>
                                            <span 
                                                style={{ ...toneStyle, borderRadius: 999, padding: "4px 10px", fontSize: "0.78rem", fontWeight: 600, cursor: item.user ? 'help' : 'default', position: 'relative' }}
                                                title={item.user ? `${item.label}\nBy: ${item.user}${item.timestamp ? '\n' + new Date(item.timestamp).toLocaleString() : ''}${item.notes ? '\n' + item.notes : ''}` : item.label}
                                            >
                                                {item.label}
                                            </span>
                                            {index < actionFlowItems.length - 1 && (
                                                <span style={{ color: "#d1d5db", fontWeight: 600 }}>→</span>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Service Details */}
                        <div className="jdm-section">
                            <div className="jdm-section-title">{getRequestTypeIcon(ticket.requestType, 14)} Configuration</div>
                            <div className="jdm-fields-grid">
                                <DetailField icon={Globe} label="Environment" value={ticket.environment} />
                                {ticket.databaseType && <DetailField icon={Database} label="Database" value={ticket.databaseType} />}
                                {ticket.releaseVersion && <DetailField icon={Tag} label="Version" value={ticket.releaseVersion} mono />}
                                {ticket.deploymentStrategy && <DetailField icon={Upload} label="Strategy" value={ticket.deploymentStrategy} />}
                                {ticket.branchName && <DetailField icon={GitBranch} label="Branch" value={ticket.branchName} mono />}
                                {ticket.commitId && <DetailField icon={GitBranch} label="Commit" value={ticket.commitId} mono />}
                                {ticket.issueType && <DetailField icon={AlertTriangle} label="Type" value={ticket.issueType} />}
                                {ticket.duration && <DetailField icon={Clock} label="Duration" value={`${ticket.duration} days`} />}
                                {ticket.activationDate && <DetailField icon={Calendar} label="Start" value={fmt(ticket.activationDate)} />}
                                {ticket.shutdownDate && <DetailField icon={Calendar} label="End" value={fmt(ticket.shutdownDate)} />}
                            </div>
                            {ticket.purpose && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Purpose</div>
                                    <div className="jdm-text-block-content">{ticket.purpose}</div>
                                </div>
                            )}
                            {ticket.shutdownReason && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Shutdown Reason</div>
                                    <div className="jdm-text-block-content">{ticket.shutdownReason}</div>
                                </div>
                            )}
                            {ticket.issueDescription && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Issue Description</div>
                                    <div className="jdm-text-block-content">{ticket.issueDescription}</div>
                                </div>
                            )}
                            {ticket.releaseNotes && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Release Notes</div>
                                    <div className="jdm-text-block-content">{ticket.releaseNotes}</div>
                                </div>
                            )}
                            {ticket.reason && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Reason</div>
                                    <div className="jdm-text-block-content">{ticket.reason}</div>
                                </div>
                            )}
                            {ticket.errorLogs && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Error Logs</div>
                                    <pre className="jdm-code-block">{ticket.errorLogs}</pre>
                                </div>
                            )}
                            {ticket.otherQueryDetails && (
                                <div className="jdm-text-block">
                                    <div className="jdm-text-block-label">Query Details</div>
                                    <div className="jdm-text-block-content">{ticket.otherQueryDetails}</div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {(selectableActions.length > 0 || (!canManage && approvalActions.length === 0)) && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><PlayCircle size={14} /> Actions</div>
                                {!canManage && approvalActions.length === 0 ? (
                                    <p className="jdm-hint-text">No approvers configured for this product.</p>
                                ) : (
                                <div className="jdm-action-row">
                                    <select
                                        value={selectedStatus}
                                        onChange={(e) => handleActionSelectChange(e.target.value)}
                                        className="jdm-select"
                                    >
                                        <option value="">Select action...</option>
                                        {canManage && defaultActions.length > 0 && (
                                            <optgroup label="Status">
                                                {defaultActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {!canManage && userCloseAction.length > 0 && (
                                            <optgroup label="Actions">
                                                {userCloseAction.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {canManage && (approvalActions.length > 0 || costApprovalActions.length > 0) && (
                                            <optgroup label="Request & cost approval">
                                                {approvalActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                                {costApprovalActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {!canManage && approvalActions.length > 0 && (
                                            <optgroup label="Send for Approval">
                                                {approvalActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {canManage && defaultActions.length === 0 && approvalActions.length === 0 && costApprovalActions.length === 0 && (
                                            <option value="" disabled>No actions available</option>
                                        )}
                                    </select>
                                    <button
                                        className="jdm-btn-primary"
                                        onClick={handleStatusChange}
                                        disabled={!selectedStatus}
                                    >
                                        Apply
                                    </button>
                                </div>
                                )}
                                {!canManage && managerRespondedApproved && approvalActions.length > 0 && (
                                    <p className="jdm-hint-text" style={{ marginTop: 6, color: '#15803d' }}>
                                        ✓ Manager has already approved — you can still re-send or escalate to another approver.
                                    </p>
                                )}
                            </div>
                        )}
                        {canManage && ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Awaiting Response</div>
                                {managerRespondedApproved ? (
                                    <p className="jdm-hint-text" style={{ color: "#15803d", fontWeight: 500 }}>
                                        ✓ Approved - Apply <strong>Approved</strong> to continue
                                    </p>
                                ) : (
                                    <p className="jdm-hint-text">
                                        Pending approval response
                                    </p>
                                )}
                            </div>
                        )}
                        {!canManage && ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING && managerRespondedApproved && (
                            <div className="jdm-section">
                                <p className="jdm-hint-text" style={{ color: "#15803d" }}>
                                    ✓ Approved - Processing will continue shortly
                                </p>
                            </div>
                        )}
                        {canManage && ticket.status === TICKET_STATUS.COST_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Cost Approval In Progress</div>
                                <p className="jdm-hint-text">
                                    Waiting for configured cost manager approval from email link. Status updates automatically.
                                </p>
                                {canSubmitCostEstimate && (
                                    <p className="jdm-hint-text" style={{ marginTop: 8 }}>
                                        To resend or revise, pick a cost line under{" "}
                                        <strong>Request & cost approval</strong> in Actions (same as manager approval).
                                    </p>
                                )}
                            </div>
                        )}
                        {canManage && canSubmitCostEstimate && onRequestCostApproval && requiresCostApproval && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Database size={14} /> Cost approval</div>
                                {canSubmitCostEstimate && onRequestCostApproval ? (
                                    <>
                                        <p className="jdm-hint-text">
                                            Open the cost tool to auto-calculate from the workflow, edit if needed, then send the approval request to the selected cost approver.
                                        </p>
                                        <button
                                            type="button"
                                            className="jdm-btn-primary"
                                            style={{ marginTop: 12 }}
                                            onClick={() =>
                                                onRequestCostApproval(ticket, {
                                                    costApproverEmail: pendingCostApproverEmail || undefined
                                                })
                                            }
                                        >
                                            <Database size={14} /> Raise cost approval request
                                        </button>
                                    </>
                                ) : (
                                    <p className="jdm-hint-text">
                                        DevOps will submit the cost estimate and notify the cost approver. You will be updated when the decision is recorded.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Toggle active (user) */}
                        {!canManage && onToggleActiveStatus && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><AlertCircle size={14} /> Ticket Visibility</div>
                                <p className="jdm-hint-text">
                                    {ticket.isActive === false
                                        ? 'Ticket is inactive – hidden from DevOps team. Reactivate anytime.'
                                        : 'Mark inactive to hide from DevOps team view.'}
                                </p>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    {ticket.isActive !== false ? (
                                        <button className="jdm-btn-ghost" onClick={() => handleToggleActive(false)}>
                                            <XCircle size={15} /> Mark Inactive
                                        </button>
                                    ) : (
                                        <button className="jdm-btn-primary" onClick={() => handleToggleActive(true)}>
                                            <CheckCircle size={15} /> Mark Active
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Add Note */}
                        {onAddNote && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><MessageSquare size={14} /> Notes</div>
                                <textarea
                                    className="jdm-textarea"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Add a note..."
                                    rows={3}
                                />
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,image/*"
                                    onChange={(e) => handleNoteFiles(e.target.files)}
                                    style={{ marginTop: 8 }}
                                />
                                {noteAttachments.length > 0 && (
                                    <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#374151' }}>
                                        {noteAttachments.length} file(s)
                                    </div>
                                )}
                                <button
                                    className="jdm-btn-primary"
                                    style={{ marginTop: 8, alignSelf: 'flex-start' }}
                                    onClick={handleAddNote}
                                    disabled={!note.trim()}
                                >
                                    <Send size={14} /> Add Note
                                </button>
                            </div>
                        )}

                        {/* Activity Timeline */}
                        <div className="jdm-section">
                            <div className="jdm-section-title"><Clock size={14} /> Activity</div>
                            <TicketTimeline timeline={ticket.timeline} maskSensitive={!canManage} />
                        </div>
                    </div>

                    {/* RIGHT: Sidebar */}
                    <div className="jdm-sidebar">
                        <div className="jdm-sidebar-section">
                            <div className="jdm-sidebar-title">Team</div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label"><User size={12} /> Requester</div>
                                <div className="jdm-person-row">
                                    <span className="jdm-avatar-sm">{(ticket.requestedBy || 'U').charAt(0).toUpperCase()}</span>
                                    <div>
                                        <div className="jdm-person-name">{ticket.requestedBy}</div>
                                    </div>
                                </div>
                            </div>
                            {ticket.assignedTo && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><UserCheck size={12} /> Assigned</div>
                                    <div className="jdm-person-row">
                                        <span className="jdm-avatar-sm assigned">{ticket.assignedTo.charAt(0).toUpperCase()}</span>
                                        <div className="jdm-person-name">{ticket.assignedTo}</div>
                                    </div>
                                </div>
                            )}
                            {canForwardTicket && (
                                <button
                                    type="button"
                                    className="jdm-btn-ghost"
                                    style={{
                                        width: "100%",
                                        marginTop: 10,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 8,
                                        fontWeight: 600
                                    }}
                                    onClick={() => onForward()}
                                >
                                    <Forward size={14} aria-hidden />
                                    Forward to teammate
                                </button>
                            )}
                            {ticket.managerName && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><Building size={12} /> Approver</div>
                                    <div className="jdm-person-name">{ticket.managerName}</div>
                                </div>
                            )}
                        </div>

                        <div className="jdm-sidebar-section">
                            <div className="jdm-sidebar-title">Timeline</div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label"><Calendar size={12} /> Created</div>
                                <div className="jdm-sidebar-value">{fmt(ticket.createdAt)}</div>
                            </div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label"><Calendar size={12} /> Updated</div>
                                <div className="jdm-sidebar-value">{fmt(ticket.updatedAt)}</div>
                            </div>
                        </div>

                        <div className="jdm-sidebar-section">
                            <div className="jdm-sidebar-title">Info</div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label">Approval</div>
                                <span className={`jdm-tag ${ticket.managerApprovalRequired ? 'required' : 'not-required'}`}>
                                    {ticket.managerApprovalRequired ? '✓ Required' : '—'}
                                </span>
                            </div>
                            {ticket.environment && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><Globe size={12} /> Env</div>
                                    <span className="jdm-tag env">{ticket.environment}</span>
                                </div>
                            )}
                            {canManage && (ticket.estimatedCost || ticket.costCurrency) && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><DollarSign size={12} /> Cost</div>
                                    <span className="jdm-sidebar-value">
                                        {`${ticket.costCurrency || ""} ${ticket.estimatedCost || ""}`.trim()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {showApprovalEditor && (
                <div className="modal-overlay" onClick={() => setShowApprovalEditor(false)}>
                    <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Request Note</h2>
                            <button className="modal-close" onClick={() => setShowApprovalEditor(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <RichTextEditor
                                valueHtml={approvalEditorHtml}
                                onChange={({ html, text }) => {
                                    setApprovalEditorHtml(html);
                                    setApprovalEditorText(text);
                                }}
                                placeholder="Write purpose / context for approval..."
                            />
                            <div className="form-actions" style={{ marginTop: 12 }}>
                                <button type="button" className="btn-secondary" onClick={() => setShowApprovalEditor(false)}>Cancel</button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => {
                                        applySelectedAction((approvalEditorText || "").trim());
                                        setShowApprovalEditor(false);
                                    }}
                                    disabled={!(approvalEditorText || "").trim()}
                                >
                                    Send Approval Request
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const RichTextEditor = ({ valueHtml = "", onChange, placeholder = "" }) => {
    const containerRef = useRef(null);
    const quillRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || quillRef.current) return;
        const q = new Quill(containerRef.current, {
            theme: "snow",
            placeholder,
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline"],
                    [{ align: [] }],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link"],
                    ["clean"]
                ]
            }
        });
        quillRef.current = q;
        q.on("text-change", () => {
            const html = q.root.innerHTML || "";
            const text = (q.getText() || "").trimEnd();
            onChange?.({ html, text });
        });
    }, [onChange, placeholder]);

    useEffect(() => {
        const q = quillRef.current;
        if (!q) return;
        const current = q.root.innerHTML || "";
        if ((valueHtml || "") && current !== valueHtml) {
            q.clipboard.dangerouslyPasteHTML(valueHtml);
        }
    }, [valueHtml]);

    return (
        <div style={{ border: "1px solid #dfe1e6", borderRadius: 8, overflow: "hidden" }}>
            <div ref={containerRef} />
        </div>
    );
};


// ============ COMMON FORM FIELDS ============
const FormField = ({ label, required, children, hint }) => (
    <div className="form-field">
        <label>
            {label}
            {required && <span className="required">*</span>}
        </label>
        {children}
        {hint && <span className="field-hint">{hint}</span>}
    </div>
);

// ============ DYNAMIC REQUEST FORMS ============
const NewEnvironmentForm = ({ formData, onChange }) => (
    <>
        <FormField label="Purpose" required>
            <textarea 
                value={formData.purpose || ''}
                onChange={e => onChange({ ...formData, purpose: e.target.value })}
                placeholder="Describe the purpose of this environment"
                rows={3}
                required
            />
        </FormField>
    </>
);

const EnvironmentUpForm = ({ formData, onChange }) => (
    <>
        <FormField label="Activation Date" required>
            <input 
                type="datetime-local"
                value={formData.activationDate || ''}
                onChange={e => onChange({ ...formData, activationDate: e.target.value })}
                required
            />
        </FormField>
        <FormField label="Duration (Days)" required>
            <input 
                type="number"
                value={formData.duration || ''}
                onChange={e => onChange({ ...formData, duration: e.target.value })}
                placeholder="Number of days"
                min="1"
                required
            />
        </FormField>
        <FormField label="Purpose" required>
            <textarea 
                value={formData.purpose || ''}
                onChange={e => onChange({ ...formData, purpose: e.target.value })}
                placeholder="Describe the purpose"
                rows={3}
                required
            />
        </FormField>
    </>
);

const EnvironmentDownForm = ({ formData, onChange }) => (
    <>
        <FormField label="Shutdown Date" required>
            <input 
                type="datetime-local"
                value={formData.shutdownDate || ''}
                onChange={e => onChange({ ...formData, shutdownDate: e.target.value })}
                required
            />
        </FormField>
        <FormField label="Shutdown Reason" required>
            <textarea 
                value={formData.shutdownReason || ''}
                onChange={e => onChange({ ...formData, shutdownReason: e.target.value })}
                placeholder="Reason for shutting down the environment"
                rows={3}
                required
            />
        </FormField>
    </>
);

const IssueFixForm = ({ formData, onChange }) => (
    <>
        <FormField label="Issue Type" required>
            <select 
                value={formData.issueType || ''}
                onChange={e => onChange({ ...formData, issueType: e.target.value })}
                required
            >
                <option value="">Select Issue Type</option>
                <option value="Bug">Bug</option>
                <option value="Performance">Performance</option>
                <option value="Security">Security</option>
                <option value="Configuration">Configuration</option>
                <option value="Infrastructure">Infrastructure</option>
                <option value="Other">Other</option>
            </select>
        </FormField>
        <FormField label="Issue Description" required>
            <textarea 
                value={formData.issueDescription || ''}
                onChange={e => onChange({ ...formData, issueDescription: e.target.value })}
                placeholder="Detailed description of the issue"
                rows={4}
                required
            />
        </FormField>
        <FormField label="Error Logs">
            <textarea 
                value={formData.errorLogs || ''}
                onChange={e => onChange({ ...formData, errorLogs: e.target.value })}
                placeholder="Paste relevant error logs here"
                rows={4}
                className="code-input"
            />
        </FormField>
    </>
);

const BuildRequestForm = ({ formData, onChange }) => (
    <>
        <FormField label="Purpose" required>
            <textarea 
                value={formData.purpose || ''}
                onChange={e => onChange({ ...formData, purpose: e.target.value })}
                placeholder="Describe your request in detail"
                rows={4}
                required
            />
        </FormField>
    </>
);

const OtherQueriesForm = ({ formData, onChange }) => (
    <>
        <FormField label="Query Details" required>
            <textarea
                value={formData.otherQueryDetails || ''}
                onChange={e => onChange({ ...formData, otherQueryDetails: e.target.value })}
                placeholder="Enter your query details here"
                rows={4}
                required
            />
        </FormField>
    </>
);

const CodeCutForm = ({ formData, onChange }) => (
    <>
        <FormField label="Branch Name" required>
            <input 
                type="text"
                value={formData.branchName || ''}
                onChange={e => onChange({ ...formData, branchName: e.target.value })}
                placeholder="e.g., release/v2.5"
                required
            />
        </FormField>
        <FormField label="Release Version" required>
            <input 
                type="text"
                value={formData.releaseVersion || ''}
                onChange={e => onChange({ ...formData, releaseVersion: e.target.value })}
                placeholder="e.g., v2.5.0"
                required
            />
        </FormField>
        <FormField label="Reason" required>
            <textarea 
                value={formData.reason || ''}
                onChange={e => onChange({ ...formData, reason: e.target.value })}
                placeholder="Reason for code cut"
                rows={3}
                required
            />
        </FormField>
    </>
);

// CC email input moved to shared component `components/EmailChipsInput.js`.

// ============ CREATE TICKET MODAL ============
export const CreateTicketModal = ({ isOpen, onClose, onSubmit, user, projects, managers = [] }) => {
    const [step, setStep] = useState(1);
    const [workflowPreview, setWorkflowPreview] = useState(null);
    const [workflowPreviewLoading, setWorkflowPreviewLoading] = useState(false);
    const [formData, setFormData] = useState({
        productName: '',
        environment: '',
        managerName: '',
        managerEmail: '',
        managerApprovalRequired: true,
        ccEmail: '',
        description: '',
        requestType: ''
    });
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savedEmails, setSavedEmails] = useState([]);
    const [workflowAutoKey, setWorkflowAutoKey] = useState("");
    
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setFormData({
                productName: '',
                environment: '',
                managerName: '',
                managerEmail: '',
                managerApprovalRequired: true,
                ccEmail: '',
                description: '',
                requestType: ''
            });
            setError('');
            setSavedEmails(getSavedCcEmails());
            setWorkflowPreview(null);
            setWorkflowAutoKey("");
        }
    }, [isOpen]);

    const selectedProjectId = (projects || []).find((p) => p.name === formData.productName)?.id;
    const selectedProject = (projects || []).find((p) => p.name === formData.productName);
    const availableEnvironments = useMemo(() => {
        const raw = selectedProject && Array.isArray(selectedProject.environments)
            ? selectedProject.environments.filter(Boolean)
            : [];
        const canon = [...new Set(raw.map(normalizeEnvironmentLabel).filter(Boolean))];
        return canon.sort((a, b) => {
            const ia = ENVIRONMENTS.indexOf(a);
            const ib = ENVIRONMENTS.indexOf(b);
            if (ia === -1 && ib === -1) return String(a).localeCompare(String(b));
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }, [selectedProject]);
    const availableEnvironmentsKey = availableEnvironments.join("|");

    useEffect(() => {
        if (!isOpen || step !== 2 || !selectedProjectId || !formData.requestType) {
            setWorkflowPreview(null);
            return;
        }
        const apiEnum = REQUEST_TYPE_TO_API_ENUM[formData.requestType];
        if (!apiEnum) {
            setWorkflowPreview(null);
            return;
        }
        let cancelled = false;
        setWorkflowPreviewLoading(true);
        getEffectiveWorkflow(selectedProjectId, apiEnum)
            .then((cfg) => {
                if (!cancelled) {
                    setWorkflowPreview(cfg);
                    setWorkflowPreviewLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setWorkflowPreview(null);
                    setWorkflowPreviewLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, step, selectedProjectId, formData.requestType]);

    useEffect(() => {
        if (!isOpen || !formData.productName) return;
        const allowed = availableEnvironments;
        const envCanon = normalizeEnvironmentLabel(formData.environment);
        if (formData.environment && (allowed.length === 0 || !allowed.includes(envCanon))) {
            setFormData((prev) => ({ ...prev, environment: "" }));
        }
    }, [isOpen, formData.productName, formData.environment, availableEnvironmentsKey]);

    useEffect(() => {
        if (!workflowPreview || !selectedProjectId || !formData.requestType) return;
        const key = `${selectedProjectId}::${formData.requestType}`;
        if (workflowAutoKey === key) return;

        const firstConfiguredManager = (workflowPreview.managers || [])
            .find((m) => m && m.email);
        const firstLevel = (workflowPreview.approvalLevels || [])
            .slice()
            .sort((a, b) => (a.level || 0) - (b.level || 0))
            .find((lvl) => Array.isArray(lvl.approvers) && lvl.approvers.length > 0);
        const firstApprover = firstLevel?.approvers?.[0];
        // Mandatory CC emails are locked — backend adds them automatically, don't put in user-editable field
        const mandatoryCcSet = new Set(
            (workflowPreview.emailRouting?.ccMandatory || [])
                .map((e) => String(e).trim().toLowerCase())
                .filter(Boolean)
        );
        const routingCc = (workflowPreview.emailRouting?.cc || [])
            .filter((e) => e && String(e).trim())
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => !mandatoryCcSet.has(e)); // exclude mandatory ones from editable field
        const existingCc = (formData.ccEmail || "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter((e) => Boolean(e) && !mandatoryCcSet.has(e)); // also strip mandatory from prior value
        const mergedCc = [...new Set([...routingCc, ...existingCc])];

        setFormData((prev) => ({
            ...prev,
            managerName: firstConfiguredManager?.name || firstApprover?.name || prev.managerName,
            managerEmail: firstConfiguredManager?.email || firstApprover?.email || prev.managerEmail,
            managerApprovalRequired: (workflowPreview.approvalLevels || []).length > 0,
            ccEmail: mergedCc.join(", ")
        }));
        setWorkflowAutoKey(key);
    }, [workflowPreview, selectedProjectId, formData.requestType, workflowAutoKey, formData.ccEmail]);
    
    if (!isOpen) return null;

    const approvalLevelPeople = (workflowPreview?.approvalLevels || [])
        .slice()
        .sort((a, b) => (a.level || 0) - (b.level || 0))
        .map((lvl, idx) => {
            const a = (lvl.approvers || [])[0] || {};
            return {
                id: `${lvl.level || idx + 1}-${a?.email || a?.name || ""}`,
                level: lvl.level || (idx + 1),
                role: a?.role || "Approver",
                name: (a?.name || "").trim(),
                email: String(a?.email || "").trim()
            };
        })
        .filter((p) => p.email);

    const projectApproverOptions = (() => {
        const map = new Map();
        approvalLevelPeople.forEach((p) => map.set(p.email.toLowerCase(), p));
        (workflowPreview?.managers || []).forEach((m) => {
            const email = String(m?.email || "").trim();
            if (!email) return;
            const k = email.toLowerCase();
            if (map.has(k)) return;
            map.set(k, {
                id: `wfm-${k}`,
                role: "Manager",
                name: String(m?.name || "").trim(),
                email
            });
        });
        return [...map.values()];
    })();

    /** Dropdown text: designation first, then name and/or email (matches approval-request style). */
    const formatApproverDropdownLabel = (person) => {
        const designation = (person.role || "").trim() || "Approver";
        const name = (person.name || "").trim();
        const email = String(person.email || "").trim();
        if (!email) return designation;
        if (name) return `${designation} — ${name} · ${email}`;
        return `${designation} — ${email}`;
    };

    const formatManagerDirectoryLabel = (manager) => {
        const designation = "Manager";
        const name = (manager.name || "").trim();
        const email = String(manager.email || "").trim();
        if (!email) return designation;
        if (name) return `${designation} — ${name} · ${email}`;
        return `${designation} — ${email}`;
    };

    const handleManagerSelect = (e) => {
        const selectedKey = e.target.value;
        if (!selectedKey) {
            setFormData({ ...formData, managerName: '', managerEmail: '' });
            return;
        }
        const keyLc = selectedKey.toLowerCase();
        const projectPerson = projectApproverOptions.find(
            (p) => String(p.email || "").toLowerCase() === keyLc
        );
        if (projectPerson) {
            setFormData({
                ...formData,
                managerName: projectPerson.name || projectPerson.role || "Approver",
                managerEmail: projectPerson.email
            });
            return;
        }
        const manager = managers.find(
            (m) => String(m.email || "").toLowerCase() === keyLc
        );
        if (manager) {
            const currentCc = formData.ccEmail ? formData.ccEmail.split(',').map(e => e.trim()).filter(e => e) : [];
            if (!currentCc.includes(manager.email.toLowerCase())) {
                currentCc.push(manager.email.toLowerCase());
            }
            setFormData({
                ...formData,
                managerName: manager.name,
                managerEmail: manager.email,
                ccEmail: currentCc.join(', ')
            });
        }
    };
    
    const handleRequestTypeSelect = (type) => {
        setFormData({ 
            ...formData, 
            requestType: type,
            managerApprovalRequired: formData.managerApprovalRequired
        });
        setStep(2);
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!formData.productName || !formData.environment) {
            setError('Please fill in all required fields');
            return;
        }
        
        try {
            setIsSubmitting(true);
            const ticket = await createTicket(formData, user);
            onSubmit(ticket);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderDynamicForm = () => {
        switch (formData.requestType) {
            case REQUEST_TYPES.NEW_ENVIRONMENT:
                return <NewEnvironmentForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.ENVIRONMENT_UP:
                return <EnvironmentUpForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.ENVIRONMENT_DOWN:
                return <EnvironmentDownForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.BUILD_REQUEST:
                return <BuildRequestForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.CODE_CUT:
                return <CodeCutForm formData={formData} onChange={setFormData} />;
            default:
                return null;
        }
    };
    
    const getRequestTypeDescription = (type) => {
        const descriptions = {
            [REQUEST_TYPES.NEW_ENVIRONMENT]: 'Request a new environment with custom specifications',
            [REQUEST_TYPES.ENVIRONMENT_UP]: 'Bring up an existing environment',
            [REQUEST_TYPES.ENVIRONMENT_DOWN]: 'Shut down an environment',
            [REQUEST_TYPES.ISSUE_FIX]: 'Report and request fix for an issue',
            [REQUEST_TYPES.BUILD_REQUEST]: 'Submit a general request to DevOps team',
            [REQUEST_TYPES.OTHER_QUERIES]: 'Ask other queries with basic details',
            [REQUEST_TYPES.CODE_CUT]: 'Request a code cut for release'
        };
        return descriptions[type] || '';
    };
    
    const getRequestTypeIcon = (type) => {
        const icons = {
            [REQUEST_TYPES.NEW_ENVIRONMENT]: <Server size={24} />,
            [REQUEST_TYPES.ENVIRONMENT_UP]: <PlayCircle size={24} />,
            [REQUEST_TYPES.ENVIRONMENT_DOWN]: <Pause size={24} />,
            [REQUEST_TYPES.ISSUE_FIX]: <AlertTriangle size={24} />,
            [REQUEST_TYPES.BUILD_REQUEST]: <GitBranch size={24} />,
            [REQUEST_TYPES.OTHER_QUERIES]: <MessageSquare size={24} />,
            [REQUEST_TYPES.CODE_CUT]: <Tag size={24} />
        };
        return icons[type] || <FileText size={24} />;
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content create-ticket-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        {step === 1 ? 'Select Request Type' : `New ${formData.requestType} Request`}
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                
                <div className="modal-body">
                    {error && (
                        <div className="form-error">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                    
                    {step === 1 ? (
                        <div className="request-type-grid">
                            {Object.values(REQUEST_TYPES).map(type => (
                                <button 
                                    key={type}
                                    className="request-type-card"
                                    onClick={() => handleRequestTypeSelect(type)}
                                >
                                    <div className="request-type-icon">
                                        {getRequestTypeIcon(type)}
                                    </div>
                                    <h4>{type}</h4>
                                    <p>{getRequestTypeDescription(type)}</p>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-section">
                                <h3>Common Information</h3>
                                
                                <div className="form-row">
                                    <FormField label="Requested By">
                                        <input 
                                            type="text"
                                            value={user.name}
                                            disabled
                                            className="disabled-input"
                                        />
                                    </FormField>
                                    <FormField label="Email">
                                        <input 
                                            type="email"
                                            value={user.email}
                                            disabled
                                            className="disabled-input"
                                        />
                                    </FormField>
                                </div>
                                
                                <div className="form-row">
                                    <FormField label="Product" required>
                                        <select 
                                            value={formData.productName}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    productName: e.target.value,
                                                    environment: ""
                                                }))
                                            }
                                            required
                                        >
                                            <option value="">Select Product</option>
                                            {(projects || []).map(project => (
                                                <option key={project.id || project.name} value={project.name}>
                                                    {project.tag ? `${project.name} (${project.tag})` : project.name}
                                                </option>
                                            ))}
                                        </select>
                                    </FormField>
                                    <FormField label="Environment" required>
                                        <select 
                                            value={formData.environment}
                                            onChange={e => setFormData({ ...formData, environment: e.target.value })}
                                            required
                                            disabled={!formData.productName || availableEnvironments.length === 0}
                                        >
                                            <option value="">
                                                {!formData.productName
                                                    ? "Select a product first"
                                                    : availableEnvironments.length === 0
                                                        ? "No environments for this product"
                                                        : "Select Environment"}
                                            </option>
                                            {availableEnvironments.map(env => (
                                                <option key={env} value={env}>{env}</option>
                                            ))}
                                        </select>
                                        {formData.productName && availableEnvironments.length === 0 && (
                                            <small style={{ color: "#b45309", fontSize: "0.75rem", display: "block", marginTop: 6 }}>
                                                An admin must enable environments for this product before you can submit a request.
                                            </small>
                                        )}
                                    </FormField>
                                </div>
                                
                                <div className="form-row">
                                    <FormField label="To">
                                        <select 
                                            value={formData.managerEmail || ''}
                                            onChange={handleManagerSelect}
                                        >
                                            <option value="">Select approver (designation — name · email)</option>
                                            {projectApproverOptions.length > 0 && (
                                                <optgroup label="From product workflow">
                                                    {projectApproverOptions.map((person) => (
                                                        <option
                                                            key={person.id}
                                                            value={person.email}
                                                            title={formatApproverDropdownLabel(person)}
                                                        >
                                                            {formatApproverDropdownLabel(person)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            {(managers || []).filter((m) => m.active !== false && String(m.email || "").trim()).length > 0 && (
                                                <optgroup label="Manager directory">
                                                    {(managers || []).filter((m) => m.active !== false && String(m.email || "").trim()).map((manager) => (
                                                        <option
                                                            key={manager.id || manager.email}
                                                            value={manager.email}
                                                            title={formatManagerDirectoryLabel(manager)}
                                                        >
                                                            {formatManagerDirectoryLabel(manager)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Auto-filled from workflow; you can change it if needed.
                                        </small>
                                    </FormField>
                                    <FormField label="CC Emails">
                                        <EmailChipsInput
                                            value={formData.ccEmail}
                                            onChange={(ccEmail) => setFormData({ ...formData, ccEmail })}
                                            savedEmails={savedEmails}
                                            lockedEmails={(workflowPreview?.emailRouting?.ccMandatory || []).map(e => String(e).trim().toLowerCase()).filter(Boolean)}
                                        />
                                        {(workflowPreview?.emailRouting?.ccMandatory || []).length > 0 && (
                                            <small style={{ color: '#6d28d9', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                <span style={{ fontSize: '0.7rem' }}>🔒</span>
                                                Locked emails are mandatory and set by your admin — they cannot be removed.
                                            </small>
                                        )}
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Type email and press Enter. Paste multiple emails to add all at once.
                                        </small>
                                    </FormField>
                                </div>
                                
                                {/* Workflow preview removed from end-user request flow. */}
                                
                                <div className="form-checkbox">
                                    <input 
                                        type="checkbox"
                                        id="managerApproval"
                                        checked={formData.managerApprovalRequired}
                                        onChange={e => setFormData({ ...formData, managerApprovalRequired: e.target.checked })}
                                    />
                                    <label htmlFor="managerApproval">
                                        Manager approval required
                                    </label>
                                </div>
                                
                                <FormField label="Description">
                                    <textarea 
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Brief description of the request"
                                        rows={3}
                                    />
                                </FormField>
                            </div>
                            
                            <div className="form-section">
                                <h3>{formData.requestType} Details</h3>
                                {renderDynamicForm()}
                            </div>
                            
                            <div className="form-actions">
                                <button 
                                    type="button" 
                                    className="btn-secondary"
                                    onClick={() => setStep(1)}
                                >
                                    Back
                                </button>
                                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                    <Send size={16} />
                                    {isSubmitting ? "Submitting..." : "Submit Request"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default {
    StatusBadge,
    HorizontalProgress,
    TicketTimeline,
    TicketCard,
    TicketFilters,
    TicketDetailsModal,
    CreateTicketModal
};
