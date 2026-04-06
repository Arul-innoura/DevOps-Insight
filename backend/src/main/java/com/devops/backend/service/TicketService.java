package com.devops.backend.service;

import com.devops.backend.dto.*;
import com.devops.backend.model.Ticket;
import org.springframework.data.domain.Page;

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
     * Get ticket by ID
     */
    TicketResponse getTicketById(String ticketId);
    
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
                                       String userName, String userEmail);

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
    List<TicketResponse> getActiveTickets();
    
    /**
     * Get completed/closed tickets
     */
    List<TicketResponse> getCompletedTickets();
    
    /**
     * Delete ticket (Admin only)
     */
    void deleteTicket(String ticketId);
    
    /**
     * Get ticket statistics
     */
    TicketStatsResponse getTicketStats();
    
    /**
     * Get ticket statistics for a specific user
     */
    TicketStatsResponse getTicketStatsByUser(String userEmail);
    
    /**
     * Search tickets
     */
    List<TicketResponse> searchTickets(String searchTerm);

    /**
     * Queue manager approval email for current ticket state (multi-level chain).
     */
    void dispatchManagerApprovalEmail(String ticketId);
}
