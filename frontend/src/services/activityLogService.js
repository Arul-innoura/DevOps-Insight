import { resolveApiBaseUrl } from "../config/apiBaseUrl";
import { getAuthToken } from "./tokenCacheService";

const API = resolveApiBaseUrl();

const authHeaders = async () => {
    const token = await getAuthToken();
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
};

/**
 * Fetch the 200 most-recent activity log entries.
 * Requires Admin role.
 */
export const getActivityLogs = async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/activity-logs`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch activity logs: ${res.status}`);
    return res.json();
};

/**
 * Fetch activity logs scoped to a specific ticket.
 * Requires Admin or DevOps role.
 */
export const getTicketActivityLogs = async (ticketId) => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/activity-logs/ticket/${encodeURIComponent(ticketId)}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ticket activity logs: ${res.status}`);
    return res.json();
};
