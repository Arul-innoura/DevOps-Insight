/**
 * API Service - Handles API calls to the backend
 * This replaces localStorage operations when a backend is available
 */

import { resolveApiBaseUrl } from "../config/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl();

// Helper to get the access token
const getAccessToken = () => {
    // Try to get token from MSAL
    const msalToken = sessionStorage.getItem('msal.idtoken');
    if (msalToken) return msalToken;
    
    // Check for test auth token
    const testAuth = localStorage.getItem('testAuth');
    if (testAuth) {
        const parsed = JSON.parse(testAuth);
        return parsed.token || 'test-token';
    }
    
    return null;
};

// Helper for API requests
const apiRequest = async (endpoint, options = {}) => {
    const token = getAccessToken();
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
    
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
    
    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    
    return response.json();
};

// ==================== Ticket API Endpoints ====================

/**
 * Create a new ticket
 * @param {Object} ticketData - The ticket data
 */
export const createTicketAPI = async (ticketData) => {
    return apiRequest('/tickets', {
        method: 'POST',
        body: JSON.stringify(ticketData),
    });
};

/**
 * Get current user's tickets
 */
export const getMyTicketsAPI = async () => {
    return apiRequest('/tickets/my-tickets');
};

/**
 * Get current user's ticket statistics
 */
export const getMyStatsAPI = async () => {
    return apiRequest('/tickets/my-stats');
};

/**
 * Get ticket by ID
 * @param {string} ticketId - The ticket ID
 */
export const getTicketByIdAPI = async (ticketId) => {
    return apiRequest(`/tickets/${ticketId}`);
};

/**
 * Get all tickets (DevOps & Admin)
 */
export const getAllTicketsAPI = async () => {
    return apiRequest('/tickets');
};

/**
 * Get tickets with filters (DevOps & Admin)
 * @param {Object} filterRequest - The filter parameters
 */
export const getTicketsWithFiltersAPI = async (filterRequest) => {
    return apiRequest('/tickets/filter', {
        method: 'POST',
        body: JSON.stringify(filterRequest),
    });
};

/**
 * Search tickets (DevOps & Admin)
 * @param {string} query - Search query
 */
export const searchTicketsAPI = async (query) => {
    return apiRequest(`/tickets/search?q=${encodeURIComponent(query)}`);
};

/**
 * Get overall ticket statistics (DevOps & Admin)
 */
export const getTicketStatsAPI = async () => {
    return apiRequest('/tickets/stats');
};

/**
 * Update ticket status
 * @param {string} ticketId - The ticket ID
 * @param {Object} statusRequest - { newStatus, notes }
 */
export const updateTicketStatusAPI = async (ticketId, statusRequest) => {
    return apiRequest(`/tickets/${ticketId}/status`, {
        method: 'PUT',
        body: JSON.stringify(statusRequest),
    });
};

/**
 * Add note to ticket
 * @param {string} ticketId - The ticket ID
 * @param {Object} noteRequest - { notes }
 */
export const addTicketNoteAPI = async (ticketId, noteRequest) => {
    return apiRequest(`/tickets/${ticketId}/notes`, {
        method: 'POST',
        body: JSON.stringify(noteRequest),
    });
};

/**
 * Assign ticket
 * @param {string} ticketId - The ticket ID
 * @param {Object} assignRequest - { assigneeName, assigneeEmail }
 */
export const assignTicketAPI = async (ticketId, assignRequest) => {
    return apiRequest(`/tickets/${ticketId}/assign`, {
        method: 'PUT',
        body: JSON.stringify(assignRequest),
    });
};

/**
 * Delete ticket (Admin only)
 * @param {string} ticketId - The ticket ID
 */
export const deleteTicketAPI = async (ticketId) => {
    return apiRequest(`/tickets/${ticketId}`, {
        method: 'DELETE',
    });
};

// ==================== Health Check ====================

/**
 * Check if API is available
 */
export const checkAPIHealth = async () => {
    try {
        await fetch(`${API_BASE_URL.replace('/api', '')}/actuator/health`);
        return true;
    } catch {
        return false;
    }
};

export default {
    createTicket: createTicketAPI,
    getMyTickets: getMyTicketsAPI,
    getMyStats: getMyStatsAPI,
    getTicketById: getTicketByIdAPI,
    getAllTickets: getAllTicketsAPI,
    getTicketsWithFilters: getTicketsWithFiltersAPI,
    searchTickets: searchTicketsAPI,
    getTicketStats: getTicketStatsAPI,
    updateTicketStatus: updateTicketStatusAPI,
    addTicketNote: addTicketNoteAPI,
    assignTicket: assignTicketAPI,
    deleteTicket: deleteTicketAPI,
    checkAPIHealth,
};
