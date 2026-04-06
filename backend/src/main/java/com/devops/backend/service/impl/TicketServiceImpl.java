package com.devops.backend.service.impl;

import com.devops.backend.dto.*;
import com.devops.backend.exception.ResourceNotFoundException;
import com.devops.backend.model.*;
import com.devops.backend.model.workflow.ApprovalLevelConfig;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ManagerApprovalTokenRepository;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.TicketRepository;
import com.devops.backend.service.EmailService;
import com.devops.backend.service.EventPublisherService;
import com.devops.backend.service.ProjectWorkflowService;
import com.devops.backend.service.TicketService;
import com.devops.backend.service.WebSocketEventService;
import com.devops.backend.service.WorkflowSnapshotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Implementation of TicketService.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TicketServiceImpl implements TicketService {
    
    private final TicketRepository ticketRepository;
    private final ManagerApprovalTokenRepository approvalTokenRepository;
    private final ProjectRepository projectRepository;
    private final ProjectWorkflowService projectWorkflowService;
    private final WorkflowSnapshotService workflowSnapshotService;
    private final EventPublisherService eventPublisher;
    private final EmailService emailService;
    private final WebSocketEventService webSocketEventService;
    
    // Valid status transitions
    private static final Map<TicketStatus, Set<TicketStatus>> STATUS_TRANSITIONS = new HashMap<>();
    
    static {
        STATUS_TRANSITIONS.put(TicketStatus.CREATED, Set.of(TicketStatus.ACCEPTED, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.ACCEPTED, Set.of(TicketStatus.MANAGER_APPROVAL_PENDING, TicketStatus.IN_PROGRESS, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.MANAGER_APPROVAL_PENDING, Set.of(TicketStatus.MANAGER_APPROVED, TicketStatus.REJECTED, TicketStatus.ACTION_REQUIRED));
        STATUS_TRANSITIONS.put(TicketStatus.MANAGER_APPROVED, Set.of(TicketStatus.COST_APPROVAL_PENDING, TicketStatus.IN_PROGRESS, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.COST_APPROVAL_PENDING, Set.of(TicketStatus.COST_APPROVED, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.COST_APPROVED, Set.of(TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.IN_PROGRESS, Set.of(TicketStatus.ACTION_REQUIRED, TicketStatus.ON_HOLD, TicketStatus.COMPLETED));
        STATUS_TRANSITIONS.put(TicketStatus.ACTION_REQUIRED, Set.of(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.ON_HOLD, Set.of(TicketStatus.IN_PROGRESS, TicketStatus.REJECTED, TicketStatus.CLOSED));
        STATUS_TRANSITIONS.put(TicketStatus.COMPLETED, Set.of(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.CLOSED, Set.of(TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.REJECTED, Set.of());
    }
    
    @Override
    public TicketResponse createTicket(CreateTicketRequest request, String userName, String userEmail) {
        log.info("Creating ticket for user: {} ({})", userName, userEmail);
        
        String ticketId = generateTicketId(request);
        Instant now = Instant.now();
        
        Ticket ticket = Ticket.builder()
                .id(ticketId)
                .requestType(request.getRequestType())
                .productName(request.getProductName())
                .environment(request.getEnvironment())
                .description(request.getDescription())
                .requestedBy(userName)
                .requesterEmail(userEmail)
                .managerName(request.getManagerName())
                .managerEmail(request.getManagerEmail())
                .managerApprovalRequired(request.isManagerApprovalRequired())
                .ccEmail(request.getCcEmail())
                .status(TicketStatus.CREATED)
                .active(true)
                .createdAt(now)
                .updatedAt(now)
                // Type-specific fields
                .databaseType(request.getDatabaseType())
                .purpose(request.getPurpose())
                .activationDate(request.getActivationDate())
                .duration(request.getDuration())
                .shutdownDate(request.getShutdownDate())
                .shutdownReason(request.getShutdownReason())
                .releaseVersion(request.getReleaseVersion())
                .deploymentStrategy(request.getDeploymentStrategy())
                .releaseNotes(request.getReleaseNotes())
                .issueType(request.getIssueType())
                .issueDescription(request.getIssueDescription())
                .errorLogs(request.getErrorLogs())
                .branchName(request.getBranchName())
                .commitId(request.getCommitId())
                .reason(request.getReason())
                .otherQueryDetails(request.getOtherQueryDetails())
                .attachments(request.getAttachments() != null ? request.getAttachments() : new ArrayList<>())
                .timeline(new ArrayList<>())
                .build();

        applyProjectWorkflow(ticket, request);
        
        // Add initial timeline entry
        ticket.addTimelineEntry(TicketStatus.CREATED, userName, userEmail, "Ticket created");
        
        Ticket savedTicket = ticketRepository.save(ticket);
        log.info("Ticket created successfully: {}", ticketId);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("created", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketCreated(savedTicket);
        
        // Send email notification for new ticket and save message ID for threading
        try {
            String messageId = emailService.sendTicketCreatedEmail(savedTicket);
            if (messageId != null) {
                savedTicket.setEmailMessageId(messageId);
                savedTicket.setEmailThreadId(ticketId);
                ticketRepository.save(savedTicket);
            }
        } catch (Exception e) {
            log.error("Failed to queue email for ticket {}: {}", ticketId, e.getMessage());
        }
        
        return response;
    }
    
    @Override
    public TicketResponse getTicketById(String ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        return mapToResponse(ticket);
    }
    
    @Override
    public List<TicketResponse> getAllTickets() {
        return ticketRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<TicketResponse> getTicketsByRequester(String requesterEmail) {
        return ticketRepository.findByRequesterEmailOrderByCreatedAtDesc(requesterEmail)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public Page<TicketResponse> getTicketsWithFilters(TicketFilterRequest filterRequest) {
        int page = filterRequest.getPage() != null ? filterRequest.getPage() : 0;
        int size = filterRequest.getSize() != null ? filterRequest.getSize() : 20;
        String sortBy = filterRequest.getSortBy() != null ? filterRequest.getSortBy() : "createdAt";
        Sort.Direction direction = "asc".equalsIgnoreCase(filterRequest.getSortDirection()) 
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, sortBy));
        
        Page<Ticket> ticketPage = ticketRepository.findWithFilters(
                filterRequest.getStatus(),
                filterRequest.getRequestType(),
                filterRequest.getEnvironment(),
                filterRequest.getRequesterEmail(),
                pageable
        );
        
        return ticketPage.map(this::mapToResponse);
    }
    
    @Override
    public TicketResponse updateTicketStatus(String ticketId, UpdateStatusRequest request, 
                                              String userName, String userEmail) {
        log.info("Updating ticket {} status to {} by {}", ticketId, request.getNewStatus(), userName);
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        
        // Validate status transition
        Set<TicketStatus> allowedTransitions = STATUS_TRANSITIONS.get(ticket.getStatus());
        if (allowedTransitions == null || !allowedTransitions.contains(request.getNewStatus())) {
            throw new IllegalStateException(
                    "Invalid status transition from " + ticket.getStatus() + " to " + request.getNewStatus());
        }

        // Enforce workflow gates
        if (request.getNewStatus() == TicketStatus.IN_PROGRESS) {
            if (ticket.isManagerApprovalRequired() && !"APPROVED".equalsIgnoreCase(ticket.getManagerApprovalStatus())) {
                throw new IllegalStateException("Cannot start work before manager approval");
            }
            if ("PENDING".equalsIgnoreCase(ticket.getCostApprovalStatus())) {
                throw new IllegalStateException("Cannot start work while cost approval is pending");
            }
            if (ticket.isCostApprovalRequired() && !"APPROVED".equalsIgnoreCase(ticket.getCostApprovalStatus())) {
                throw new IllegalStateException("Cannot start work before cost approval");
            }
        }

        // Cost approval pending must be triggered from cost submission endpoint
        if (request.getNewStatus() == TicketStatus.COST_APPROVAL_PENDING) {
            throw new IllegalStateException("Use cost submission flow to request cost approval");
        }

        // Manager/cost approvals are confirmed only through secure email links
        if (request.getNewStatus() == TicketStatus.MANAGER_APPROVED) {
            throw new IllegalStateException("Manager approval must be completed from the manager email link");
        }
        if (request.getNewStatus() == TicketStatus.COST_APPROVED) {
            throw new IllegalStateException("Cost approval must be completed from the manager email link");
        }
        
        TicketStatus previousStatus = ticket.getStatus();
        ticket.setStatus(request.getNewStatus());
        ticket.setUpdatedAt(Instant.now());
        if (request.getNewStatus() == TicketStatus.MANAGER_APPROVAL_PENDING) {
            ticket.setManagerApprovalStatus("PENDING");
            int total = ticket.getTotalApprovalLevels() != null ? ticket.getTotalApprovalLevels() : 0;
            if (total > 0) {
                ticket.setCurrentApprovalLevel(1);
                WorkflowConfiguration wf = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson());
                workflowSnapshotService.firstApproverAtLevel(wf, 1).ifPresent(a -> {
                    ticket.setManagerEmail(a.getEmail());
                    ticket.setManagerName(a.getName() != null && !a.getName().isBlank() ? a.getName() : a.getEmail());
                });
            }
        }
        ticket.addTimelineEntry(request.getNewStatus(), userName, userEmail, 
                request.getNotes() != null ? request.getNotes() : "Status changed to " + request.getNewStatus());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        log.info("Ticket {} status updated successfully", ticketId);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("status-updated", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketStatusChanged(savedTicket);
        
        // Send email notifications based on status
        try {
            if (request.getNewStatus() == TicketStatus.MANAGER_APPROVAL_PENDING) {
                // Trigger manager approval workflow
                sendManagerApprovalEmail(savedTicket);
            } else if (request.getNewStatus() == TicketStatus.MANAGER_APPROVED
                    || request.getNewStatus() == TicketStatus.COST_APPROVAL_PENDING
                    || request.getNewStatus() == TicketStatus.COST_APPROVED) {
                emailService.sendTicketStatusEmail(savedTicket, previousStatus);
            } else if (request.getNewStatus() == TicketStatus.COMPLETED) {
                emailService.sendTicketCompletedEmail(savedTicket);
            } else if (request.getNewStatus() == TicketStatus.CLOSED) {
                emailService.sendTicketClosedEmail(savedTicket);
            } else {
                emailService.sendTicketStatusEmail(savedTicket, previousStatus);
            }
        } catch (Exception e) {
            log.error("Failed to queue email for ticket {}: {}", ticketId, e.getMessage());
        }
        
        return response;
    }
    
    /**
     * Create approval token and send manager approval email
     */
    private void sendManagerApprovalEmail(Ticket ticket) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isEmpty()) {
            log.warn("Cannot send manager approval email - no manager email for ticket {}", ticket.getId());
            return;
        }
        
        // Generate secure random token
        String token = UUID.randomUUID().toString().replace("-", "") + 
                       UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        
        // Create and save approval token (expires in 7 days)
        Integer level = ticket.getCurrentApprovalLevel() != null ? ticket.getCurrentApprovalLevel() : 1;
        Integer totalLv = ticket.getTotalApprovalLevels() != null ? ticket.getTotalApprovalLevels() : 1;

        ManagerApprovalToken approvalToken = ManagerApprovalToken.builder()
                .token(token)
                .ticketId(ticket.getId())
                .managerName(ticket.getManagerName())
                .managerEmail(ticket.getManagerEmail())
                .approvalLevel(level)
                .totalApprovalLevels(totalLv)
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .used(false)
                .tokenType("MANAGER_APPROVAL")
                .build();
        
        approvalTokenRepository.save(approvalToken);
        log.info("Created manager approval token for ticket {}", ticket.getId());
        
        // Send manager approval email
        emailService.sendManagerApprovalRequestEmail(ticket, token);
    }
    
    /**
     * Create cost approval token and send cost approval email
     */
    private void sendCostApprovalEmail(Ticket ticket, String userName) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isEmpty()) {
            log.warn("Cannot send cost approval email - no manager email for ticket {}", ticket.getId());
            return;
        }
        
        // Generate secure random token
        String token = UUID.randomUUID().toString().replace("-", "") + 
                       UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        
        // Create and save cost approval token (expires in 7 days)
        ManagerApprovalToken approvalToken = ManagerApprovalToken.builder()
                .token(token)
                .ticketId(ticket.getId())
                .managerName(ticket.getManagerName())
                .managerEmail(ticket.getManagerEmail())
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .used(false)
                .tokenType("COST_APPROVAL")
                .estimatedCost(ticket.getEstimatedCost())
                .costCurrency(ticket.getCostCurrency())
                .costSubmittedBy(userName)
                .build();
        
        approvalTokenRepository.save(approvalToken);
        log.info("Created cost approval token for ticket {} (Cost: {} {})", 
                ticket.getId(), ticket.getCostCurrency(), ticket.getEstimatedCost());
        
        // Send cost approval email
        emailService.sendCostApprovalRequestEmail(ticket, token);
    }

    @Override
    public TicketResponse submitCostEstimation(CostSubmissionRequest request, String userName, String userEmail) {
        log.info("Submitting cost estimation for ticket {} by {}", request.getTicketId(), userName);
        
        Ticket ticket = ticketRepository.findById(request.getTicketId())
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + request.getTicketId()));
        
        // Validate ticket is in correct status
        if (ticket.getStatus() != TicketStatus.MANAGER_APPROVED) {
            throw new IllegalStateException("Cost can only be submitted after manager approval. Current: " + ticket.getStatus());
        }
        
        // Update ticket with cost information
        ticket.setEstimatedCost(request.getEstimatedCost());
        ticket.setCostCurrency(request.getCurrency());
        ticket.setCostApprovalRequired(true);
        ticket.setCostApprovalStatus("PENDING");
        ticket.setCostSubmittedBy(userName);
        ticket.setCostSubmittedByEmail(userEmail);
        ticket.setStatus(TicketStatus.COST_APPROVAL_PENDING);
        ticket.setUpdatedAt(Instant.now());

        WorkflowConfiguration wfCost = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson());
        workflowSnapshotService.firstCostApprover(wfCost).ifPresent(a -> {
            ticket.setManagerEmail(a.getEmail());
            ticket.setManagerName(a.getName() != null && !a.getName().isBlank() ? a.getName() : a.getEmail());
        });
        
        String notes = String.format("Cost estimation submitted: %s %,.2f%s", 
                request.getCurrency(), request.getEstimatedCost(),
                request.getNotes() != null ? ". Notes: " + request.getNotes() : "");
        ticket.addTimelineEntry(TicketStatus.COST_APPROVAL_PENDING, userName, userEmail, notes);
        
        Ticket savedTicket = ticketRepository.save(ticket);
        
        // Send cost approval email to manager
        try {
            sendCostApprovalEmail(savedTicket, userName);
        } catch (Exception e) {
            log.error("Failed to send cost approval email: {}", e.getMessage());
        }
        
        TicketResponse response = mapToResponse(savedTicket);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketStatusChanged(savedTicket);
        
        log.info("Cost estimation submitted for ticket {}: {} {}", ticket.getId(), request.getCurrency(), request.getEstimatedCost());
        
        return response;
    }

    @Override
    public TicketResponse toggleTicketActive(String ticketId, ToggleActiveRequest request, String userName, String userEmail) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));

        ticket.setActive(request.isActive());
        ticket.setUpdatedAt(Instant.now());
        String note = request.getNotes();
        if (note == null || note.isBlank()) {
            note = request.isActive() ? "Ticket marked as active" : "Ticket marked as inactive";
        }
        ticket.addNote(userName, userEmail, note);

        Ticket saved = ticketRepository.save(ticket);
        TicketResponse response = mapToResponse(saved);
        eventPublisher.publishTicketEvent("active-toggled", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketUpdated(saved);
        
        return response;
    }
    
    @Override
    public TicketResponse addNoteToTicket(String ticketId, AddNoteRequest request, 
                                           String userName, String userEmail) {
        log.info("Adding note to ticket {} by {}", ticketId, userName);
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        
        ticket.setUpdatedAt(Instant.now());
        ticket.addNote(userName, userEmail, request.getNotes(), request.getAttachments());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        log.info("Note added to ticket {} successfully", ticketId);
        
        emailService.sendNoteAddedEmail(savedTicket, userName, request.getNotes());
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("note-added", response);
        webSocketEventService.broadcastTicketUpdated(savedTicket);
        return response;
    }
    
    @Override
    public TicketResponse assignTicket(String ticketId, AssignTicketRequest request, 
                                        String userName, String userEmail) {
        log.info("Assigning ticket {} to {} by {}", ticketId, request.getAssigneeName(), userName);
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        
        ticket.setAssignedTo(request.getAssigneeName());
        ticket.setAssignedToEmail(request.getAssigneeEmail());
        ticket.setUpdatedAt(Instant.now());
        ticket.addTimelineEntry(ticket.getStatus(), userName, userEmail, 
                "Ticket assigned to " + request.getAssigneeName());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        log.info("Ticket {} assigned successfully", ticketId);
        
        emailService.sendTicketAssignedEmail(savedTicket, userName);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("assigned", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketAssigned(savedTicket);
        
        return response;
    }
    
    @Override
    public void deleteTicket(String ticketId) {
        log.info("Deleting ticket: {}", ticketId);
        
        if (!ticketRepository.existsById(ticketId)) {
            throw new ResourceNotFoundException("Ticket not found with ID: " + ticketId);
        }
        
        ticketRepository.deleteById(ticketId);
        eventPublisher.publishTicketEvent("deleted", Map.of("ticketId", ticketId));
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketDeleted(ticketId);
        
        log.info("Ticket {} deleted successfully", ticketId);
    }
    
    @Override
    public TicketStatsResponse getTicketStats() {
        long total = ticketRepository.count();
        
        Map<TicketStatus, Long> byStatus = new EnumMap<>(TicketStatus.class);
        for (TicketStatus status : TicketStatus.values()) {
            byStatus.put(status, ticketRepository.countByStatus(status));
        }
        
        Map<RequestType, Long> byRequestType = new EnumMap<>(RequestType.class);
        for (RequestType type : RequestType.values()) {
            byRequestType.put(type, ticketRepository.countByRequestType(type));
        }
        
        Map<Environment, Long> byEnvironment = new EnumMap<>(Environment.class);
        for (Environment env : Environment.values()) {
            byEnvironment.put(env, ticketRepository.countByEnvironment(env));
        }
        
        return TicketStatsResponse.builder()
                .total(total)
                .byStatus(byStatus)
                .byRequestType(byRequestType)
                .byEnvironment(byEnvironment)
                .pendingCount(byStatus.getOrDefault(TicketStatus.CREATED, 0L))
                .activeCount(
                        byStatus.getOrDefault(TicketStatus.ACCEPTED, 0L) +
                        byStatus.getOrDefault(TicketStatus.MANAGER_APPROVAL_PENDING, 0L) +
                        byStatus.getOrDefault(TicketStatus.IN_PROGRESS, 0L) +
                        byStatus.getOrDefault(TicketStatus.ACTION_REQUIRED, 0L) +
                        byStatus.getOrDefault(TicketStatus.ON_HOLD, 0L)
                )
                .completedCount(
                        byStatus.getOrDefault(TicketStatus.COMPLETED, 0L) +
                        byStatus.getOrDefault(TicketStatus.CLOSED, 0L)
                )
                .rejectedCount(byStatus.getOrDefault(TicketStatus.REJECTED, 0L))
                .build();
    }
    
    @Override
    public TicketStatsResponse getTicketStatsByUser(String userEmail) {
        List<Ticket> userTickets = ticketRepository.findByRequesterEmailOrderByCreatedAtDesc(userEmail);
        
        long total = userTickets.size();
        
        Map<TicketStatus, Long> byStatus = userTickets.stream()
                .collect(Collectors.groupingBy(Ticket::getStatus, Collectors.counting()));
        
        Map<RequestType, Long> byRequestType = userTickets.stream()
                .collect(Collectors.groupingBy(Ticket::getRequestType, Collectors.counting()));
        
        Map<Environment, Long> byEnvironment = userTickets.stream()
                .collect(Collectors.groupingBy(Ticket::getEnvironment, Collectors.counting()));
        
        return TicketStatsResponse.builder()
                .total(total)
                .byStatus(byStatus)
                .byRequestType(byRequestType)
                .byEnvironment(byEnvironment)
                .pendingCount(byStatus.getOrDefault(TicketStatus.CREATED, 0L))
                .activeCount(
                        byStatus.getOrDefault(TicketStatus.ACCEPTED, 0L) +
                        byStatus.getOrDefault(TicketStatus.MANAGER_APPROVAL_PENDING, 0L) +
                        byStatus.getOrDefault(TicketStatus.IN_PROGRESS, 0L) +
                        byStatus.getOrDefault(TicketStatus.ACTION_REQUIRED, 0L) +
                        byStatus.getOrDefault(TicketStatus.ON_HOLD, 0L)
                )
                .completedCount(
                        byStatus.getOrDefault(TicketStatus.COMPLETED, 0L) +
                        byStatus.getOrDefault(TicketStatus.CLOSED, 0L)
                )
                .rejectedCount(byStatus.getOrDefault(TicketStatus.REJECTED, 0L))
                .build();
    }
    
    @Override
    public List<TicketResponse> searchTickets(String searchTerm) {
        return ticketRepository.searchTickets(searchTerm)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    // Helper methods
    
    private String generateTicketId(CreateTicketRequest request) {
        String basis = firstNonBlank(
                request.getProductName(),
                request.getDescription(),
                request.getRequestType() != null ? request.getRequestType().getDisplayName() : null,
                "GENERAL"
        );
        String shortCode = toShortCode(basis);
        String uuidPart = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return "EH-IMOM-" + shortCode + "-" + uuidPart;
    }

    private String toShortCode(String value) {
        String cleaned = value == null ? "" : value.toUpperCase().replaceAll("[^A-Z0-9\\s]", " ").trim();
        if (cleaned.isBlank()) return "GEN";
        String[] parts = cleaned.split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(4, parts[0].length()));
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            if (!parts[i].isBlank()) sb.append(parts[i].charAt(0));
        }
        String out = sb.toString();
        if (out.isBlank()) return "GEN";
        return out.length() > 4 ? out.substring(0, 4) : out;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "GENERAL";
    }
    
    @Override
    public TicketResponse forwardTicket(String ticketId, ForwardTicketRequest request, 
                                        String userName, String userEmail) {
        log.info("Forwarding ticket {} from {} to {}", ticketId, userName, request.getNewAssigneeName());
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with id: " + ticketId));
        
        String previousAssignee = ticket.getAssignedTo();
        
        // Update assignment
        ticket.setAssignedTo(request.getNewAssigneeName());
        ticket.setAssignedToEmail(request.getNewAssigneeEmail());
        ticket.setUpdatedAt(Instant.now());
        
        // Add timeline entry for forwarding
        String notes = request.getNotes();
        if (notes == null || notes.isEmpty()) {
            notes = "Ticket forwarded from " + previousAssignee + " to " + request.getNewAssigneeName();
        }
        ticket.addForwardEntry(userName, userEmail, previousAssignee, 
                               request.getNewAssigneeName(), notes);
        
        Ticket savedTicket = ticketRepository.save(ticket);
        log.info("Ticket {} forwarded successfully", ticketId);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("forwarded", response);
        return response;
    }
    
    @Override
    public List<TicketResponse> getUnassignedTickets() {
        log.info("Fetching unassigned tickets");
        List<Ticket> tickets = ticketRepository.findByAssignedToIsNullAndStatus(TicketStatus.CREATED);
        return tickets.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<TicketResponse> getTicketsByAssignee(String assigneeEmail) {
        log.info("Fetching tickets assigned to: {}", assigneeEmail);
        List<Ticket> tickets = ticketRepository.findByAssignedToEmail(assigneeEmail);
        return tickets.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<TicketResponse> getActiveTickets() {
        log.info("Fetching active tickets");
        List<TicketStatus> activeStatuses = Arrays.asList(
            TicketStatus.ACCEPTED,
            TicketStatus.MANAGER_APPROVAL_PENDING,
            TicketStatus.IN_PROGRESS,
            TicketStatus.ACTION_REQUIRED,
            TicketStatus.ON_HOLD
        );
        List<Ticket> tickets = ticketRepository.findByStatusIn(activeStatuses);
        return tickets.stream()
                .filter(Ticket::isActive)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<TicketResponse> getCompletedTickets() {
        log.info("Fetching completed tickets");
        List<TicketStatus> completedStatuses = Arrays.asList(
            TicketStatus.COMPLETED,
            TicketStatus.CLOSED,
            TicketStatus.REJECTED
        );
        List<Ticket> tickets = ticketRepository.findByStatusIn(completedStatuses);
        return tickets.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    private void applyProjectWorkflow(Ticket ticket, CreateTicketRequest request) {
        if (request.getProductName() == null || request.getProductName().isBlank()) {
            return;
        }
        projectRepository.findByNameIgnoreCase(request.getProductName().trim()).ifPresent(project -> {
            ticket.setProjectId(project.getId());
            WorkflowConfiguration wf = projectWorkflowService.resolveEffective(project.getId(), request.getRequestType());
            ticket.setWorkflowSnapshotJson(workflowSnapshotService.serialize(wf));
            if (wf.getEmailRouting() != null) {
                ticket.setWorkflowEmailTo(copyEmailList(wf.getEmailRouting().getTo()));
                ticket.setWorkflowEmailCc(copyEmailList(wf.getEmailRouting().getCc()));
                ticket.setWorkflowEmailBcc(copyEmailList(wf.getEmailRouting().getBcc()));
            }
            int levels = countConfiguredApprovalLevels(wf);
            ticket.setTotalApprovalLevels(levels);
            if (levels > 0) {
                ticket.setManagerApprovalRequired(true);
            }
            if ((ticket.getManagerEmail() == null || ticket.getManagerEmail().isBlank())
                    && wf.getManagers() != null && !wf.getManagers().isEmpty()) {
                var manager = wf.getManagers().get(0);
                ticket.setManagerEmail(manager.getEmail());
                ticket.setManagerName(manager.getName() != null && !manager.getName().isBlank()
                        ? manager.getName() : manager.getEmail());
            }
            if (wf.isCostApprovalRequired()) {
                ticket.setCostApprovalRequired(true);
            }
            mergeWorkflowCcIntoTicket(ticket, wf);
        });
    }

    private static List<String> copyEmailList(List<String> raw) {
        if (raw == null) {
            return null;
        }
        List<String> out = raw.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        return out.isEmpty() ? null : out;
    }

    private static int countConfiguredApprovalLevels(WorkflowConfiguration wf) {
        if (wf.getApprovalLevels() == null || wf.getApprovalLevels().isEmpty()) {
            return 0;
        }
        return wf.getApprovalLevels().stream().mapToInt(ApprovalLevelConfig::getLevel).max().orElse(0);
    }

    private static void mergeWorkflowCcIntoTicket(Ticket ticket, WorkflowConfiguration wf) {
        LinkedHashSet<String> cc = new LinkedHashSet<>();
        if (ticket.getCcEmail() != null && !ticket.getCcEmail().isBlank()) {
            for (String p : ticket.getCcEmail().split("[,;]")) {
                if (!p.isBlank()) {
                    cc.add(p.trim().toLowerCase());
                }
            }
        }
        if (wf.getEmailRouting() != null && wf.getEmailRouting().getCc() != null) {
            wf.getEmailRouting().getCc().stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(e -> cc.add(e.toLowerCase()));
        }
        if (!cc.isEmpty()) {
            ticket.setCcEmail(String.join(", ", cc));
        }
    }

    private List<WorkflowStageView> buildWorkflowStages(Ticket ticket, WorkflowConfiguration wf) {
        TicketStatus st = ticket.getStatus();
        int totalLevels = ticket.getTotalApprovalLevels() != null ? ticket.getTotalApprovalLevels() : 0;
        if (wf != null) {
            totalLevels = Math.max(totalLevels, countConfiguredApprovalLevels(wf));
        }
        boolean showCost = ticket.isCostApprovalRequired()
                || st == TicketStatus.COST_APPROVAL_PENDING
                || st == TicketStatus.COST_APPROVED
                || (wf != null && wf.isCostApprovalRequired());
        List<WorkflowStageView> stages = new ArrayList<>();
        stages.add(stageState("raised", "Ticket raised", st == TicketStatus.CREATED ? "current" : "done"));
        for (int i = 1; i <= totalLevels; i++) {
            String state = resolveApprovalStageState(st, ticket.getCurrentApprovalLevel(), i, totalLevels);
            stages.add(WorkflowStageView.builder().id("approval-" + i).label("Approval level " + i).state(state).build());
        }
        if (showCost) {
            stages.add(stageState("cost", "Cost approval", resolveCostStageState(st)));
        }
        stages.add(stageState("progress", "Work in progress", resolveProgressStageState(st)));
        stages.add(stageState("completed", "Completed", resolveCompletedStageState(st)));
        stages.add(stageState("closed", "Closed", st == TicketStatus.CLOSED ? "current"
                : (st == TicketStatus.COMPLETED || ordinalPastCompleted(st)) ? "done" : "pending"));
        return stages;
    }

    private static WorkflowStageView stageState(String id, String label, String state) {
        return WorkflowStageView.builder().id(id).label(label).state(state).build();
    }

    private static String resolveApprovalStageState(TicketStatus st, Integer curLevel, int levelIndex, int totalLevels) {
        if (totalLevels <= 0) {
            return "pending";
        }
        if (st == TicketStatus.MANAGER_APPROVED || pastManagerApproval(st)) {
            return "done";
        }
        if (st == TicketStatus.MANAGER_APPROVAL_PENDING && curLevel != null) {
            if (levelIndex < curLevel) {
                return "done";
            }
            if (levelIndex == curLevel) {
                return "current";
            }
        }
        return "pending";
    }

    private static boolean pastManagerApproval(TicketStatus st) {
        return st == TicketStatus.COST_APPROVAL_PENDING
                || st == TicketStatus.COST_APPROVED
                || st == TicketStatus.IN_PROGRESS
                || st == TicketStatus.ACTION_REQUIRED
                || st == TicketStatus.ON_HOLD
                || st == TicketStatus.COMPLETED
                || st == TicketStatus.CLOSED;
    }

    private static boolean ordinalPastCompleted(TicketStatus st) {
        return st == TicketStatus.IN_PROGRESS || st == TicketStatus.ACTION_REQUIRED
                || st == TicketStatus.ON_HOLD || st == TicketStatus.COMPLETED;
    }

    private static String resolveCostStageState(TicketStatus st) {
        if (st == TicketStatus.COST_APPROVAL_PENDING) {
            return "current";
        }
        if (st == TicketStatus.COST_APPROVED || st == TicketStatus.IN_PROGRESS
                || st == TicketStatus.ACTION_REQUIRED || st == TicketStatus.ON_HOLD
                || st == TicketStatus.COMPLETED || st == TicketStatus.CLOSED) {
            return "done";
        }
        return "pending";
    }

    private static String resolveProgressStageState(TicketStatus st) {
        if (st == TicketStatus.IN_PROGRESS || st == TicketStatus.ACTION_REQUIRED || st == TicketStatus.ON_HOLD) {
            return "current";
        }
        if (st == TicketStatus.COMPLETED || st == TicketStatus.CLOSED) {
            return "done";
        }
        return "pending";
    }

    private static String resolveCompletedStageState(TicketStatus st) {
        if (st == TicketStatus.COMPLETED) {
            return "current";
        }
        if (st == TicketStatus.CLOSED) {
            return "done";
        }
        return "pending";
    }

    private TicketResponse mapToResponse(Ticket ticket) {
        WorkflowConfiguration wf = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson());
        return TicketResponse.builder()
                .id(ticket.getId())
                .requestType(ticket.getRequestType())
                .productName(ticket.getProductName())
                .projectId(ticket.getProjectId())
                .workflowConfiguration(wf)
                .workflowStages(buildWorkflowStages(ticket, wf))
                .currentApprovalLevel(ticket.getCurrentApprovalLevel())
                .totalApprovalLevels(ticket.getTotalApprovalLevels())
                .environment(ticket.getEnvironment())
                .description(ticket.getDescription())
                .requestedBy(ticket.getRequestedBy())
                .requesterEmail(ticket.getRequesterEmail())
                .managerName(ticket.getManagerName())
                .managerEmail(ticket.getManagerEmail())
                .managerApprovalRequired(ticket.isManagerApprovalRequired())
                .ccEmail(ticket.getCcEmail())
                .managerApprovalStatus(ticket.getManagerApprovalStatus())
                .managerApprovalNote(ticket.getManagerApprovalNote())
                .managerApprovalDate(ticket.getManagerApprovalDate())
                // Cost approval fields
                .costApprovalRequired(ticket.isCostApprovalRequired())
                .estimatedCost(ticket.getEstimatedCost())
                .costCurrency(ticket.getCostCurrency())
                .costApprovalStatus(ticket.getCostApprovalStatus())
                .costApprovalNote(ticket.getCostApprovalNote())
                .costApprovalDate(ticket.getCostApprovalDate())
                .costSubmittedBy(ticket.getCostSubmittedBy())
                .costSubmittedByEmail(ticket.getCostSubmittedByEmail())
                .status(ticket.getStatus())
                .active(ticket.isActive())
                .assignedTo(ticket.getAssignedTo())
                .assignedToEmail(ticket.getAssignedToEmail())
                .createdAt(ticket.getCreatedAt())
                .updatedAt(ticket.getUpdatedAt())
                .timeline(ticket.getTimeline())
                .databaseType(ticket.getDatabaseType())
                .purpose(ticket.getPurpose())
                .activationDate(ticket.getActivationDate())
                .duration(ticket.getDuration())
                .shutdownDate(ticket.getShutdownDate())
                .shutdownReason(ticket.getShutdownReason())
                .releaseVersion(ticket.getReleaseVersion())
                .deploymentStrategy(ticket.getDeploymentStrategy())
                .releaseNotes(ticket.getReleaseNotes())
                .issueType(ticket.getIssueType())
                .issueDescription(ticket.getIssueDescription())
                .errorLogs(ticket.getErrorLogs())
                .branchName(ticket.getBranchName())
                .commitId(ticket.getCommitId())
                .reason(ticket.getReason())
                .otherQueryDetails(ticket.getOtherQueryDetails())
                .attachments(ticket.getAttachments())
                .build();
    }

    @Override
    public void dispatchManagerApprovalEmail(String ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        sendManagerApprovalEmail(ticket);
    }
}
