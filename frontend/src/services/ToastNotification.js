/**
 * Professional Toast Notification System
 * Inspired by Slack, Microsoft Teams, and Jira notifications
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Info, Bell } from 'lucide-react';
import { playNotification, NOTIFICATION_TYPES, primeAudioContext } from './notificationService';

// Toast types
export const TOAST_TYPES = {
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    INFO: 'info',
    DEFAULT: 'default'
};

// Toast context
const ToastContext = createContext(null);

/**
 * Toast Provider Component
 */
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback(({
        type = TOAST_TYPES.DEFAULT,
        title,
        message,
        duration = 5000,
        playSound = true,
        soundType = null
    }) => {
        const id = Date.now() + Math.random();

        // Play notification sound (prime context first — avoids silent first toast after load)
        if (playSound) {
            const sound = soundType || (
                type === TOAST_TYPES.SUCCESS ? NOTIFICATION_TYPES.SUCCESS :
                type === TOAST_TYPES.ERROR ? NOTIFICATION_TYPES.ERROR :
                type === TOAST_TYPES.WARNING ? NOTIFICATION_TYPES.WARNING :
                NOTIFICATION_TYPES.SHORT
            );
            void primeAudioContext().then(() => playNotification(sound));
        }

        const toast = {
            id,
            type,
            title,
            message,
            duration,
            createdAt: Date.now()
        };

        setToasts(prev => [...prev, toast]);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.map(toast =>
            toast.id === id ? { ...toast, exiting: true } : toast
        ));

        // Actually remove after animation
        setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id));
        }, 300);
    }, []);

    const clearAll = useCallback(() => {
        setToasts(prev => prev.map(toast => ({ ...toast, exiting: true })));
        setTimeout(() => setToasts([]), 300);
    }, []);

    // Convenience methods
    const success = useCallback((title, message, options = {}) => {
        return addToast({ type: TOAST_TYPES.SUCCESS, title, message, ...options });
    }, [addToast]);

    const error = useCallback((title, message, options = {}) => {
        return addToast({ type: TOAST_TYPES.ERROR, title, message, duration: 8000, ...options });
    }, [addToast]);

    const warning = useCallback((title, message, options = {}) => {
        return addToast({ type: TOAST_TYPES.WARNING, title, message, ...options });
    }, [addToast]);

    const info = useCallback((title, message, options = {}) => {
        return addToast({ type: TOAST_TYPES.INFO, title, message, ...options });
    }, [addToast]);

    const value = {
        toasts,
        addToast,
        removeToast,
        clearAll,
        success,
        error,
        warning,
        info
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};

/**
 * Toast Container Component
 */
const ToastContainer = ({ toasts, onRemove }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
};

/**
 * Individual Toast Component
 */
const Toast = ({ toast, onRemove }) => {
    const { id, type, title, message, duration, exiting, createdAt } = toast;

    const getIcon = () => {
        const iconProps = { size: 18 };
        switch (type) {
            case TOAST_TYPES.SUCCESS:
                return <CheckCircle {...iconProps} />;
            case TOAST_TYPES.WARNING:
                return <AlertTriangle {...iconProps} />;
            case TOAST_TYPES.ERROR:
                return <XCircle {...iconProps} />;
            case TOAST_TYPES.INFO:
                return <Info {...iconProps} />;
            default:
                return <Bell {...iconProps} />;
        }
    };

    return (
        <div className={`toast toast-${type} ${exiting ? 'exiting' : ''}`}>
            <div className={`toast-icon`}>
                {getIcon()}
            </div>
            <div className="toast-content">
                {title && <div className="toast-title">{title}</div>}
                {message && <div className="toast-message">{message}</div>}
            </div>
            <button className="toast-close" onClick={() => onRemove(id)}>
                <X size={16} />
            </button>
            {duration > 0 && (
                <div className="toast-progress">
                    <div 
                        className="toast-progress-bar" 
                        style={{ animationDuration: `${duration}ms` }}
                    />
                </div>
            )}
        </div>
    );
};

/**
 * Hook to use toast notifications
 */
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

/**
 * Connection Status Component
 */
export const ConnectionStatus = ({ status, syncMethod, lastSyncTime }) => {
    const getStatusText = () => {
        switch (status) {
            case 'connected':
                return `Real-time sync active (${syncMethod})`;
            case 'connecting':
                return 'Connecting...';
            case 'reconnecting':
                return 'Reconnecting...';
            case 'disconnected':
                return 'Disconnected - Using polling';
            case 'failed':
                return 'Connection failed';
            default:
                return 'Unknown status';
        }
    };

    const getStatusClass = () => {
        switch (status) {
            case 'connected':
                return 'connected';
            case 'connecting':
            case 'reconnecting':
                return 'connecting';
            default:
                return 'disconnected';
        }
    };

    return (
        <div className={`connection-status ${getStatusClass()}`}>
            <span className="connection-status-dot" />
            <span className="connection-status-text">{getStatusText()}</span>
            {lastSyncTime && (
                <span className="connection-status-time">
                    Last sync: {formatTime(lastSyncTime)}
                </span>
            )}
        </div>
    );
};

/**
 * Real-time Update Banner Component
 */
export const RealTimeIndicator = ({ isConnected, lastUpdate, syncMethod }) => {
    if (!isConnected) return null;

    return (
        <div className="realtime-indicator">
            <span className="realtime-indicator-dot" />
            <span className="realtime-indicator-text">
                Real-time updates active via {syncMethod === 'websocket' ? 'WebSocket' : syncMethod === 'sse' ? 'SSE' : 'Polling'}
            </span>
            {lastUpdate && (
                <span className="realtime-indicator-time">
                    Updated {formatTimeAgo(lastUpdate)}
                </span>
            )}
        </div>
    );
};

/**
 * Data Sync Indicator Component
 */
export const SyncIndicator = ({ isSyncing, hasError, lastSync }) => {
    const getStatus = () => {
        if (hasError) return 'error';
        if (isSyncing) return 'syncing';
        return 'synced';
    };

    const getText = () => {
        if (hasError) return 'Sync error';
        if (isSyncing) return 'Syncing...';
        return lastSync ? `Synced ${formatTimeAgo(lastSync)}` : 'Synced';
    };

    return (
        <div className={`sync-indicator ${getStatus()}`}>
            {isSyncing && <span className="sync-indicator-spinner" />}
            {!isSyncing && hasError && <XCircle size={14} />}
            {!isSyncing && !hasError && <CheckCircle size={14} />}
            <span>{getText()}</span>
        </div>
    );
};

/**
 * Sound Settings Component
 */
export const SoundSettings = ({ enabled, volume, onToggle, onVolumeChange }) => {
    return (
        <div className="sound-settings">
            <div className="sound-settings-header">
                <span className="sound-settings-title">Notification Sounds</span>
                <button 
                    className={`sound-toggle ${enabled ? 'active' : ''}`}
                    onClick={onToggle}
                    aria-label={enabled ? 'Disable sounds' : 'Enable sounds'}
                >
                    <span className="sound-toggle-knob" />
                </button>
            </div>
            {enabled && (
                <div className="volume-slider">
                    <Bell size={16} style={{ opacity: 0.5 }} />
                    <div 
                        className="volume-slider-track"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const newVolume = Math.max(0, Math.min(1, x / rect.width));
                            onVolumeChange(newVolume);
                        }}
                    >
                        <div 
                            className="volume-slider-fill" 
                            style={{ width: `${volume * 100}%` }}
                        />
                        <div 
                            className="volume-slider-thumb"
                            style={{ left: `${volume * 100}%` }}
                        />
                    </div>
                    <Bell size={16} />
                </div>
            )}
        </div>
    );
};

// Helper functions
const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatTimeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

export default ToastProvider;
