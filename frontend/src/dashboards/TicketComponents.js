import React, { useState, useEffect, useRef } from 'react';
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
    UserPlus,
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
    Ban
} from 'lucide-react';
import { 
    TICKET_STATUS, 
    STATUS_COLORS, 
    REQUEST_TYPES,
    REQUEST_TYPE_TO_API_ENUM,
    ENVIRONMENTS,
    getDynamicAllowedTransitions,
    createTicket,
    updateTicketStatus,
    addTicketNote,
    assignTicket,
    getSavedCcEmails,
    saveCcEmail
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
                borderRadius: '8px',
                fontSize: sizeStyle.fontSize,
                fontWeight: 600,
                backgroundColor: colors.bg,
                color: colors.text,
                whiteSpace: 'nowrap',
                boxShadow: `0 2px 8px -2px ${colors.bg}`,
                transition: 'all 0.2s ease'
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
        .replace(/\b(USD|EUR|INR|GBP)\s*[\d,]+(?:\.\d+)?\b/gi, "***");
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
                            backgroundColor: entry.isNote ? '#6b7280' : STATUS_COLORS[entry.status]?.text || '#6b7280'
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
                                        style={{ fontSize: '0.8rem', color: '#1f2937', textDecoration: 'underline' }}
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
    'New Environment':       { border: '#7c3aed', bg: '#f5f3ff', icon: '#7c3aed', label: 'bg-purple' },
    'Environment Up':        { border: '#16a34a', bg: '#f0fdf4', icon: '#16a34a', label: 'bg-green' },
    'Environment Down':      { border: '#dc2626', bg: '#fef2f2', icon: '#dc2626', label: 'bg-red' },
    'Release Deployment':    { border: '#2563eb', bg: '#eff6ff', icon: '#2563eb', label: 'bg-blue' },
    'Issue Fix':             { border: '#d97706', bg: '#fffbeb', icon: '#d97706', label: 'bg-yellow' },
    'Build Request':         { border: '#0891b2', bg: '#ecfeff', icon: '#0891b2', label: 'bg-cyan' },
    'Code Cut':              { border: '#be185d', bg: '#fdf2f8', icon: '#be185d', label: 'bg-pink' },
    'Other Queries':         { border: '#64748b', bg: '#f8fafc', icon: '#64748b', label: 'bg-gray' },
};

const getTypeAccent = (requestType) =>
    TYPE_ACCENT[requestType] || { border: '#64748b', bg: '#f8fafc', icon: '#64748b', label: 'bg-gray' };

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
            className="jira-ticket-card"
            onClick={onClick}
            style={{ borderLeftColor: accent.border }}
        >
            {/* Top row: ID + Status + Date */}
            <div className="jtc-top">
                <div className="jtc-top-left">
                    <span className="jtc-id">{ticket.id}</span>
                    <StatusBadge status={ticket.status} size="small" />
                </div>
                <div className="jtc-top-right">
                    <span className="jtc-date" title={formatDate(ticket.createdAt)}>
                        <Calendar size={11} /> {timeSince(ticket.createdAt)}
                    </span>
                </div>
            </div>

            {/* Type chip + product name */}
            <div className="jtc-type-row">
                <span className="jtc-type-chip" style={{ background: accent.bg, color: accent.icon, border: `1px solid ${accent.border}22` }}>
                    {getRequestTypeIcon(ticket.requestType, 13)}
                    {ticket.requestType}
                </span>
            </div>

            <h3 className="jtc-title">{ticket.productName || '(No product)'}</h3>

            {/* Key details chips */}
            <div className="jtc-chips">
                {ticket.environment && (
                    <span className="jtc-chip env">
                        <Globe size={11} /> {ticket.environment}
                    </span>
                )}
                {serviceDetail && (
                    <span className="jtc-chip service">
                        <Cpu size={11} /> {serviceDetail}
                    </span>
                )}
                {ticket.managerApprovalRequired && (
                    <span className="jtc-chip approval">
                        <UserCheck size={11} /> Approval Req.
                    </span>
                )}
            </div>

            {/* Description preview */}
            {ticket.description && (
                <p className="jtc-description">{ticket.description}</p>
            )}

            {/* Footer: requester + assignee */}
            <div className="jtc-footer">
                <div className="jtc-people">
                    <span className="jtc-avatar" title={ticket.requestedBy}>
                        {(ticket.requestedBy || 'U').charAt(0).toUpperCase()}
                    </span>
                    {ticket.assignedTo && (
                        <>
                            <span className="jtc-arrow">→</span>
                            <span className="jtc-avatar assigned" title={ticket.assignedTo}>
                                {ticket.assignedTo.charAt(0).toUpperCase()}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {showActions && (
                <div className="jtc-expand-row" onClick={e => e.stopPropagation()}>
                    <button className="jtc-expand-btn" onClick={() => setExpanded(!expanded)}>
                        {expanded ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Details</>}
                    </button>
                </div>
            )}

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

// ============ STATUS FLOW BAR COMPONENT ============
const StatusFlowBar = ({ ticket }) => {
    const statusSteps = [
        { key: TICKET_STATUS.CREATED, label: 'Raised' },
        { key: TICKET_STATUS.ACCEPTED, label: 'Accepted' },
        { key: TICKET_STATUS.MANAGER_APPROVAL_PENDING, label: 'Mgr Approval', optional: !ticket.managerApprovalRequired },
        { key: TICKET_STATUS.MANAGER_APPROVED, label: 'Approved', optional: !ticket.managerApprovalRequired },
        { key: TICKET_STATUS.COST_APPROVAL_PENDING, label: 'Cost Review', optional: !ticket.costApprovalRequired },
        { key: TICKET_STATUS.COST_APPROVED, label: 'Cost OK', optional: !ticket.costApprovalRequired },
        { key: TICKET_STATUS.IN_PROGRESS, label: 'In Progress' },
        { key: TICKET_STATUS.COMPLETED, label: 'Completed' },
        { key: TICKET_STATUS.CLOSED, label: 'Closed' },
    ];

    const useDynamic = Array.isArray(ticket.workflowStages) && ticket.workflowStages.length > 0;

    if (useDynamic) {
        return (
            <div style={{ overflowX: 'auto', background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 1.25rem', minWidth: 'max-content', gap: 0 }}>
                    {ticket.workflowStages.map((stage, i) => {
                        const isDone = stage.state === 'done';
                        const isCurrent = stage.state === 'current';
                        return (
                            <React.Fragment key={stage.id || i}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                    <div style={{
                                        width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                                        background: isDone ? '#16a34a' : isCurrent ? '#2563eb' : '#d1d5db',
                                        boxShadow: isCurrent ? '0 0 0 3px #bfdbfe' : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, transition: 'all 0.2s'
                                    }}>
                                        {isDone && <span style={{ fontSize: 7, color: '#fff', lineHeight: 1, fontWeight: 900 }}>✓</span>}
                                    </div>
                                    <span style={{
                                        fontSize: '0.6rem', fontWeight: isCurrent ? 700 : 400,
                                        color: isDone ? '#166534' : isCurrent ? '#1d4ed8' : '#9ca3af',
                                        whiteSpace: 'nowrap', lineHeight: 1
                                    }}>
                                        {stage.label}
                                    </span>
                                </div>
                                {i < ticket.workflowStages.length - 1 && (
                                    <div style={{ width: 18, height: 1.5, background: isDone ? '#86efac' : '#e5e7eb', margin: '-7px 3px 0', flexShrink: 0 }} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        );
    }

    const getStepIdx = () => {
        const idx = statusSteps.findIndex(s => s.key === ticket.status);
        if (idx !== -1) return idx;
        if (ticket.status === TICKET_STATUS.ACTION_REQUIRED || ticket.status === TICKET_STATUS.ON_HOLD) {
            return statusSteps.findIndex(s => s.key === TICKET_STATUS.IN_PROGRESS);
        }
        return 0;
    };
    const currentIdx = getStepIdx();

    return (
        <div style={{ overflowX: 'auto', background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 1.25rem', minWidth: 'max-content', gap: 0 }}>
                {statusSteps.map((step, i) => {
                    const isDone = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const isOptionalFaded = step.optional && !isDone && !isCurrent;
                    return (
                        <React.Fragment key={step.key}>
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                                opacity: isOptionalFaded ? 0.3 : 1, transition: 'opacity 0.2s'
                            }}>
                                <div style={{
                                    width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                                    background: isDone ? '#16a34a' : isCurrent ? '#2563eb' : '#d1d5db',
                                    boxShadow: isCurrent ? '0 0 0 3px #bfdbfe' : 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, transition: 'all 0.2s'
                                }}>
                                    {isDone && <span style={{ fontSize: 7, color: '#fff', lineHeight: 1, fontWeight: 900 }}>✓</span>}
                                </div>
                                <span style={{
                                    fontSize: '0.6rem', fontWeight: isCurrent ? 700 : 400,
                                    color: isDone ? '#166534' : isCurrent ? '#1d4ed8' : '#9ca3af',
                                    whiteSpace: 'nowrap', lineHeight: 1
                                }}>
                                    {step.label}
                                </span>
                            </div>
                            {i < statusSteps.length - 1 && (
                                <div style={{
                                    width: 18, height: 1.5,
                                    background: isDone ? '#86efac' : '#e5e7eb',
                                    margin: '-7px 3px 0', flexShrink: 0,
                                    opacity: isOptionalFaded ? 0.3 : 1
                                }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            {(ticket.status === TICKET_STATUS.ACTION_REQUIRED || ticket.status === TICKET_STATUS.ON_HOLD) && (
                <div style={{ padding: '0 1.25rem 6px', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge status={ticket.status} size="small" animated />
                </div>
            )}
        </div>
    );
};

// ============ TICKET DETAILS MODAL ============
export const TicketDetailsModal = ({ ticket, onClose, onStatusChange, onAddNote, user, canManage = false, onToggleActiveStatus, onRequestCostApproval }) => {
    const [note, setNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [noteAttachments, setNoteAttachments] = useState([]);
    const [showApprovalEditor, setShowApprovalEditor] = useState(false);
    const [approvalEditorText, setApprovalEditorText] = useState('');
    const [approvalEditorHtml, setApprovalEditorHtml] = useState('');
    const [showApprovalPanel, setShowApprovalPanel] = useState(false);
    const [approvalType, setApprovalType] = useState('Manager Approval');
    const [approvalNote, setApprovalNote] = useState('');
    const [closeNote, setCloseNote] = useState('');
    const [modalActionLoading, setModalActionLoading] = useState(false);

    if (!ticket) return null;

    const accent = getTypeAccent(ticket.requestType);
    const allowedTransitions = getDynamicAllowedTransitions(ticket);
    const requiresCostApproval = !!ticket.costApprovalRequired || !!ticket.workflowConfiguration?.costApprovalRequired;
    
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
        const displayName = (p.name || "").trim() || p.email;
        return {
            value: `APPROVAL::${p.email}`,
            label: `📋 ${displayName}`,
            type: "approval",
            person: p
        };
    });
    const managerRespondedApproved = String(ticket.managerApprovalStatus || "").toUpperCase() === "APPROVED";
    const approvalActionsForUser = !canManage && managerRespondedApproved ? [] : approvalActions;
    const defaultActions = (canManage ? Object.values(TICKET_STATUS) : allowedTransitions).map((s) => ({
        value: `STATUS::${s}`,
        label: getStatusActionLabel(s),
        type: "status",
        status: s
    }));
    const selectableActions = canManage ? [...defaultActions, ...approvalActions] : approvalActionsForUser;
    const selectedApprovalAction = selectedStatus.startsWith("APPROVAL::")
        ? approvalActions.find((a) => a.value === selectedStatus)
        : null;

    const applySelectedAction = (actionNoteText) => {
        if (selectedStatus && onStatusChange) {
            if (selectedStatus.startsWith("STATUS::")) {
                const statusValue = selectedStatus.replace("STATUS::", "");
                if (statusValue === TICKET_STATUS.COST_APPROVAL_PENDING && onRequestCostApproval) {
                    onRequestCostApproval(ticket);
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
            if (selectedStatus === TICKET_STATUS.COST_APPROVAL_PENDING && onRequestCostApproval) {
                onRequestCostApproval(ticket);
                setSelectedStatus('');
                return;
            }
            onStatusChange(ticket.id, selectedStatus, actionNoteText || note, {});
            setNote('');
            setSelectedStatus('');
        }
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

    const handleAssignMe = async () => {
        if (!user) return;
        setModalActionLoading(true);
        try {
            await assignTicket(ticket.id, user.name, user);
        } catch (e) {
            alert(e.message);
        } finally {
            setModalActionLoading(false);
        }
    };

    const handleQuickStatus = (status, defaultNote) => {
        if (onStatusChange) onStatusChange(ticket.id, status, defaultNote, {});
    };

    const handleSendApprovalRequest = () => {
        if (!onStatusChange) return;
        if (approvalType === 'Cost Approval') {
            if (onRequestCostApproval) {
                onRequestCostApproval(ticket);
            } else {
                onStatusChange(ticket.id, TICKET_STATUS.COST_APPROVAL_PENDING, approvalNote || 'Cost approval requested', {});
            }
        } else {
            const typeNote = [approvalType, approvalNote ? `Purpose: ${approvalNote}` : null].filter(Boolean).join('. ');
            onStatusChange(
                ticket.id,
                TICKET_STATUS.MANAGER_APPROVAL_PENDING,
                typeNote,
                ticket.managerEmail ? { approvalTargetEmail: ticket.managerEmail } : {}
            );
        }
        setApprovalNote('');
        setShowApprovalPanel(false);
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
            return { id: `${entry?.timestamp || "x"}-${idx}`, label, tone };
        });
    const runtimeBarTone = (() => {
        const st = timelineStatusKey(ticket.status);
        if (st === "CLOSED" || st === "REJECTED") {
            return { color: "#dc2626", bg: "#fee2e2", label: "Closed" };
        }
        if (st === "MANAGER_APPROVAL_PENDING") {
            return { color: "#dc2626", bg: "#fee2e2", label: "Pending Approval" };
        }
        if (st === "COST_APPROVAL_PENDING") {
            return { color: "#dc2626", bg: "#fee2e2", label: "Cost Review" };
        }
        if (st === "MANAGER_APPROVED") {
            return { color: "#16a34a", bg: "#dcfce7", label: "Approved" };
        }
        if (st === "COST_APPROVED") {
            return { color: "#16a34a", bg: "#dcfce7", label: "Cost Approved" };
        }
        if (st === "COMPLETED" || st === "IN_PROGRESS") {
            return { color: "#16a34a", bg: "#dcfce7", label: "Processing" };
        }
        if (st === "ACTION_REQUIRED" || st === "ON_HOLD") {
            return { color: "#d97706", bg: "#fef3c7", label: "Waiting" };
        }
        return { color: "#2563eb", bg: "#dbeafe", label: "Active" };
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
                <StatusFlowBar ticket={ticket} />

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
                                        ? { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }
                                        : item.tone === "red"
                                            ? { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }
                                            : item.tone === "amber"
                                                ? { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }
                                                : { background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd" };
                                    return (
                                        <React.Fragment key={item.id}>
                                            <span style={{ ...toneStyle, borderRadius: 999, padding: "4px 10px", fontSize: "0.78rem", fontWeight: 600 }}>
                                                {item.label}
                                            </span>
                                            {index < actionFlowItems.length - 1 && (
                                                <span style={{ color: "#94a3b8", fontWeight: 700 }}>→</span>
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

                        {/* Actions (manage) */}
                        {ticket.status === TICKET_STATUS.ACTION_REQUIRED && canManage ? (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><AlertCircle size={14} /> Action Required — What to do?</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                    {user && ticket.assignedTo !== user.name && (
                                        <button
                                            className="jdm-btn-secondary"
                                            onClick={handleAssignMe}
                                            disabled={modalActionLoading}
                                            title="Assign this ticket to yourself"
                                        >
                                            <UserPlus size={14} /> Assign Me
                                        </button>
                                    )}
                                    <button
                                        className="jdm-btn-primary"
                                        onClick={() => handleQuickStatus(TICKET_STATUS.IN_PROGRESS, 'Resuming work on ticket')}
                                        disabled={modalActionLoading}
                                    >
                                        <PlayCircle size={14} /> Work In Progress
                                    </button>
                                    <button
                                        className="jdm-btn-ghost"
                                        onClick={() => handleQuickStatus(TICKET_STATUS.ON_HOLD, 'Ticket put on hold')}
                                        disabled={modalActionLoading}
                                    >
                                        <Pause size={14} /> On Hold
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        className="jdm-select"
                                        style={{ flex: 1, padding: '5px 8px', height: 34 }}
                                        placeholder="Close note (optional)..."
                                        value={closeNote}
                                        onChange={e => setCloseNote(e.target.value)}
                                    />
                                    <button
                                        className="jdm-btn-ghost"
                                        style={{ color: '#dc2626', borderColor: '#fca5a5', flexShrink: 0 }}
                                        onClick={() => handleQuickStatus(TICKET_STATUS.CLOSED, closeNote || 'Ticket closed')}
                                        disabled={modalActionLoading}
                                    >
                                        <XCircle size={14} /> Close Ticket
                                    </button>
                                </div>
                            </div>
                        ) : selectableActions.length > 0 && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><PlayCircle size={14} /> Actions</div>
                                <div className="jdm-action-row">
                                    <select
                                        value={selectedStatus}
                                        onChange={e => setSelectedStatus(e.target.value)}
                                        className="jdm-select"
                                    >
                                        <option value="">Select action...</option>
                                        {defaultActions.length > 0 && (
                                            <optgroup label="Status">
                                                {defaultActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {approvalActions.length > 0 && (
                                            <optgroup label="Request Approval">
                                                {approvalActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {!canManage && managerRespondedApproved && (
                                            <option value="" disabled>✓ Approved - pending processing</option>
                                        )}
                                        {!canManage && !managerRespondedApproved && approvalActions.length === 0 && (
                                            <option value="" disabled>No approvers configured</option>
                                        )}
                                        {canManage && defaultActions.length === 0 && approvalActions.length === 0 && (
                                            <option value="" disabled>No actions</option>
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
                                {ticket.status === TICKET_STATUS.MANAGER_APPROVED
                                    && requiresCostApproval
                                    && !String(ticket.costApprovalStatus || '').toUpperCase().includes('PENDING')
                                    && !String(ticket.costApprovalStatus || '').toUpperCase().includes('APPROVED')
                                    && onRequestCostApproval && (
                                        <button
                                            className="jdm-btn-primary"
                                            style={{ marginTop: 10 }}
                                            onClick={() => onRequestCostApproval(ticket)}
                                        >
                                            <DollarSign size={14} /> Submit Cost Estimate
                                        </button>
                                    )}
                            </div>
                        )}

                        {/* Request Approval — collapsible panel for DevOps/Admin */}
                        {canManage && ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(ticket.status) && (
                            <div className="jdm-section">
                                <button
                                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#374151', fontWeight: 600, fontSize: '0.82rem' }}
                                    onClick={() => setShowApprovalPanel(!showApprovalPanel)}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <ShieldCheck size={14} /> Send for Approval
                                    </span>
                                    {showApprovalPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showApprovalPanel && (
                                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <label style={{ fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap', minWidth: 90 }}>Approval type</label>
                                            <select
                                                value={approvalType}
                                                onChange={e => setApprovalType(e.target.value)}
                                                className="jdm-select"
                                                style={{ flex: 1 }}
                                            >
                                                <option>Manager Approval</option>
                                                <option>Lead Approval</option>
                                                <option>CEO Approval</option>
                                                <option>Cost Approval</option>
                                            </select>
                                        </div>
                                        <textarea
                                            className="jdm-textarea"
                                            value={approvalNote}
                                            onChange={e => setApprovalNote(e.target.value)}
                                            placeholder="Note / context for approver (optional)"
                                            rows={2}
                                        />
                                        <button
                                            className="jdm-btn-primary"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={handleSendApprovalRequest}
                                            disabled={modalActionLoading}
                                        >
                                            <Send size={14} /> Send Approval Request
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {canManage && ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Awaiting Response</div>
                                {managerRespondedApproved ? (
                                    <p className="jdm-hint-text" style={{ color: "#166534", fontWeight: 500 }}>
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
                                <p className="jdm-hint-text" style={{ color: "#166534" }}>
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
                            </div>
                        )}
                        {canManage && ticket.status === TICKET_STATUS.MANAGER_APPROVED && requiresCostApproval
                            && !String(ticket.costApprovalStatus || '').toUpperCase().includes('PENDING')
                            && !String(ticket.costApprovalStatus || '').toUpperCase().includes('APPROVED') && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Database size={14} /> Cost Approval Required</div>
                                <p className="jdm-hint-text">
                                    Raise cost approval with estimated budget to proceed in workflow.
                                </p>
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
        <FormField label="Branch Name" required>
            <input 
                type="text"
                value={formData.branchName || ''}
                onChange={e => onChange({ ...formData, branchName: e.target.value })}
                placeholder="e.g., feature/new-feature"
                required
            />
        </FormField>
        <FormField label="Commit ID">
            <input 
                type="text"
                value={formData.commitId || ''}
                onChange={e => onChange({ ...formData, commitId: e.target.value })}
                placeholder="e.g., abc1234"
            />
        </FormField>
        <FormField label="Purpose" required>
            <textarea 
                value={formData.purpose || ''}
                onChange={e => onChange({ ...formData, purpose: e.target.value })}
                placeholder="Purpose of this build"
                rows={3}
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
    const availableEnvironments = selectedProject
        ? (Array.isArray(selectedProject.environments) ? selectedProject.environments.filter(Boolean) : [])
        : [];
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
        if (formData.environment && (allowed.length === 0 || !allowed.includes(formData.environment))) {
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
        const routingCc = (workflowPreview.emailRouting?.cc || [])
            .filter((e) => e && String(e).trim())
            .map((e) => String(e).trim().toLowerCase());
        const existingCc = (formData.ccEmail || "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
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

    const formatApproverDropdownLabel = (person) => {
        const namePart = (person.name || "").trim() || person.email;
        const designation = (person.role || "").trim() || "Approver";
        return `${designation} — ${namePart} · ${person.email}`;
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
            case REQUEST_TYPES.ISSUE_FIX:
                return <IssueFixForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.BUILD_REQUEST:
                return <BuildRequestForm formData={formData} onChange={setFormData} />;
            case REQUEST_TYPES.OTHER_QUERIES:
                return <OtherQueriesForm formData={formData} onChange={setFormData} />;
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
                                    <FormField label="To (Approver)">
                                        <select 
                                            value={formData.managerEmail || ''}
                                            onChange={handleManagerSelect}
                                        >
                                            <option value="">Select approver (designation · name · email)</option>
                                            {projectApproverOptions.length > 0 && (
                                                <optgroup label="Project workflow (by designation)">
                                                    {projectApproverOptions.map((person) => (
                                                        <option key={person.id} value={person.email}>
                                                            {formatApproverDropdownLabel(person)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            {(managers || []).filter((m) => m.active !== false && String(m.email || "").trim()).length > 0 && (
                                                <optgroup label="Manager directory">
                                                    {(managers || []).filter((m) => m.active !== false && String(m.email || "").trim()).map((manager) => (
                                                        <option key={manager.id || manager.email} value={manager.email}>
                                                            {`Manager — ${manager.name} · ${manager.email}`}
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
                                        />
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
