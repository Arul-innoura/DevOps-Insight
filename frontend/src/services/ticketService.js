/**
 * Ticket Service - backend API backed service.
 */

import { getAuthToken, refreshAuthToken } from "./tokenCacheService";

// Request Types
export const REQUEST_TYPES = {
    NEW_ENVIRONMENT: "New Environment",
    ENVIRONMENT_UP: "Environment Up",
    ENVIRONMENT_DOWN: "Environment Down",
    ISSUE_FIX: "Issue Fix",
    BUILD_REQUEST: "General Request",
    OTHER_QUERIES: "Other Queries",
    CODE_CUT: "Code Cut"
};

/** Maps UI request type label to backend RequestType enum name (workflow API). */
export const REQUEST_TYPE_TO_API_ENUM = {
    [REQUEST_TYPES.NEW_ENVIRONMENT]: "NEW_ENVIRONMENT",
    [REQUEST_TYPES.ENVIRONMENT_UP]: "ENVIRONMENT_UP",
    [REQUEST_TYPES.ENVIRONMENT_DOWN]: "ENVIRONMENT_DOWN",
    [REQUEST_TYPES.ISSUE_FIX]: "ISSUE_FIX",
    [REQUEST_TYPES.BUILD_REQUEST]: "BUILD_REQUEST",
    [REQUEST_TYPES.OTHER_QUERIES]: "OTHER_QUERIES",
    [REQUEST_TYPES.CODE_CUT]: "CODE_CUT"
};

/** Display label for legacy API values no longer offered in the create form */
const LEGACY_REQUEST_TYPE_LABELS = {
    RELEASE_DEPLOYMENT: "Release Deployment"
};

// Ticket Statuses
export const TICKET_STATUS = {
    CREATED: "Ticket Raised",
    ACCEPTED: "DevOps Accepted",
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

// Environment Options
export const ENVIRONMENTS = ["Dev", "QA", "Stage", "Production"];

// DevOps availability statuses
export const DEVOPS_AVAILABILITY_STATUS = {
    AVAILABLE: "Available",
    BUSY: "Busy",
    AWAY: "Away",
    OFFLINE: "Offline"
};

// Status colors for UI
export const STATUS_COLORS = {
    [TICKET_STATUS.CREATED]: { bg: "#dbeafe", text: "#1e40af" },
    [TICKET_STATUS.ACCEPTED]: { bg: "#e0f2fe", text: "#0369a1" },
    [TICKET_STATUS.MANAGER_APPROVAL_PENDING]: { bg: "#fef3c7", text: "#92400e" },
    [TICKET_STATUS.MANAGER_APPROVED]: { bg: "#dcfce7", text: "#166534" },
    [TICKET_STATUS.COST_APPROVAL_PENDING]: { bg: "#ffedd5", text: "#9a3412" },
    [TICKET_STATUS.COST_APPROVED]: { bg: "#d1fae5", text: "#065f46" },
    [TICKET_STATUS.IN_PROGRESS]: { bg: "#ddd6fe", text: "#5b21b6" },
    [TICKET_STATUS.ACTION_REQUIRED]: { bg: "#fee2e2", text: "#991b1b" },
    [TICKET_STATUS.ON_HOLD]: { bg: "#f3f4f6", text: "#374151" },
    [TICKET_STATUS.COMPLETED]: { bg: "#d1fae5", text: "#065f46" },
    [TICKET_STATUS.CLOSED]: { bg: "#fee2e2", text: "#dc2626" }
};

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
    const managerRequired =
        !!ticket.managerApprovalRequired ||
        Number(ticket.totalApprovalLevels || 0) > 0;
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
            return [TICKET_STATUS.COST_APPROVAL_PENDING, TICKET_STATUS.CLOSED];
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

const resolveApiBaseUrl = () => {
    const envUrl = (process.env.REACT_APP_API_URL || "").trim();
    const origin = window.location.origin.replace(/\/$/, "");
    const isProdHost = !/localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const envPointsLocal = /localhost|127\.0\.0\.1/i.test(envUrl);
    if (isProdHost && envPointsLocal) {
        return `${origin}/api`;
    }
    return envUrl || `${origin}/api`;
};
const API_BASE_URL = resolveApiBaseUrl();
const INACTIVE_STATUS = "INACTIVE";
const DATA_CHANGE_EVENT = "portal-data-changed";
const MEMORY_CACHE = new Map();
const CACHE_TTL_MS = 30 * 1000;

const emitDataChange = (scope, action) => {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    if (scope === "devops-team" || scope === "projects" || scope === "managers") {
        MEMORY_CACHE.delete(`devops-team`);
        MEMORY_CACHE.delete(`projects`);
        MEMORY_CACHE.delete(`managers:true`);
        MEMORY_CACHE.delete(`managers:false`);
    }
    window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, {
        detail: {
            scope,
            action,
            timestamp: Date.now()
        }
    }));
};

export const subscribeDataChanges = (listener) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
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

const toDisplayStatus = (status) => {
    if (!status) return TICKET_STATUS.CREATED;
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
    const map = {
        [REQUEST_TYPES.NEW_ENVIRONMENT]: "NEW_ENVIRONMENT",
        [REQUEST_TYPES.ENVIRONMENT_UP]: "ENVIRONMENT_UP",
        [REQUEST_TYPES.ENVIRONMENT_DOWN]: "ENVIRONMENT_DOWN",
        [REQUEST_TYPES.ISSUE_FIX]: "ISSUE_FIX",
        [REQUEST_TYPES.BUILD_REQUEST]: "BUILD_REQUEST",
        [REQUEST_TYPES.OTHER_QUERIES]: "OTHER_QUERIES",
        [REQUEST_TYPES.CODE_CUT]: "CODE_CUT"
    };
    return map[displayType] || "NEW_ENVIRONMENT";
};

const toApiEnvironment = (displayEnv) => {
    const map = { Dev: "DEV", QA: "QA", Stage: "STAGE", Production: "PRODUCTION" };
    return map[displayEnv] || displayEnv?.toUpperCase?.() || "DEV";
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
        status: toDisplayStatus(entry.status)
    }));

const mapTicket = (ticket) => {
    if (!ticket) return ticket;
    const requestTypeCode = ticket.requestType || ticket.type;
    const assignedTo =
        ticket.assignedTo ||
        ticket.assigneeName ||
        ticket.assignee?.name ||
        ticket.assignedEngineerName ||
        "";
    const assignedToEmail =
        ticket.assigneeEmail ||
        ticket.assignedToEmail ||
        ticket.assignee?.email ||
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
            REQUEST_TYPES[requestTypeCode] ||
            LEGACY_REQUEST_TYPE_LABELS[requestTypeCode] ||
            requestTypeCode ||
            REQUEST_TYPES.BUILD_REQUEST,
        environment: ticket.environment ? (ticket.environment.charAt(0) + ticket.environment.slice(1).toLowerCase()) : "",
        status: toDisplayStatus(ticket.status),
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
        totalApprovalLevels: ticket.totalApprovalLevels ?? null
    };
};

const mapTickets = (tickets = []) => unwrapListPayload(tickets).map(mapTicket);

const mapCreateTicketPayload = (ticketData) => ({
    requestType: toApiRequestType(ticketData.requestType),
    productName: ticketData.productName,
    environment: toApiEnvironment(ticketData.environment),
    description: ticketData.description || "",
    managerName: ticketData.managerName || "",
    managerEmail: ticketData.managerEmail || "",
    managerApprovalRequired: !!ticketData.managerApprovalRequired,
    ccEmail: ticketData.ccEmail || "",
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

export const getAllTickets = async () => {
    const data = await apiRequest("/tickets");
    return mapTickets(data);
};

export const getTicketsByUser = async (_email) => {
    const data = await apiRequest("/tickets/my-tickets");
    return mapTickets(data);
};

export const getActiveTicketsForDevOps = async () => {
    const all = await getAllTickets();
    return all.filter((ticket) => ticket.isActive !== false);
};

export const updateTicketStatus = async (ticketId, newStatus, _user, notes = "") => {
    const updated = await apiRequest(`/tickets/${ticketId}/status`, {
        method: "PUT",
        body: JSON.stringify({ newStatus: toApiStatus(newStatus), notes })
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

export const submitCostEstimation = async (ticketId, estimatedCost, currency = "USD", notes = "") => {
    const updated = await apiRequest("/tickets/cost-submission", {
        method: "POST",
        body: JSON.stringify({
            ticketId,
            estimatedCost: Number(estimatedCost),
            currency,
            notes: notes || ""
        })
    });
    emitDataChange("tickets", "cost-submission");
    return mapTicket(updated);
};

export const getUnassignedTickets = async () => mapTickets(await apiRequest("/tickets/unassigned"));
export const getAssignedTickets = async () => mapTickets(await apiRequest("/tickets/assigned-to-me"));
export const getActiveTickets = async () => mapTickets(await apiRequest("/tickets/active"));
export const getCompletedTickets = async () => mapTickets(await apiRequest("/tickets/completed"));

export const deleteTicket = async (ticketId) => {
    await apiRequest(`/tickets/${ticketId}`, { method: "DELETE" });
    emitDataChange("tickets", "delete");
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
    const statsPayload = await apiRequest("/tickets/stats");
    const stats = statsPayload?.data || statsPayload || {};
    const byStatus = {};
    Object.entries(stats.byStatus || {}).forEach(([k, v]) => {
        const d = toDisplayStatus(k);
        byStatus[d] = (byStatus[d] || 0) + Number(v);
    });
    const byRequestType = {};
    Object.entries(stats.byRequestType || {}).forEach(([k, v]) => {
        byRequestType[REQUEST_TYPES[k] || REQUEST_TYPES.BUILD_REQUEST] = v;
    });
    const byEnvironment = {};
    Object.entries(stats.byEnvironment || {}).forEach(([k, v]) => {
        byEnvironment[k.charAt(0) + k.slice(1).toLowerCase()] = v;
    });

    const myTickets = await getTicketsByUser();
    return {
        total: myTickets.length,
        active: myTickets.filter((t) => t.isActive !== false && ![TICKET_STATUS.COMPLETED, TICKET_STATUS.CLOSED].includes(t.status)).length,
        completed: myTickets.filter((t) => t.status === TICKET_STATUS.COMPLETED).length,
        pending: myTickets.filter((t) => t.status === TICKET_STATUS.CREATED).length,
        inactive: myTickets.filter((t) => t.isActive === false).length,
        byStatus,
        byRequestType,
        byEnvironment
    };
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
        tag: project.tag || project.alias || project.code || ""
    })).filter((project) => project.name);
    return setCached(cacheKey, mapped);
};
export const initializeProjectData = () => {};
export const addProject = async (projectName, projectTag = "") => {
    const created = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({
            name: projectName,
            projectName,
            tag: projectTag || ""
        })
    });
    emitDataChange("projects", "create");
    return created;
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
        body: JSON.stringify({ date, emails: (emails || []).slice(0, 2) })
    });
    emitDataChange("rota", "manual-update");
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
