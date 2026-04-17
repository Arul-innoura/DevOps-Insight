/**
 * Ticket Service - backend API backed service.
 */

import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken, refreshAuthToken } from "./tokenCacheService";

// Request Types
export const REQUEST_TYPES = {
    NEW_ENVIRONMENT: "New Environment",
    ENVIRONMENT_UP: "Environment Up",
    ENVIRONMENT_DOWN: "Environment Down",
    GENERAL_REQUEST: "General Request",
    CODE_CUT: "Code Cut"
};

export const COST_CURRENCIES = [
    { code: "USD", label: "USD ($)" },
    { code: "INR", label: "INR (₹)" },
    { code: "AED", label: "AED (د.إ)" },
    { code: "QAR", label: "Riyal / QAR (ر.ق)" },
    { code: "EUR", label: "EUR (€)" },
    { code: "SAR", label: "SAR (﷼)" }
];

/** Maps UI request type label to backend RequestType enum name (workflow API). */
export const REQUEST_TYPE_TO_API_ENUM = {
    [REQUEST_TYPES.NEW_ENVIRONMENT]: "NEW_ENVIRONMENT",
    [REQUEST_TYPES.ENVIRONMENT_UP]: "ENVIRONMENT_UP",
    [REQUEST_TYPES.ENVIRONMENT_DOWN]: "ENVIRONMENT_DOWN",
    [REQUEST_TYPES.GENERAL_REQUEST]: "GENERAL_REQUEST",
    [REQUEST_TYPES.CODE_CUT]: "CODE_CUT"
};

/** Display label for legacy API values no longer offered in the create form */
const LEGACY_REQUEST_TYPE_LABELS = {
    RELEASE_DEPLOYMENT: "Release Deployment",
    ISSUE_FIX: "Issue Fix",
    OTHER_QUERIES: "Other Queries"
};

/** API / WebSocket enum name → UI label (same as create form). */
const API_REQUEST_TYPE_TO_DISPLAY = {
    NEW_ENVIRONMENT: REQUEST_TYPES.NEW_ENVIRONMENT,
    ENVIRONMENT_UP: REQUEST_TYPES.ENVIRONMENT_UP,
    ENVIRONMENT_DOWN: REQUEST_TYPES.ENVIRONMENT_DOWN,
    GENERAL_REQUEST: REQUEST_TYPES.GENERAL_REQUEST,
    /** Legacy tickets: enum was used for general DevOps work before GENERAL_REQUEST existed. */
    BUILD_REQUEST: REQUEST_TYPES.GENERAL_REQUEST,
    CODE_CUT: REQUEST_TYPES.CODE_CUT,
    RELEASE_DEPLOYMENT: LEGACY_REQUEST_TYPE_LABELS.RELEASE_DEPLOYMENT,
    ISSUE_FIX: LEGACY_REQUEST_TYPE_LABELS.ISSUE_FIX,
    OTHER_QUERIES: LEGACY_REQUEST_TYPE_LABELS.OTHER_QUERIES
};

/**
 * @param {string|null|undefined} value — enum name (e.g. GENERAL_REQUEST) or display label
 * @returns {string|null} display label, or null if unknown
 */
export function requestTypeApiValueToDisplay(value) {
    if (value == null || value === "") return null;
    const raw = String(value).trim();
    const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
    if (API_REQUEST_TYPE_TO_DISPLAY[upper]) return API_REQUEST_TYPE_TO_DISPLAY[upper];
    if (Object.values(REQUEST_TYPES).includes(raw)) return raw;
    for (const [k, v] of Object.entries(LEGACY_REQUEST_TYPE_LABELS)) {
        if (k === upper || v === raw) return v;
    }
    return null;
}

/**
 * Shapes raw WebSocket / partial API payloads before merging into list rows so enum-only
 * updates do not replace display labels, and omitted assignee fields do not clear optimistic UI.
 * @param {Record<string, unknown>} payload
 */
export function normalizeWebSocketTicketPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    const out = { ...payload };
    const own = (k) => Object.prototype.hasOwnProperty.call(payload, k);

    if (own("requestType")) {
        const mapped = requestTypeApiValueToDisplay(out.requestType);
        if (mapped) out.requestType = mapped;
    }
    // Partial WS payloads often include assignedTo: null; merging that would clear a valid assignee on the row.
    const blankAssign = (v) => v == null || String(v).trim() === "";
    if (!own("assignedTo") || blankAssign(out.assignedTo)) {
        delete out.assignedTo;
    }
    if (!own("assignedToEmail") || blankAssign(out.assignedToEmail)) {
        delete out.assignedToEmail;
    }
    if (own("environmentLabel") && String(out.environmentLabel || "").trim() !== "") {
        out.environment = normalizeEnvironmentLabel(out.environmentLabel);
    } else if (own("environment") && out.environment != null && String(out.environment).trim() !== "") {
        out.environment = normalizeEnvironmentLabel(out.environment);
    }
    // Partial WS payloads never include timeline; null would wipe client timeline used for assignee display.
    if (own("timeline") && !Array.isArray(out.timeline)) {
        delete out.timeline;
    }
    return out;
}

function deriveAssigneeNameFromTimeline(ticket) {
    const timeline = Array.isArray(ticket?.timeline) ? ticket.timeline : [];
    for (let i = timeline.length - 1; i >= 0; i--) {
        const e = timeline[i];
        const na = String(e?.newAssignee || "").trim();
        if (na) return na;
        const n = String(e?.notes || "");
        const nLower = n.toLowerCase();
        const prefix = "ticket assigned to ";
        const at = nLower.indexOf(prefix);
        if (at >= 0) {
            const tail = n.slice(at + prefix.length).trim();
            if (tail) {
                const paren = tail.indexOf("(");
                const namePart = (paren >= 0 ? tail.slice(0, paren) : tail).trim();
                if (namePart) return namePart;
            }
        }
        const fwd = " to ";
        const fwdIdx = nLower.lastIndexOf(fwd);
        if (fwdIdx >= 0 && nLower.includes("forward")) {
            const tail = n.slice(fwdIdx + fwd.length).trim();
            if (tail) {
                const paren = tail.indexOf("(");
                const namePart = (paren >= 0 ? tail.slice(0, paren) : tail).trim();
                if (namePart) return namePart;
            }
        }
    }
    return "";
}

/**
 * Display line for ticket cards: stored assignee, then legacy fields, then email, then latest timeline assignment.
 */
export function getTicketAssigneeDisplay(ticket) {
    const a = String(ticket?.assignedTo || "").trim();
    if (a) return a;
    const legacy = String(ticket?.assigneeName || ticket?.assignedEngineerName || "").trim();
    if (legacy) return legacy;
    const em = String(ticket?.assignedToEmail || "").trim();
    if (em) return em;
    return deriveAssigneeNameFromTimeline(ticket);
}

/** True when a WS merge patch carries a non-blank assignee (do not drop as "stale"). */
export function wsPatchHasMeaningfulAssignee(patch) {
    if (!patch || typeof patch !== "object") return false;
    const n = patch.assignedTo != null && String(patch.assignedTo).trim() !== "";
    const e = patch.assignedToEmail != null && String(patch.assignedToEmail).trim() !== "";
    return n || e;
}

// Ticket Statuses
export const TICKET_STATUS = {
    CREATED: "Ticket Raised",
    ACCEPTED: "Assigned",
    MANAGER_APPROVAL_PENDING: "Waiting for Manager Approval",
    MANAGER_APPROVED: "Manager Approved",
    COST_APPROVAL_PENDING: "Cost Approval Pending",
    COST_APPROVED: "Cost Approved",
    IN_PROGRESS: "Work In Progress",
    ACTION_REQUIRED: "Action Required",
    ON_HOLD: "On Hold",
    COMPLETED: "Completed",
    CLOSED: "Closed"
};

/**
 * When DevOps/Admin picks a workflow status that claims an unowned ticket (matches server auto-assign),
 * patch assignee fields optimistically so list cards update immediately.
 */
export function optimisticSelfAssignOnStatusChange(ticket, newStatus, actorName, actorEmail, meta = {}) {
    if (meta?.reopen) return {};
    const no =
        !String(ticket?.assignedTo || "").trim() &&
        !String(ticket?.assignedToEmail || "").trim();
    if (!no) return {};
    const name = String(actorName || "").trim();
    if (!name) return {};
    const claimStatuses = new Set([
        TICKET_STATUS.ACCEPTED,
        TICKET_STATUS.IN_PROGRESS,
        TICKET_STATUS.MANAGER_APPROVED,
        TICKET_STATUS.COST_APPROVED,
        TICKET_STATUS.ACTION_REQUIRED,
        TICKET_STATUS.ON_HOLD
    ]);
    if (!claimStatuses.has(newStatus)) return {};
    const em = String(actorEmail || "").trim();
    return {
        assignedTo: name,
        assignedToEmail: em || String(ticket?.assignedToEmail || "").trim()
    };
}

/** Primary list filters (not individual workflow states like manager/cost pending). */
export const TICKET_FILTER_BUCKET = {
    ALL: "",
    UNASSIGNED: "UNASSIGNED",
    ASSIGNED_ME: "ASSIGNED_ME",
    IN_PROGRESS: "IN_PROGRESS",
    PENDING: "PENDING",
    COMPLETED: "COMPLETED",
    CLOSED: "CLOSED"
};

/** Per-file limit for ticket note attachments (must match backend BlobStorageService). */
export const NOTE_ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
export const NOTE_ATTACHMENT_MAX_MB = 12;

const TICKET_FILTER_BUCKET_VALUES = new Set(Object.values(TICKET_FILTER_BUCKET));

/**
 * Whether the signed-in user is the ticket requester (handles MSAL username vs id token email).
 * @param {object} ticket
 * @param {{ email?: string, username?: string, preferredUsername?: string, upn?: string, uniqueName?: string, name?: string, emailAliases?: string[] }} user
 */
export function ticketRequesterMatchesCurrentUser(ticket, user) {
    const req = String(ticket?.requesterEmail ?? "").trim().toLowerCase();
    const add = (set, v) => {
        const s = String(v ?? "").trim().toLowerCase();
        if (s) set.add(s);
    };
    const candidates = new Set();
    add(candidates, user?.email);
    add(candidates, user?.username);
    add(candidates, user?.preferredUsername);
    add(candidates, user?.upn);
    add(candidates, user?.uniqueName);
    if (Array.isArray(user?.emailAliases)) user.emailAliases.forEach((e) => add(candidates, e));
    if (req && candidates.size > 0) {
        for (const c of candidates) {
            if (c === req) return true;
        }
    }
    if (!req && ticket?.requestedBy && user?.name) {
        return (
            String(ticket.requestedBy).trim().toLowerCase() === String(user.name).trim().toLowerCase()
        );
    }
    return false;
}

/**
 * @param {object} ticket
 * @param {string} bucket — {@link TICKET_FILTER_BUCKET} value, or legacy exact {@code ticket.status} string
 * @param {{ userName?: string, userEmail?: string }} [ctx]
 */
export function ticketMatchesPrimaryStatusFilter(ticket, bucket, ctx = {}) {
    if (!bucket) return true;
    if (!TICKET_FILTER_BUCKET_VALUES.has(bucket)) {
        return (ticket?.status || "") === bucket;
    }
    const st = ticket?.status;
    const { userName = "", userEmail = "" } = ctx;
    const nm = String(userName || "").trim();
    const em = String(userEmail || "").trim().toLowerCase();
    const assignee = ticket?.assignedTo;
    const assigneeEmail = String(ticket?.assignedToEmail || "").trim().toLowerCase();

    switch (bucket) {
        case TICKET_FILTER_BUCKET.UNASSIGNED: {
            const noAssignee =
                !String(assignee || "").trim() &&
                !String(assigneeEmail || "").trim() &&
                !deriveAssigneeNameFromTimeline(ticket);
            if (!noAssignee) return false;
            const waitingPickup =
                st === TICKET_STATUS.CREATED ||
                st === TICKET_STATUS.MANAGER_APPROVAL_PENDING ||
                st === TICKET_STATUS.MANAGER_APPROVED ||
                st === TICKET_STATUS.COST_APPROVAL_PENDING ||
                st === TICKET_STATUS.COST_APPROVED ||
                st === TICKET_STATUS.ACCEPTED;
            return waitingPickup;
        }
        case TICKET_FILTER_BUCKET.ASSIGNED_ME:
            return (
                st !== TICKET_STATUS.CLOSED &&
                ((nm && assignee === nm) || (em && assigneeEmail && assigneeEmail === em))
            );
        case TICKET_FILTER_BUCKET.IN_PROGRESS:
            return st === TICKET_STATUS.IN_PROGRESS;
        case TICKET_FILTER_BUCKET.PENDING:
            return (
                st !== TICKET_STATUS.IN_PROGRESS &&
                st !== TICKET_STATUS.COMPLETED &&
                st !== TICKET_STATUS.CLOSED
            );
        case TICKET_FILTER_BUCKET.COMPLETED:
            return st === TICKET_STATUS.COMPLETED;
        case TICKET_FILTER_BUCKET.CLOSED:
            return st === TICKET_STATUS.CLOSED;
        default:
            return true;
    }
}

/**
 * DevOps may open/send cost only after manager approval (first submit) or to resubmit while cost approval is pending.
 * Blocks once cost is approved, or duplicate send from Manager Approved while cost is already pending.
 */
// ── Environments (full labels in UI; API uses DEV, QA, STAGE, UAT, PRODUCTION) ──
export const ENVIRONMENTS = [
    "Development",
    "Quality Assurance",
    "Staging",
    "User Acceptance Testing",
    "Production"
];

const ENV_API_TO_DISPLAY = {
    DEV: "Development",
    QA: "Quality Assurance",
    STAGE: "Staging",
    UAT: "User Acceptance Testing",
    PRODUCTION: "Production"
};

const ENV_DISPLAY_TO_API = {
    Development: "DEV",
    "Quality Assurance": "QA",
    Staging: "STAGE",
    "User Acceptance Testing": "UAT",
    Production: "PRODUCTION"
};

const ENV_NORMALIZED_ALIAS_TO_DISPLAY = {
    dev: "Development",
    development: "Development",
    qa: "Quality Assurance",
    quality_assurance: "Quality Assurance",
    qualityassurance: "Quality Assurance",
    stage: "Staging",
    staging: "Staging",
    uat: "User Acceptance Testing",
    user_acceptance_testing: "User Acceptance Testing",
    useracceptancetesting: "User Acceptance Testing",
    production: "Production",
    prod: "Production"
};

/** Map any legacy / API / short value to canonical display label used in dropdowns. */
export function normalizeEnvironmentLabel(value) {
    if (value == null || value === "") return "";
    const s = String(value).trim();
    const upper = s.toUpperCase();
    if (ENV_API_TO_DISPLAY[upper]) return ENV_API_TO_DISPLAY[upper];
    if (ENV_DISPLAY_TO_API[s]) return s;
    const compact = s.toLowerCase().replace(/[\s-]+/g, "_");
    const compactNoUnderscore = compact.replace(/_/g, "");
    if (ENV_NORMALIZED_ALIAS_TO_DISPLAY[compact]) return ENV_NORMALIZED_ALIAS_TO_DISPLAY[compact];
    if (ENV_NORMALIZED_ALIAS_TO_DISPLAY[compactNoUnderscore]) return ENV_NORMALIZED_ALIAS_TO_DISPLAY[compactNoUnderscore];
    return s;
}

function environmentApiToDisplay(apiValue) {
    if (!apiValue) return "";
    const k = String(apiValue).trim().toUpperCase();
    return ENV_API_TO_DISPLAY[k] || normalizeEnvironmentLabel(apiValue);
}

/** Days used to derive a daily rate from the product monthly estimate (Environment Up proration). */
export const PRORATION_DAYS_PER_MONTH = 30;

/**
 * Parse admin-entered monthly cost strings, e.g. "$150 / month", "150 USD", "₹12,000".
 * @returns {{ amount: number|null, currency: string }}
 */
export function parseMonthlyCostEstimate(raw) {
    if (raw == null) return { amount: null, currency: "USD" };
    const s = String(raw).trim();
    if (!s) return { amount: null, currency: "USD" };
    let currency = "USD";
    if (/₹|inr/i.test(s)) currency = "INR";
    else if (/aed|د\.إ/i.test(s)) currency = "AED";
    else if (/qar|riyal|rial|ر\.ق/i.test(s)) currency = "QAR";
    else if (/sar|﷼/i.test(s)) currency = "SAR";
    else if (/€|eur/i.test(s)) currency = "EUR";
    else if (/\$|usd/i.test(s)) currency = "USD";

    const compact = s.replace(/,/g, "");
    const matches = compact.match(/(\d+(?:\.\d+)?)/g);
    if (!matches || matches.length === 0) return { amount: null, currency };
    const nums = matches.map((x) => parseFloat(x)).filter((n) => !Number.isNaN(n) && n > 0);
    if (nums.length === 0) return { amount: null, currency };
    const amount = nums.reduce((a, b) => Math.max(a, b), 0);
    return { amount, currency };
}

/**
 * Estimated run cost from product monthly estimate and run length in days.
 */
export function prorateMonthlyToPeriod(monthlyAmount, durationDays, daysPerMonth = PRORATION_DAYS_PER_MONTH) {
    const m = Number(monthlyAmount);
    const d = Number(durationDays);
    if (!m || m <= 0 || !d || d <= 0 || !daysPerMonth || daysPerMonth <= 0) return null;
    return Math.round((m / daysPerMonth) * d * 100) / 100;
}

function parseTicketInstant(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Run length in days for cost proration: prefers ticket.duration, else calendar span activation → shutdown (inclusive, UTC dates).
 * @param {{ ignoreDuration?: boolean }} [opts] if ignoreDuration, only use activation/shutdown span.
 */
export function inferRunDaysFromTicketDates(ticket, opts = {}) {
    if (!ticket) return 0;
    if (!opts.ignoreDuration) {
        const dur = ticket.duration;
        if (dur != null && dur !== "") {
            const n = typeof dur === "number" ? dur : parseInt(String(dur).replace(/[^\d]/g, "") || "0", 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }
    const start = parseTicketInstant(ticket.activationDate);
    const end = parseTicketInstant(ticket.shutdownDate);
    if (start && end) {
        const u1 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        const u2 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
        const diff = Math.round((u2 - u1) / 86400000);
        return diff >= 0 ? diff + 1 : 0;
    }
    return 0;
}

/** Short display for API instants / ISO strings (cost tool summary). */
export function formatTicketDateForDisplay(value) {
    const d = parseTicketInstant(value);
    if (!d) return "";
    try {
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

// DevOps availability statuses
export const DEVOPS_AVAILABILITY_STATUS = {
    AVAILABLE: "Available",
    BUSY: "Busy",
    AWAY: "Away",
    OFFLINE: "Offline"
};

// Status colors for UI
export const STATUS_COLORS = {
    [TICKET_STATUS.CREATED]:                  { bg: "#eff6ff", text: "#1d4ed8" },
    [TICKET_STATUS.ACCEPTED]:                 { bg: "#ecfeff", text: "#0e7490" },
    [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: { bg: "#fffbeb", text: "#b45309" },
    [TICKET_STATUS.MANAGER_APPROVED]:         { bg: "#f0fdf4", text: "#15803d" },
    [TICKET_STATUS.COST_APPROVAL_PENDING]:    { bg: "#fff7ed", text: "#c2410c" },
    [TICKET_STATUS.COST_APPROVED]:            { bg: "#ecfdf5", text: "#059669" },
    [TICKET_STATUS.IN_PROGRESS]:              { bg: "#f5f3ff", text: "#6d28d9" },
    [TICKET_STATUS.ACTION_REQUIRED]:          { bg: "#fef2f2", text: "#dc2626" },
    [TICKET_STATUS.ON_HOLD]:                  { bg: "#f9fafb", text: "#4b5563" },
    [TICKET_STATUS.COMPLETED]:                { bg: "#f0fdf4", text: "#15803d" },
    [TICKET_STATUS.CLOSED]:                   { bg: "#f9fafb", text: "#6b7280" }
};

/** Muted translucent badges for dark + DevOps cinema themes (readable on #555 / slate cards). */
export const STATUS_COLORS_DARK = {
    [TICKET_STATUS.CREATED]:                  { bg: "rgba(59, 130, 246, 0.22)", text: "#93c5fd" },
    [TICKET_STATUS.ACCEPTED]:                 { bg: "rgba(20, 184, 166, 0.22)", text: "#5eead4" },
    [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: { bg: "rgba(245, 158, 11, 0.22)", text: "#fcd34d" },
    [TICKET_STATUS.MANAGER_APPROVED]:         { bg: "rgba(34, 197, 94, 0.2)", text: "#86efac" },
    [TICKET_STATUS.COST_APPROVAL_PENDING]:    { bg: "rgba(249, 115, 22, 0.22)", text: "#fdba74" },
    [TICKET_STATUS.COST_APPROVED]:            { bg: "rgba(16, 185, 129, 0.2)", text: "#6ee7b7" },
    [TICKET_STATUS.IN_PROGRESS]:              { bg: "rgba(139, 92, 246, 0.22)", text: "#c4b5fd" },
    [TICKET_STATUS.ACTION_REQUIRED]:          { bg: "rgba(239, 68, 68, 0.22)", text: "#fca5a5" },
    [TICKET_STATUS.ON_HOLD]:                  { bg: "rgba(148, 163, 184, 0.2)", text: "#cbd5e1" },
    [TICKET_STATUS.COMPLETED]:                { bg: "rgba(34, 197, 94, 0.2)", text: "#86efac" },
    [TICKET_STATUS.CLOSED]:                   { bg: "rgba(255, 255, 255, 0.08)", text: "#a1a1aa" }
};

export const getStatusColors = (theme) =>
    theme === "dark" || theme === "devops" ? STATUS_COLORS_DARK : STATUS_COLORS;

// Status workflow
export const STATUS_TRANSITIONS = {
    [TICKET_STATUS.CREATED]: [TICKET_STATUS.ACCEPTED, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.ACCEPTED]: [TICKET_STATUS.MANAGER_APPROVAL_PENDING, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: [TICKET_STATUS.MANAGER_APPROVED, TICKET_STATUS.CLOSED, TICKET_STATUS.ACTION_REQUIRED],
    [TICKET_STATUS.MANAGER_APPROVED]: [TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.COST_APPROVAL_PENDING]: [TICKET_STATUS.COST_APPROVED, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.COST_APPROVED]: [TICKET_STATUS.IN_PROGRESS],
    [TICKET_STATUS.IN_PROGRESS]: [TICKET_STATUS.ACTION_REQUIRED, TICKET_STATUS.ON_HOLD, TICKET_STATUS.COMPLETED],
    [TICKET_STATUS.ACTION_REQUIRED]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ON_HOLD, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.ON_HOLD]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED],
    [TICKET_STATUS.COMPLETED]: [TICKET_STATUS.CLOSED, TICKET_STATUS.IN_PROGRESS],
    [TICKET_STATUS.CLOSED]: [TICKET_STATUS.COMPLETED, TICKET_STATUS.IN_PROGRESS]
};

/**
 * Workflow-aware transitions for action dropdowns.
 * Uses live ticket workflow flags instead of static transitions.
 */
export const getDynamicAllowedTransitions = (ticket) => {
    if (!ticket || !ticket.status) return [];

    const status = ticket.status;
    const managerRequired = !!ticket.managerApprovalRequired;
    const managerApproved = String(ticket.managerApprovalStatus || "").toUpperCase() === "APPROVED";
    const costRequired = !!ticket.costApprovalRequired;
    const costStatus = String(ticket.costApprovalStatus || "").toUpperCase();
    const costApproved = costStatus === "APPROVED";
    const costPending = costStatus === "PENDING";

    if (status === TICKET_STATUS.CREATED) {
        return [TICKET_STATUS.ACCEPTED, TICKET_STATUS.CLOSED];
    }
    if (status === TICKET_STATUS.ACCEPTED) {
        if (managerRequired && !managerApproved) {
            return [TICKET_STATUS.MANAGER_APPROVAL_PENDING, TICKET_STATUS.CLOSED];
        }
        if (costRequired && !costApproved) {
            return [TICKET_STATUS.CLOSED];
        }
        return [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED];
    }
    if (status === TICKET_STATUS.MANAGER_APPROVAL_PENDING) {
        return [];
    }
    if (status === TICKET_STATUS.MANAGER_APPROVED) {
        if (costRequired && !costApproved) {
            // Requesters cannot advance to cost pending; DevOps submits the estimate.
            return [TICKET_STATUS.CLOSED];
        }
        return [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED];
    }
    if (status === TICKET_STATUS.COST_APPROVAL_PENDING || costPending) {
        return [];
    }
    if (status === TICKET_STATUS.COST_APPROVED) {
        return [TICKET_STATUS.IN_PROGRESS];
    }
    return STATUS_TRANSITIONS[status] || [];
};

const API_BASE_URL = resolveApiBaseUrl();
const INACTIVE_STATUS = "INACTIVE";
const DATA_CHANGE_EVENT = "portal-data-changed";
const DATA_BROADCAST_NAME = "portal-data-changed";
const MEMORY_CACHE = new Map();
const CACHE_TTL_MS = 30 * 1000;
const TICKET_CACHE_PREFIX = "tickets:";
const CACHE_KEYS = {
    TICKETS_ALL: `${TICKET_CACHE_PREFIX}all`,
    TICKET_STATS: `${TICKET_CACHE_PREFIX}stats`,
    DEVOPS_TEAM: "devops-team",
    PROJECTS: "projects",
    MANAGERS_TRUE: "managers:true",
    MANAGERS_FALSE: "managers:false"
};

let broadcastChannelSingleton = null;
function getDataBroadcastChannel() {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!broadcastChannelSingleton) {
        try {
            broadcastChannelSingleton = new BroadcastChannel(DATA_BROADCAST_NAME);
        } catch {
            broadcastChannelSingleton = null;
        }
    }
    return broadcastChannelSingleton;
}

const emitDataChange = (scope, action) => {
    if (typeof window === "undefined") return;
    if (scope === "tickets") {
        [...MEMORY_CACHE.keys()]
            .filter((k) => k.startsWith(TICKET_CACHE_PREFIX))
            .forEach((k) => MEMORY_CACHE.delete(k));
    }
    if (scope === "devops-team" || scope === "projects" || scope === "managers") {
        MEMORY_CACHE.delete(CACHE_KEYS.DEVOPS_TEAM);
        MEMORY_CACHE.delete(CACHE_KEYS.PROJECTS);
        MEMORY_CACHE.delete(CACHE_KEYS.MANAGERS_TRUE);
        MEMORY_CACHE.delete(CACHE_KEYS.MANAGERS_FALSE);
    }
    const detail = { scope, action, timestamp: Date.now() };
    const bc = getDataBroadcastChannel();
    if (bc) {
        try {
            bc.postMessage(detail);
        } catch {
            /* ignore */
        }
    } else if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail }));
    }
};

export const subscribeDataChanges = (listener) => {
    if (typeof window === "undefined") {
        return () => {};
    }
    const bc = getDataBroadcastChannel();
    if (bc) {
        const onMessage = (ev) => listener?.(ev.data || {});
        bc.addEventListener("message", onMessage);
        return () => bc.removeEventListener("message", onMessage);
    }
    if (typeof window.addEventListener !== "function") {
        return () => {};
    }
    const handler = (event) => listener?.(event?.detail || {});
    window.addEventListener(DATA_CHANGE_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGE_EVENT, handler);
};
const unwrapListPayload = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.content)) return payload.content;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
    return [];
};

const getCached = (key) => {
    const hit = MEMORY_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > CACHE_TTL_MS) {
        MEMORY_CACHE.delete(key);
        return null;
    }
    return hit.value;
};

const setCached = (key, value) => {
    MEMORY_CACHE.set(key, { ts: Date.now(), value });
    return value;
};

const userTicketsCacheKey = (email = "") => `${TICKET_CACHE_PREFIX}user:${String(email || "me").toLowerCase()}`;

export const invalidateDataCache = ({ scope = "all", keys = [] } = {}) => {
    const removed = [];
    const remove = (key) => {
        if (MEMORY_CACHE.has(key)) {
            MEMORY_CACHE.delete(key);
            removed.push(key);
        }
    };

    if (Array.isArray(keys) && keys.length) {
        keys.forEach(remove);
        return removed;
    }

    if (scope === "all") {
        [...MEMORY_CACHE.keys()].forEach(remove);
        return removed;
    }

    if (scope === "tickets") {
        [...MEMORY_CACHE.keys()]
            .filter((key) => key.startsWith(TICKET_CACHE_PREFIX))
            .forEach(remove);
        return removed;
    }

    if (scope === "devops-team") {
        remove(CACHE_KEYS.DEVOPS_TEAM);
        return removed;
    }

    if (scope === "projects") {
        remove(CACHE_KEYS.PROJECTS);
        return removed;
    }

    if (scope === "managers") {
        remove(CACHE_KEYS.MANAGERS_TRUE);
        remove(CACHE_KEYS.MANAGERS_FALSE);
        return removed;
    }

    return removed;
};

export const applyCacheInvalidationHint = (hint = {}) => {
    if (!hint || typeof hint !== "object") {
        return invalidateDataCache({ scope: "tickets" });
    }
    if (Array.isArray(hint.keys) && hint.keys.length) {
        return invalidateDataCache({ keys: hint.keys });
    }
    if (hint.scope) {
        return invalidateDataCache({ scope: hint.scope });
    }
    return invalidateDataCache({ scope: "tickets" });
};

/** Normalize API or legacy status strings to UI labels used in STATUS_TRANSITIONS / dropdowns. */
export const toDisplayTicketStatus = (status) => {
    if (!status) return TICKET_STATUS.CREATED;
    if (status === "DevOps Accepted") return TICKET_STATUS.ACCEPTED;
    const key = String(status).toUpperCase().replace(/\s+/g, "_");
    if (key === "REJECTED") return TICKET_STATUS.CLOSED;
    const map = {
        CREATED: TICKET_STATUS.CREATED,
        ACCEPTED: TICKET_STATUS.ACCEPTED,
        MANAGER_APPROVAL_PENDING: TICKET_STATUS.MANAGER_APPROVAL_PENDING,
        MANAGER_APPROVED: TICKET_STATUS.MANAGER_APPROVED,
        COST_APPROVAL_PENDING: TICKET_STATUS.COST_APPROVAL_PENDING,
        COST_APPROVED: TICKET_STATUS.COST_APPROVED,
        IN_PROGRESS: TICKET_STATUS.IN_PROGRESS,
        ACTION_REQUIRED: TICKET_STATUS.ACTION_REQUIRED,
        ON_HOLD: TICKET_STATUS.ON_HOLD,
        COMPLETED: TICKET_STATUS.COMPLETED,
        CLOSED: TICKET_STATUS.CLOSED
    };
    return map[status] || map[key] || status;
};

const toApiStatus = (displayStatus) => {
    const map = {
        [TICKET_STATUS.CREATED]: "CREATED",
        [TICKET_STATUS.ACCEPTED]: "ACCEPTED",
        [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: "MANAGER_APPROVAL_PENDING",
        [TICKET_STATUS.MANAGER_APPROVED]: "MANAGER_APPROVED",
        [TICKET_STATUS.COST_APPROVAL_PENDING]: "COST_APPROVAL_PENDING",
        [TICKET_STATUS.COST_APPROVED]: "COST_APPROVED",
        [TICKET_STATUS.IN_PROGRESS]: "IN_PROGRESS",
        [TICKET_STATUS.ACTION_REQUIRED]: "ACTION_REQUIRED",
        [TICKET_STATUS.ON_HOLD]: "ON_HOLD",
        [TICKET_STATUS.COMPLETED]: "COMPLETED",
        [TICKET_STATUS.CLOSED]: "CLOSED"
    };
    return map[displayStatus] || displayStatus;
};

const toApiRequestType = (displayType) => {
    const raw = String(displayType ?? "").trim();
    if (!raw) {
        throw new Error("Request type is required");
    }
    const map = {
        [REQUEST_TYPES.NEW_ENVIRONMENT]: "NEW_ENVIRONMENT",
        [REQUEST_TYPES.ENVIRONMENT_UP]: "ENVIRONMENT_UP",
        [REQUEST_TYPES.ENVIRONMENT_DOWN]: "ENVIRONMENT_DOWN",
        [REQUEST_TYPES.GENERAL_REQUEST]: "GENERAL_REQUEST",
        [REQUEST_TYPES.CODE_CUT]: "CODE_CUT",
        "Issue Fix": "ISSUE_FIX",
        "Other Queries": "OTHER_QUERIES",
        "Build Request": "BUILD_REQUEST"
    };
    if (map[raw]) return map[raw];
    const apiEnum = raw.toUpperCase().replace(/[\s-]+/g, "_");
    const supported = new Set(Object.values(map));
    if (supported.has(apiEnum)) return apiEnum;
    throw new Error(`Unsupported request type value: ${raw}`);
};

const toApiEnvironment = (displayEnv) => {
    const raw = String(displayEnv ?? "").trim();
    if (!raw) {
        throw new Error("Environment is required");
    }
    const canon = normalizeEnvironmentLabel(displayEnv);
    if (ENV_DISPLAY_TO_API[canon]) return ENV_DISPLAY_TO_API[canon];
    const u = raw.toUpperCase().replace(/[\s-]+/g, "_");
    if (ENV_API_TO_DISPLAY[u]) return u;
    const l = raw.toLowerCase();
    if (/\bqa\b|quality/.test(l)) return "QA";
    if (/\buat\b|acceptance/.test(l)) return "UAT";
    if (/\bstage\b|staging/.test(l)) return "STAGE";
    if (/\bprod\b|production/.test(l)) return "PRODUCTION";
    return "DEV";
};

const toApiAvailability = (displayAvailability) => {
    const map = {
        [DEVOPS_AVAILABILITY_STATUS.AVAILABLE]: "AVAILABLE",
        [DEVOPS_AVAILABILITY_STATUS.BUSY]: "BUSY",
        [DEVOPS_AVAILABILITY_STATUS.AWAY]: "AWAY",
        [DEVOPS_AVAILABILITY_STATUS.OFFLINE]: "OFFLINE"
    };
    return map[displayAvailability] || "AVAILABLE";
};

const toDisplayAvailability = (apiAvailability) => {
    const normalized = String(apiAvailability || "").toUpperCase().replace(/\s+/g, "_");
    const map = {
        AVAILABLE: DEVOPS_AVAILABILITY_STATUS.AVAILABLE,
        ONLINE: DEVOPS_AVAILABILITY_STATUS.AVAILABLE,
        BUSY: DEVOPS_AVAILABILITY_STATUS.BUSY,
        AWAY: DEVOPS_AVAILABILITY_STATUS.AWAY,
        OFFLINE: DEVOPS_AVAILABILITY_STATUS.OFFLINE
    };
    return map[normalized] || DEVOPS_AVAILABILITY_STATUS.OFFLINE;
};

// authToken is now handled by tokenCacheService

const apiRequest = async (endpoint, options = {}) => {
    const doRequest = async (token) => {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    };

    // Use centralized token cache
    let token = await getAuthToken();
    let response = await doRequest(token);

    // Retry once on 401 with force refresh token
    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) {
            response = await doRequest(token);
        }
    }
    
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");

    const readErrorPayload = async () => {
        if (isJson) {
            return response.json().catch(() => ({}));
        }
        const text = await response.text().catch(() => "");
        return { message: text ? `Unexpected response from server: ${text.slice(0, 120)}` : "Unexpected response from server" };
    };

    if (!response.ok) {
        const errorData = await readErrorPayload();
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    if (!isJson) {
        const text = await response.text().catch(() => "");
        throw new Error(`Expected JSON response but received non-JSON content from ${endpoint}. ${text.slice(0, 120)}`);
    }
    return response.json();
};

const mapTimeline = (timeline = []) =>
    (timeline || []).map((entry) => ({
        ...entry,
        status: toDisplayTicketStatus(entry.status)
    }));

const mapTicket = (ticket) => {
    if (!ticket) return ticket;
    const requestTypeCode = ticket.requestType || ticket.type;
    const requestTypeFromApi = requestTypeApiValueToDisplay(requestTypeCode);
    const pickStr = (v) => String(v ?? "").trim();
    let assignedTo =
        pickStr(ticket.assignedTo) ||
        pickStr(ticket.assigneeName) ||
        pickStr(ticket.assignee?.name) ||
        pickStr(ticket.assignedEngineerName) ||
        "";
    if (!assignedTo) {
        assignedTo = deriveAssigneeNameFromTimeline(ticket);
    }
    let assignedToEmail =
        pickStr(ticket.assigneeEmail) ||
        pickStr(ticket.assignedToEmail) ||
        pickStr(ticket.assignee?.email) ||
        "";
    const requestedBy =
        ticket.requestedBy ||
        ticket.requesterName ||
        ticket.createdByName ||
        ticket.requester?.name ||
        "";
    const requesterEmail =
        ticket.requesterEmail ||
        ticket.createdByEmail ||
        ticket.requester?.email ||
        "";
    const isActive =
        ticket.active !== undefined
            ? ticket.active !== false
            : ticket.isActive !== undefined
                ? ticket.isActive !== false
                : true;

    return {
        ...ticket,
        requestType:
            requestTypeFromApi ||
            REQUEST_TYPES[requestTypeCode] ||
            LEGACY_REQUEST_TYPE_LABELS[requestTypeCode] ||
            requestTypeCode ||
            REQUEST_TYPES.GENERAL_REQUEST,
        environment: String(ticket.environmentLabel || "").trim() || environmentApiToDisplay(ticket.environment),
        status: toDisplayTicketStatus(ticket.status),
        costApprovalRequired: !!ticket.costApprovalRequired,
        estimatedCost: ticket.estimatedCost ?? null,
        costCurrency: ticket.costCurrency || "",
        costApprovalStatus: ticket.costApprovalStatus || "",
        costApprovalNote: ticket.costApprovalNote || "",
        costApprovalDate: ticket.costApprovalDate || null,
        costSubmittedBy: ticket.costSubmittedBy || "",
        costSubmittedByEmail: ticket.costSubmittedByEmail || "",
        isActive,
        requestedBy,
        requesterEmail,
        assignedTo,
        assignedToEmail,
        createdAt: ticket.createdAt || ticket.createdDate || ticket.createdOn || ticket.createdTimestamp,
        timeline: mapTimeline(ticket.timeline || ticket.statusHistory || []),
        projectId: ticket.projectId || null,
        workflowStages: ticket.workflowStages || null,
        workflowConfiguration: ticket.workflowConfiguration || null,
        currentApprovalLevel: ticket.currentApprovalLevel ?? null,
        totalApprovalLevels: ticket.totalApprovalLevels ?? null,
        deleted: !!ticket.deleted,
        deletedAt: ticket.deletedAt ?? null,
        deletedBy: ticket.deletedBy || "",
        deletedByEmail: ticket.deletedByEmail || ""
    };
};

const mapTickets = (tickets = []) => unwrapListPayload(tickets).map(mapTicket);

const mapCreateTicketPayload = (ticketData) => ({
    requestType: toApiRequestType(ticketData.requestType),
    productName: ticketData.productName,
    environment: toApiEnvironment(ticketData.environment),
    environmentLabel: String(ticketData.environment ?? "").trim(),
    description: ticketData.description || "",
    managerName: ticketData.managerName || "",
    managerEmail: ticketData.managerEmail || "",
    managerApprovalRequired: !!ticketData.managerApprovalRequired,
    toEmail: ticketData.toEmail || "",
    ccEmail: ticketData.ccEmail || "",
    bccEmail: ticketData.bccEmail || "",
    databaseType: ticketData.databaseType || "",
    purpose: ticketData.purpose || "",
    activationDate: ticketData.activationDate ? new Date(ticketData.activationDate).toISOString() : null,
    duration: ticketData.duration ? Number(ticketData.duration) : null,
    shutdownDate: ticketData.shutdownDate ? new Date(ticketData.shutdownDate).toISOString() : null,
    shutdownReason: ticketData.shutdownReason || "",
    releaseVersion: ticketData.releaseVersion || "",
    deploymentStrategy: ticketData.deploymentStrategy || "",
    releaseNotes: ticketData.releaseNotes || "",
    issueType: ticketData.issueType || "",
    issueDescription: ticketData.issueDescription || "",
    errorLogs: ticketData.errorLogs || "",
    branchName: ticketData.branchName || "",
    commitId: ticketData.commitId || "",
    reason: ticketData.reason || "",
    otherQueryDetails: ticketData.otherQueryDetails || "",
    attachments: ticketData.attachments || []
});

// Tickets
export const initializeDemoData = () => {};

export const createTicket = async (ticketData) => {
    const created = await apiRequest("/tickets", {
        method: "POST",
        body: JSON.stringify(mapCreateTicketPayload(ticketData))
    });
    emitDataChange("tickets", "create");
    return mapTicket(created);
};

export const getAllTickets = async (opts = {}) => {
    const force = Boolean(opts && opts.force);
    const cacheKey = CACHE_KEYS.TICKETS_ALL;
    if (!force) {
        const cached = getCached(cacheKey);
        if (cached) {
            void apiRequest("/tickets")
                .then((data) => setCached(cacheKey, mapTickets(data)))
                .catch(() => {});
            return cached;
        }
    }
    const data = await apiRequest("/tickets");
    return setCached(cacheKey, mapTickets(data));
};

export const getTicketsByUser = async (_email, { force = false } = {}) => {
    const cacheKey = userTicketsCacheKey(_email);
    if (!force) {
        const cached = getCached(cacheKey);
        if (cached) {
            void apiRequest("/tickets/my-tickets")
                .then((data) => setCached(cacheKey, mapTickets(data)))
                .catch(() => {});
            return cached;
        }
    }
    const data = await apiRequest("/tickets/my-tickets");
    return setCached(cacheKey, mapTickets(data));
};

export const getTicketById = async (ticketId) => {
    const raw = await apiRequest(`/tickets/${encodeURIComponent(ticketId)}`);
    return mapTicket(raw);
};

/** DevOps/Admin: server-side ticket search (id fragment e.g. 0002, product name, description, assignees…). */
export const searchTicketsApi = async (q) => {
    const t = String(q || "").trim();
    if (!t) return [];
    const raw = await apiRequest(`/tickets/search?q=${encodeURIComponent(t)}`);
    return mapTickets(raw);
};

/** Current user as requester only — same scope as my-tickets. */
export const searchMyTicketsApi = async (q) => {
    const t = String(q || "").trim();
    if (!t) return [];
    const raw = await apiRequest(`/tickets/my-search?q=${encodeURIComponent(t)}`);
    return mapTickets(raw);
};

export const getActiveTicketsForDevOps = async () => {
    const all = await getAllTickets({ force: true });
    return all.filter((ticket) => ticket.isActive !== false);
};

export const updateTicketStatus = async (ticketId, newStatus, _user, notes = "", options = {}) => {
    const body = { newStatus: toApiStatus(newStatus), notes: notes ?? "" };
    if (options.reopen) body.reopen = true;
    if (options.approvalTargetEmail && String(options.approvalTargetEmail).trim()) {
        body.approvalTargetEmail = String(options.approvalTargetEmail).trim();
    }
    const updated = await apiRequest(`/tickets/${ticketId}/status`, {
        method: "PUT",
        body: JSON.stringify(body)
    });
    emitDataChange("tickets", "status-update");
    return mapTicket(updated);
};

export const toApiTicketStatus = (displayStatus) => toApiStatus(displayStatus);

export const addTicketNote = async (ticketId, _user, notes, attachments = []) => {
    const updated = await apiRequest(`/tickets/${ticketId}/notes`, {
        method: "POST",
        body: JSON.stringify({ notes, attachments: attachments || [] })
    });
    emitDataChange("tickets", "note-add");
    return mapTicket(updated);
};

/**
 * Upload files for a note attachment to Azure Blob Storage via backend.
 * Each file must be ≤ {@link NOTE_ATTACHMENT_MAX_MB} MB. Returns { uploaded: [{url, name, type, size}], errors: [] }.
 */
export const uploadNoteAttachments = async (ticketId, files) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    let token = await getAuthToken();
    const doUpload = async (t) =>
        fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments/upload`, {
            method: "POST",
            headers: t ? { Authorization: `Bearer ${t}` } : {},
            body: formData
        });

    let response = await doUpload(token);
    if (response.status === 401) {
        token = await refreshAuthToken();
        if (token) response = await doUpload(token);
    }

    if (!response.ok) {
        const msg = await response.text().catch(() => "Upload error");
        throw new Error(msg);
    }
    return response.json();
};

export const assignTicket = async (ticketId, assignee, user) => {
    const updated = await apiRequest(`/tickets/${ticketId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ assigneeName: assignee, assigneeEmail: user?.email || "" })
    });
    emitDataChange("tickets", "assign");
    return mapTicket(updated);
};

export const forwardTicket = async (ticketId, newAssignee, newAssigneeEmail, _user, forwardNote = "") => {
    const updated = await apiRequest(`/tickets/${ticketId}/forward`, {
        method: "PUT",
        body: JSON.stringify({
            newAssigneeName: newAssignee,
            newAssigneeEmail,
            notes: forwardNote
        })
    });
    emitDataChange("tickets", "forward");
    return mapTicket(updated);
};

export const submitCostEstimation = async (
    ticketId,
    estimatedCost,
    currency = "USD",
    notes = "",
    costApproverEmail = ""
) => {
    const body = {
        ticketId,
        estimatedCost: Number(estimatedCost),
        currency,
        notes: notes || ""
    };
    const ca = String(costApproverEmail || "").trim();
    if (ca) body.costApproverEmail = ca;
    const updated = await apiRequest("/tickets/cost-submission", {
        method: "POST",
        body: JSON.stringify(body)
    });
    emitDataChange("tickets", "cost-submission");
    return mapTicket(updated);
};

export const convertCurrency = async (amount, from, to) => {
    const data = await apiRequest(
        `/currency/convert?amount=${encodeURIComponent(Number(amount || 0))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    return data;
};

export const getUnassignedTickets = async () => mapTickets(await apiRequest("/tickets/unassigned"));
export const getAssignedTickets = async () => mapTickets(await apiRequest("/tickets/assigned-to-me"));
export const getActiveTickets = async () => mapTickets(await apiRequest("/tickets/active"));
export const getCompletedTickets = async () => mapTickets(await apiRequest("/tickets/completed"));

export const deleteTicket = async (ticketId) => {
    await apiRequest(`/tickets/${ticketId}`, { method: "DELETE" });
    emitDataChange("tickets", "delete");
};

/** Admin: tickets in the recycle bin (soft-deleted). */
export const getDeletedTickets = async () => {
    const data = await apiRequest("/tickets/deleted");
    return mapTickets(data);
};

/** Admin: restore a soft-deleted ticket. */
export const restoreTicket = async (ticketId) => {
    const updated = await apiRequest(`/tickets/${encodeURIComponent(ticketId)}/restore`, {
        method: "POST"
    });
    emitDataChange("tickets", "restore");
    return mapTicket(updated);
};

export const toggleTicketActiveStatus = async (ticketId, user, isActive) => {
    const updated = await apiRequest(`/tickets/${ticketId}/active`, {
        method: "PUT",
        body: JSON.stringify({
            active: !!isActive,
            notes: isActive ? "Ticket marked as active" : "Ticket marked as inactive"
        })
    });
    const mapped = mapTicket(updated);
    if (!isActive && mapped) {
        mapped.timeline = [
            ...(mapped.timeline || []),
            {
                status: mapped.status || TICKET_STATUS.CREATED,
                timestamp: new Date().toISOString(),
                user: user?.name || "User",
                notes: "Ticket marked as inactive",
                action: INACTIVE_STATUS
            }
        ];
    }
    emitDataChange("tickets", "toggle-active");
    return mapped;
};

export const filterTickets = async () => getAllTickets();

export const getTicketStats = async () => {
    const cacheKey = CACHE_KEYS.TICKET_STATS;
    const cached = getCached(cacheKey);
    if (cached) {
        void (async () => {
            try {
                const statsPayload = await apiRequest("/tickets/stats");
                const stats = statsPayload?.data || statsPayload || {};
                const byStatus = {};
                Object.entries(stats.byStatus || {}).forEach(([k, v]) => {
                    const d = toDisplayTicketStatus(k);
                    byStatus[d] = (byStatus[d] || 0) + Number(v);
                });
                const byRequestType = {};
                Object.entries(stats.byRequestType || {}).forEach(([k, v]) => {
                    byRequestType[requestTypeApiValueToDisplay(k) || REQUEST_TYPES.GENERAL_REQUEST] = v;
                });
                const byEnvironment = {};
                Object.entries(stats.byEnvironment || {}).forEach(([k, v]) => {
                    const label = environmentApiToDisplay(k);
                    byEnvironment[label] = (byEnvironment[label] || 0) + Number(v);
                });
                const myTickets = await getTicketsByUser(undefined, { force: true });
                setCached(cacheKey, {
                    total: myTickets.length,
                    active: myTickets.filter((t) => t.isActive !== false && ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length,
                    completed: myTickets.filter((t) => t.status === TICKET_STATUS.COMPLETED).length,
                    pending: myTickets.filter((t) => t.status === TICKET_STATUS.CREATED).length,
                    inactive: myTickets.filter((t) => t.isActive === false).length,
                    byStatus,
                    byRequestType,
                    byEnvironment
                });
            } catch {
                // Keep stale cached stats on background refresh failure.
            }
        })();
        return cached;
    }

    const statsPayload = await apiRequest("/tickets/stats");
    const stats = statsPayload?.data || statsPayload || {};
    const byStatus = {};
    Object.entries(stats.byStatus || {}).forEach(([k, v]) => {
        const d = toDisplayTicketStatus(k);
        byStatus[d] = (byStatus[d] || 0) + Number(v);
    });
    const byRequestType = {};
    Object.entries(stats.byRequestType || {}).forEach(([k, v]) => {
        byRequestType[requestTypeApiValueToDisplay(k) || REQUEST_TYPES.GENERAL_REQUEST] = v;
    });
    const byEnvironment = {};
    Object.entries(stats.byEnvironment || {}).forEach(([k, v]) => {
        const label = environmentApiToDisplay(k);
        byEnvironment[label] = (byEnvironment[label] || 0) + Number(v);
    });

    const myTickets = await getTicketsByUser(undefined, { force: true });
    return setCached(cacheKey, {
        total: myTickets.length,
        active: myTickets.filter((t) => t.isActive !== false && ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length,
        completed: myTickets.filter((t) => t.status === TICKET_STATUS.COMPLETED).length,
        pending: myTickets.filter((t) => t.status === TICKET_STATUS.CREATED).length,
        inactive: myTickets.filter((t) => t.isActive === false).length,
        byStatus,
        byRequestType,
        byEnvironment
    });
};

// DevOps Team
export const getDevOpsTeamMembers = async ({ force = false } = {}) => {
    const cacheKey = "devops-team";
    if (!force) {
        const cached = getCached(cacheKey);
        if (cached) return cached;
    }
    const membersPayload = await apiRequest("/devops-team");
    const normalized = unwrapListPayload(membersPayload).map((m) => ({
        ...m,
        name: m.name || m.fullName || m.displayName || m.userName || "",
        email: (m.email || m.mail || m.userPrincipalName || "").toLowerCase(),
        availability: toDisplayAvailability(m.availability)
    }));

    // De-duplicate by email to avoid repeated cards when data source has duplicates.
    const dedupedByEmail = new Map();
    normalized.forEach((member) => {
        const key = (member.email || "").trim().toLowerCase();
        if (!key) return;
        if (!dedupedByEmail.has(key)) {
            dedupedByEmail.set(key, member);
            return;
        }
        // Prefer the most recently updated record when duplicates exist.
        const existing = dedupedByEmail.get(key);
        const existingUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const currentUpdated = member?.updatedAt ? new Date(member.updatedAt).getTime() : 0;
        if (currentUpdated >= existingUpdated) {
            dedupedByEmail.set(key, member);
        }
    });

    return setCached(cacheKey, Array.from(dedupedByEmail.values()));
};

export const initializeDevOpsTeamData = () => {};

export const addDevOpsTeamMember = async (member) => {
    const created = await apiRequest("/devops-team", {
        method: "POST",
        body: JSON.stringify({
            name: member?.name?.trim() || "",
            email: (member?.email || "").toLowerCase(),
            availability: toApiAvailability(member?.availability || DEVOPS_AVAILABILITY_STATUS.AVAILABLE)
        })
    });
    const mapped = {
        ...(created || {}),
        name: created?.name || created?.fullName || member?.name || "",
        email: (created?.email || created?.mail || member?.email || "").toLowerCase(),
        availability: toDisplayAvailability(created?.availability || member?.availability)
    };
    emitDataChange("devops-team", "create");
    return mapped;
};

export const upsertDevOpsTeamMember = async (member) => {
    // Validate input before sending
    const name = (member?.name || "").trim();
    const email = (member?.email || "").toLowerCase().trim();
    
    if (!name || !email || !email.includes('@')) {
        // Skip silently if invalid data - not a real user session
        console.log('[API] Skipping upsert - invalid member data');
        return { name, email, availability: DEVOPS_AVAILABILITY_STATUS.AVAILABLE };
    }
    
    try {
        const upserted = await apiRequest("/devops-team/upsert", {
            method: "PUT",
            body: JSON.stringify({
                name: name,
                email: email,
                availability: toApiAvailability(member?.availability || DEVOPS_AVAILABILITY_STATUS.AVAILABLE)
            })
        });
        const mapped = {
            ...upserted,
            name: upserted?.name || upserted?.fullName || name,
            email: (upserted?.email || upserted?.mail || email).toLowerCase(),
            availability: toDisplayAvailability(upserted?.availability || member?.availability)
        };
        return mapped;
    } catch (err) {
        // On any error, try to fetch existing member
        console.log('[API] Upsert failed, attempting fallback:', err?.message);
        try {
            const all = await getDevOpsTeamMembers();
            const found = all.find((m) => (m.email || "").toLowerCase() === email);
            if (found) return found;
        } catch (fallbackErr) {
            // Ignore fallback errors
        }
        // Return placeholder to avoid breaking the UI
        return { name, email, availability: DEVOPS_AVAILABILITY_STATUS.AVAILABLE };
    }
};

export const updateDevOpsAvailability = async (email, availability, fallbackName = "") => {
    let updated;
    try {
        updated = await apiRequest(`/devops-team/${encodeURIComponent(email)}/availability`, {
            method: "PUT",
            body: JSON.stringify({ availability: toApiAvailability(availability) })
        });
    } catch (_e) {
        await upsertDevOpsTeamMember({
            name: fallbackName || email?.split("@")[0] || "DevOps User",
            email,
            availability
        });
        updated = await apiRequest(`/devops-team/${encodeURIComponent(email)}/availability`, {
            method: "PUT",
            body: JSON.stringify({ availability: toApiAvailability(availability) })
        });
    }
    const mapped = {
        ...(updated || {}),
        email: (updated?.email || email || "").toLowerCase(),
        availability: toDisplayAvailability(updated?.availability || availability)
    };
    emitDataChange("devops-team", "availability-update");
    return mapped;
};

export const getAvailableDevOpsMembers = async () => {
    const members = await getDevOpsTeamMembers();
    return members.filter((m) => m.availability === DEVOPS_AVAILABILITY_STATUS.AVAILABLE);
};

// Projects
export const getProjects = async ({ force = false } = {}) => {
    const cacheKey = "projects";
    if (!force) {
        const cached = getCached(cacheKey);
        if (cached) return cached;
    }
    const projectsPayload = await apiRequest("/projects");
    const mapped = unwrapListPayload(projectsPayload).map((project) => ({
        ...project,
        name: project.name || project.projectName || project.title || "",
        tag: project.tag || project.alias || project.code || "",
        environments: Array.isArray(project.environments) ? project.environments.filter(Boolean) : []
    })).filter((project) => project.name);
    return setCached(cacheKey, mapped);
};
export const initializeProjectData = () => {};
export const addProject = async (projectName, projectTag = "", environments = []) => {
    const created = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({
            name: projectName,
            projectName,
            tag: projectTag || "",
            environments: Array.isArray(environments) ? environments : []
        })
    });
    emitDataChange("projects", "create");
    return created;
};

/** Replace product deployment environment list (admin workflow editor). */
export const updateProjectEnvironments = async (projectId, environments = []) => {
    const updated = await apiRequest(`/projects/${encodeURIComponent(projectId)}/environments`, {
        method: "PATCH",
        body: JSON.stringify({ environments: Array.isArray(environments) ? environments : [] })
    });
    emitDataChange("projects", "update-environments");
    return updated;
};

// Standups
export const getStandupNotes = async () => apiRequest("/standups");
export const addStandupNote = async ({ date, summary, updates }) => {
    const created = await apiRequest("/standups", {
        method: "POST",
        body: JSON.stringify({ date, summary, updates })
    });
    emitDataChange("standups", "create");
    return created;
};
export const getStandupNotesByDate = async (date) => apiRequest(`/standups?date=${encodeURIComponent(date)}`);

// Rota
export const getRotaManagementState = async () => apiRequest("/rota/state");
export const setRotaLeaveForDate = async (date, email, isLeave) => {
    const updated = await apiRequest("/rota/leave", {
        method: "PUT",
        body: JSON.stringify({ date, email, leave: !!isLeave })
    });
    emitDataChange("rota", "leave-update");
    return updated;
};
export const setRotaManualAssignment = async (date, emails = []) => {
    const updated = await apiRequest("/rota/manual", {
        method: "PUT",
        body: JSON.stringify({ date, emails: (emails || []).slice(0, 4) })
    });
    emitDataChange("rota", "manual-update");
    return updated;
};

export const setRotaRotationMode = async (rotationMode) => {
    const updated = await apiRequest("/rota/rotation-mode", {
        method: "POST",
        body: JSON.stringify({ rotationMode: String(rotationMode || "DAILY").toUpperCase() })
    });
    emitDataChange("rota", "rotation-mode");
    return updated;
};
export const getRotaSchedule = async (days = 14, startDate = new Date()) => {
    const date = new Date(startDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return apiRequest(`/rota/schedule?days=${encodeURIComponent(days)}&startDate=${encodeURIComponent(key)}`);
};

// Managers
export const getManagers = async (activeOnly = true, { force = false } = {}) => {
    const cacheKey = `managers:${!!activeOnly}`;
    if (!force) {
        const cached = getCached(cacheKey);
        if (cached) return cached;
    }
    const payload = await apiRequest(`/managers?activeOnly=${activeOnly}`);
    const mapped = unwrapListPayload(payload).map((m) => ({
        ...m,
        name: m.name || "",
        email: m.email || ""
    }));
    return setCached(cacheKey, mapped);
};

export const addManager = async (name, email) => {
    const created = await apiRequest("/managers", {
        method: "POST",
        body: JSON.stringify({ name, email })
    });
    emitDataChange("managers", "create");
    return created;
};

export const updateManager = async (id, name, email) => {
    const updated = await apiRequest(`/managers/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, email })
    });
    emitDataChange("managers", "update");
    return updated;
};

export const deleteManager = async (id) => {
    await apiRequest(`/managers/${encodeURIComponent(id)}`, { method: "DELETE" });
    emitDataChange("managers", "delete");
};

export const toggleManagerStatus = async (id, active) => {
    await apiRequest(`/managers/${encodeURIComponent(id)}/status?active=${active}`, { method: "PATCH" });
    emitDataChange("managers", "toggle-status");
};

// CC Email LocalStorage helpers
const CC_EMAILS_KEY = "devops_portal_cc_emails";

export const getSavedCcEmails = () => {
    try {
        const saved = localStorage.getItem(CC_EMAILS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

export const saveCcEmail = (email) => {
    if (!email || typeof email !== "string") return;
    const normalized = email.toLowerCase().trim();
    if (!normalized.includes("@")) return;
    
    const existing = getSavedCcEmails();
    if (!existing.includes(normalized)) {
        const updated = [normalized, ...existing].slice(0, 50); // Keep max 50
        try {
            localStorage.setItem(CC_EMAILS_KEY, JSON.stringify(updated));
        } catch { /* ignore */ }
    }
};

export const removeSavedCcEmail = (email) => {
    const normalized = (email || "").toLowerCase().trim();
    const existing = getSavedCcEmails();
    const updated = existing.filter((e) => e !== normalized);
    try {
        localStorage.setItem(CC_EMAILS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
};
