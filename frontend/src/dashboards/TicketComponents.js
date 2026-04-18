import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, memo } from 'react';
import { createPortal } from 'react-dom';
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
    Forward,
    RotateCcw,
    Lock,
    Paperclip,
    Image,
    File,
    Download,
    ZoomIn,
    Eye
} from 'lucide-react';
import { 
    TICKET_STATUS,
    TICKET_FILTER_BUCKET,
    getStatusColors,
    REQUEST_TYPES,
    REQUEST_TYPE_TO_API_ENUM,
    ENVIRONMENTS,
    normalizeEnvironmentLabel,
    getDynamicAllowedTransitions,
    createTicket,
    updateTicketStatus,
    addTicketNote,
    uploadNoteAttachments,
    getSavedCcEmails,
    saveCcEmail,
    toDisplayTicketStatus,
    ticketRequesterMatchesCurrentUser,
    getTicketAssigneeDisplay,
    NOTE_ATTACHMENT_MAX_BYTES,
    NOTE_ATTACHMENT_MAX_MB
} from '../services/ticketService';
import { getEffectiveWorkflow } from '../services/projectWorkflowService';
import { fetchWorkflowDirectoryContacts } from "../services/workflowDirectoryService";
import EmailChipsInput from "../components/EmailChipsInput";
import { useTheme } from "../services/ThemeContext";
import { useToast } from "../services/ToastNotification";

/** Tint overlay for ticket type strip (works on light + dark card backgrounds). */
function hexWithAlpha(hex, alpha) {
    if (!hex || typeof hex !== "string" || hex[0] !== "#") return hex;
    const core = hex.length >= 7 ? hex.slice(1, 7) : "";
    if (!/^[0-9a-fA-F]{6}$/.test(core)) return hex;
    const r = parseInt(core.slice(0, 2), 16);
    const g = parseInt(core.slice(2, 4), 16);
    const b = parseInt(core.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function runtimeBarToneForStatus(st, theme) {
    const d = theme === "dark" || theme === "devops";
    if (st === "CLOSED" || st === "REJECTED") {
        return d ? { color: "#a3a3a3", bg: "rgba(255,255,255,0.08)", label: "Closed" } : { color: "#6b7280", bg: "#f9fafb", label: "Closed" };
    }
    if (st === "MANAGER_APPROVAL_PENDING") {
        return d ? { color: "#fcd34d", bg: "rgba(245, 158, 11, 0.2)", label: "Pending Approval" } : { color: "#b45309", bg: "#fffbeb", label: "Pending Approval" };
    }
    if (st === "COST_APPROVAL_PENDING") {
        return d ? { color: "#fdba74", bg: "rgba(249, 115, 22, 0.2)", label: "Cost Review" } : { color: "#c2410c", bg: "#fff7ed", label: "Cost Review" };
    }
    if (st === "MANAGER_APPROVED") {
        return d ? { color: "#86efac", bg: "rgba(34, 197, 94, 0.18)", label: "Approved" } : { color: "#15803d", bg: "#f0fdf4", label: "Approved" };
    }
    if (st === "COST_APPROVED") {
        return d ? { color: "#6ee7b7", bg: "rgba(16, 185, 129, 0.18)", label: "Cost Approved" } : { color: "#059669", bg: "#ecfdf5", label: "Cost Approved" };
    }
    if (st === "COMPLETED" || st === "IN_PROGRESS") {
        return d ? { color: "#6ee7b7", bg: "rgba(34, 197, 94, 0.16)", label: "Processing" } : { color: "#059669", bg: "#ecfdf5", label: "Processing" };
    }
    if (st === "ACTION_REQUIRED" || st === "ON_HOLD") {
        return d ? { color: "#fcd34d", bg: "rgba(245, 158, 11, 0.16)", label: "Waiting" } : { color: "#b45309", bg: "#fffbeb", label: "Waiting" };
    }
    return d ? { color: "#93c5fd", bg: "rgba(59, 130, 246, 0.18)", label: "Active" } : { color: "#1d4ed8", bg: "#eff6ff", label: "Active" };
}

function flowPillStyleForTone(tone, theme) {
    const d = theme === "dark" || theme === "devops";
    if (tone === "green") {
        return d
            ? { background: "rgba(34, 197, 94, 0.18)", color: "#86efac", border: "1px solid rgba(74, 222, 128, 0.32)" }
            : { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" };
    }
    if (tone === "red") {
        return d
            ? { background: "rgba(239, 68, 68, 0.18)", color: "#fca5a5", border: "1px solid rgba(248, 113, 113, 0.35)" }
            : { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" };
    }
    if (tone === "amber") {
        return d
            ? { background: "rgba(245, 158, 11, 0.18)", color: "#fcd34d", border: "1px solid rgba(251, 191, 36, 0.35)" }
            : { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" };
    }
    return d
        ? { background: "rgba(59, 130, 246, 0.18)", color: "#93c5fd", border: "1px solid rgba(147, 197, 253, 0.35)" }
        : { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
}

// Status configuration with icons and simplified labels for dropdowns
export const STATUS_DISPLAY_CONFIG = {
    [TICKET_STATUS.CREATED]: { 
        icon: CircleDot, 
        label: 'New Request',
        shortLabel: 'New'
    },
    [TICKET_STATUS.ACCEPTED]: { 
        icon: UserCheck, 
        label: 'Assigned',
        shortLabel: 'Assigned'
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
    const { theme } = useTheme();
    const palette = getStatusColors(theme);
    const colors = palette[status] || { bg: "#e5e7eb", text: "#4b5563" };
    
    // Simplified display labels for cleaner UI
    const getDisplayLabel = () => {
        switch (status) {
            case TICKET_STATUS.CREATED:
                return 'New';
            case TICKET_STATUS.ACCEPTED:
                return 'Assigned';
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
                return <UserCheck size={iconSize} />;
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
        { key: TICKET_STATUS.ACCEPTED, label: 'Assigned' },
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
        .replace(/\b(USD|INR|AED|QAR|SAR|EUR|GBP|CAD|AUD|NZD|RIAL)\s*[\d,]+(?:\.\d+)?\b/gi, "***")
        .replace(/\b[\d,]+(?:\.\d+)?\s*(USD|INR|AED|QAR|SAR|EUR|GBP|CAD|AUD|NZD)\b/gi, "***")
        .replace(/\$\s*[\d,]+(?:\.\d+)?/g, "***")
        .replace(/€\s*[\d,]+(?:\.\d+)?/g, "***")
        .replace(/£\s*[\d,]+(?:\.\d+)?/g, "***");
};

// ─── Attachment helpers ───────────────────────────────────────────────────────

/** Derive a display filename from a blob URL (last two segments: uuid/name). */
const getAttachmentName = (url) => {
    try {
        const parts = decodeURIComponent(new URL(url).pathname).split('/');
        return parts[parts.length - 1] || 'Attachment';
    } catch {
        return url.split('/').pop() || 'Attachment';
    }
};

const getAttachmentType = (url) => {
    const name = getAttachmentName(url).toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/.test(name)) return 'image';
    if (/\.pdf$/.test(name)) return 'pdf';
    return 'file';
};

const isImageUrl = (url) => getAttachmentType(url) === 'image';
const isPdfUrl = (url) => getAttachmentType(url) === 'pdf';

/** Lightbox / embedded viewer for images and PDFs. */
const AttachmentViewer = ({ attachment, onClose }) => {
    if (!attachment) return null;
    const { url, name } = attachment;
    const type = getAttachmentType(url);
    const displayName = name || getAttachmentName(url);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.82)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                backdropFilter: 'blur(4px)',
            }}
        >
            {/* header */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 12, gap: 8,
                }}
            >
                <span style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 120px)' }}>
                    {displayName}
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a
                        href={url}
                        download={displayName}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '6px 12px', borderRadius: 8,
                            background: '#1e293b', color: '#94a3b8',
                            fontSize: '0.8rem', textDecoration: 'none', border: '1px solid #334155',
                        }}
                    >
                        <Download size={14} /> Download
                    </a>
                    <button
                        onClick={onClose}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '6px 12px', borderRadius: 8,
                            background: '#1e293b', color: '#e2e8f0',
                            fontSize: '0.8rem', border: '1px solid #334155', cursor: 'pointer',
                        }}
                    >
                        <X size={14} /> Close
                    </button>
                </div>
            </div>

            {/* content */}
            {type === 'image' && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: 900, maxHeight: '80vh', borderRadius: 10, overflow: 'hidden', background: '#0f172a' }}
                >
                    <img
                        src={url}
                        alt={displayName}
                        style={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                        onError={(e) => { e.target.alt = 'Could not load image'; }}
                    />
                </div>
            )}

            {type === 'pdf' && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: 900, height: '80vh', borderRadius: 10, overflow: 'hidden', background: 'var(--card-bg, #fff)' }}
                >
                    <embed
                        src={url}
                        type="application/pdf"
                        width="100%"
                        height="100%"
                        style={{ border: 'none' }}
                    />
                </div>
            )}

            {type === 'file' && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: '#1e293b', borderRadius: 12, padding: '32px 40px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                        border: '1px solid #334155',
                    }}
                >
                    <File size={48} color="#64748b" />
                    <p style={{ color: '#e2e8f0', margin: 0, fontSize: '1rem', fontWeight: 500 }}>{displayName}</p>
                    <a
                        href={url}
                        download={displayName}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '10px 20px', borderRadius: 8,
                            background: '#2563eb', color: '#fff',
                            fontSize: '0.875rem', textDecoration: 'none', fontWeight: 600,
                        }}
                    >
                        <Download size={16} /> Download file
                    </a>
                </div>
            )}
        </div>
    );
};

/** Single attachment chip shown in timeline. */
const AttachmentChip = ({ url, name, onView }) => {
    const displayName = name || getAttachmentName(url);
    const type = getAttachmentType(url);

    return (
        <div
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                background: 'var(--surface-muted, #f1f5f9)', border: '1px solid var(--border-color, #e2e8f0)',
                fontSize: '0.78rem', color: 'var(--text-sub, #334155)', maxWidth: 280,
                cursor: 'pointer',
            }}
            onClick={() => onView({ url, name: displayName })}
            title={`Click to view: ${displayName}`}
        >
            {type === 'image' ? <Image size={13} color="#2563eb" /> :
             type === 'pdf' ? <FileText size={13} color="#dc2626" /> :
             <File size={13} color="#64748b" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {displayName}
            </span>
            <Eye size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
        </div>
    );
};

export const TicketTimeline = memo(function TicketTimeline({ timeline = [], maskSensitive = false }) {
    const { theme } = useTheme();
    const statusPalette = getStatusColors(theme);
    const [viewing, setViewing] = useState(null); // { url, name }

    const timelineItems = useMemo(() => {
        if (!timeline || timeline.length === 0) return [];
        return timeline.map((entry, index) => {
            const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
            const imageAttachments = attachments.filter(isImageUrl);
            const nonImageAttachments = attachments.filter((u) => !isImageUrl(u));
            return { entry, index, imageAttachments, nonImageAttachments };
        });
    }, [timeline]);

    if (!timeline || timeline.length === 0) {
        return <div className="timeline-empty">No timeline entries</div>;
    }

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <>
            {viewing && <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />}
            <div className="ticket-timeline">
                {timelineItems.map(({ entry, index, imageAttachments, nonImageAttachments }) => (
                    <div key={index} className={`timeline-entry ${entry.isNote ? 'is-note' : ''}`}>
                        <div className="timeline-marker">
                            <div className="timeline-dot" style={{
                                background: entry.isNote ? "var(--border-color, #d1d5db)" : (statusPalette[entry.status]?.text || "var(--text-muted, #d1d5db)")
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
                            {(imageAttachments.length > 0 || nonImageAttachments.length > 0) && (
                                <div style={{ marginTop: 8 }}>
                                    {/* Image thumbnails */}
                                    {imageAttachments.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                            {imageAttachments.map((url, idx) => (
                                                <div
                                                    key={`img-${idx}`}
                                                    onClick={() => setViewing({ url, name: getAttachmentName(url) })}
                                                    style={{
                                                        width: 80, height: 80, borderRadius: 8,
                                                        overflow: 'hidden', cursor: 'pointer',
                                                        border: '2px solid var(--border-color, #e2e8f0)', position: 'relative',
                                                        flexShrink: 0, background: 'var(--surface-muted, #f1f5f9)',
                                                    }}
                                                    title="Click to view"
                                                >
                                                    <img
                                                        src={url}
                                                        alt={getAttachmentName(url)}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                    <div style={{
                                                        position: 'absolute', inset: 0,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: 'rgba(0,0,0,0)', transition: 'background 0.15s',
                                                    }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0)'}
                                                    >
                                                        <ZoomIn size={18} color="#fff" style={{ opacity: 0.9 }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Non-image chips */}
                                    {nonImageAttachments.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {nonImageAttachments.map((url, idx) => (
                                                <AttachmentChip
                                                    key={`file-${idx}`}
                                                    url={url}
                                                    onView={setViewing}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
});

// ============ TYPE ACCENT COLORS ============
const TYPE_ACCENT = {
    'New Environment':       { border: '#6d28d9', bg: '#f5f3ff', icon: '#6d28d9' },
    'Environment Up':        { border: '#15803d', bg: '#f0fdf4', icon: '#15803d' },
    'Environment Down':      { border: '#dc2626', bg: '#fef2f2', icon: '#dc2626' },
    'Release Deployment':    { border: '#1d4ed8', bg: '#eff6ff', icon: '#1d4ed8' },
    'Issue Fix':             { border: '#b45309', bg: '#fffbeb', icon: '#b45309' },
    'Build Request':         { border: '#0e7490', bg: '#ecfeff', icon: '#0e7490' },
    'General Request':       { border: '#0369a1', bg: '#e0f2fe', icon: '#0369a1' },
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
        case 'General Request':       return <FileText size={size} />;
        case 'Code Cut':              return <Tag size={size} />;
        default:                      return <FileText size={size} />;
    }
};

// ============ TICKET CARD COMPONENT ============
function TicketCardInner({
    ticket,
    onClick,
    /** Stable handler from parent (e.g. ref + useCallback) — preferred over `onClick` for list open to avoid row re-renders. */
    onOpenById,
    showActions = false,
    onStatusChange,
    user,
    highlightAssigned = false
}) {
    const { theme } = useTheme();
    const toast = useToast();
    const [expanded, setExpanded] = useState(false);
    const handleCardActivate = useCallback(() => {
        if (typeof onOpenById === "function") onOpenById(ticket.id);
        else onClick?.();
    }, [onClick, onOpenById, ticket.id]);
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
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Pick up the most relevant service detail 
    const serviceDetail = ticket.releaseVersion || ticket.branchName || ticket.issueType || ticket.databaseType || ticket.deploymentStrategy || null;

    const assignedDisplay = getTicketAssigneeDisplay(ticket);
    const shouldHighlightAssignedCard = highlightAssigned && assignedDisplay.length > 0;
    const handleCopyTicketId = async (e) => {
        e.stopPropagation();
        const ticketId = String(ticket?.id || "").trim();
        if (!ticketId) return;
        try {
            await navigator.clipboard.writeText(ticketId);
            toast.success("Copied", `Ticket ID ${ticketId} copied`);
        } catch {
            toast.error("Copy failed", "Could not copy ticket ID");
        }
    };

    return (
        <div
            className={`jira-ticket-card ${isActionRequired ? 'status-glow' : ''}`}
            onClick={handleCardActivate}
            style={{
                borderLeftColor: accent.border,
                borderLeftWidth: 4,
                backgroundColor: "var(--card-bg, #ffffff)",
                backgroundImage: shouldHighlightAssignedCard
                    ? `linear-gradient(135deg, ${hexWithAlpha("#bfdbfe", theme === "light" || theme === "retro" ? 0.55 : 0.35)} 0%, transparent 65%)`
                    : `linear-gradient(135deg, ${hexWithAlpha(accent.bg, theme === "light" || theme === "retro" ? 0.42 : 0.28)} 0%, transparent 55%)`,
                boxShadow: shouldHighlightAssignedCard
                    ? "0 0 0 1px rgba(37,99,235,0.45), 0 2px 10px rgba(37,99,235,0.12)"
                    : undefined
            }}
        >
            {/* ── Main row ── */}
            <div className="jtc-row">

                {/* Centre: title + meta chips */}
                <div className="jtc-centre">
                    <h3
                        className="jtc-title jtc-title-clickable"
                        onClick={handleCopyTicketId}
                        title="Click to copy ticket ID"
                        style={{ color: accent.icon }}
                    >
                        {ticket.id || "—"}
                    </h3>
                    <div className="jtc-meta">
                        <span className="jtc-type-badge" style={{ color: accent.icon, borderColor: `${accent.icon}44`, background: `${accent.icon}14` }}>
                            {ticket.requestType || "General Request"}
                        </span>
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
                        <div className="jtc-people-names">
                            <span className="jtc-person-line" title={ticket.requestedBy || "Unknown User"}>
                                User: {ticket.requestedBy || "Unknown User"}
                            </span>
                            <span className={`jtc-person-line ${assignedDisplay ? "assigned" : ""}`} title={assignedDisplay || "Unassigned"}>
                                Assigned: {assignedDisplay || "Unassigned"}
                            </span>
                        </div>
                        <span className="jtc-date" title={formatDate(ticket.updatedAt || ticket.createdAt)}>
                            {formatDate(ticket.updatedAt || ticket.createdAt)}
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
}

// Not memoized: assignee/status updates must always repaint the row (memo + merge edge cases left "Assigned: Unassigned" stale).
export const TicketCard = TicketCardInner;

/** @deprecated Use `TicketCard` with `onOpenById` — kept as an alias for existing imports. */
export const TicketCardClickable = TicketCard;

// ============ TICKET FILTERS COMPONENT ============
export const TicketFilters = ({
    filters,
    onFilterChange,
    hideAssignMeOption = false,
    hideStatusFilter = false,
    showAssigneeFilter = false,
    assigneeOptions = [],
    searchPlaceholder = "Filter this list (id, product, assignee…)",
    /** When true, hides the free-text "Refine" search row (e.g. User dashboard). */
    hideRefineSearch = false
}) => {
    useEffect(() => {
        if (!hideAssignMeOption) return;
        if (filters.status !== TICKET_FILTER_BUCKET.ASSIGNED_ME) return;
        onFilterChange({ ...filters, status: null });
    }, [hideAssignMeOption, filters, onFilterChange]);

    const statusValue =
        hideAssignMeOption && filters.status === TICKET_FILTER_BUCKET.ASSIGNED_ME
            ? ""
            : filters.status || "";
    return (
        <div className="ticket-filters">
            {!hideStatusFilter && (
                <div className="filter-group">
                    <label>Status</label>
                    <select 
                        value={statusValue} 
                        onChange={e => onFilterChange({ ...filters, status: e.target.value })}
                    >
                        <option value={TICKET_FILTER_BUCKET.ALL}>All</option>
                        <option value={TICKET_FILTER_BUCKET.UNASSIGNED}>Unassigned</option>
                        {!hideAssignMeOption && (
                            <option value={TICKET_FILTER_BUCKET.ASSIGNED_ME}>Assign me</option>
                        )}
                        <option value={TICKET_FILTER_BUCKET.IN_PROGRESS}>In progress</option>
                        <option value={TICKET_FILTER_BUCKET.PENDING}>Pending</option>
                        <option value={TICKET_FILTER_BUCKET.COMPLETED}>Completed</option>
                        <option value={TICKET_FILTER_BUCKET.CLOSED}>Closed</option>
                    </select>
                </div>
            )}
            
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
            {showAssigneeFilter && (
                <div className="filter-group">
                    <label>DevOps member</label>
                    <select
                        value={filters.assignedTo || ''}
                        onChange={e => onFilterChange({ ...filters, assignedTo: e.target.value || null })}
                    >
                        <option value="">All DevOps members</option>
                        {assigneeOptions.map((member) => (
                            <option key={member.value} value={member.value}>
                                {member.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            
            {!hideRefineSearch && (
                <div className="filter-group filter-group--search-wide">
                    <label>Refine</label>
                    <input 
                        type="search"
                        className="ticket-filter-search-input"
                        placeholder={searchPlaceholder}
                        value={filters.search || ''}
                        onChange={e => onFilterChange({ ...filters, search: e.target.value || null })}
                    />
                </div>
            )}
        </div>
    );
};

/** DevOps/Admin manual status list only — workflow steps (manager/cost approved, on hold, etc.) are driven by approvals, not this menu. */
const DEVOPS_EXPLICIT_STATUS_OPTIONS = [
    TICKET_STATUS.CREATED,
    TICKET_STATUS.ACCEPTED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.COMPLETED,
    TICKET_STATUS.CLOSED,
];

const REOPEN_ACTION_VALUE = "REOPEN::APPLY";
const ASSIGN_SELF_ACTION_VALUE = "ASSIGN_SELF::APPLY";
/** DevOps: placeholder menu row (must stay enabled so the action menu can open; Apply is disabled for this value). */
const DEVOPS_NO_ACTIONS_INFO = "__DEVOPS_NO_ACTIONS__";

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

/**
 * Custom action menu (replaces native &lt;select&gt;) so options use in-app styling and stay readable.
 * Renders the list in a portal with position:fixed to avoid modal overflow clipping.
 */
function TicketActionMenu({
    menuId,
    groups,
    selectedValue,
    onChangeValue,
    placeholder = "Choose an action…",
}) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 280 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);

    const selectedLabel = useMemo(() => {
        if (!selectedValue) return null;
        for (const g of groups) {
            const it = g.items.find((i) => i.value === selectedValue);
            if (it) return it.label;
        }
        return null;
    }, [selectedValue, groups]);

    const hasChoices = groups.some((g) => g.items.some((i) => !i.disabled));

    const syncPosition = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 10;
        const maxH = Math.min(360, Math.max(120, vh - r.bottom - pad - 20));
        let width = Math.max(r.width, 300);
        let left = r.left;
        if (left + width > vw - pad) left = Math.max(pad, vw - width - pad);
        let top = r.bottom + 6;
        const spaceBelow = vh - r.bottom - pad;
        const spaceAbove = r.top - pad;
        if (spaceBelow < 160 && spaceAbove > spaceBelow) {
            const h = Math.min(360, Math.max(120, spaceAbove - 20));
            top = r.top - 6 - h;
            setPos({ top, left, width, maxH: h });
            return;
        }
        setPos({ top, left, width, maxH });
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        syncPosition();
    }, [open, syncPosition]);

    useEffect(() => {
        if (!open) return;
        const onScroll = () => syncPosition();
        const onResize = () => syncPosition();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open, syncPosition]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const displayText = selectedLabel || placeholder;

    const menuPortal =
        open && hasChoices
            ? createPortal(
                  <div
                      ref={menuRef}
                      className="jdm-ticket-action-menu-portal"
                      style={{
                          position: 'fixed',
                          top: pos.top,
                          left: pos.left,
                          width: pos.width,
                          maxHeight: pos.maxH,
                          zIndex: 10060,
                      }}
                      role="listbox"
                      aria-labelledby={menuId}
                  >
                      <div className="jdm-ticket-action-menu-scroller">
                          {groups.map((group, gi) => (
                              <div key={gi} className="jdm-ticket-action-menu-group">
                                  {group.title ? (
                                      <div className="jdm-ticket-action-menu-group-title">{group.title}</div>
                                  ) : null}
                                  {group.items.map((item, ii) => (
                                      <button
                                          key={item.value ? `${item.value}-${gi}-${ii}` : `row-${gi}-${ii}`}
                                          type="button"
                                          role="option"
                                          aria-selected={selectedValue === item.value}
                                          disabled={item.disabled}
                                          className={`jdm-ticket-action-menu-item ${
                                              selectedValue === item.value ? 'is-selected' : ''
                                          } ${item.disabled ? 'is-disabled' : ''}`}
                                          onClick={() => {
                                              if (item.disabled) return;
                                              onChangeValue(item.value);
                                              setOpen(false);
                                          }}
                                      >
                                          {item.label}
                                      </button>
                                  ))}
                              </div>
                          ))}
                      </div>
                  </div>,
                  document.body
              )
            : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                id={menuId}
                className={`jdm-ticket-action-trigger ${open ? 'is-open' : ''} ${!hasChoices ? 'is-disabled' : ''}`}
                disabled={!hasChoices}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Ticket action"
                onClick={() => hasChoices && setOpen((o) => !o)}
            >
                <span className={`jdm-ticket-action-trigger-text ${!selectedValue ? 'is-placeholder' : ''}`}>
                    {displayText}
                </span>
                <ChevronDown
                    size={18}
                    strokeWidth={2}
                    className={`jdm-ticket-action-trigger-chev ${open ? 'is-flip' : ''}`}
                    aria-hidden
                />
            </button>
            {menuPortal}
        </>
    );
}

/**
 * Ticket-driven fields for TicketDetailsModal only (not note/selection state), so typing in the
 * modal does not rebuild action menus, approval lists, and dropdown groups on every keystroke.
 */
function buildTicketDetailsModalDerived(ticket, canManage, canSubmitCostEstimate, user, onAssignToSelf, onForward) {
    const ticketIsDeleted = !!ticket.deleted;
    const effectiveCanManage = canManage && !ticketIsDeleted;
    const effectiveCostEstimate = canSubmitCostEstimate && !ticketIsDeleted;

    const accent = getTypeAccent(ticket.requestType);

    const getStatusActionLabel = (status) => {
        if (status === TICKET_STATUS.ACCEPTED) return "Assign";
        const config = STATUS_DISPLAY_CONFIG[status];
        if (status === TICKET_STATUS.COST_APPROVAL_PENDING) return "Submit cost estimate";
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
        const label = effectiveCanManage ? `${role} — ${name} · ${p.email}` : `${role} — ${name}`;
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
        effectiveCostEstimate
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
                          label: "Cost approval — open estimate tool",
                          type: "openCostTool"
                      }
                  ]
            : [];

    const managerRespondedApproved = String(ticket.managerApprovalStatus || "").toUpperCase() === "APPROVED";
    const approvalActionsForUser = approvalActions;

    const userCloseAction = ticket.status !== TICKET_STATUS.CLOSED
        ? [{ value: `STATUS::${TICKET_STATUS.CLOSED}`, label: "Close ticket", type: "status", status: TICKET_STATUS.CLOSED }]
        : [];

    const isRequesterReopen = !canManage && ticketRequesterMatchesCurrentUser(ticket, user);

    const userReopenSelectAction =
        ticket.status === TICKET_STATUS.CLOSED && isRequesterReopen
            ? [{ value: REOPEN_ACTION_VALUE, label: "Reopen ticket", type: "reopen" }]
            : [];

    const getDevOpsActionLabel = (status) => {
        switch (status) {
            case TICKET_STATUS.CREATED:
                return "Ticket raised (unassigned queue)";
            case TICKET_STATUS.ACCEPTED:
                return "Assigned";
            case TICKET_STATUS.IN_PROGRESS:
                return "In progress";
            case TICKET_STATUS.COMPLETED:
                return "Completed";
            case TICKET_STATUS.CLOSED:
                return "Closed";
            default:
                return getStatusActionLabel(status);
        }
    };

    const inDevOpsUnassignedQueue =
        effectiveCanManage &&
        ticket.status === TICKET_STATUS.CREATED;
    const smartTransitions = effectiveCanManage && !inDevOpsUnassignedQueue ? [...DEVOPS_EXPLICIT_STATUS_OPTIONS] : [];
    const defaultActions = effectiveCanManage
        ? inDevOpsUnassignedQueue && typeof onAssignToSelf === "function"
            ? [{ value: ASSIGN_SELF_ACTION_VALUE, label: "Assign", type: "assign-self" }]
            : smartTransitions.map((s) => ({
                  value: `STATUS::${s}`,
                  label: getDevOpsActionLabel(s),
                  type: "status",
                  status: s,
              }))
        : [];

    const selectableActions = effectiveCanManage
        ? [...defaultActions, ...approvalActions, ...costApprovalActions]
        : [...userReopenSelectAction, ...userCloseAction, ...approvalActionsForUser];

    const actionDropdownGroups = [];
    if (effectiveCanManage && defaultActions.length > 0) {
        actionDropdownGroups.push({
            title: "Status",
            items: defaultActions.map((a) => ({ value: a.value, label: a.label })),
        });
    }
    if (!canManage && userReopenSelectAction.length > 0) {
        actionDropdownGroups.push({
            title: "Closed ticket",
            items: userReopenSelectAction.map((a) => ({ value: a.value, label: a.label })),
        });
    }
    if (!canManage && userCloseAction.length > 0) {
        actionDropdownGroups.push({
            title: "Actions",
            items: userCloseAction.map((a) => ({ value: a.value, label: a.label })),
        });
    }
    if (effectiveCanManage && (approvalActions.length > 0 || costApprovalActions.length > 0)) {
        actionDropdownGroups.push({
            title: "Request & cost approval",
            items: [
                ...approvalActions.map((a) => ({ value: a.value, label: a.label })),
                ...costApprovalActions.map((a) => ({ value: a.value, label: a.label })),
            ],
        });
    }
    if (!canManage && approvalActions.length > 0) {
        actionDropdownGroups.push({
            title: "Send for approval",
            items: approvalActions.map((a) => ({ value: a.value, label: a.label })),
        });
    }
    if (
        effectiveCanManage &&
        defaultActions.length === 0 &&
        approvalActions.length === 0 &&
        costApprovalActions.length === 0
    ) {
        actionDropdownGroups.push({
            title: "",
            items: [
                {
                    value: DEVOPS_NO_ACTIONS_INFO,
                    label: inDevOpsUnassignedQueue
                        ? "Assign this ticket from the list first — then status and workflow actions appear here"
                        : "No workflow actions — add approvers / cost approvers in project workflow settings",
                    disabled: false,
                },
            ],
        });
    }

    const canForwardTicket =
        typeof onForward === "function" &&
        !ticketIsDeleted &&
        !!ticket.assignedTo &&
        ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(ticket.status);

    return {
        ticketIsDeleted,
        effectiveCanManage,
        effectiveCostEstimate,
        accent,
        configuredApprovalPeople,
        approvalActions,
        requiresCostApproval,
        managerRespondedApproved,
        isRequesterReopen,
        inDevOpsUnassignedQueue,
        selectableActions,
        actionDropdownGroups,
        canForwardTicket,
    };
}

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
    onForward,
    /** DevOps: quick claim action for unassigned queue */
    onAssignToSelf,
    /** Admin: restore soft-deleted ticket from recycle bin */
    onRestoreTicket
}) => {
    const toast = useToast();
    const [note, setNote] = useState('');
    const [reopenNote, setReopenNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    // Each item: { file, name, size, status: 'pending'|'uploading'|'done'|'error', url?, error? }
    const [pendingFiles, setPendingFiles] = useState([]);
    const [showApprovalEditor, setShowApprovalEditor] = useState(false);
    const [approvalEditorText, setApprovalEditorText] = useState('');
    const [approvalEditorHtml, setApprovalEditorHtml] = useState('');
    const noteFileInputRef = useRef(null);
    /** DevOps: workflow cost approver chosen in Actions dropdown (sent with cost submission). */
    const [pendingCostApproverEmail, setPendingCostApproverEmail] = useState(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (ticket?.id) {
            setPendingCostApproverEmail(null);
            setReopenNote("");
        }
    }, [ticket?.id]);

    const actionFlowItems = useMemo(() => {
        if (!ticket) return [];
        const effectiveCanManageForFlow = canManage && !ticket.deleted;
        const flowTimelineSource = dedupeConsecutiveStatusTimeline(
            (ticket.timeline || []).filter((entry) => !entry?.isNote)
        );
        let mgrPendingRound = 0;
        let mgrApprovedRound = 0;
        let costPendingRound = 0;
        let costApprovedRound = 0;

        return flowTimelineSource.map((entry, idx) => {
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
                label = "Assigned";
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
            const rawNotes = entry?.notes ? normalizeFlowNotes(entry.notes).slice(0, 80) : '';
            const notesForTooltip = effectiveCanManageForFlow ? rawNotes : maskCostText(rawNotes);
            return { id: `${entry?.timestamp || "x"}-${idx}`, label, tone, user: entry?.user || '', timestamp: entry?.timestamp || '', notes: notesForTooltip };
        });
    }, [ticket, canManage]);

    const modalDerived = useMemo(
        () =>
            ticket
                ? buildTicketDetailsModalDerived(
                      ticket,
                      canManage,
                      canSubmitCostEstimate,
                      user,
                      onAssignToSelf,
                      onForward
                  )
                : null,
        [ticket, canManage, canSubmitCostEstimate, user, onAssignToSelf, onForward]
    );

    const runtimeBarTone = useMemo(() => {
        if (!ticket) return runtimeBarToneForStatus("", theme);
        return runtimeBarToneForStatus(timelineStatusKey(ticket.status), theme);
    }, [ticket, theme]);

    if (!ticket) return null;
    const assigneeDisplayLine = getTicketAssigneeDisplay(ticket);
    const handleCopyTicketId = async () => {
        const ticketId = String(ticket?.id || "").trim();
        if (!ticketId) return;
        try {
            await navigator.clipboard.writeText(ticketId);
            toast.success("Copied", `Ticket ID ${ticketId} copied`);
        } catch {
            toast.error("Copy failed", "Could not copy ticket ID");
        }
    };

    const {
        ticketIsDeleted,
        effectiveCanManage,
        effectiveCostEstimate,
        accent,
        configuredApprovalPeople,
        approvalActions,
        requiresCostApproval,
        managerRespondedApproved,
        isRequesterReopen,
        inDevOpsUnassignedQueue,
        selectableActions,
        actionDropdownGroups,
        canForwardTicket,
    } = modalDerived;

    const selectedApprovalAction = selectedStatus.startsWith("APPROVAL::")
        ? approvalActions.find((a) => a.value === selectedStatus)
        : null;

    const applySelectedAction = (actionNoteText) => {
        if (!selectedStatus) return;

        if (selectedStatus === DEVOPS_NO_ACTIONS_INFO) {
            setSelectedStatus("");
            return;
        }

        if (selectedStatus === OPEN_COST_TOOL_ACTION) {
            if (!effectiveCostEstimate || !onRequestCostApproval) return;
            onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
            setSelectedStatus("");
            return;
        }
        if (selectedStatus === ASSIGN_SELF_ACTION_VALUE) {
            if (typeof onAssignToSelf === "function") onAssignToSelf(ticket.id);
            setSelectedStatus("");
            return;
        }

        if (selectedStatus.startsWith(COST_APPROVAL_PREFIX)) {
            if (!effectiveCostEstimate || !onRequestCostApproval) return;
            const email = selectedStatus.slice(COST_APPROVAL_PREFIX.length).trim();
            if (email) {
                setPendingCostApproverEmail(email);
                onRequestCostApproval(ticket, { costApproverEmail: email });
            }
            setSelectedStatus("");
            return;
        }

        if (!onStatusChange) return;

        if (selectedStatus === REOPEN_ACTION_VALUE) {
            const r = reopenNote.trim();
            if (!r) return;
            onStatusChange(
                ticket.id,
                TICKET_STATUS.CREATED,
                `Ticket reopened — returned to unassigned queue. Requester note: ${r}`,
                { reopen: true }
            );
            setReopenNote("");
            setNote("");
            setSelectedStatus("");
            return;
        }

        if (selectedStatus.startsWith("STATUS::")) {
            const statusValue = selectedStatus.replace("STATUS::", "");
            if (statusValue === TICKET_STATUS.COST_APPROVAL_PENDING && effectiveCostEstimate && onRequestCostApproval) {
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
        if (selectedStatus === TICKET_STATUS.COST_APPROVAL_PENDING && effectiveCostEstimate && onRequestCostApproval) {
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
        if (value === OPEN_COST_TOOL_ACTION && effectiveCostEstimate && onRequestCostApproval) {
            onRequestCostApproval(ticket, { costApproverEmail: pendingCostApproverEmail || undefined });
            setSelectedStatus("");
            return;
        }
        if (effectiveCostEstimate && onRequestCostApproval && value.startsWith(COST_APPROVAL_PREFIX)) {
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
        const urls = pendingFiles.filter((f) => f.status === 'done').map((f) => f.url);
        if (note.trim() && onAddNote) {
            onAddNote(ticket.id, note, urls);
            setNote('');
            setPendingFiles([]);
            if (noteFileInputRef.current) noteFileInputRef.current.value = '';
        }
    };

    const handleNoteFiles = async (files) => {
        const MAX_SIZE = NOTE_ATTACHMENT_MAX_BYTES;
        const list = Array.from(files || []).slice(0, 10);

        // Validate client-side first
        const withValidation = list.map((f) => ({
            file: f,
            name: f.name,
            size: f.size,
            status: f.size > MAX_SIZE ? 'error' : 'pending',
            error: f.size > MAX_SIZE ? `Exceeds ${NOTE_ATTACHMENT_MAX_MB} MB limit` : null,
            url: null,
        }));

        setPendingFiles((prev) => [...prev, ...withValidation]);
        if (noteFileInputRef.current) noteFileInputRef.current.value = '';

        // Upload valid files one by one and track progress
        for (let i = 0; i < withValidation.length; i++) {
            const item = withValidation[i];
            if (item.status !== 'pending') continue;

            // Mark as uploading
            setPendingFiles((prev) =>
                prev.map((p) => p.name === item.name && p.status === 'pending' ? { ...p, status: 'uploading' } : p)
            );

            try {
                const result = await uploadNoteAttachments(ticket.id, [item.file]);
                if (result.uploaded && result.uploaded.length > 0) {
                    const { url } = result.uploaded[0];
                    setPendingFiles((prev) =>
                        prev.map((p) =>
                            p.name === item.name && p.status === 'uploading'
                                ? { ...p, status: 'done', url }
                                : p
                        )
                    );
                } else {
                    const errMsg = result.errors?.[0] || 'Upload failed';
                    setPendingFiles((prev) =>
                        prev.map((p) =>
                            p.name === item.name && p.status === 'uploading'
                                ? { ...p, status: 'error', error: errMsg }
                                : p
                        )
                    );
                }
            } catch (err) {
                setPendingFiles((prev) =>
                    prev.map((p) =>
                        p.name === item.name && p.status === 'uploading'
                            ? { ...p, status: 'error', error: err.message || 'Upload failed' }
                            : p
                    )
                );
            }
        }
    };

    const removePendingFile = (idx) => {
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const isAnyUploading = pendingFiles.some((f) => f.status === 'uploading');
    
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
        <div className="modal-overlay jdm-modal-overlay" onClick={onClose}>
            <div className="jdm-modal" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="jdm-header" style={{ borderTopColor: accent.border }}>
                    <div className="jdm-header-left">
                        <div className="jdm-type-icon" style={{ background: accent.bg, color: accent.icon }}>
                            {getRequestTypeIcon(ticket.requestType, 20)}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="jdm-ticket-id jdm-ticket-id-btn"
                                    onClick={handleCopyTicketId}
                                    title="Click to copy ticket ID"
                                >
                                    {ticket.id}
                                </button>
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
                <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border-color, #e5e7eb)", background: runtimeBarTone.bg }}>
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

                        {ticketIsDeleted && (
                            <div
                                className="jdm-section"
                                style={{
                                    background: "var(--surface-warn, #fffbeb)",
                                    border: "1px solid var(--border-warn, #fcd34d)",
                                    borderRadius: 8
                                }}
                            >
                                <div className="jdm-section-title" style={{ color: "#92400e" }}>
                                    Recycle bin
                                </div>
                                <p className="jdm-description" style={{ marginBottom: onRestoreTicket ? 12 : 0 }}>
                                    This ticket was removed from active queues. It is read-only until restored.
                                    {ticket.deletedAt && (
                                        <>
                                            {" "}
                                            <span style={{ color: "var(--text-muted, #64748b)" }}>
                                                Deleted {new Date(ticket.deletedAt).toLocaleString()}
                                                {ticket.deletedBy ? ` · ${ticket.deletedBy}` : ""}.
                                            </span>
                                        </>
                                    )}
                                </p>
                                {onRestoreTicket && (
                                    <button type="button" className="jdm-btn-primary" onClick={() => onRestoreTicket(ticket.id)}>
                                        Restore ticket
                                    </button>
                                )}
                            </div>
                        )}

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
                                    <span style={{ color: "var(--text-muted, #64748b)", fontSize: "0.85rem" }}>Pending</span>
                                )}
                                {actionFlowItems.map((item, index) => {
                                    const toneStyle = flowPillStyleForTone(item.tone, theme);
                                    return (
                                        <React.Fragment key={item.id}>
                                            <span 
                                                style={{ ...toneStyle, borderRadius: 999, padding: "4px 10px", fontSize: "0.78rem", fontWeight: 600, cursor: item.user ? 'help' : 'default', position: 'relative' }}
                                                title={item.user ? `${item.label}\nBy: ${item.user}${item.timestamp ? '\n' + new Date(item.timestamp).toLocaleString() : ''}${item.notes ? '\n' + item.notes : ''}` : item.label}
                                            >
                                                {item.label}
                                            </span>
                                            {index < actionFlowItems.length - 1 && (
                                                <span style={{ color: "var(--border-color, #d1d5db)", fontWeight: 600 }}>→</span>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        {!canManage &&
                            ticket.status === TICKET_STATUS.CLOSED &&
                            isRequesterReopen && (
                                <div className="jdm-section">
                                    <div className="jdm-section-title">
                                        <RotateCcw size={14} /> Reopen
                                    </div>
                                    <p className="jdm-description" style={{ marginBottom: 12, fontSize: "0.9rem" }}>
                                        Send this request back to the unassigned queue. Full history is kept. Add a short note
                                        for the team (required). You can also choose <strong>Reopen ticket</strong> under
                                        Actions and click Apply.
                                    </p>
                                    <textarea
                                        className="jdm-textarea"
                                        value={reopenNote}
                                        onChange={(e) => setReopenNote(e.target.value)}
                                        placeholder="Why are you reopening? What should the team do next?"
                                        rows={3}
                                        style={{ marginBottom: 12 }}
                                    />
                                    <button
                                        type="button"
                                        className="jdm-btn-primary"
                                        disabled={!reopenNote.trim()}
                                        onClick={() => {
                                            const r = reopenNote.trim();
                                            if (!r || !onStatusChange) return;
                                            onStatusChange(
                                                ticket.id,
                                                TICKET_STATUS.CREATED,
                                                `Ticket reopened — returned to unassigned queue. Requester note: ${r}`,
                                                { reopen: true }
                                            );
                                            setReopenNote("");
                                            setSelectedStatus("");
                                        }}
                                    >
                                        <RotateCcw size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
                                        Reopen ticket
                                    </button>
                                </div>
                            )}

                        {/* Service Details */}
                        <div className="jdm-section">
                            <div className="jdm-section-title">{getRequestTypeIcon(ticket.requestType, 14)} Configuration</div>
                            <div className="jdm-fields-grid">
                                <DetailField icon={Globe} label="Environment" value={ticket.environmentLabel || ticket.environment} />
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
                                <div className="jdm-ticket-action-picker">
                                    <div className="jdm-ticket-action-picker-label">Change status or route</div>
                                    {effectiveCanManage && inDevOpsUnassignedQueue && (
                                        <p className="jdm-hint-text" style={{ marginBottom: 10 }}>
                                            Assign this ticket from the list first — manual status changes unlock after it leaves the
                                            unassigned queue.
                                        </p>
                                    )}
                                    <div className="jdm-ticket-action-picker-row">
                                    <TicketActionMenu
                                        key={ticket.id}
                                        menuId={`ticket-action-${ticket.id}`}
                                        groups={actionDropdownGroups}
                                        selectedValue={selectedStatus}
                                        onChangeValue={handleActionSelectChange}
                                    />
                                    <button
                                        type="button"
                                        className="jdm-btn-primary jdm-ticket-action-apply"
                                        onClick={handleStatusChange}
                                        disabled={
                                            !selectedStatus ||
                                            (selectedStatus === REOPEN_ACTION_VALUE && !reopenNote.trim()) ||
                                            selectedStatus === DEVOPS_NO_ACTIONS_INFO
                                        }
                                    >
                                        Apply
                                    </button>
                                    </div>
                                    <p className="jdm-ticket-action-picker-hint">
                                        Pick a status update or an approval / cost step, then apply. Notes above are sent when relevant.
                                        {selectedStatus === REOPEN_ACTION_VALUE
                                            ? " Reopen requires the note in the Reopen section above."
                                            : ""}
                                    </p>
                                </div>
                                )}
                                {!canManage && managerRespondedApproved && approvalActions.length > 0 && (
                                    <p className="jdm-hint-text" style={{ marginTop: 6, color: '#15803d' }}>
                                        Manager has already approved — you can still re-send or escalate to another approver.
                                    </p>
                                )}
                            </div>
                        )}
                        {effectiveCanManage && ticket.status === TICKET_STATUS.MANAGER_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Awaiting Response</div>
                                {managerRespondedApproved ? (
                                    <p className="jdm-hint-text" style={{ color: "#15803d", fontWeight: 500 }}>
                                        Approved — apply <strong>Approved</strong> in Actions to continue
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
                                    Approved — processing will continue shortly
                                </p>
                            </div>
                        )}
                        {effectiveCanManage && ticket.status === TICKET_STATUS.COST_APPROVAL_PENDING && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Clock size={14} /> Cost Approval In Progress</div>
                                <p className="jdm-hint-text">
                                    Waiting for configured cost manager approval from email link. Status updates automatically.
                                </p>
                                {effectiveCostEstimate && (
                                    <p className="jdm-hint-text" style={{ marginTop: 8 }}>
                                        To resend or revise, pick a cost line under{" "}
                                        <strong>Request & cost approval</strong> in Actions (same as manager approval).
                                    </p>
                                )}
                            </div>
                        )}
                        {effectiveCanManage && effectiveCostEstimate && onRequestCostApproval && requiresCostApproval && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><Database size={14} /> Cost approval</div>
                                {effectiveCostEstimate && onRequestCostApproval ? (
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
                        {onAddNote && !ticketIsDeleted && (
                            <div className="jdm-section">
                                <div className="jdm-section-title"><MessageSquare size={14} /> Add Note</div>
                                <textarea
                                    className="jdm-textarea"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Write a note..."
                                    rows={3}
                                />

                                <div className="jdm-note-attach-zone">
                                {/* File picker */}
                                <input
                                    ref={noteFileInputRef}
                                    id={`note-files-${ticket.id}`}
                                    type="file"
                                    multiple
                                    accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.zip"
                                    onChange={(e) => handleNoteFiles(e.target.files)}
                                    style={{ display: 'none' }}
                                />
                                <label
                                    htmlFor={`note-files-${ticket.id}`}
                                    style={{
                                        marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '6px 12px', borderRadius: 8,
                                        border: '1px dashed var(--border-color, #cbd5e1)', background: 'var(--surface-subtle, #f8fafc)',
                                        color: 'var(--text-sub, #475569)', fontSize: '0.8rem', cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                >
                                    <Paperclip size={13} /> Attach files (max {NOTE_ATTACHMENT_MAX_MB} MB each)
                                </label>

                                {/* Pending / uploaded files list */}
                                {pendingFiles.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {pendingFiles.map((f, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 10px', borderRadius: 8,
                                                    background: f.status === 'error' ? '#fef2f2' : f.status === 'done' ? '#f0fdf4' : 'var(--surface-subtle, #f8fafc)',
                                                    border: `1px solid ${f.status === 'error' ? '#fecaca' : f.status === 'done' ? '#bbf7d0' : 'var(--border-color, #e2e8f0)'}`,
                                                    fontSize: '0.8rem',
                                                }}
                                            >
                                                {f.status === 'uploading' && <Loader2 size={14} className="spin-icon" color="#2563eb" />}
                                                {f.status === 'done' && <CheckCircle size={14} color="#16a34a" />}
                                                {f.status === 'error' && <XCircle size={14} color="#dc2626" />}
                                                {f.status === 'pending' && <Paperclip size={14} color="#64748b" />}

                                                <span style={{
                                                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    color: f.status === 'error' ? '#991b1b' : '#374151',
                                                }}>
                                                    {f.name}
                                                    {f.status === 'error' && (
                                                        <span style={{ marginLeft: 6, color: '#dc2626', fontSize: '0.75rem' }}>
                                                            — {f.error}
                                                        </span>
                                                    )}
                                                </span>
                                                <span style={{ color: '#94a3b8', flexShrink: 0, fontSize: '0.75rem' }}>
                                                    {f.size < 1024 ? `${f.size} B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingFile(idx)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', flexShrink: 0 }}
                                                    title="Remove"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                </div>

                                <button
                                    type="button"
                                    className="jdm-btn-primary jdm-note-send-btn"
                                    onClick={handleAddNote}
                                    disabled={!note.trim() || isAnyUploading}
                                >
                                    {isAnyUploading
                                        ? <><Loader2 size={14} className="spin-icon" /> Uploading…</>
                                        : <><Send size={14} /> Add Note</>}
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
                            {assigneeDisplayLine && (
                                <div className="jdm-sidebar-field">
                                    <div className="jdm-sidebar-label"><UserCheck size={12} /> Assigned</div>
                                    <div className="jdm-person-row">
                                        <span className="jdm-avatar-sm assigned">{assigneeDisplayLine.charAt(0).toUpperCase()}</span>
                                        <div className="jdm-person-name">{assigneeDisplayLine}</div>
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
                            {effectiveCanManage && (ticket.estimatedCost || ticket.costCurrency) && (
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
                <div className="modal-overlay jdm-modal-overlay" onClick={() => setShowApprovalEditor(false)}>
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
        toEmail: '',
        ccEmail: '',
        bccEmail: '',
        description: '',
        requestType: ''
    });
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sendPosting, setSendPosting] = useState(false);
    const [savedEmails, setSavedEmails] = useState([]);
    const [contactHints, setContactHints] = useState([]);
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
                toEmail: '',
                ccEmail: '',
                bccEmail: '',
                description: '',
                requestType: ''
            });
            setError('');
            setSavedEmails(getSavedCcEmails());
            setContactHints([]);
            setWorkflowPreview(null);
            setWorkflowAutoKey("");
            setSendPosting(false);
        }
    }, [isOpen]);

    const selectedProjectId = (projects || []).find((p) => p.name === formData.productName)?.id;
    const selectedProject = (projects || []).find((p) => p.name === formData.productName);
    const routingEntryEmail = (entry) => {
        if (entry == null) return "";
        if (typeof entry === "string") return String(entry).trim().toLowerCase();
        return String(entry.email || "").trim().toLowerCase();
    };
    const normalizeRoutingEmailList = (list) =>
        [...new Set((list || []).map(routingEntryEmail).filter(Boolean))];

    const mandatoryToEmails = normalizeRoutingEmailList(workflowPreview?.emailRouting?.toMandatory);
    const mandatoryCcEmails = normalizeRoutingEmailList(workflowPreview?.emailRouting?.ccMandatory);
    const mandatoryBccEmails = normalizeRoutingEmailList(workflowPreview?.emailRouting?.bccMandatory);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        fetchWorkflowDirectoryContacts({})
            .then((rows) => {
                if (!cancelled) setContactHints(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setContactHints([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, selectedProjectId]);
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
            setWorkflowPreviewLoading(false);
            return;
        }
        const apiEnum = REQUEST_TYPE_TO_API_ENUM[formData.requestType];
        if (!apiEnum) {
            setWorkflowPreview(null);
            setWorkflowPreviewLoading(false);
            return;
        }
        let cancelled = false;
        setWorkflowPreviewLoading(true);
        getEffectiveWorkflow(selectedProjectId, apiEnum, formData.environment)
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
    }, [isOpen, step, selectedProjectId, formData.requestType, formData.environment]);

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
        const envKey = normalizeEnvironmentLabel(formData.environment || "");
        const key = `${selectedProjectId}::${formData.requestType}::${envKey}`;
        if (workflowAutoKey === key) return;

        // Auto-fill hidden approver for the API payload (not shown in To field)
        const firstConfiguredManager = (workflowPreview.managers || []).find((m) => m && m.email);
        const firstLevel = (workflowPreview.approvalLevels || [])
            .slice()
            .sort((a, b) => (a.level || 0) - (b.level || 0))
            .find((lvl) => Array.isArray(lvl.approvers) && lvl.approvers.length > 0);
        const firstApprover = firstLevel?.approvers?.[0];
        const autoManagerEmail = firstConfiguredManager?.email || firstApprover?.email || "";
        const autoManagerName = firstConfiguredManager?.name || firstApprover?.name || "";

        const optionalOnly = (list, mandatoryList) => {
            const mandatorySet = new Set(normalizeRoutingEmailList(mandatoryList));
            return [...new Set(
                (list || [])
                    .map(routingEntryEmail)
                    .filter((e) => e && !mandatorySet.has(e))
            )];
        };

        const routingTo = [
            ...mandatoryToEmails,
            ...optionalOnly(workflowPreview.emailRouting?.to, workflowPreview.emailRouting?.toMandatory)
        ];
        const routingCc = [
            ...mandatoryCcEmails,
            ...optionalOnly(workflowPreview.emailRouting?.cc, workflowPreview.emailRouting?.ccMandatory)
        ];
        const routingBcc = [
            ...mandatoryBccEmails,
            ...optionalOnly(workflowPreview.emailRouting?.bcc, workflowPreview.emailRouting?.bccMandatory)
        ];

        setFormData((prev) => ({
            ...prev,
            managerName: autoManagerName || prev.managerName,
            managerEmail: autoManagerEmail || prev.managerEmail,
            managerApprovalRequired: (workflowPreview.approvalLevels || []).length > 0,
            toEmail: routingTo.join(", "),
            ccEmail: routingCc.join(", "),
            bccEmail: routingBcc.join(", ")
        }));
        setWorkflowAutoKey(key);
    }, [
        workflowPreview,
        selectedProjectId,
        formData.requestType,
        formData.environment,
        workflowAutoKey,
        mandatoryToEmails,
        mandatoryCcEmails,
        mandatoryBccEmails
    ]);
    
    if (!isOpen) return null;

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
            setSendPosting(true);
            window.setTimeout(() => {
                onSubmit(ticket);
                onClose();
            }, 880);
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
            case REQUEST_TYPES.GENERAL_REQUEST:
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
            [REQUEST_TYPES.GENERAL_REQUEST]: 'Submit a general request to DevOps team',
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
            [REQUEST_TYPES.GENERAL_REQUEST]: <FileText size={24} />,
            [REQUEST_TYPES.OTHER_QUERIES]: <MessageSquare size={24} />,
            [REQUEST_TYPES.CODE_CUT]: <Tag size={24} />
        };
        return icons[type] || <FileText size={24} />;
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-content create-ticket-modal${sendPosting ? " create-ticket-modal--postcard-send" : ""}`}
                onClick={e => e.stopPropagation()}
            >
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
                                        <EmailChipsInput
                                            value={formData.toEmail}
                                            onChange={(val) => setFormData((prev) => ({ ...prev, toEmail: val }))}
                                            lockedEmails={mandatoryToEmails}
                                            savedEmails={savedEmails}
                                            contactHints={contactHints}
                                            placeholder="Type email and press Enter"
                                            inputLocked
                                        />
                                        <small style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                                            To is set from your project workflow (auto-filled). You can’t add addresses here — use <strong>CC</strong> to copy others.
                                        </small>
                                        {mandatoryToEmails.length > 0 && (
                                            <small style={{ color: '#6d28d9', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                <Lock size={12} aria-hidden />
                                                Some To addresses are mandatory — set by your admin.
                                            </small>
                                        )}
                                        {!workflowPreview && (
                                            <small style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                                                Recipients load after selecting product &amp; request type.
                                            </small>
                                        )}
                                        {workflowPreviewLoading && (
                                            <small style={{ color: '#2563eb', fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                                                Loading recipients for selected environment...
                                            </small>
                                        )}
                                    </FormField>
                                    <FormField label="CC">
                                        <EmailChipsInput
                                            value={formData.ccEmail}
                                            onChange={(ccEmail) => setFormData((prev) => ({ ...prev, ccEmail }))}
                                            savedEmails={savedEmails}
                                            contactHints={contactHints}
                                            lockedEmails={mandatoryCcEmails}
                                        />
                                        {mandatoryCcEmails.length > 0 && (
                                            <small style={{ color: '#6d28d9', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                <Lock size={12} aria-hidden />
                                                Locked emails are mandatory — set by your admin.
                                            </small>
                                        )}
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Type email and press Enter. Paste to add multiple.
                                        </small>
                                    </FormField>
                                </div>

                                <div className="form-row">
                                    <FormField label="BCC">
                                        <EmailChipsInput
                                            value={formData.bccEmail}
                                            onChange={(bccEmail) => setFormData((prev) => ({ ...prev, bccEmail }))}
                                            savedEmails={savedEmails}
                                            contactHints={contactHints}
                                            lockedEmails={mandatoryBccEmails}
                                            placeholder="Type email and press Enter"
                                        />
                                        {mandatoryBccEmails.length > 0 && (
                                            <small style={{ color: '#6d28d9', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                <Lock size={12} aria-hidden />
                                                Locked BCC emails are mandatory — set by your admin.
                                            </small>
                                        )}
                                        <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            Recipients receive a hidden copy of this request.
                                        </small>
                                    </FormField>
                                </div>
                                
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
