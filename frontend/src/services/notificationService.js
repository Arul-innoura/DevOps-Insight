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
    dataSync: true
};
let soundCategories = { ...DEFAULT_SOUND_CATEGORIES };

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
    { key: "dataSync", label: "Data sync", description: "Background refresh / cache sync signal" }
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

// Initialize preferences on load
if (typeof window !== "undefined") {
    loadSoundPreferences();
    setupAudioUnlock();
}

/**
 * Rate limiting for sounds
 */
const canPlaySound = (soundType, minInterval = 500) => {
    const now = Date.now();
    const lastPlayed = lastPlayedAt[soundType] || 0;
    if (now - lastPlayed < minInterval) return false;
    lastPlayedAt[soundType] = now;
    return true;
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
    if (!canPlaySound(soundType, 400)) return;

    const ctx = ensureAudioReady();
    if (!ctx) return;

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
    if (!canPlaySound(soundType, 600)) return;

    const ctx = ensureAudioReady();
    if (!ctx) return;

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
};

// ============ PROFESSIONAL NOTIFICATION SOUNDS ============

/**
 * Slack-style "knock" - Short update notification
 * Clean, professional, subtle "blip"
 */
export const playShortNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 650, vol: 0.8 },
            { freq: 850, vol: 1 }
        ],
        noteDuration: 0.08,
        baseVolume: 0.078,
        waveType: "sine",
        attack: 0.005,
        decay: 0.02,
        sustain: 0.3,
        release: 0.08,
        soundType: "short"
    });
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
    if (typeof window === "undefined" || !soundEnabled) return;
    if (!canPlaySound("newTicketArrival", 650)) return;

    const ctx = ensureAudioReady();
    if (!ctx) return;

    const vol = 0.26 * volumeLevel;
    const now = ctx.currentTime;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, now);
    compressor.knee.setValueAtTime(24, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.18, now);
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.setValueAtTime(vol, now);
    master.connect(compressor);

    // Formal "service bell" — ascending major motif + resolving fifth (≈ 0.95 s)
    const bells = [
        { freq: 523.25, delay: 0.0, dur: 0.14, peak: 0.95, wave: "triangle" }, // C5
        { freq: 659.25, delay: 0.12, dur: 0.14, peak: 1.0, wave: "triangle" }, // E5
        { freq: 783.99, delay: 0.24, dur: 0.15, peak: 1.0, wave: "triangle" }, // G5
        { freq: 1046.5, delay: 0.38, dur: 0.16, peak: 0.92, wave: "sine" }, // C6
        { freq: 783.99, delay: 0.58, dur: 0.28, peak: 0.88, wave: "sine" }, // G5 resolve
        { freq: 523.25, delay: 0.72, dur: 0.22, peak: 0.55, wave: "sine" } // C5 anchor
    ];

    bells.forEach(({ freq, delay, dur, peak, wave }) => {
        const start = now + delay;
        const end = start + dur;

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + 0.018);
        g.gain.exponentialRampToValueAtTime(peak * 0.55, end - 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(end + 0.03);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, start);
        g2.gain.setValueAtTime(0.0001, start);
        g2.gain.exponentialRampToValueAtTime(peak * 0.12, start + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, end);
        osc2.connect(g2);
        g2.connect(master);
        osc2.start(start);
        osc2.stop(end + 0.03);
    });

    setTimeout(() => {
        master.disconnect();
        compressor.disconnect();
    }, 1100);
};

/**
 * Success notification - Task completed
 * Satisfying upward resolution chord
 */
export const playSuccessNotification = () => {
    playHarmonicChord({
        fundamentals: [523, 659, 784], // C major chord (C5, E5, G5)
        duration: 0.4,
        baseVolume: 0.09,
        soundType: "success"
    });
};

/**
 * Warning notification - Attention needed
 * Distinctive double-tap
 */
export const playWarningNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 880, vol: 1 },
            { freq: 880, vol: 0.8 }
        ],
        noteDuration: 0.1,
        baseVolume: 0.07,
        waveType: "triangle",
        attack: 0.01,
        decay: 0.03,
        sustain: 0.6,
        release: 0.04,
        soundType: "warning"
    });
};

/**
 * Error notification - Action failed
 * Low, attention-grabbing tone
 */
export const playErrorNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 294, vol: 1 },   // D4
            { freq: 262, vol: 0.9 }  // C4
        ],
        noteDuration: 0.2,
        baseVolume: 0.08,
        waveType: "triangle",
        attack: 0.01,
        decay: 0.05,
        sustain: 0.7,
        release: 0.1,
        soundType: "error"
    });
};

/**
 * Priority/Urgent notification - High importance
 * Three ascending urgent tones
 */
export const playUrgentNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 880, vol: 0.85 },
            { freq: 1047, vol: 0.95 },
            { freq: 1319, vol: 1 }
        ],
        noteDuration: 0.12,
        baseVolume: 0.09,
        waveType: "triangle",
        attack: 0.008,
        decay: 0.03,
        sustain: 0.8,
        release: 0.05,
        soundType: "urgent"
    });
};

/**
 * Message/Comment notification - New comment added
 * Soft, pleasant notification
 */
export const playMessageNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 698, vol: 0.9 },  // F5
            { freq: 880, vol: 1 }     // A5
        ],
        noteDuration: 0.1,
        baseVolume: 0.055,
        waveType: "sine",
        attack: 0.01,
        decay: 0.03,
        sustain: 0.5,
        release: 0.05,
        soundType: "message"
    });
};

/**
 * Status change notification - Ticket status updated
 */
export const playStatusChangeNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 587, vol: 0.85 }, // D5
            { freq: 784, vol: 1 },    // G5
            { freq: 988, vol: 0.9 }   // B5
        ],
        noteDuration: 0.11,
        baseVolume: 0.092,
        waveType: "sine",
        attack: 0.012,
        decay: 0.04,
        sustain: 0.6,
        release: 0.06,
        soundType: "status"
    });
};
export const playStatusChangeSound = playStatusChangeNotification;

/** WebSocket: general ticket field / note updates (distinct from status chime). */
export const playTicketUpdateNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 622.25, vol: 0.88 }, // Eb5
            { freq: 932.33, vol: 1 } // Bb5
        ],
        noteDuration: 0.1,
        baseVolume: 0.074,
        waveType: "sine",
        attack: 0.008,
        decay: 0.035,
        sustain: 0.55,
        release: 0.06,
        soundType: "ticketWsUpdate"
    });
};

/**
 * Assignment notification - Ticket assigned to you
 */
export const playAssignmentNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 659, vol: 0.9 },  // E5
            { freq: 784, vol: 1 },    // G5
            { freq: 988, vol: 0.95 }, // B5
            { freq: 1175, vol: 0.85 } // D6
        ],
        noteDuration: 0.13,
        baseVolume: 0.07,
        waveType: "triangle",
        attack: 0.01,
        decay: 0.04,
        sustain: 0.65,
        release: 0.07,
        soundType: "assignment"
    });
};

/** WebSocket: DevOps roster / profile row changed. */
export const playTeamRosterUpdateNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 392, vol: 0.75 },
            { freq: 494, vol: 0.88 },
            { freq: 587, vol: 0.92 }
        ],
        noteDuration: 0.1,
        baseVolume: 0.076,
        waveType: "sine",
        attack: 0.01,
        decay: 0.04,
        sustain: 0.58,
        release: 0.07,
        soundType: "teamRosterWs"
    });
};

/** WebSocket: availability (Available / Busy / Away) toggled. */
export const playAvailabilityChangeNotification = () => {
    playEnterpriseSound({
        notes: [
            { freq: 1174.66, vol: 0.95 },
            { freq: 783.99, vol: 0.82 }
        ],
        noteDuration: 0.12,
        baseVolume: 0.08,
        waveType: "sine",
        attack: 0.012,
        decay: 0.045,
        sustain: 0.55,
        release: 0.08,
        soundType: "availabilityWs"
    });
};

/** WebSocket: soft ping when server asks clients to refresh. */
export const playDataSyncChime = () => {
    playEnterpriseSound({
        notes: [{ freq: 528, vol: 1 }],
        noteDuration: 0.055,
        baseVolume: 0.055,
        waveType: "sine",
        attack: 0.004,
        decay: 0.02,
        sustain: 0.35,
        release: 0.04,
        soundType: "dataSyncWs"
    });
};

/**
 * Completion celebration - Major milestone
 * Rich, satisfying fanfare
 */
export const playCelebrationNotification = () => {
    // Play chord progression
    const ctx = ensureAudioReady();
    if (!ctx || !soundEnabled || !canPlaySound("celebration", 1000)) return;
    
    const adjustedVolume = 0.06 * volumeLevel;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(adjustedVolume, ctx.currentTime);
    
    // First chord: C major
    [523, 659, 784].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
    });
    
    // Second chord: G major (delayed)
    setTimeout(() => {
        if (!soundEnabled) return;
        const ctx2 = ensureAudioReady();
        if (!ctx2) return;
        [392, 494, 587, 784].forEach(freq => {
            const osc = ctx2.createOscillator();
            const gain = ctx2.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, ctx2.currentTime);
            gain.gain.setValueAtTime(0.35, ctx2.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx2.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(ctx2.currentTime);
            osc.stop(ctx2.currentTime + 0.55);
        });
    }, 200);
    
    setTimeout(() => masterGain.disconnect(), 1000);
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
    void ensureAudioReady()?.resume?.();
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
        default:
            playShortNotification();
    }
};
