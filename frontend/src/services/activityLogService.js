import { apiRequest } from "./apiClient";

/**
 * Fetch the 200 most-recent activity log entries.
 * Requires Admin role.
 */
export const getActivityLogs = async () => apiRequest("/activity-logs");

/**
 * Fetch activity logs scoped to a specific ticket.
 * Requires Admin or DevOps role.
 */
export const getTicketActivityLogs = async (ticketId) =>
    apiRequest(`/activity-logs/ticket/${encodeURIComponent(ticketId)}`);
