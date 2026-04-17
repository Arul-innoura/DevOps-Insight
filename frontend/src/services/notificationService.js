/**
 * Enterprise-Grade Notification Sound Service
 * Professional sounds inspired by Slack, Microsoft Teams, and Jira
 * Uses Web Audio API for high-quality, customizable audio feedback
 */

let audioContext = null;
let lastPlayedAt = {};
let soundEnabled = true;
let volumeLevel = 0.72; // 0-1 scale (default audible in typical offices)

/** Per-event toggles (real-time sounds). Preview / UI tests bypass these. */
const DEFAULT_SOUND_CATEGORIES = {
    newTicket: true,
    statusChange: true,
    ticketUpdate: true,
    assignment: true,
    availability: true,
    teamRoster: true,
    dataSync: true,
    approvalTrigger: true,
    rejection: true
};
let soundCategories = { ...DEFAULT_SOUND_CATEGORIES };

/** Bundled MP3 assets under `public/sounds/` (copied from project sound pack). */
const SOUND_FILES = {
    statusChange: "status-change.mp3",
    newTicket: "new-ticket.mp3",
    ticketSubmit: "ticket-submit.mp3",
    notesAdd: "notes-add.mp3",
    notification041: "notification-041.mp3",
    notification043: "notification-043.mp3",
    rejection: "rejection.mp3",
    approvalTrigger: "approval-trigger.mp3"
};

// Sound preferences storage key
const SOUND_PREFS_KEY = 'devops_sound_preferences';

/** Labels for Settings UI */
export const SOUND_CATEGORY_META = [
    { key: "newTicket", label: "New ticket", description: "Distinct arrival when a ticket is created" },
    { key: "statusChange", label: "Status change", description: "Ticket moves through workflow" },
    { key: "ticketUpdate", label: "Ticket update", description: "Notes, fields, or general ticket edits" },
    { key: "assignment", label: "Assignment", description: "Ticket assigned or re-assigned" },
    { key: "availability", label: "Team availability", description: "DevOps availability status changes" },
    { key: "teamRoster", label: "Team roster", description: "DevOps team member list updates" },
    { key: "dataSync", label: "Data sync", description: "Background refresh / cache sync signal" },
    { key: "approvalTrigger", label: "Approval requested", description: "Manager / cost approval flow started" },
    { key: "rejection", label: "Rejection & alerts", description: "Declines, errors, and strong warnings" }
];

/**
 * Initialize or get audio context
 */
const getAudioContext = () => {
    if (!audioContext && typeof window !== "undefined") {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioContext = new AudioCtx();
        }
    }
    return audioContext;
};

/**
 * Resume AudioContext (required after user gesture on most browsers).
 * Call at the start of every audible routine.
 */
const ensureAudioReady = () => {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
    }
    return ctx;
};

export const isSoundCategoryEnabled = (key) =>
    soundCategories[key] !== false;

export const getSoundCategories = () => ({ ...soundCategories });

export const setSoundCategoryEnabled = (key, enabled) => {
    if (!(key in DEFAULT_SOUND_CATEGORIES)) return;
    const next = { ...soundCategories, [key]: !!enabled };
    soundCategories = next;
    saveSoundPreferences({ categories: next });
};

/**
 * Browser audio unlock: many browsers block sound until user interacts once.
 * This resumes the AudioContext on first click/key/touch.
 */
const setupAudioUnlock = () => {
    if (typeof window === "undefined") return;
    const unlock = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        try {
            const a = new Audio(publicAssetUrl(`/sounds/${SOUND_FILES.notification043}`));
            a.volume = 0.0001;
            void a.play().then(() => {
                a.pause();
                a.currentTime = 0;
            }).catch(() => {});
        } catch {
            /* ignore */
        }
        window.removeEventListener("click", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
};

/**
 * Load sound preferences from localStorage
 */
export const loadSoundPreferences = () => {
    if (typeof window === "undefined") return;
    try {
        const prefs = JSON.parse(localStorage.getItem(SOUND_PREFS_KEY) || '{}');
        soundEnabled = prefs.enabled !== false;
        volumeLevel = typeof prefs.volume === "number" ? prefs.volume : 0.72;
        soundCategories = {
            ...DEFAULT_SOUND_CATEGORIES,
            ...(typeof prefs.categories === "object" && prefs.categories !== null ? prefs.categories : {})
        };
    } catch (e) {
        console.warn('[NotificationService] Failed to load preferences:', e);
    }
};

/**
 * Save sound preferences to localStorage
 */
export const saveSoundPreferences = (prefs) => {
    if (typeof window === "undefined") return;
    try {
        const current = JSON.parse(localStorage.getItem(SOUND_PREFS_KEY) || '{}');
        const updated = { ...current, ...prefs };
        if (prefs.categories && typeof prefs.categories === "object") {
            updated.categories = {
                ...DEFAULT_SOUND_CATEGORIES,
                ...(current.categories && typeof current.categories === "object" ? current.categories : {}),
                ...prefs.categories
            };
            soundCategories = { ...updated.categories };
        }
        localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(updated));
        if (typeof prefs.enabled === "boolean") soundEnabled = prefs.enabled;
        if (typeof prefs.volume === "number") volumeLevel = prefs.volume;
    } catch (e) {
        console.warn('[NotificationService] Failed to save preferences:', e);
    }
};

/**
 * Enable/disable sounds
 */
export const setSoundEnabled = (enabled) => {
    saveSoundPreferences({ enabled });
};

/**
 * Set volume level (0-1)
 */
export const setVolume = (volume) => {
    saveSoundPreferences({ volume: Math.max(0, Math.min(1, volume)) });
};

/**
 * Get current sound settings
 */
export const getSoundSettings = () => ({
    enabled: soundEnabled,
    volume: volumeLevel,
    categories: { ...soundCategories }
});
export const getSoundEnabled = () => soundEnabled;
export const getVolume = () => volumeLevel;

function publicAssetUrl(path) {
    const base =
        typeof process !== "undefined" && process.env && process.env.PUBLIC_URL != null
            ? String(process.env.PUBLIC_URL).replace(/\/$/, "")
            : "";
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
}

/**
 * Play an MP3 from `/public/sounds/`. No artificial throttle — each call plays (browser may still coalesce autoplay).
 */
export function playSoundFile(fileName, { category = null, volumeScale = 1 } = {}) {
    if (typeof window === "undefined" || !soundEnabled) return;
    if (category && !isSoundCategoryEnabled(category)) return;
    const audio = new Audio(publicAssetUrl(`/sounds/${fileName}`));
    audio.volume = Math.max(0, Math.min(1, volumeLevel * volumeScale));
    audio.preload = "auto";
    void audio.play().catch(() => {});
}

function preloadSoundAssets() {
    if (typeof window === "undefined") return;
    try {
        Object.values(SOUND_FILES).forEach((file) => {
            const a = new Audio(publicAssetUrl(`/sounds/${file}`));
            a.preload = "auto";
            void a.load();
        });
    } catch {
        /* ignore */
    }
}

// Initialize preferences on load
if (typeof window !== "undefined") {
    loadSoundPreferences();
    setupAudioUnlock();
    preloadSoundAssets();
}

/**
 * Rate limiting for sounds
 */
/** Synth/WebAudio path only: keep interval at 0 so rapid real-time events are not dropped (MP3 path is unthrottled). */
const canPlaySound = (soundType, minInterval = 0) => {
    if (minInterval <= 0) return true;
    const now = Date.now();
    const lastPlayed = lastPlayedAt[soundType] || 0;
    if (now - lastPlayed < minInterval) return false;
    lastPlayedAt[soundType] = now;
    return true;
};

const throttleIntervalForSoundType = () => 0;

/**
 * Schedule audio only after AudioContext is running (avoids silent starts while suspended).
 */
const runWhenAudioContextRunning = (fn) => {
    const ctx = getAudioContext();
    if (!ctx || typeof window === "undefined") return;
    const run = () => {
        try {
            fn(ctx);
        } catch (e) {
            console.warn("[NotificationService] audio play failed", e);
        }
    };
    if (ctx.state === "running") {
        run();
        return;
    }
    void ctx.resume()
        .then(() => {
            if (ctx.state === "running") run();
            else requestAnimationFrame(() => { if (ctx.state === "running") run(); });
        })
        .catch(() => {
            requestAnimationFrame(() => {
                void ctx.resume()
                    .then(() => { if (ctx.state === "running") run(); })
                    .catch(() => {});
            });
        });
};

/** Resume context (e.g. from toast / click) so the next chime is not dropped. */
export const primeAudioContext = () => {
    const ctx = getAudioContext();
    if (!ctx) return Promise.resolve();
    return ctx.resume().catch(() => {});
};

/**
 * Play professional multi-tone sound with envelope shaping
 */
const playEnterpriseSound = ({ 
    notes, 
    noteDuration, 
    baseVolume = 0.08, 
    waveType = "sine",
    attack = 0.02,
    decay = 0.1,
    sustain = 0.7,
    release = 0.1,
    soundType = "default"
}) => {
    if (typeof window === "undefined" || !soundEnabled) return;
    if (!canPlaySound(soundType, throttleIntervalForSoundType(soundType))) return;

    runWhenAudioContextRunning((ctx) => {
        const adjustedVolume = baseVolume * volumeLevel;
        const masterGain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        
        // Professional compression for consistent volume
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(12, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);
        
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
        masterGain.gain.setValueAtTime(adjustedVolume, ctx.currentTime);

        notes.forEach((noteData, i) => {
            const freq = typeof noteData === 'number' ? noteData : noteData.freq;
            const noteVol = typeof noteData === 'number' ? 1 : (noteData.vol || 1);
            
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            
            osc.type = waveType;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            
            const startTime = ctx.currentTime + i * noteDuration;
            const attackEnd = startTime + attack;
            const decayEnd = attackEnd + decay;
            const sustainEnd = startTime + noteDuration - release;
            const endTime = startTime + noteDuration;
            
            // ADSR envelope for professional sound
            noteGain.gain.setValueAtTime(0.0001, startTime);
            noteGain.gain.exponentialRampToValueAtTime(noteVol, attackEnd);
            noteGain.gain.exponentialRampToValueAtTime(noteVol * sustain, decayEnd);
            noteGain.gain.setValueAtTime(noteVol * sustain, sustainEnd);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            
            osc.connect(noteGain);
            noteGain.connect(masterGain);
            osc.start(startTime);
            osc.stop(endTime + 0.05);
        });

        const totalDuration = notes.length * noteDuration;
        setTimeout(() => {
            masterGain.disconnect();
            compressor.disconnect();
        }, totalDuration * 1000 + 200);
    });
};

/**
 * Play harmonic chord for rich sound
 */
const playHarmonicChord = ({
    fundamentals,
    duration,
    baseVolume = 0.06,
    soundType = "chord"
}) => {
    if (typeof window === "undefined" || !soundEnabled) return;
    if (!canPlaySound(soundType, throttleIntervalForSoundType(soundType))) return;

    runWhenAudioContextRunning((ctx) => {
        const adjustedVolume = baseVolume * volumeLevel;
        const masterGain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        
        compressor.threshold.setValueAtTime(-20, ctx.currentTime);
        compressor.knee.setValueAtTime(40, ctx.currentTime);
        compressor.ratio.setValueAtTime(8, ctx.currentTime);
        
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
        masterGain.gain.setValueAtTime(adjustedVolume, ctx.currentTime);
        
        const startTime = ctx.currentTime;
        const endTime = startTime + duration;

        fundamentals.forEach((freq, idx) => {
            // Main tone
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, startTime);
            
            // Subtle harmonics for richness
            const harmonic = ctx.createOscillator();
            const harmGain = ctx.createGain();
            harmonic.type = "sine";
            harmonic.frequency.setValueAtTime(freq * 2, startTime);
            harmGain.gain.setValueAtTime(0.15, startTime);
            
            // Envelope
            const vol = 1 / fundamentals.length;
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(vol, startTime + 0.03);
            gain.gain.setValueAtTime(vol, endTime - 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            
            harmGain.gain.setValueAtTime(0.0001, startTime);
            harmGain.gain.exponentialRampToValueAtTime(0.1 * vol, startTime + 0.03);
            harmGain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            
            osc.connect(gain);
            harmonic.connect(harmGain);
            gain.connect(masterGain);
            harmGain.connect(masterGain);
            
            osc.start(startTime);
            osc.stop(endTime + 0.05);
            harmonic.start(startTime);
            harmonic.stop(endTime + 0.05);
        });

        setTimeout(() => {
            masterGain.disconnect();
            compressor.disconnect();
        }, duration * 1000 + 200);
    });
};

// ============ PROFESSIONAL NOTIFICATION SOUNDS ============

/**
 * Slack-style "knock" - Short update notification
 * Clean, professional, subtle "blip"
 */
export const playShortNotification = () => {
    playSoundFile(SOUND_FILES.notification043, { category: "ticketUpdate" });
};

/**
 * Teams-style "pop" - Quick acknowledgment
 */
export const playPopNotification = () => {
    playEnterpriseSound({
        notes: [{ freq: 1320, vol: 1 }], // E6
        noteDuration: 0.08,
        baseVolume: 0.05,
        waveType: "sine",
        attack: 0.005,
        decay: 0.02,
        sustain: 0.3,
        release: 0.05,
        soundType: "pop"
    });
};

/**
 * Jira-style "New Issue" - Smooth, feel-good chime
 * Ascending major 7th arpeggio for a positive, professional alert
 */
export const playLongNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 587.33, vol: 0.7 }, // D5
            { freq: 880.00, vol: 0.8 }, // A5
            { freq: 1174.66, vol: 0.9 } // D6
        ],
        noteDuration: 0.16,
        baseVolume: 0.06,
        waveType: "sine",
        attack: 0.015,
        decay: 0.05,
        sustain: 0.5,
        release: 0.25,
        soundType: "long"
    });
};

/**
 * NEW TICKET ARRIVAL — Zoho Cliq-style double-pop chime.
 * Bright, punchy, immediately recognisable: two quick pops followed by a
 * warm tail note, totalling ~450 ms.
 */
export const playNewTicketArrival = () => {
    playSoundFile(SOUND_FILES.newTicket, { category: "newTicket" });
};

/** Manager / cost approval path started (distinct from generic status moves). */
export const playApprovalTriggeredSound = () => {
    playSoundFile(SOUND_FILES.approvalTrigger, { category: "approvalTrigger" });
};

/** Declines, validation errors, and other strong “no” feedback. */
export const playRejectionFeedbackSound = () => {
    playSoundFile(SOUND_FILES.rejection, { category: "rejection", volumeScale: 0.92 });
};

/**
 * Success notification - Task completed
 * Satisfying upward resolution chord
 */
export const playSuccessNotification = () => {
    playSoundFile(SOUND_FILES.ticketSubmit, { category: "statusChange", volumeScale: 1 });
};

/**
 * Warning notification - Attention needed
 * Distinctive double-tap
 */
export const playWarningNotification = () => {
    playSoundFile(SOUND_FILES.rejection, { category: "rejection", volumeScale: 0.72 });
};

/**
 * Error notification - Action failed
 * Low, attention-grabbing tone
 */
export const playErrorNotification = () => {
    playSoundFile(SOUND_FILES.rejection, { category: "rejection", volumeScale: 1 });
};

/**
 * Priority/Urgent notification - High importance
 * Three ascending urgent tones
 */
export const playUrgentNotification = () => {
    playSoundFile(SOUND_FILES.rejection, { category: "rejection", volumeScale: 0.88 });
};

/**
 * Message/Comment notification - New comment added
 * Soft, pleasant notification
 */
export const playMessageNotification = () => {
    playSoundFile(SOUND_FILES.notesAdd, { category: "ticketUpdate" });
};

/**
 * Status change notification - Ticket status updated
 */
export const playStatusChangeNotification = () => {
    playSoundFile(SOUND_FILES.statusChange, { category: "statusChange" });
};
export const playStatusChangeSound = playStatusChangeNotification;

/** WebSocket: general ticket field / note updates (distinct from status chime). */
export const playTicketUpdateNotification = () => {
    playSoundFile(SOUND_FILES.notification041, { category: "ticketUpdate" });
};

/**
 * Assignment notification - Ticket assigned to you
 */
export const playAssignmentNotification = () => {
    playSoundFile(SOUND_FILES.ticketSubmit, { category: "assignment" });
};

/** WebSocket: DevOps roster / profile row changed. */
export const playTeamRosterUpdateNotification = () => {
    playSoundFile(SOUND_FILES.notification041, { category: "teamRoster" });
};

/** WebSocket: availability (Available / Busy / Away) toggled. */
export const playAvailabilityChangeNotification = () => {
    playSoundFile(SOUND_FILES.notification043, { category: "availability" });
};

/** WebSocket: soft ping when server asks clients to refresh. */
export const playDataSyncChime = () => {
    playSoundFile(SOUND_FILES.notification043, { category: "dataSync", volumeScale: 0.85 });
};

/**
 * Completion celebration - Major milestone
 * Rich, satisfying fanfare
 */
export const playCelebrationNotification = () => {
    if (typeof window === "undefined" || !soundEnabled) return;
    if (!canPlaySound("celebration", throttleIntervalForSoundType("celebration"))) return;

    runWhenAudioContextRunning((ctx) => {
        const adjustedVolume = 0.06 * volumeLevel;
        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        const t0 = ctx.currentTime;
        masterGain.gain.setValueAtTime(adjustedVolume, t0);

        // First chord: C major
        [523, 659, 784].forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0.3, t0);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t0);
            osc.stop(t0 + 0.35);
        });

        // Second chord: G major (same timeline — avoids a second suspended context)
        const t1 = t0 + 0.2;
        [392, 494, 587, 784].forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, t1);
            gain.gain.setValueAtTime(0.35, t1);
            gain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.5);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t1);
            osc.stop(t1 + 0.55);
        });

        setTimeout(() => masterGain.disconnect(), 1000);
    });
};

// Aliases for backward compatibility
export const playUpdateNotification = playShortNotification;
export const playNewTicketNotification = playNewTicketArrival;

// Export notification types for use in components
export const NOTIFICATION_TYPES = {
    NEW_TICKET: 'newTicket',
    SHORT: 'short',
    LONG: 'long',
    POP: 'pop',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    URGENT: 'urgent',
    MESSAGE: 'message',
    STATUS: 'status',
    ASSIGNMENT: 'assignment',
    CELEBRATION: 'celebration'
};

/**
 * Play notification by type
 */
export const playNotification = (type) => {
    switch (type) {
        case NOTIFICATION_TYPES.SHORT:
            playShortNotification();
            break;
        case NOTIFICATION_TYPES.LONG:
            playLongNotification();
            break;
        case NOTIFICATION_TYPES.POP:
            playPopNotification();
            break;
        case NOTIFICATION_TYPES.SUCCESS:
            playSuccessNotification();
            break;
        case NOTIFICATION_TYPES.WARNING:
            playWarningNotification();
            break;
        case NOTIFICATION_TYPES.ERROR:
            playErrorNotification();
            break;
        case NOTIFICATION_TYPES.URGENT:
            playUrgentNotification();
            break;
        case NOTIFICATION_TYPES.MESSAGE:
            playMessageNotification();
            break;
        case NOTIFICATION_TYPES.STATUS:
            playStatusChangeNotification();
            break;
        case NOTIFICATION_TYPES.ASSIGNMENT:
            playAssignmentNotification();
            break;
        case NOTIFICATION_TYPES.CELEBRATION:
            playCelebrationNotification();
            break;
        case NOTIFICATION_TYPES.NEW_TICKET:
            playNewTicketArrival();
            break;
        default:
            playShortNotification();
    }
};

/** Settings: play the sound mapped to a real-time category (ignores category toggles). */
export const previewSoundCategory = (key) => {
    if (typeof window === "undefined" || !soundEnabled) return;
    void primeAudioContext();
    switch (key) {
        case "newTicket":
            playNewTicketArrival();
            break;
        case "statusChange":
            playStatusChangeNotification();
            break;
        case "ticketUpdate":
            playTicketUpdateNotification();
            break;
        case "assignment":
            playAssignmentNotification();
            break;
        case "availability":
            playAvailabilityChangeNotification();
            break;
        case "teamRoster":
            playTeamRosterUpdateNotification();
            break;
        case "dataSync":
            playDataSyncChime();
            break;
        case "approvalTrigger":
            playApprovalTriggeredSound();
            break;
        case "rejection":
            playRejectionFeedbackSound();
            break;
        default:
            playShortNotification();
    }
};
