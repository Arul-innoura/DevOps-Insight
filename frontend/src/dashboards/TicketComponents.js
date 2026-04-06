import React, { useState, useEffect } from 'react';
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
    Tag
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
    getSavedCcEmails,
    saveCcEmail
} from '../services/ticketService';
import { getEffectiveWorkflow } from '../services/projectWorkflowService';

// ============ STATUS BADGE COMPONENT ============
export const StatusBadge = ({ status, size = 'medium' }) => {
    const colors = STATUS_COLORS[status] || { bg: '#e5e7eb', text: '#4b5563' };
    
    const getIcon = () => {
        const iconSize = size === 'small' ? 12 : 14;
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
    
    const sizeClasses = {
        small: { padding: '2px 8px', fontSize: '0.7rem', gap: '4px' },
        medium: { padding: '4px 10px', fontSize: '0.75rem', gap: '6px' },
        large: { padding: '6px 12px', fontSize: '0.875rem', gap: '8px' }
    };
    
    const sizeStyle = sizeClasses[size] || sizeClasses.medium;
    
    return (
        <span 
            className="status-badge"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: sizeStyle.gap,
                padding: sizeStyle.padding,
                borderRadius: '9999px',
                fontSize: sizeStyle.fontSize,
                fontWeight: 600,
                backgroundColor: colors.bg,
                color: colors.text,
                whiteSpace: 'nowrap'
            }}
        >
            {getIcon()}
            {status}
        </span>
    );
};

// ============ HORIZONTAL PROGRESS COMPONENT ============
export const HorizontalProgress = ({ timeline = [], currentStatus, workflowStages: dynamicStages }) => {
    const staticStages = [
        { key: TICKET_STATUS.CREATED, label: 'Ticket Raised' },
        { key: TICKET_STATUS.ACCEPTED, label: 'DevOps Accepted' },
        { key: TICKET_STATUS.MANAGER_APPROVAL_PENDING, label: 'Mgr Approval' },
        { key: TICKET_STATUS.MANAGER_APPROVED, label: 'Mgr Approved' },
        { key: TICKET_STATUS.COST_APPROVAL_PENDING, label: 'Cost Pending' },
        { key: TICKET_STATUS.COST_APPROVED, label: 'Cost Approved' },
        { key: TICKET_STATUS.IN_PROGRESS, label: 'Work In Progress' },
        { key: TICKET_STATUS.COMPLETED, label: 'Completed' },
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
export const TicketTimeline = ({ timeline = [] }) => {
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
                                {entry.notes}
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
                    <span className="jtc-avatar" title={`Requested by: ${ticket.requestedBy}`}>
                        {(ticket.requestedBy || 'U').charAt(0).toUpperCase()}
                    </span>
                    {ticket.assignedTo && (
                        <>
                            <span className="jtc-arrow">→</span>
                            <span className="jtc-avatar assigned" title={`Assigned to: ${ticket.assignedTo}`}>
                                {ticket.assignedTo.charAt(0).toUpperCase()}
                            </span>
                        </>
                    )}
                    <span className="jtc-people-names">
                        <span>{ticket.requestedBy}</span>
                        {ticket.assignedTo && <span className="jtc-assigned-name">→ {ticket.assignedTo}</span>}
                    </span>
                </div>
                <div className="jtc-footer-right">
                    {ticket.ccEmail && (
                        <span className="jtc-chip cc" title={`CC: ${ticket.ccEmail}`}>
                            <Mail size={11} /> CC
                        </span>
                    )}
                </div>
            </div>

            {showActions && (
                <div className="jtc-expand-row" onClick={e => e.stopPropagation()}>
                    <button className="jtc-expand-btn" onClick={() => setExpanded(!expanded)}>
                        {expanded ? <><ChevronUp size={14} /> Hide Timeline</> : <><ChevronDown size={14} /> Show Timeline</>}
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
                    <option value="">All Statuses</option>
                    {Object.values(TICKET_STATUS).map(status => (
                        <option key={status} value={status}>{status}</option>
                    ))}
                </select>
            </div>
            
            <div className="filter-group">
                <label>Request Type</label>
                <select 
                    value={filters.requestType || ''} 
                    onChange={e => onFilterChange({ ...filters, requestType: e.target.value || null })}
                >
                    <option value="">All Types</option>
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
                    <option value="">All Environments</option>
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
export const TicketDetailsModal = ({ ticket, onClose, onStatusChange, onAddNote, user, canManage = false, onToggleActiveStatus, onRequestCostApproval }) => {
    const [note, setNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [noteAttachments, setNoteAttachments] = useState([]);
    
    if (!ticket) return null;

    const accent = getTypeAccent(ticket.requestType);
    const allowedTransitions = getDynamicAllowedTransitions(ticket);
    const requiresCostApproval = !!ticket.costApprovalRequired || !!ticket.workflowConfiguration?.costApprovalRequired;
    
    const getStatusActionLabel = (status) => {
        if (status === TICKET_STATUS.COST_APPROVAL_PENDING) return "Raise Cost Approval (enter estimate)";
        return status;
    };

    const handleStatusChange = () => {
        if (selectedStatus && onStatusChange) {
            if (selectedStatus === TICKET_STATUS.COST_APPROVAL_PENDING && onRequestCostApproval) {
                onRequestCostApproval(ticket);
                setSelectedStatus('');
                return;
            }
            onStatusChange(ticket.id, selectedStatus, note);
            setNote('');
            setSelectedStatus('');
        }
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

                {/* ── Progress Bar ── */}
                <div className="jdm-progress-wrap">
                    <HorizontalProgress
                        timeline={ticket.timeline}
                        currentStatus={ticket.status}
                        workflowStages={ticket.workflowStages}
                    />
                </div>

                {/* ── Two-panel body ── */}
                <div className="jdm-body">

                    {/* LEFT: Main content */}
                    <div className="jdm-main">

                        {/* Description */}
                        {ticket.description && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><FileText size={14} /> Description</div>
                                <p className="jdm-description">{ticket.description}</p>
                            </div>
                        )}

                        {/* Service Details */}
                        <div className="jdm-section">
                            <div className="jdm-section-title">{getRequestTypeIcon(ticket.requestType, 14)} Service Details</div>
                            <div className="jdm-fields-grid">
                                <DetailField icon={Globe} label="Environment" value={ticket.environment} />
                                {ticket.databaseType && <DetailField icon={Database} label="Database" value={ticket.databaseType} />}
                                {ticket.releaseVersion && <DetailField icon={Tag} label="Release Version" value={ticket.releaseVersion} mono />}
                                {ticket.deploymentStrategy && <DetailField icon={Upload} label="Deployment Strategy" value={ticket.deploymentStrategy} />}
                                {ticket.branchName && <DetailField icon={GitBranch} label="Branch" value={ticket.branchName} mono />}
                                {ticket.commitId && <DetailField icon={GitBranch} label="Commit ID" value={ticket.commitId} mono />}
                                {ticket.issueType && <DetailField icon={AlertTriangle} label="Issue Type" value={ticket.issueType} />}
                                {ticket.duration && <DetailField icon={Clock} label="Duration" value={`${ticket.duration} days`} />}
                                {ticket.activationDate && <DetailField icon={Calendar} label="Activation Date" value={fmt(ticket.activationDate)} />}
                                {ticket.shutdownDate && <DetailField icon={Calendar} label="Shutdown Date" value={fmt(ticket.shutdownDate)} />}
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
                        {canManage && allowedTransitions.length > 0 && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><PlayCircle size={14} /> Workflow Action</div>
                                <div className="jdm-action-row">
                                    <select
                                        value={selectedStatus}
                                        onChange={e => setSelectedStatus(e.target.value)}
                                        className="jdm-select"
                                    >
                                        <option value="">Select next workflow action…</option>
                                        {allowedTransitions.map(s => (
                                            <option key={s} value={s}>{getStatusActionLabel(s)}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="jdm-btn-primary"
                                        onClick={handleStatusChange}
                                        disabled={!selectedStatus}
                                    >
                                        Apply Action
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
                                            <Database size={14} /> Raise Cost Approval
                                        </button>
                                    )}
                            </div>
                        )}
                        {canManage && ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Approval In Progress</div>
                                <p className="jdm-hint-text">
                                    Waiting for manager approval
                                    {ticket.currentApprovalLevel && ticket.totalApprovalLevels
                                        ? ` (Level ${ticket.currentApprovalLevel} of ${ticket.totalApprovalLevels})`
                                        : ""}.
                                    Status will update automatically when the approver clicks Approve/Reject from email.
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

                        {/* Add Note (log style for both DevOps and requester) */}
                        {onAddNote && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><MessageSquare size={14} /> Add Work Log Entry</div>
                                <textarea
                                    className="jdm-textarea"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Write a formal log note..."
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
                                        {noteAttachments.length} attachment(s) selected
                                    </div>
                                )}
                                <button
                                    className="jdm-btn-primary"
                                    style={{ marginTop: 8, alignSelf: 'flex-start' }}
                                    onClick={handleAddNote}
                                    disabled={!note.trim()}
                                >
                                    <Send size={14} /> Add Log Entry
                                </button>
                            </div>
                        )}

                        {/* Activity Timeline */}
                        <div className="jdm-section">
                            <div className="jdm-section-title"><Clock size={14} /> Activity</div>
                            <TicketTimeline timeline={ticket.timeline} />
                        </div>
                    </div>

                    {/* RIGHT: Sidebar */}
                    <div className="jdm-sidebar">
                        <div className="jdm-sidebar-section">
                            <div className="jdm-sidebar-title">People</div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label"><User size={12} /> Reporter</div>
                                <div className="jdm-person-row">
                                    <span className="jdm-avatar-sm">{(ticket.requestedBy || 'U').charAt(0).toUpperCase()}</span>
                                    <div>
                                        <div className="jdm-person-name">{ticket.requestedBy}</div>
                                        {ticket.requesterEmail && <div className="jdm-person-email">{ticket.requesterEmail}</div>}
                                    </div>
                                </div>
                            </div>
                            {ticket.assignedTo && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><UserCheck size={12} /> Assignee</div>
                                    <div className="jdm-person-row">
                                        <span className="jdm-avatar-sm assigned">{ticket.assignedTo.charAt(0).toUpperCase()}</span>
                                        <div className="jdm-person-name">{ticket.assignedTo}</div>
                                    </div>
                                </div>
                            )}
                            {ticket.managerName && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><Building size={12} /> Manager</div>
                                    <div className="jdm-person-name">{ticket.managerName}</div>
                                </div>
                            )}
                            {ticket.ccEmail && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><Mail size={12} /> CC</div>
                                    <div className="jdm-person-email" style={{ wordBreak: 'break-all' }}>{ticket.ccEmail}</div>
                                </div>
                            )}
                        </div>

                        <div className="jdm-sidebar-section">
                            <div className="jdm-sidebar-title">Dates</div>
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
                            <div className="jdm-sidebar-title">Details</div>
                            <div className="jdm-sidebar-field">
                                <div className="jdm-sidebar-label">Manager Approval</div>
                                <span className={`jdm-tag ${ticket.managerApprovalRequired ? 'required' : 'not-required'}`}>
                                    {ticket.managerApprovalRequired ? '✓ Required' : '✕ Not Required'}
                                </span>
                            </div>
                            {ticket.environment && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><Globe size={12} /> Environment</div>
                                    <span className="jdm-tag env">{ticket.environment}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
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

// ============ CC EMAIL CHIP INPUT ============
const CcEmailInput = ({ value, onChange, savedEmails = [] }) => {
    const [inputValue, setInputValue] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    // Parse value as array of emails
    const emails = value ? value.split(',').map(e => e.trim()).filter(e => e && e.includes('@')) : [];
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
            e.preventDefault();
            addEmail(inputValue);
        } else if (e.key === 'Backspace' && !inputValue && emails.length > 0) {
            removeEmail(emails.length - 1);
        }
    };
    
    const handlePaste = (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        // Split by common separators
        const pastedEmails = pastedText.split(/[,;\s\n]+/).filter(email => email.includes('@'));
        if (pastedEmails.length > 0) {
            const newEmails = [...emails, ...pastedEmails];
            onChange(newEmails.join(', '));
            pastedEmails.forEach(email => saveCcEmail(email));
        }
    };
    
    const addEmail = (email) => {
        const trimmed = email.trim().toLowerCase();
        if (trimmed && trimmed.includes('@') && !emails.includes(trimmed)) {
            const newEmails = [...emails, trimmed];
            onChange(newEmails.join(', '));
            saveCcEmail(trimmed);
        }
        setInputValue('');
        setShowSuggestions(false);
    };
    
    const removeEmail = (index) => {
        const newEmails = emails.filter((_, i) => i !== index);
        onChange(newEmails.join(', '));
    };
    
    const filteredSuggestions = savedEmails.filter(
        email => email.includes(inputValue.toLowerCase()) && !emails.includes(email)
    ).slice(0, 5);
    
    return (
        <div className="cc-email-input-container">
            <div className="cc-email-chips">
                {emails.map((email, index) => (
                    <span key={email} className="cc-email-chip">
                        {email}
                        <button type="button" onClick={() => removeEmail(index)} className="chip-remove">
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        setShowSuggestions(e.target.value.length > 0);
                    }}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => setShowSuggestions(inputValue.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={emails.length === 0 ? "Type email and press Enter" : "Add more..."}
                    className="cc-email-text-input"
                />
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="cc-email-suggestions">
                    {filteredSuggestions.map(email => (
                        <button
                            key={email}
                            type="button"
                            className="cc-email-suggestion"
                            onClick={() => addEmail(email)}
                        >
                            {email}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

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
    
    const handleManagerSelect = (e) => {
        const selectedKey = e.target.value;
        if (!selectedKey) {
            setFormData({ ...formData, managerName: '', managerEmail: '' });
            return;
        }
        const manager = managers.find(
            (m) => String(m.id || "").toLowerCase() === selectedKey.toLowerCase()
                || String(m.email || "").toLowerCase() === selectedKey.toLowerCase()
        );
        if (manager) {
            // Add manager email to CC automatically
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
                                            onChange={e => setFormData({ ...formData, productName: e.target.value })}
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
                                        >
                                            <option value="">Select Environment</option>
                                            {ENVIRONMENTS.map(env => (
                                                <option key={env} value={env}>{env}</option>
                                            ))}
                                        </select>
                                    </FormField>
                                </div>
                                
                                <div className="form-row">
                                    <FormField label="Manager">
                                        <select 
                                            value={formData.managerEmail || managers.find(m => m.name === formData.managerName)?.email || ''}
                                            onChange={handleManagerSelect}
                                        >
                                            {formData.managerEmail && !(managers || []).some(
                                                (m) => String(m.email || "").toLowerCase() === String(formData.managerEmail || "").toLowerCase()
                                            ) && (
                                                <option value={formData.managerEmail}>
                                                    {formData.managerName || formData.managerEmail} ({formData.managerEmail})
                                                </option>
                                            )}
                                            <option value="">Select Manager (optional)</option>
                                            {(managers || []).filter(m => m.active !== false).map(manager => (
                                                <option key={manager.id || manager.email} value={manager.id || manager.email}>
                                                    {manager.name} ({manager.email})
                                                </option>
                                            ))}
                                        </select>
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Or type manually below
                                        </small>
                                        <input 
                                            type="text"
                                            value={formData.managerName}
                                            onChange={e => setFormData({ ...formData, managerName: e.target.value })}
                                            placeholder="Enter manager name"
                                            style={{ marginTop: '0.5rem' }}
                                        />
                                    </FormField>
                                    <FormField label="CC Emails">
                                        <CcEmailInput
                                            value={formData.ccEmail}
                                            onChange={(ccEmail) => setFormData({ ...formData, ccEmail })}
                                            savedEmails={savedEmails}
                                        />
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Type email and press Enter. Paste multiple emails to add all at once.
                                        </small>
                                    </FormField>
                                </div>
                                
                                {step === 2 && formData.productName && formData.requestType && (
                                    <div
                                        className="form-info-box"
                                        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Mail size={16} />
                                            <strong>Configured Approval Flow</strong>
                                        </div>
                                        {workflowPreviewLoading && (
                                            <span style={{ fontSize: '0.85rem', color: '#5E6C84' }}>Loading configured flow…</span>
                                        )}
                                        {!workflowPreviewLoading && workflowPreview && (
                                            <div style={{ width: '100%', fontSize: '0.85rem', color: '#172B4D' }}>
                                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Hierarchy</div>
                                                <div style={{ paddingLeft: 6, borderLeft: '2px solid #dfe1e6', marginLeft: 6 }}>
                                                    <div style={{ marginBottom: 4 }}>Product Request</div>
                                                    {!!(workflowPreview.managers || []).length && (
                                                        <div style={{ marginBottom: 4 }}>
                                                            ├─ Configured Managers:
                                                            <div style={{ paddingLeft: 18 }}>
                                                                {(workflowPreview.managers || []).map((m, idx) => (
                                                                    <div key={`mgr-${idx}`}>
                                                                        • {m?.name || 'Manager'} {m?.email ? `(${m.email})` : ''}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ marginBottom: 4 }}>
                                                        ├─ Approval Levels ({(workflowPreview.approvalLevels || []).length})
                                                    </div>
                                                    <div style={{ paddingLeft: 18, marginBottom: 4 }}>
                                                        {(workflowPreview.approvalLevels || [])
                                                            .slice()
                                                            .sort((a, b) => (a.level || 0) - (b.level || 0))
                                                            .map((lvl) => (
                                                                <div key={`preview-level-${lvl.level}`} style={{ marginBottom: 2 }}>
                                                                    • Level {lvl.level}
                                                                    <div style={{ paddingLeft: 16 }}>
                                                                        {(lvl.approvers || []).length === 0 && <div>- No approver configured</div>}
                                                                        {(lvl.approvers || []).map((a, i) => (
                                                                            <div key={`lvl-${lvl.level}-ap-${i}`}>
                                                                                - {a?.name || 'Approver'} {a?.email ? `(${a.email})` : ''}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                    <div style={{ marginBottom: 4 }}>
                                                        ├─ Cost Approval: <strong>{workflowPreview.costApprovalRequired ? 'Required' : 'Not Required'}</strong>
                                                    </div>
                                                    <div>
                                                        └─ Routing To: <strong>{(workflowPreview.emailRouting?.to || []).join(', ') || '—'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {!workflowPreviewLoading && !workflowPreview && selectedProjectId && (
                                            <span style={{ fontSize: '0.85rem', color: '#5E6C84' }}>
                                                Default workflow settings apply for this project.
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div className="form-info-box">
                                    <Mail size={16} />
                                    <span>
                                        Notifications use the project workflow (To / CC / BCC). Your CC list is included on
                                        ticket threads where applicable.
                                    </span>
                                </div>
                                
                                <div className="form-checkbox">
                                    <input 
                                        type="checkbox"
                                        id="managerApproval"
                                        checked={formData.managerApprovalRequired}
                                        onChange={e => setFormData({ ...formData, managerApprovalRequired: e.target.checked })}
                                    />
                                    <label htmlFor="managerApproval">
                                        Manager Approval Required
                                        {workflowPreview && (workflowPreview.approvalLevels || []).length > 0 && (
                                            <span className="mandatory-note"> (Configured from project workflow)</span>
                                        )}
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
