package com.devops.backend.controller;

import com.devops.backend.dto.ManagerApprovalRequest;
import com.devops.backend.dto.ManagerApprovalTokenInfo;
import com.devops.backend.exception.ResourceNotFoundException;
import com.devops.backend.model.ManagerApprovalToken;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.TicketStatus;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ManagerApprovalTokenRepository;
import com.devops.backend.repository.TicketRepository;
import com.devops.backend.service.EmailService;
import com.devops.backend.service.TicketService;
import com.devops.backend.service.WebSocketEventService;
import com.devops.backend.service.WorkflowSnapshotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

/**
 * Public controller for manager approval actions.
 * No authentication required - managers are identified via secure tokens.
 * Handles both manager approval and cost approval workflows.
 */
@RestController
@RequestMapping("/api/public/manager-approval")
@RequiredArgsConstructor
@Slf4j
public class ManagerApprovalController {

    private final ManagerApprovalTokenRepository tokenRepository;
    private final TicketRepository ticketRepository;
    private final EmailService emailService;
    private final WebSocketEventService webSocketEventService;
    private final WorkflowSnapshotService workflowSnapshotService;
    private final TicketService ticketService;

    /**
     * Validate token and get ticket info for manager approval page
     */
    @GetMapping("/validate")
    public ResponseEntity<ManagerApprovalTokenInfo> validateToken(
            @RequestParam String token,
            @RequestParam(required = false) String action) {
        
        log.info("Validating manager approval token");
        
        ManagerApprovalToken approvalToken = tokenRepository.findByToken(token).orElse(null);
        
        if (approvalToken == null) {
            return ResponseEntity.ok(ManagerApprovalTokenInfo.builder()
                    .valid(false)
                    .errorMessage("Invalid or expired approval link")
                    .build());
        }
        
        if (approvalToken.isUsed()) {
            return ResponseEntity.ok(ManagerApprovalTokenInfo.builder()
                    .valid(false)
                    .used(true)
                    .action(approvalToken.getAction())
                    .managerName(approvalToken.getManagerName())
                    .ticketId(approvalToken.getTicketId())
                    .tokenType(approvalToken.getTokenType())
                    .errorMessage("This approval link has already been used. Action: " + approvalToken.getAction())
                    .build());
        }
        
        if (approvalToken.getExpiresAt() != null && approvalToken.getExpiresAt().isBefore(Instant.now())) {
            return ResponseEntity.ok(ManagerApprovalTokenInfo.builder()
                    .valid(false)
                    .errorMessage("This approval link has expired")
                    .build());
        }
        
        Ticket ticket = ticketRepository.findById(approvalToken.getTicketId()).orElse(null);
        if (ticket == null) {
            return ResponseEntity.ok(ManagerApprovalTokenInfo.builder()
                    .valid(false)
                    .errorMessage("Ticket not found")
                    .build());
        }
        
        ManagerApprovalTokenInfo.ManagerApprovalTokenInfoBuilder infoBuilder = ManagerApprovalTokenInfo.builder()
                .valid(true)
                .ticketId(ticket.getId())
                .productName(ticket.getProductName())
                .requestType(ticket.getRequestType() != null ? ticket.getRequestType().name() : null)
                .environment(ticket.getEnvironment() != null ? ticket.getEnvironment().name() : null)
                .description(ticket.getDescription())
                .requesterName(ticket.getRequestedBy())
                .requesterEmail(ticket.getRequesterEmail())
                .managerName(approvalToken.getManagerName())
                .managerEmail(approvalToken.getManagerEmail())
                .status(ticket.getStatus() != null ? ticket.getStatus().name() : null)
                .action(action) // Pre-selected action from URL
                .tokenType(approvalToken.getTokenType())
                .approvalLevel(approvalToken.getApprovalLevel())
                .totalApprovalLevels(approvalToken.getTotalApprovalLevels());
        
        // Add cost information if this is a cost approval
        if ("COST_APPROVAL".equals(approvalToken.getTokenType())) {
            infoBuilder
                .estimatedCost(approvalToken.getEstimatedCost())
                .costCurrency(approvalToken.getCostCurrency())
                .costSubmittedBy(approvalToken.getCostSubmittedBy());
        }
        
        return ResponseEntity.ok(infoBuilder.build());
    }

    /**
     * Process manager approval or rejection
     */
    @PostMapping("/submit")
    public ResponseEntity<Map<String, Object>> submitApproval(
            @Valid @RequestBody ManagerApprovalRequest request) {
        
        log.info("Processing approval: action={}", request.getAction());
        
        ManagerApprovalToken approvalToken = tokenRepository.findByToken(request.getToken())
                .orElseThrow(() -> new ResourceNotFoundException("Invalid approval token"));
        
        if (approvalToken.isUsed()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "This approval link has already been used"
            ));
        }
        
        if (approvalToken.getExpiresAt() != null && approvalToken.getExpiresAt().isBefore(Instant.now())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "This approval link has expired"
            ));
        }
        
        Ticket ticket = ticketRepository.findById(approvalToken.getTicketId())
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found"));
        
        boolean isApproved = "approve".equalsIgnoreCase(request.getAction());
        String tokenType = approvalToken.getTokenType() != null ? approvalToken.getTokenType() : "MANAGER_APPROVAL";
        
        // Handle based on token type
        if ("COST_APPROVAL".equals(tokenType)) {
            return processCostApproval(approvalToken, ticket, isApproved, request.getNote());
        } else {
            return processManagerApproval(approvalToken, ticket, isApproved, request.getNote());
        }
    }
    
    /**
     * Process manager approval for the ticket
     */
    private ResponseEntity<Map<String, Object>> processManagerApproval(
            ManagerApprovalToken approvalToken, Ticket ticket, boolean isApproved, String note) {

        ticket.setManagerApprovalNote(note);
        ticket.setManagerApprovalDate(Instant.now());
        ticket.setUpdatedAt(Instant.now());

        if (!isApproved) {
            ticket.setManagerApprovalStatus("REJECTED");
            ticket.setStatus(TicketStatus.CLOSED);
            ticket.addTimelineEntry(TicketStatus.CLOSED, approvalToken.getManagerName(),
                    approvalToken.getManagerEmail(),
                    "Approval declined; ticket closed." + (note != null ? " Reason: " + note : ""));
            Ticket savedTicket = ticketRepository.save(ticket);
            markTokenUsed(approvalToken, false, note);
            try {
                emailService.sendManagerApprovalResponseEmail(savedTicket, false, note);
            } catch (Exception e) {
                log.error("Failed to send manager approval response email: {}", e.getMessage());
            }
            webSocketEventService.broadcastTicketStatusChanged(savedTicket);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Request declined",
                    "ticketId", ticket.getId(),
                    "newStatus", savedTicket.getStatus().name()
            ));
        }

        ticket.setManagerApprovalStatus("APPROVED");
        // Auto-advance to Manager Approved when approver confirms via email
        ticket.setStatus(TicketStatus.MANAGER_APPROVED);
        ticket.setCurrentApprovalLevel(null);
        ticket.addTimelineEntry(TicketStatus.MANAGER_APPROVED, approvalToken.getManagerName(),
                approvalToken.getManagerEmail(),
                "Approver confirmed via email."
                        + (note != null && !note.isBlank() ? " Note: " + note : ""));

        Ticket savedTicket = ticketRepository.save(ticket);
        markTokenUsed(approvalToken, true, note);

        try {
            emailService.sendManagerApprovalResponseEmail(savedTicket, true, note);
        } catch (Exception e) {
            log.error("Failed to send manager approval response email: {}", e.getMessage());
        }

        webSocketEventService.broadcastTicketStatusChanged(savedTicket);

        log.info("Manager approval processed for ticket {}: APPROVED (manual mode)", ticket.getId());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Request approved successfully",
                "ticketId", ticket.getId(),
                "newStatus", savedTicket.getStatus().name()
        ));
    }
    
    /**
     * Process cost approval for the ticket
     */
    private ResponseEntity<Map<String, Object>> processCostApproval(
            ManagerApprovalToken approvalToken, Ticket ticket, boolean isApproved, String note) {
        
        // Update ticket cost approval
        ticket.setCostApprovalStatus(isApproved ? "APPROVED" : "REJECTED");
        ticket.setCostApprovalNote(note);
        ticket.setCostApprovalDate(Instant.now());
        ticket.setUpdatedAt(Instant.now());
        
        // Update ticket status based on approval
        if (isApproved) {
            ticket.setStatus(TicketStatus.COST_APPROVED);
            ticket.addTimelineEntry(TicketStatus.COST_APPROVED, approvalToken.getManagerName(), 
                    approvalToken.getManagerEmail(), 
                    String.format("Cost approved: %s %,.2f. DevOps can start work.%s", 
                            ticket.getCostCurrency(), ticket.getEstimatedCost(),
                            note != null ? " Note: " + note : ""));
        } else {
            ticket.setStatus(TicketStatus.CLOSED);
            ticket.addTimelineEntry(TicketStatus.CLOSED, approvalToken.getManagerName(),
                    approvalToken.getManagerEmail(),
                    String.format("Cost approval declined; ticket closed. %s %,.2f.%s",
                            ticket.getCostCurrency(), ticket.getEstimatedCost(),
                            note != null ? " Reason: " + note : ""));
        }
        
        Ticket savedTicket = ticketRepository.save(ticket);
        
        // Mark token as used
        markTokenUsed(approvalToken, isApproved, note);
        
        // Send notification email
        try {
            emailService.sendCostApprovalResponseEmail(savedTicket, isApproved, note);
        } catch (Exception e) {
            log.error("Failed to send cost approval response email: {}", e.getMessage());
        }
        
        // Broadcast WebSocket event for real-time UI update
        webSocketEventService.broadcastTicketStatusChanged(savedTicket);
        
        log.info("Cost approval processed for ticket {}: {} (Cost: {} {})", 
                ticket.getId(), isApproved ? "APPROVED" : "REJECTED",
                ticket.getCostCurrency(), ticket.getEstimatedCost());
        
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", isApproved ? "Cost approved successfully. Work can begin." : "Cost rejected",
                "ticketId", ticket.getId(),
                "newStatus", savedTicket.getStatus().name()
        ));
    }
    
    /**
     * Mark token as used
     */
    private void markTokenUsed(ManagerApprovalToken token, boolean approved, String note) {
        token.setUsed(true);
        token.setUsedAt(Instant.now());
        token.setAction(approved ? "APPROVED" : "REJECTED");
        token.setNote(note);
        tokenRepository.save(token);
    }
}
