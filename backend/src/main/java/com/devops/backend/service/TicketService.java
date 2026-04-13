package com.devops.backend.service;

import com.devops.backend.dto.*;
import com.devops.backend.model.Ticket;
import org.springframework.data.domain.Page;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;

/**
 * Service interface for ticket operations.
 */
public interface TicketService {
    
    /**
     * Create a new ticket
     */
    TicketResponse createTicket(CreateTicketRequest request, String userName, String userEmail);
    
    /**
     * Get ticket by ID. Soft-deleted tickets return 404 unless {@code includeSoftDeleted} is true (Admin viewing recycle bin).
     */
    TicketResponse getTicketById(String ticketId, boolean includeSoftDeleted);

    /**
     * Soft-deleted tickets (Admin recycle bin), newest updates first.
     */
    List<TicketResponse> getDeletedTickets();

    /**
     * Restore a soft-deleted ticket (Admin only).
     */
    TicketResponse restoreTicket(String ticketId, String userName, String userEmail);
    
    /**
     * Get all tickets (Admin/DevOps)
     */
    List<TicketResponse> getAllTickets();
    
    /**
     * Get tickets by requester email (User dashboard)
     */
    List<TicketResponse> getTicketsByRequester(String requesterEmail);
    
    /**
     * Get tickets with filters
     */
    Page<TicketResponse> getTicketsWithFilters(TicketFilterRequest filterRequest);
    
    /**
     * Update ticket status
     */
    TicketResponse updateTicketStatus(String ticketId, UpdateStatusRequest request,
                                       String userName, String userEmail, Jwt jwt);

    TicketResponse toggleTicketActive(String ticketId, ToggleActiveRequest request, String userName, String userEmail);
    
    /**
     * Add note to ticket
     */
    TicketResponse addNoteToTicket(String ticketId, AddNoteRequest request, 
                                    String userName, String userEmail);
    
    /**
     * Assign ticket to a team member
     */
    TicketResponse assignTicket(String ticketId, AssignTicketRequest request, 
                                 String userName, String userEmail);
    
    /**
     * Forward ticket to another DevOps engineer
     */
    TicketResponse forwardTicket(String ticketId, ForwardTicketRequest request,
                                  String userName, String userEmail);
    
    /**
     * Submit cost estimation for manager approval
     */
    TicketResponse submitCostEstimation(CostSubmissionRequest request, String userName, String userEmail);
    
    /**
     * Get unassigned tickets (tickets without assignedTo)
     */
    List<TicketResponse> getUnassignedTickets();
    
    /**
     * Get tickets assigned to a specific engineer
     */
    List<TicketResponse> getTicketsByAssignee(String assigneeEmail);
    
    /**
     * Get active tickets (in progress, pending approval, etc.)
     */
    List<TicketResponse> getActiveTickets(String assigneeEmail);
    
    /**
     * Get completed/closed tickets
     */
    List<TicketResponse> getCompletedTickets(String assigneeEmail);
    
    /**
     * Soft-delete ticket (Admin only). {@code userName} / {@code userEmail} are recorded on the activity log.
     */
    void deleteTicket(String ticketId, String userName, String userEmail);
    
    /**
     * Get ticket statistics
     */
    TicketStatsResponse getTicketStats();
    
    /**
     * Get ticket statistics for a specific user
     */
    TicketStatsResponse getTicketStatsByUser(String userEmail);
    
    /**
     * Search tickets (DevOps / Admin — all active tickets).
     */
    List<TicketResponse> searchTickets(String searchTerm);

    /**
     * Search tickets for the current requester only (User dashboard; scoped by email).
     */
    List<TicketResponse> searchMyTickets(String searchTerm, String requesterEmail);

    /**
     * Short list for autocomplete (same rules as {@link #searchTickets}).
     */
    List<TicketResponse> searchTicketsSuggest(String searchTerm, int limit);

    /**
     * Short list for autocomplete (same rules as {@link #searchMyTickets}).
     */
    List<TicketResponse> searchMyTicketsSuggest(String searchTerm, String requesterEmail, int limit);

    /**
     * Queue manager approval email for current ticket state.
     */
    void dispatchManagerApprovalEmail(String ticketId);
}
