package com.devops.backend.controller;

import com.devops.backend.dto.*;
import com.devops.backend.service.TicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller for ticket management operations.
 * Provides endpoints for creating, reading, updating, and managing tickets.
 */
@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
@Slf4j
public class TicketController {
    
    private final TicketService ticketService;
    
    // ==================== User Endpoints ====================
    
    /**
     * Create a new ticket (User, DevOps, Admin)
     */
    @PostMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> createTicket(
            @Valid @RequestBody CreateTicketRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Creating ticket request from user: {} ({})", userName, userEmail);
        
        TicketResponse ticket = ticketService.createTicket(request, userName, userEmail);
        return ResponseEntity.status(HttpStatus.CREATED).body(ticket);
    }
    
    /**
     * Get tickets for the current user (User dashboard)
     */
    @GetMapping("/my-tickets")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getMyTickets(@AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        log.info("Fetching tickets for user: {}", userEmail);
        
        List<TicketResponse> tickets = ticketService.getTicketsByRequester(userEmail);
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get ticket statistics for current user
     */
    @GetMapping("/my-stats")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketStatsResponse> getMyStats(@AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        TicketStatsResponse stats = ticketService.getTicketStatsByUser(userEmail);
        return ResponseEntity.ok(stats);
    }
    
    /**
     * Get a specific ticket by ID
     */
    @GetMapping("/{ticketId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> getTicketById(@PathVariable String ticketId) {
        TicketResponse ticket = ticketService.getTicketById(ticketId);
        return ResponseEntity.ok(ticket);
    }
    
    // ==================== DevOps Endpoints ====================
    
    /**
     * Get all tickets (DevOps & Admin only)
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getAllTickets() {
        log.info("Fetching all tickets");
        List<TicketResponse> tickets = ticketService.getAllTickets();
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get tickets with filters (DevOps & Admin)
     */
    @PostMapping("/filter")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<Page<TicketResponse>> getTicketsWithFilters(
            @RequestBody TicketFilterRequest filterRequest) {
        Page<TicketResponse> tickets = ticketService.getTicketsWithFilters(filterRequest);
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Search tickets (DevOps & Admin)
     */
    @GetMapping("/search")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> searchTickets(@RequestParam String q) {
        List<TicketResponse> tickets = ticketService.searchTickets(q);
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get overall ticket statistics (DevOps & Admin)
     */
    @GetMapping("/stats")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketStatsResponse> getTicketStats() {
        TicketStatsResponse stats = ticketService.getTicketStats();
        return ResponseEntity.ok(stats);
    }
    
    /**
     * Update ticket status (DevOps & Admin)
     */
    @PutMapping("/{ticketId}/status")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin', 'APPROLE_User')")
    public ResponseEntity<TicketResponse> updateTicketStatus(
            @PathVariable String ticketId,
            @Valid @RequestBody UpdateStatusRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Updating ticket {} status to {} by {}", ticketId, request.getNewStatus(), userName);
        
        TicketResponse ticket = ticketService.updateTicketStatus(ticketId, request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }

    @PutMapping("/{ticketId}/active")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_Admin', 'APPROLE_DevOps')")
    public ResponseEntity<TicketResponse> toggleTicketActive(
            @PathVariable String ticketId,
            @RequestBody ToggleActiveRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        TicketResponse ticket = ticketService.toggleTicketActive(ticketId, request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }
    
    /**
     * Add note to ticket (User, DevOps & Admin)
     */
    @PostMapping("/{ticketId}/notes")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> addNote(
            @PathVariable String ticketId,
            @Valid @RequestBody AddNoteRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Adding note to ticket {} by {}", ticketId, userName);
        
        TicketResponse ticket = ticketService.addNoteToTicket(ticketId, request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }
    
    /**
     * Assign ticket to a team member (DevOps & Admin)
     */
    @PutMapping("/{ticketId}/assign")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> assignTicket(
            @PathVariable String ticketId,
            @Valid @RequestBody AssignTicketRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Assigning ticket {} to {} by {}", ticketId, request.getAssigneeName(), userName);
        
        TicketResponse ticket = ticketService.assignTicket(ticketId, request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }
    
    /**
     * Forward ticket to another DevOps engineer (DevOps & Admin)
     */
    @PutMapping("/{ticketId}/forward")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> forwardTicket(
            @PathVariable String ticketId,
            @Valid @RequestBody ForwardTicketRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Forwarding ticket {} from {} to {} by {}", 
                ticketId, userName, request.getNewAssigneeName(), userName);
        
        TicketResponse ticket = ticketService.forwardTicket(ticketId, request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }
    
    /**
     * Submit cost estimation for manager approval (DevOps & Admin)
     */
    @PostMapping("/cost-submission")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> submitCostEstimation(
            @Valid @RequestBody CostSubmissionRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        
        log.info("Submitting cost estimation for ticket {} by {}: {} {}", 
                request.getTicketId(), userName, request.getCurrency(), request.getEstimatedCost());
        
        TicketResponse ticket = ticketService.submitCostEstimation(request, userName, userEmail);
        return ResponseEntity.ok(ticket);
    }
    
    /**
     * Get unassigned tickets (DevOps & Admin)
     */
    @GetMapping("/unassigned")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getUnassignedTickets() {
        log.info("Fetching unassigned tickets");
        List<TicketResponse> tickets = ticketService.getUnassignedTickets();
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get tickets assigned to current user (DevOps & Admin)
     */
    @GetMapping("/assigned-to-me")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getMyAssignedTickets(@AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        log.info("Fetching tickets assigned to: {}", userEmail);
        List<TicketResponse> tickets = ticketService.getTicketsByAssignee(userEmail);
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get active tickets (DevOps & Admin)
     */
    @GetMapping("/active")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getActiveTickets() {
        log.info("Fetching active tickets");
        List<TicketResponse> tickets = ticketService.getActiveTickets();
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get completed/closed tickets (DevOps & Admin)
     */
    @GetMapping("/completed")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getCompletedTickets() {
        log.info("Fetching completed tickets");
        List<TicketResponse> tickets = ticketService.getCompletedTickets();
        return ResponseEntity.ok(tickets);
    }
    
    // ==================== Admin Endpoints ====================
    
    /**
     * Delete ticket (Admin only)
     */
    @DeleteMapping("/{ticketId}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Map<String, String>> deleteTicket(@PathVariable String ticketId) {
        log.info("Deleting ticket: {}", ticketId);
        ticketService.deleteTicket(ticketId);
        return ResponseEntity.ok(Map.of("message", "Ticket deleted successfully", "ticketId", ticketId));
    }
    
    // ==================== Helper Methods ====================
    
    private String extractUserName(Jwt jwt) {
        // Try different claim names for the user's name
        String name = jwt.getClaimAsString("name");
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("preferred_username");
        }
        if (name == null || name.isEmpty()) {
            name = jwt.getClaimAsString("given_name");
        }
        return name != null ? name : "Unknown User";
    }
    
    private String extractUserEmail(Jwt jwt) {
        // Try different claim names for the user's email
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("preferred_username");
        }
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("upn");
        }
        return email != null ? email : "unknown@unknown.com";
    }
}
