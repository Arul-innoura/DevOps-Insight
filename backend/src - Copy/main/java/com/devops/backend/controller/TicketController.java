package com.devops.backend.controller;

import com.devops.backend.dto.*;
import com.devops.backend.exception.ResourceNotFoundException;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.TicketStatus;
import com.devops.backend.repository.TicketRepository;
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
    private final TicketRepository ticketRepository;
    
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
     * Search tickets raised by the current user (same scope as {@code /my-tickets}). User / DevOps / Admin.
     */
    @GetMapping("/my-search")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> searchMyTickets(
            @RequestParam String q,
            @AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        return ResponseEntity.ok(ticketService.searchMyTickets(q, userEmail));
    }

    /**
     * Autocomplete for {@code /my-search}.
     */
    @GetMapping("/my-search/suggest")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> searchMyTicketsSuggest(
            @RequestParam String q,
            @RequestParam(name = "limit", defaultValue = "10") int limit,
            @AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        return ResponseEntity.ok(ticketService.searchMyTicketsSuggest(q, userEmail, limit));
    }

    /**
     * Soft-deleted tickets (Admin recycle bin). Must be registered before {@code GET /{ticketId}} so "deleted" is not captured as an id.
     */
    @GetMapping("/deleted")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getDeletedTickets() {
        return ResponseEntity.ok(ticketService.getDeletedTickets());
    }
    
    /**
     * Get a specific ticket by ID
     */
    @GetMapping("/{ticketId}")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<TicketResponse> getTicketById(
            @PathVariable String ticketId,
            @AuthenticationPrincipal Jwt jwt) {
        boolean includeSoftDeleted = hasRole(jwt, "APPROLE_Admin");
        TicketResponse ticket = ticketService.getTicketById(ticketId, includeSoftDeleted);
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
     * Autocomplete for global ticket search (DevOps & Admin). Registered before {@code /search}.
     */
    @GetMapping("/search/suggest")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> searchTicketsSuggest(
            @RequestParam String q,
            @RequestParam(name = "limit", defaultValue = "10") int limit) {
        return ResponseEntity.ok(ticketService.searchTicketsSuggest(q, limit));
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
        boolean isUserOnly = hasRole(jwt, "APPROLE_User")
                && !hasRole(jwt, "APPROLE_DevOps")
                && !hasRole(jwt, "APPROLE_Admin");
        boolean userReopen = isUserOnly
                && Boolean.TRUE.equals(request.getReopen())
                && request.getNewStatus() == TicketStatus.CREATED;
        if (isUserOnly && !userReopen && request.getNewStatus() != TicketStatus.MANAGER_APPROVAL_PENDING) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (isUserOnly && request.getNewStatus() == TicketStatus.MANAGER_APPROVAL_PENDING) {
            Ticket existing = ticketRepository.findById(ticketId)
                    .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
            if (existing.isDeleted()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
            }
            if (existing.getStatus() != TicketStatus.ACCEPTED) {
                log.warn("User {} blocked from requesting approval: ticket {} status is {}", userEmail, ticketId, existing.getStatus());
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        // Cost-pending is set only via cost-submission (DevOps); block manual status skips for Admin/User.
        if (request.getNewStatus() == TicketStatus.COST_APPROVAL_PENDING && !hasRole(jwt, "APPROLE_DevOps")) {
            log.warn("Blocked non-DevOps from setting COST_APPROVAL_PENDING on ticket {}", ticketId);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        log.info("Updating ticket {} status to {} by {}", ticketId, request.getNewStatus(), userName);
        
        TicketResponse ticket = ticketService.updateTicketStatus(ticketId, request, userName, userEmail, jwt);
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
     * Submit cost estimation for cost-approver email (DevOps only).
     */
    @PostMapping("/cost-submission")
    @PreAuthorize("hasAuthority('APPROLE_DevOps')")
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
    public ResponseEntity<List<TicketResponse>> getActiveTickets(@AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        log.info("Fetching active tickets for assignee: {}", userEmail);
        List<TicketResponse> tickets = ticketService.getActiveTickets(userEmail);
        return ResponseEntity.ok(tickets);
    }
    
    /**
     * Get completed/closed tickets (DevOps & Admin)
     */
    @GetMapping("/completed")
    @PreAuthorize("hasAnyAuthority('APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<List<TicketResponse>> getCompletedTickets(@AuthenticationPrincipal Jwt jwt) {
        String userEmail = extractUserEmail(jwt);
        log.info("Fetching completed tickets for assignee: {}", userEmail);
        List<TicketResponse> tickets = ticketService.getCompletedTickets(userEmail);
        return ResponseEntity.ok(tickets);
    }
    
    // ==================== Admin Endpoints ====================
    
    /**
     * Delete ticket (Admin only)
     */
    @DeleteMapping("/{ticketId}")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<Map<String, String>> deleteTicket(
            @PathVariable String ticketId,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        log.info("Deleting ticket: {} by {} ({})", ticketId, userName, userEmail);
        ticketService.deleteTicket(ticketId, userName, userEmail);
        return ResponseEntity.ok(Map.of(
                "message", "Ticket moved to recycle bin. Restore it from Deleted tickets if needed.",
                "ticketId", ticketId));
    }

    /**
     * Restore a soft-deleted ticket (Admin only).
     */
    @PostMapping("/{ticketId}/restore")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public ResponseEntity<TicketResponse> restoreTicket(
            @PathVariable String ticketId,
            @AuthenticationPrincipal Jwt jwt) {
        String userName = extractUserName(jwt);
        String userEmail = extractUserEmail(jwt);
        TicketResponse ticket = ticketService.restoreTicket(ticketId, userName, userEmail);
        return ResponseEntity.ok(ticket);
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
        if (email == null || email.isEmpty()) {
            email = jwt.getClaimAsString("unique_name");
        }
        return email != null ? email : "unknown@unknown.com";
    }

    private boolean hasRole(Jwt jwt, String role) {
        java.util.List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles == null) return false;
        return roles.stream().anyMatch(r -> role.equalsIgnoreCase(r));
    }
}
