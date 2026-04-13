import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    CheckCircle, 
    XCircle, 
    AlertCircle, 
    User, 
    Mail, 
    FileText, 
    Send,
    Shield,
    Loader2
} from 'lucide-react';
import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { TICKET_STATUS, toApiTicketStatus } from '../services/ticketService';

/**
 * Manager Approval Page
 * Public page for managers to approve/reject tickets without logging in.
 * Manager is identified via secure token in the URL.
 */

const API_BASE_URL = resolveApiBaseUrl();

const ManagerApprovalPage = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const preSelectedAction = searchParams.get('action'); // 'approve' or 'reject'

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [tokenInfo, setTokenInfo] = useState(null);
    const [note, setNote] = useState('');
    const [selectedAction, setSelectedAction] = useState(
        preSelectedAction === 'approve' || preSelectedAction === 'reject' ? preSelectedAction : null
    );
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const a = searchParams.get('action');
        if (a === 'approve' || a === 'reject') {
            setSelectedAction(a);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!token) {
            setError('No approval token provided');
            setLoading(false);
            return;
        }

        validateToken();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const validateToken = async () => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/public/manager-approval/validate?token=${encodeURIComponent(token)}${preSelectedAction ? `&action=${preSelectedAction}` : ''}`
            );
            const data = await response.json();
            setTokenInfo(data);
            
            if (data.action) {
                setSelectedAction(data.action);
            }
        } catch (err) {
            setError('Failed to validate approval link');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedAction) {
            setError('Please select an action (Approve or Reject)');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/public/manager-approval/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token,
                    action: selectedAction,
                    note: note.trim() || null
                })
            });

            const data = await response.json();
            
            if (data.success) {
                const statusApiValue = data.newStatus || null;
                const normalizedStatus = statusApiValue
                    ? (Object.values(TICKET_STATUS).find(s => toApiTicketStatus(s) === statusApiValue) || statusApiValue)
                    : null;
                setResult({
                    success: true,
                    action: selectedAction,
                    message: data.message,
                    ticketId: data.ticketId,
                    newStatus: normalizedStatus
                });
            } else {
                setError(data.message || 'Failed to process approval');
            }
        } catch (err) {
            setError('Failed to submit approval. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.loadingContainer}>
                        <Loader2 size={48} style={{ animation: 'spin 1s linear infinite' }} color="#0052CC" />
                        <p style={{ marginTop: 16, color: '#64748b' }}>Validating approval link...</p>
                    </div>
                </div>
                <style>{spinKeyframes}</style>
            </div>
        );
    }

    // Success result
    if (result?.success) {
        const isApproved = result.action === 'approve';
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        {isApproved ? (
                            <CheckCircle size={64} color="#22c55e" />
                        ) : (
                            <XCircle size={64} color="#ef4444" />
                        )}
                        <h1 style={{ 
                            marginTop: 24, 
                            fontSize: '1.75rem', 
                            color: isApproved ? '#166534' : '#991b1b' 
                        }}>
                            Request {isApproved ? 'Approved' : 'Rejected'}
                        </h1>
                        <p style={{ marginTop: 12, color: '#64748b', fontSize: '1rem' }}>
                            {result.message}
                        </p>
                        <div style={styles.ticketBadge}>
                            <FileText size={16} />
                            {result.ticketId}
                        </div>
                        {result.newStatus && (
                            <p style={{ marginTop: 10, color: '#475569', fontSize: '0.9rem' }}>
                                Current status: <strong>{result.newStatus}</strong>
                            </p>
                        )}
                        {isApproved && result.newStatus === TICKET_STATUS.MANAGER_APPROVAL_PENDING && (
                            <p style={{ marginTop: 12, color: '#475569', fontSize: '0.9rem' }}>
                                DevOps will set the ticket to <strong>Manager Approved</strong> when they finalize this step in the portal.
                            </p>
                        )}
                        <p style={{ marginTop: 24, color: '#94a3b8', fontSize: '0.875rem' }}>
                            A confirmation email has been sent to the requester.
                        </p>
                        <p style={{ marginTop: 8, color: '#94a3b8', fontSize: '0.875rem' }}>
                            You can close this window now.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Error or invalid token
    if (error || !tokenInfo?.valid) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <AlertCircle size={64} color="#f59e0b" />
                        <h1 style={{ marginTop: 24, fontSize: '1.5rem', color: '#92400e' }}>
                            {tokenInfo?.used ? 'Already Processed' : 'Invalid Link'}
                        </h1>
                        <p style={{ marginTop: 12, color: '#64748b', fontSize: '1rem' }}>
                            {error || tokenInfo?.errorMessage || 'This approval link is invalid or has expired.'}
                        </p>
                        {tokenInfo?.used && (
                            <div style={{ 
                                marginTop: 24, 
                                padding: 16, 
                                background: '#f8fafc', 
                                borderRadius: 8,
                                border: '1px solid #e2e8f0'
                            }}>
                                <p style={{ color: '#475569', fontSize: '0.875rem' }}>
                                    <strong>Previous action:</strong> {tokenInfo.action}
                                </p>
                                {tokenInfo.managerName && (
                                    <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: 8 }}>
                                        <strong>Processed by:</strong> {tokenInfo.managerName}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const isCostApproval = tokenInfo?.tokenType === 'COST_APPROVAL';
    const titleText = isCostApproval ? 'Cost approval' : 'Request approval';
    const subtitleText = isCostApproval
        ? `Review the estimate below, then confirm your decision.`
        : `Review the request below, then confirm your decision.`;
    const intentFromLink =
        preSelectedAction === 'approve' || preSelectedAction === 'reject' ? preSelectedAction : null;

    // Main approval form
    return (
        <div style={styles.container} className="manager-approval-page">
            <div style={styles.card}>
                <div style={styles.cardAccent} aria-hidden />
                <div style={styles.headerMinimal}>
                    <div style={styles.headerIconWrap}>
                        <Shield size={22} color="#0f172a" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={styles.kicker}>Secure approver page</p>
                        <h1 style={styles.headerTitleMinimal}>{titleText}</h1>
                        <p style={styles.headerSubtitleMinimal}>{subtitleText}</p>
                        {tokenInfo.managerName && (
                            <p style={styles.headerGreeting}>Approver: {tokenInfo.managerName}</p>
                        )}
                    </div>
                </div>

                <div style={styles.body}>
                    {intentFromLink && selectedAction === intentFromLink && (
                        <div
                            style={{
                                ...styles.intentBanner,
                                ...(intentFromLink === 'approve' ? styles.intentBannerApprove : styles.intentBannerReject)
                            }}
                        >
                            <p style={styles.intentBannerTitle}>
                                {intentFromLink === 'approve'
                                    ? 'You opened the approval link'
                                    : 'You opened the decline link'}
                            </p>
                            <p style={styles.intentBannerText}>
                                {intentFromLink === 'approve'
                                    ? 'Confirm below to approve this request, or switch to decline if that fits better.'
                                    : 'Confirm below to decline, or switch to approve if you change your mind.'}
                            </p>
                        </div>
                    )}

                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>
                            <FileText size={18} /> Request details
                        </h2>

                        {tokenInfo.purpose?.trim() ? (
                            <div style={styles.purposeBox}>
                                <p style={styles.purposeLabel}>Purpose:</p>
                                <p style={styles.purposeText}>{tokenInfo.purpose.trim()}</p>
                            </div>
                        ) : null}
                        
                        <div style={styles.infoGrid}>
                            <div style={styles.infoItem}>
                                <span style={styles.infoLabel}>Ticket ID</span>
                                <span style={styles.infoBadge}>{tokenInfo.ticketId}</span>
                            </div>
                            <div style={styles.infoItem}>
                                <span style={styles.infoLabel}>Product</span>
                                <span style={styles.infoValue}>{tokenInfo.productName}</span>
                            </div>
                            <div style={styles.infoItem}>
                                <span style={styles.infoLabel}>Request Type</span>
                                <span style={styles.infoValue}>{tokenInfo.requestType?.replace(/_/g, ' ')}</span>
                            </div>
                            <div style={styles.infoItem}>
                                <span style={styles.infoLabel}>Environment</span>
                                <span style={styles.infoValue}>{tokenInfo.environment}</span>
                            </div>
                            {isCostApproval && (
                                <div style={styles.infoItem}>
                                    <span style={styles.infoLabel}>Estimated Cost</span>
                                    <span style={styles.infoValue}>
                                        {(tokenInfo.costCurrency || 'USD')} {Number(tokenInfo.estimatedCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                            {isCostApproval && tokenInfo.costSubmittedBy && (
                                <div style={styles.infoItem}>
                                    <span style={styles.infoLabel}>Submitted By</span>
                                    <span style={styles.infoValue}>{tokenInfo.costSubmittedBy}</span>
                                </div>
                            )}
                        </div>

                        {tokenInfo.description && (
                            <div style={styles.descriptionBox}>
                                <p style={styles.descriptionLabel}>Description</p>
                                <p style={styles.descriptionText}>{tokenInfo.description}</p>
                            </div>
                        )}
                    </div>

                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>
                            <User size={18} /> Requester
                        </h2>
                        <div style={styles.requesterCard}>
                            <div style={styles.requesterAvatar}>
                                {tokenInfo.requesterName?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p style={styles.requesterName}>{tokenInfo.requesterName}</p>
                                <p style={styles.requesterEmail}>
                                    <Mail size={14} /> {tokenInfo.requesterEmail}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Decision</h2>
                        <p style={styles.decisionHint}>
                            Choose one outcome. You can change your selection before submitting.
                        </p>

                        <div style={styles.actionRow}>
                            <button
                                type="button"
                                style={{
                                    ...styles.choicePill,
                                    ...(selectedAction === 'approve' ? styles.choicePillApproveOn : styles.choicePillApproveOff)
                                }}
                                onClick={() => setSelectedAction('approve')}
                            >
                                <CheckCircle size={18} />
                                Approve
                            </button>
                            <button
                                type="button"
                                style={{
                                    ...styles.choicePill,
                                    ...(selectedAction === 'reject' ? styles.choicePillRejectOn : styles.choicePillRejectOff)
                                }}
                                onClick={() => setSelectedAction('reject')}
                            >
                                <XCircle size={18} />
                                Decline
                            </button>
                        </div>

                        {selectedAction && (
                            <p style={styles.switchHint}>
                                {selectedAction === 'approve' ? (
                                    <>
                                        Prefer to decline?{' '}
                                        <button type="button" style={styles.inlineLink} onClick={() => setSelectedAction('reject')}>
                                            Switch to decline
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        Prefer to approve?{' '}
                                        <button type="button" style={styles.inlineLink} onClick={() => setSelectedAction('approve')}>
                                            Switch to approve
                                        </button>
                                    </>
                                )}
                            </p>
                        )}

                        {/* Note field */}
                        <div style={{ marginTop: 24 }}>
                            <label style={styles.noteLabel}>Add a note {selectedAction === 'reject' ? '(recommended)' : '(optional)'}</label>
                            <textarea
                                style={styles.noteTextarea}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder={selectedAction === 'reject' 
                                    ? (isCostApproval ? 'Please provide a reason for cost rejection...' : 'Please provide a reason for rejection...') 
                                    : (isCostApproval ? 'Add comments for the cost decision...' : 'Add any comments or instructions...')}
                                rows={3}
                            />
                        </div>

                        {error && (
                            <div style={styles.errorBox}>
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}

                        {/* Submit button */}
                        <button
                            style={{
                                ...styles.submitButton,
                                ...(selectedAction === 'approve' ? styles.submitApprove : 
                                   selectedAction === 'reject' ? styles.submitReject : styles.submitDisabled),
                                opacity: submitting || !selectedAction ? 0.7 : 1,
                                cursor: submitting || !selectedAction ? 'not-allowed' : 'pointer'
                            }}
                            onClick={handleSubmit}
                            disabled={submitting || !selectedAction}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Send size={20} />
                                    {selectedAction === 'approve' ? 'Confirm Approval' : 
                                     selectedAction === 'reject' ? 'Confirm Rejection' : 'Select an action'}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div style={styles.footer}>
                    <p>Personal approval link — do not forward. Single use after a successful submit.</p>
                </div>
            </div>
            <style>{spinKeyframes}</style>
        </div>
    );
};

const spinKeyframes = `
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
`;

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(160deg, var(--surface-muted, #f1f5f9) 0%, var(--border-color, #e2e8f0) 45%, var(--surface-subtle, #f8fafc) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    card: {
        width: '100%',
        maxWidth: '560px',
        background: 'var(--card-bg, #ffffff)',
        borderRadius: '14px',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
        position: 'relative'
    },
    cardAccent: {
        height: '3px',
        width: '100%',
        background: 'linear-gradient(90deg, #0f172a 0%, #334155 50%, #64748b 100%)'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px'
    },
    headerMinimal: {
        padding: '22px 24px 8px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px'
    },
    headerIconWrap: {
        width: '44px',
        height: '44px',
        borderRadius: '10px',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
    },
    kicker: {
        margin: 0,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#64748b'
    },
    headerTitleMinimal: {
        margin: '6px 0 0 0',
        fontSize: '1.35rem',
        fontWeight: 650,
        color: '#0f172a',
        letterSpacing: '-0.02em',
        lineHeight: 1.25
    },
    headerSubtitleMinimal: {
        margin: '8px 0 0 0',
        fontSize: '0.9rem',
        color: '#475569',
        lineHeight: 1.5
    },
    headerGreeting: {
        margin: '10px 0 0 0',
        fontSize: '0.8125rem',
        color: '#64748b'
    },
    intentBanner: {
        padding: '14px 16px',
        borderRadius: '10px',
        marginBottom: '20px',
        border: '1px solid'
    },
    intentBannerApprove: {
        background: '#f0fdf4',
        borderColor: '#bbf7d0',
        color: '#14532d'
    },
    intentBannerReject: {
        background: '#fef2f2',
        borderColor: '#fecaca',
        color: '#7f1d1d'
    },
    intentBannerTitle: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 600
    },
    intentBannerText: {
        margin: '6px 0 0 0',
        fontSize: '0.8125rem',
        lineHeight: 1.45,
        opacity: 0.95
    },
    body: {
        padding: '12px 24px 24px'
    },
    section: {
        marginBottom: '24px'
    },
    sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '1rem',
        fontWeight: 600,
        color: '#1e293b',
        marginBottom: '16px'
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px'
    },
    infoItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    infoLabel: {
        fontSize: '0.75rem',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    infoValue: {
        fontSize: '0.9rem',
        fontWeight: 500,
        color: '#1e293b'
    },
    infoBadge: {
        display: 'inline-block',
        padding: '4px 10px',
        background: '#e0f2fe',
        color: '#0369a1',
        borderRadius: '6px',
        fontFamily: 'monospace',
        fontWeight: 600,
        fontSize: '0.875rem'
    },
    purposeBox: {
        marginBottom: '18px',
        padding: '14px 16px',
        background: '#f8fafc',
        borderRadius: '10px',
        border: '1px solid #e2e8f0'
    },
    purposeLabel: {
        margin: 0,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: '8px'
    },
    purposeText: {
        margin: 0,
        fontSize: '0.9375rem',
        color: '#1e293b',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap'
    },
    descriptionBox: {
        marginTop: '16px',
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
    },
    descriptionLabel: {
        fontSize: '0.75rem',
        color: '#64748b',
        textTransform: 'uppercase',
        marginBottom: '8px'
    },
    descriptionText: {
        fontSize: '0.9rem',
        color: '#334155',
        lineHeight: 1.6,
        margin: 0
    },
    requesterCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
    },
    requesterAvatar: {
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        background: '#2563eb',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: '1.1rem'
    },
    requesterName: {
        margin: 0,
        fontWeight: 600,
        color: '#1e293b'
    },
    requesterEmail: {
        margin: '4px 0 0 0',
        fontSize: '0.875rem',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },
    decisionHint: {
        margin: '0 0 12px 0',
        fontSize: '0.8125rem',
        color: '#64748b',
        lineHeight: 1.45
    },
    actionRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px'
    },
    choicePill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 18px',
        borderRadius: '999px',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: 'pointer',
        border: '1px solid',
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
    },
    choicePillApproveOff: {
        background: '#fff',
        borderColor: '#e2e8f0',
        color: '#334155'
    },
    choicePillApproveOn: {
        background: '#ecfdf5',
        borderColor: '#34d399',
        color: '#065f46'
    },
    choicePillRejectOff: {
        background: 'var(--card-bg, #fff)',
        borderColor: 'var(--border-color, #e2e8f0)',
        color: 'var(--text-sub, #334155)'
    },
    choicePillRejectOn: {
        background: '#fef2f2',
        borderColor: '#f87171',
        color: '#991b1b'
    },
    switchHint: {
        margin: '12px 0 0 0',
        fontSize: '0.8125rem',
        color: '#64748b'
    },
    inlineLink: {
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: '#2563eb',
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: '2px'
    },
    noteLabel: {
        display: 'block',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: '#374151',
        marginBottom: '8px'
    },
    noteTextarea: {
        width: '100%',
        padding: '12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '0.9rem',
        resize: 'vertical',
        fontFamily: 'inherit',
        boxSizing: 'border-box'
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        color: '#991b1b',
        fontSize: '0.875rem',
        marginTop: '16px'
    },
    submitButton: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '16px 24px',
        border: 'none',
        borderRadius: '10px',
        fontSize: '1rem',
        fontWeight: 600,
        marginTop: '24px',
        transition: 'all 0.2s ease'
    },
    submitApprove: {
        background: '#16a34a',
        color: '#ffffff'
    },
    submitReject: {
        background: '#dc2626',
        color: '#ffffff'
    },
    submitDisabled: {
        background: '#e2e8f0',
        color: '#64748b'
    },
    ticketBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        marginTop: '20px',
        padding: '8px 16px',
        background: '#f1f5f9',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontWeight: 600,
        color: '#475569'
    },
    footer: {
        padding: '14px 24px 20px',
        textAlign: 'center',
        fontSize: '11px',
        color: '#94a3b8',
        lineHeight: 1.5
    }
};

export default ManagerApprovalPage;
