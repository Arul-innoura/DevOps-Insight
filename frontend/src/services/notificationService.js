/** Notification sounds — single file: `shipt.aac` for all events. */

let audioContext = null;
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

const SOUND_SOFT = "shipt.aac";
const SOUND_ALERT = "shipt.aac";

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
 * Browser audio unlock + OS notification permission.
 * Browsers block both sound and push notifications until a user gesture fires.
 */
const setupAudioUnlock = () => {
    if (typeof window === "undefined") return;
    const unlock = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        try {
            const a = new Audio(publicAssetUrl(`/sounds/${SOUND_SOFT}`));
            a.volume = 0.0001;
            void a.play().then(() => {
                a.pause();
                a.currentTime = 0;
            }).catch(() => {});
        } catch {
            /* ignore */
        }
        // Request OS notification permission on first interaction
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
        }
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
    greetingTts: false,
    categories: { ...soundCategories }
});

/** @deprecated Spoken greeting removed; persists {@code greetingTts: false} for older clients. */
export const setGreetingTtsEnabled = (_enabled) => {
    saveSoundPreferences({ greetingTts: false });
};

export const getGreetingTtsEnabled = () => false;

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
        [SOUND_SOFT].forEach((file) => {
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

/** Resume context (e.g. from toast / click) so the next chime is not dropped. */
export const primeAudioContext = () => {
    const ctx = getAudioContext();
    if (!ctx) return Promise.resolve();
    return ctx.resume().catch(() => {});
};

/**
 * Synthesized WhatsApp-style two-note chime — plays instantly via Web Audio API,
 * no file loading latency, truly real-time.
 * C6 (1047 Hz) → G5 (784 Hz) with soft bell envelope.
 */
export const playSynthChime = () => {
    const ctx = getAudioContext();
    if (!ctx || !soundEnabled) return;
    const vol = volumeLevel * 0.42;
    ctx.resume().then(() => {
        const now = ctx.currentTime;
        // First note — high ding
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.value = 1047; // C6
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(vol, now + 0.006);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc1.start(now);
        osc1.stop(now + 0.55);
        // Second note — lower dong
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 784; // G5
        gain2.gain.setValueAtTime(0, now + 0.14);
        gain2.gain.linearRampToValueAtTime(vol * 0.75, now + 0.148);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
        osc2.start(now + 0.14);
        osc2.stop(now + 0.72);
    }).catch(() => {});
};

// ============ Notification sounds (notif.mp3 / notf1.mp3 only) ============

export const playShortNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "ticketUpdate", volumeScale: 0.95 });
};

export const playPopNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "ticketUpdate", volumeScale: 0.95 });
};

export const playLongNotification = () => {
    playSoundFile(SOUND_ALERT, { category: "ticketUpdate", volumeScale: 0.95 });
};

export const playNewTicketArrival = () => {
    playSoundFile(SOUND_ALERT, { category: "newTicket" });
};

export const playApprovalTriggeredSound = () => {
    playSoundFile(SOUND_ALERT, { category: "approvalTrigger" });
};

export const playRejectionFeedbackSound = () => {
    playSoundFile(SOUND_ALERT, { category: "rejection", volumeScale: 0.92 });
};

export const playSuccessNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "statusChange", volumeScale: 1 });
};

export const playWarningNotification = () => {
    playSoundFile(SOUND_ALERT, { category: "rejection", volumeScale: 0.72 });
};

export const playErrorNotification = () => {
    playSoundFile(SOUND_ALERT, { category: "rejection", volumeScale: 1 });
};

export const playUrgentNotification = () => {
    playSoundFile(SOUND_ALERT, { category: "rejection", volumeScale: 0.88 });
};

export const playMessageNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "ticketUpdate" });
};

export const playStatusChangeNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "statusChange" });
};
export const playStatusChangeSound = playStatusChangeNotification;

export const playTicketUpdateNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "ticketUpdate" });
};

export const playAssignmentNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "assignment" });
};

export const playTeamRosterUpdateNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "teamRoster" });
};

export const playAvailabilityChangeNotification = () => {
    playSoundFile(SOUND_SOFT, { category: "availability" });
};

export const playDataSyncChime = () => {
    playSoundFile(SOUND_SOFT, { category: "dataSync", volumeScale: 0.85 });
};

export const playCelebrationNotification = () => {
    playSoundFile(SOUND_ALERT, { volumeScale: 1 });
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
