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
    const [selectedAction, setSelectedAction] = useState(preSelectedAction || null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

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
    const titleText = isCostApproval ? 'Cost Approval Required' : 'Manager Approval Required';
    const subtitleText = isCostApproval
        ? `Hi ${tokenInfo.managerName}, please review the cost estimation and approve or reject.`
        : `Hi ${tokenInfo.managerName}, please review and approve or reject this request.`;

    // Main approval form
    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.headerLogo}>
                        <Shield size={24} color="#fff" />
                    </div>
                    <div>
                        <h1 style={styles.headerTitle}>{titleText}</h1>
                        <p style={styles.headerSubtitle}>{subtitleText}</p>
                    </div>
                </div>

                {/* Ticket Info */}
                <div style={styles.body}>
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>
                            <FileText size={18} /> Request Details
                        </h2>
                        
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
                            {!isCostApproval && tokenInfo.totalApprovalLevels > 1 && tokenInfo.approvalLevel != null && (
                                <div style={styles.infoItem}>
                                    <span style={styles.infoLabel}>Approval step</span>
                                    <span style={styles.infoValue}>
                                        Level {tokenInfo.approvalLevel} of {tokenInfo.totalApprovalLevels}
                                    </span>
                                </div>
                            )}
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

                    {/* Requester Info */}
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

                    {/* Action Selection */}
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Your Decision</h2>
                        
                        <div style={styles.actionButtons}>
                            <button
                                style={{
                                    ...styles.actionButton,
                                    ...(selectedAction === 'approve' ? styles.approveButtonSelected : styles.approveButton)
                                }}
                                onClick={() => setSelectedAction('approve')}
                            >
                                <CheckCircle size={24} />
                                <span>Approve</span>
                            </button>
                            <button
                                style={{
                                    ...styles.actionButton,
                                    ...(selectedAction === 'reject' ? styles.rejectButtonSelected : styles.rejectButton)
                                }}
                                onClick={() => setSelectedAction('reject')}
                            >
                                <XCircle size={24} />
                                <span>Reject</span>
                            </button>
                        </div>

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

                {/* Footer */}
                <div style={styles.footer}>
                    <p>DevOps Portal • Secure Manager Approval</p>
                    <p style={{ marginTop: 4 }}>This link is unique to you and will expire after use.</p>
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
        background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    card: {
        width: '100%',
        maxWidth: '600px',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px'
    },
    header: {
        background: 'linear-gradient(135deg, #0052CC 0%, #0747A6 100%)',
        padding: '32px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        color: '#ffffff'
    },
    headerLogo: {
        width: '48px',
        height: '48px',
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerTitle: {
        margin: 0,
        fontSize: '1.5rem',
        fontWeight: 600
    },
    headerSubtitle: {
        margin: '4px 0 0 0',
        fontSize: '0.9rem',
        opacity: 0.9
    },
    body: {
        padding: '24px'
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
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
    actionButtons: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px'
    },
    actionButton: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '20px',
        border: '2px solid',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontWeight: 600,
        fontSize: '1rem'
    },
    approveButton: {
        background: '#ffffff',
        borderColor: '#dcfce7',
        color: '#166534'
    },
    approveButtonSelected: {
        background: '#dcfce7',
        borderColor: '#22c55e',
        color: '#166534'
    },
    rejectButton: {
        background: '#ffffff',
        borderColor: '#fee2e2',
        color: '#991b1b'
    },
    rejectButtonSelected: {
        background: '#fee2e2',
        borderColor: '#ef4444',
        color: '#991b1b'
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
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        color: '#ffffff'
    },
    submitReject: {
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
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
        padding: '16px 24px',
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#94a3b8'
    }
};

export default ManagerApprovalPage;
