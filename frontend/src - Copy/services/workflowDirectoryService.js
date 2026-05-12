import { apiRequest } from "./apiClient";

/**
 * Contacts from all saved product workflows (optionally excluding one product), for autocomplete.
 * @param {{ excludeProjectId?: string, q?: string }} params
 * @returns {Promise<Array<{ email: string, name?: string, role?: string }>>}
 */
export const fetchWorkflowDirectoryContacts = async (params = {}) => {
    const search = new URLSearchParams();
    if (params.excludeProjectId) search.set("excludeProjectId", params.excludeProjectId);
    if (params.q && String(params.q).trim()) search.set("q", String(params.q).trim());
    const qs = search.toString();
    const path = `/workflow-directory/contacts${qs ? `?${qs}` : ""}`;
    const data = (await apiRequest(path)) ?? [];
    return Array.isArray(data) ? data : [];
};
