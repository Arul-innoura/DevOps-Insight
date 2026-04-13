package com.devops.backend.service.impl;

import com.devops.backend.dto.*;
import com.devops.backend.exception.ResourceNotFoundException;
import com.devops.backend.model.*;
import com.devops.backend.model.workflow.ApprovalLevelConfig;
import com.devops.backend.model.workflow.InfrastructureConfig;
import com.devops.backend.model.workflow.WorkflowApprover;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ManagerApprovalTokenRepository;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.TicketRepository;
import com.devops.backend.service.ActivityLogService;
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
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
    private final ActivityLogService activityLogService;
    private final CacheManager cacheManager;
    private static final Pattern EMAIL_IN_PAREN_PATTERN = Pattern.compile("\\(([^()\\s]+@[^()\\s]+)\\)");
    /** Designation: Role — Name · email@domain */
    private static final Pattern DESIGNATION_EMAIL_PATTERN = Pattern.compile(
            "Designation:\\s*[\\s\\S]*?·\\s*([\\w.!#$%&'*+/=?^`{|}~-]+@[\\w.-]+\\.[A-Za-z]{2,})",
            Pattern.CASE_INSENSITIVE);
    
    // Valid status transitions
    private static final Map<TicketStatus, Set<TicketStatus>> STATUS_TRANSITIONS = new HashMap<>();
    
    static {
        STATUS_TRANSITIONS.put(TicketStatus.CREATED, Set.of(TicketStatus.ACCEPTED, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.ACCEPTED, Set.of(TicketStatus.MANAGER_APPROVAL_PENDING, TicketStatus.IN_PROGRESS, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.MANAGER_APPROVAL_PENDING, Set.of(TicketStatus.MANAGER_APPROVED, TicketStatus.REJECTED, TicketStatus.ACTION_REQUIRED));
        STATUS_TRANSITIONS.put(TicketStatus.MANAGER_APPROVED, Set.of(TicketStatus.MANAGER_APPROVAL_PENDING, TicketStatus.COST_APPROVAL_PENDING, TicketStatus.IN_PROGRESS, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.COST_APPROVAL_PENDING, Set.of(TicketStatus.COST_APPROVED, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.COST_APPROVED, Set.of(TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.IN_PROGRESS, Set.of(TicketStatus.ACTION_REQUIRED, TicketStatus.ON_HOLD, TicketStatus.COMPLETED));
        STATUS_TRANSITIONS.put(TicketStatus.ACTION_REQUIRED, Set.of(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, TicketStatus.REJECTED));
        STATUS_TRANSITIONS.put(TicketStatus.ON_HOLD, Set.of(TicketStatus.IN_PROGRESS, TicketStatus.REJECTED, TicketStatus.CLOSED));
        STATUS_TRANSITIONS.put(TicketStatus.COMPLETED, Set.of(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.CLOSED, Set.of(TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS));
        STATUS_TRANSITIONS.put(TicketStatus.REJECTED, Set.of());
    }

    private static final String TICKET_DELETED_READONLY_MSG =
            "This ticket is in the recycle bin and cannot be changed. Restore it from Admin → Deleted tickets to continue.";

    private void evictTicketCaches() {
        for (String cacheName : List.of(
                "ticket-stats",
                "ticket-stats-user",
                "tickets-unassigned",
                "tickets-assignee",
                "tickets-active-assignee",
                "tickets-completed-assignee"
        )) {
            Cache cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.clear();
            }
        }
    }

    private void assertTicketWritable(Ticket ticket) {
        if (ticket.isDeleted()) {
            throw new IllegalStateException(TICKET_DELETED_READONLY_MSG);
        }
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
        mergeUserProvidedRoutingIntoTicket(ticket, request);
        
        // Add initial timeline entry
        ticket.addTimelineEntry(TicketStatus.CREATED, userName, userEmail, "Ticket created");
        
        Ticket savedTicket = ticketRepository.save(ticket);
        evictTicketCaches();
        log.info("Ticket created successfully: {}", ticketId);

        activityLogService.logActivity(
                "TICKET_CREATED", "TICKET", ticketId,
                userName, userEmail,
                "Ticket created: " + ticketId + " (" + request.getRequestType() + ")",
                Map.of("requestType", String.valueOf(request.getRequestType()),
                       "productName", request.getProductName() != null ? request.getProductName() : "",
                       "environment", String.valueOf(request.getEnvironment())));

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
    public TicketResponse getTicketById(String ticketId, boolean includeSoftDeleted) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        if (ticket.isDeleted() && !includeSoftDeleted) {
            throw new ResourceNotFoundException("Ticket not found with ID: " + ticketId);
        }
        return mapToResponse(ticket);
    }

    @Override
    public List<TicketResponse> getDeletedTickets() {
        return ticketRepository.findSoftDeletedTicketsOrderByUpdatedAtDesc()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public TicketResponse restoreTicket(String ticketId, String userName, String userEmail) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        if (!ticket.isDeleted()) {
            throw new IllegalArgumentException("Ticket is not in the recycle bin");
        }
        ticket.setDeleted(false);
        ticket.setDeletedAt(null);
        ticket.setDeletedBy(null);
        ticket.setDeletedByEmail(null);
        ticket.setUpdatedAt(Instant.now());
        ticket.addTimelineEntry(ticket.getStatus(), userName, userEmail, "Ticket restored from recycle bin");
        Ticket saved = ticketRepository.save(ticket);
        evictTicketCaches();
        activityLogService.logActivity(
                "TICKET_RESTORED", "TICKET", ticketId,
                userName != null && !userName.isBlank() ? userName : "Unknown",
                userEmail != null && !userEmail.isBlank() ? userEmail : "",
                "Ticket restored: " + ticketId,
                Map.of("ticketId", ticketId));
        TicketResponse response = mapToResponse(saved);
        eventPublisher.publishTicketEvent("restored", response);
        webSocketEventService.broadcastTicketUpdated(saved);
        return response;
    }
    
    @Override
    public List<TicketResponse> getAllTickets() {
        return ticketRepository.findActiveTicketsOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<TicketResponse> getTicketsByRequester(String requesterEmail) {
        return ticketRepository.findActiveByRequesterEmailOrderByCreatedAtDesc(requesterEmail)
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

    /**
     * Reopen is allowed when the stored requester email matches any common JWT email claim
     * (Azure AD often differs between {@code email}, {@code preferred_username}, and {@code upn}).
     * Legacy tickets with no stored email fall back to display-name match.
     */
    private boolean isOriginalRequesterForReopen(Ticket ticket, String userName, String userEmail, Jwt jwt) {
        String stored = ticket.getRequesterEmail();
        if (stored != null && !stored.isBlank()) {
            String normStored = stored.trim().toLowerCase(Locale.ROOT);
            if (userEmail != null && !userEmail.isBlank()
                    && normStored.equals(userEmail.trim().toLowerCase(Locale.ROOT))) {
                return true;
            }
            if (jwt != null) {
                for (String claim : List.of("email", "preferred_username", "upn", "unique_name")) {
                    String v = jwt.getClaimAsString(claim);
                    if (v != null && !v.isBlank() && normStored.equals(v.trim().toLowerCase(Locale.ROOT))) {
                        return true;
                    }
                }
                List<String> emails = jwt.getClaimAsStringList("emails");
                if (emails != null) {
                    for (String e : emails) {
                        if (e != null && !e.isBlank() && normStored.equals(e.trim().toLowerCase(Locale.ROOT))) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        return ticket.getRequestedBy() != null && userName != null
                && ticket.getRequestedBy().trim().equalsIgnoreCase(userName.trim());
    }
    
    @Override
    public TicketResponse updateTicketStatus(String ticketId, UpdateStatusRequest request,
                                              String userName, String userEmail, Jwt jwt) {
        log.info("Updating ticket {} status to {} by {}", ticketId, request.getNewStatus(), userName);
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        assertTicketWritable(ticket);

        if (Boolean.TRUE.equals(request.getReopen())) {
            if (ticket.getStatus() != TicketStatus.CLOSED) {
                throw new IllegalArgumentException("Only closed tickets can be reopened");
            }
            if (!isOriginalRequesterForReopen(ticket, userName, userEmail, jwt)) {
                throw new IllegalArgumentException("Only the original requester can reopen this ticket");
            }
            if (request.getNewStatus() != TicketStatus.CREATED) {
                throw new IllegalArgumentException("Reopen must target CREATED status");
            }
            TicketStatus previousStatus = ticket.getStatus();
            ticket.setStatus(TicketStatus.CREATED);
            ticket.setAssignedTo(null);
            ticket.setAssignedToEmail(null);
            ticket.setUpdatedAt(Instant.now());
            String reopenNote = request.getNotes() != null && !request.getNotes().isBlank()
                    ? request.getNotes()
                    : "Ticket reopened — returned to unassigned queue";
            ticket.addTimelineEntry(TicketStatus.CREATED, userName, userEmail, reopenNote);
            Ticket savedTicket = ticketRepository.save(ticket);
            evictTicketCaches();
            activityLogService.logActivity(
                    "STATUS_CHANGED", "TICKET", ticketId,
                    userName, userEmail,
                    "Ticket reopened from " + previousStatus + " to CREATED",
                    Map.of("previousStatus", String.valueOf(previousStatus),
                            "newStatus", "CREATED",
                            "notes", reopenNote));
            TicketResponse response = mapToResponse(savedTicket);
            eventPublisher.publishTicketEvent("status-updated", response);
            webSocketEventService.broadcastTicketStatusChanged(savedTicket);
            try {
                emailService.sendTicketStatusEmail(savedTicket, previousStatus);
            } catch (Exception e) {
                log.error("Failed to queue email for ticket {}: {}", ticketId, e.getMessage());
            }
            return response;
        }

        // Manual workflow mode: allow status transition to any state (validated by role in controller where needed).

        TicketStatus previousStatus = ticket.getStatus();
        ticket.setStatus(request.getNewStatus());
        ticket.setUpdatedAt(Instant.now());
        if (request.getNewStatus() == TicketStatus.MANAGER_APPROVAL_PENDING) {
            ticket.setManagerApprovalStatus("PENDING");
            ticket.setCurrentApprovalLevel(null);
            applyManagerApprovalRecipient(ticket, request);
        }
        ticket.addTimelineEntry(request.getNewStatus(), userName, userEmail, 
                request.getNotes() != null ? request.getNotes() : "Status changed to " + request.getNewStatus());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        evictTicketCaches();
        log.info("Ticket {} status updated successfully", ticketId);

        activityLogService.logActivity(
                "STATUS_CHANGED", "TICKET", ticketId,
                userName, userEmail,
                "Status changed from " + previousStatus + " to " + request.getNewStatus(),
                Map.of("previousStatus", String.valueOf(previousStatus),
                       "newStatus", String.valueOf(request.getNewStatus()),
                       "notes", request.getNotes() != null ? request.getNotes() : ""));

        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("status-updated", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketStatusChanged(savedTicket);
        
        // Send email notifications based on status
        try {
            if (request.getNewStatus() == TicketStatus.MANAGER_APPROVAL_PENDING) {
                // Trigger manager approval workflow (include trigger note / purpose in email body)
                sendManagerApprovalEmail(savedTicket, request.getNotes());
            } else if (request.getNewStatus() == TicketStatus.MANAGER_APPROVED
                    || request.getNewStatus() == TicketStatus.COST_APPROVED) {
                emailService.sendTicketStatusEmail(savedTicket, previousStatus);
            } else if (request.getNewStatus() == TicketStatus.COST_APPROVAL_PENDING) {
                // Cost-approval link email is sent only from submitCostEstimation — do not email the requester here on Apply/status alone.
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
    /**
     * @param requesterNotes timeline note from the approval trigger (shown in approver email); may be null
     */
    private void sendManagerApprovalEmail(Ticket ticket, String requesterNotes) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isEmpty()) {
            log.warn("Cannot send manager approval email - no manager email for ticket {}", ticket.getId());
            return;
        }
        
        // Generate secure random token
        String token = UUID.randomUUID().toString().replace("-", "") + 
                       UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        
        // Manual approval only — token is not tied to a level chain
        ManagerApprovalToken approvalToken = ManagerApprovalToken.builder()
                .token(token)
                .ticketId(ticket.getId())
                .managerName(ticket.getManagerName())
                .managerEmail(ticket.getManagerEmail())
                .approvalLevel(1)
                .totalApprovalLevels(1)
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .used(false)
                .tokenType("MANAGER_APPROVAL")
                .build();
        
        approvalTokenRepository.save(approvalToken);
        log.info("Created manager approval token for ticket {}", ticket.getId());
        
        String noteForEmail = requesterNotes != null && !requesterNotes.isBlank()
                ? requesterNotes
                : latestManagerApprovalPendingNotes(ticket);
        emailService.sendManagerApprovalRequestEmail(ticket, token, noteForEmail);
    }

    private String latestManagerApprovalPendingNotes(Ticket ticket) {
        if (ticket.getTimeline() == null || ticket.getTimeline().isEmpty()) {
            return null;
        }
        return ticket.getTimeline().stream()
                .filter(e -> !e.isNote() && e.getStatus() == TicketStatus.MANAGER_APPROVAL_PENDING)
                .reduce((a, b) -> b)
                .map(TimelineEntry::getNotes)
                .filter(n -> n != null && !n.isBlank())
                .orElse(null);
    }
    
    /**
     * Find an approver row in cost approvers, approval levels, or workflow managers (case-insensitive email).
     */
    private Optional<WorkflowApprover> findWorkflowApproverByEmailIgnoreCase(WorkflowConfiguration wf, String emailLower) {
        if (wf == null || emailLower == null || emailLower.isBlank()) {
            return Optional.empty();
        }
        String norm = emailLower.trim().toLowerCase(Locale.ROOT);
        if (wf.getCostApprovers() != null) {
            for (WorkflowApprover a : wf.getCostApprovers()) {
                if (a != null && a.getEmail() != null && norm.equals(a.getEmail().trim().toLowerCase(Locale.ROOT))) {
                    return Optional.of(a);
                }
            }
        }
        if (wf.getApprovalLevels() != null) {
            for (var lvl : wf.getApprovalLevels()) {
                if (lvl == null || lvl.getApprovers() == null) {
                    continue;
                }
                for (WorkflowApprover a : lvl.getApprovers()) {
                    if (a != null && a.getEmail() != null && norm.equals(a.getEmail().trim().toLowerCase(Locale.ROOT))) {
                        return Optional.of(a);
                    }
                }
            }
        }
        if (wf.getManagers() != null) {
            for (WorkflowApprover a : wf.getManagers()) {
                if (a != null && a.getEmail() != null && norm.equals(a.getEmail().trim().toLowerCase(Locale.ROOT))) {
                    return Optional.of(a);
                }
            }
        }
        return Optional.empty();
    }

    /**
     * Sets {@code managerEmail}/{@code managerName} on the ticket for the cost-approval email recipient.
     */
    private void resolveCostApprovalRecipient(Ticket ticket, WorkflowConfiguration wf, String requestedCostEmailRaw) {
        String requested = requestedCostEmailRaw != null ? requestedCostEmailRaw.trim() : "";
        if (!requested.isEmpty()) {
            String reqLower = requested.toLowerCase(Locale.ROOT);
            Optional<WorkflowApprover> match = findWorkflowApproverByEmailIgnoreCase(wf, reqLower);
            if (match.isPresent()) {
                WorkflowApprover a = match.get();
                ticket.setManagerEmail(a.getEmail() != null ? a.getEmail().trim() : requested);
                String nm = a.getName();
                ticket.setManagerName(nm != null && !nm.isBlank() ? nm.trim()
                        : (a.getEmail() != null ? localPartOfEmail(a.getEmail()) : localPartOfEmail(requested)));
                return;
            }
            if (requested.contains("@")) {
                ticket.setManagerEmail(requested);
                ticket.setManagerName(localPartOfEmail(requested));
                log.warn("Cost approver {} not listed in workflow snapshot for ticket {}; using explicit address",
                        requested, ticket.getId());
                return;
            }
            throw new IllegalArgumentException("costApproverEmail must be a valid email or match a workflow approver");
        }
        if (ticket.getStatus() == TicketStatus.COST_APPROVAL_PENDING
                && ticket.getManagerEmail() != null && !ticket.getManagerEmail().isBlank()) {
            return;
        }
        workflowSnapshotService.firstCostApprover(wf).ifPresent(a -> {
            ticket.setManagerEmail(a.getEmail() != null ? a.getEmail().trim() : null);
            ticket.setManagerName(a.getName() != null && !a.getName().isBlank()
                    ? a.getName().trim()
                    : (a.getEmail() != null ? localPartOfEmail(a.getEmail()) : "Approver"));
        });
    }

    /**
     * Create cost approval token and send cost approval email
     */
    private void sendCostApprovalEmail(Ticket ticket, String userName) {
        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isBlank()) {
            throw new IllegalStateException("Cannot send cost approval email — no recipient address on ticket " + ticket.getId());
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
        assertTicketWritable(ticket);
        
        if (ticket.getStatus() == TicketStatus.CLOSED) {
            throw new IllegalStateException("Cannot submit cost on a closed ticket.");
        }

        WorkflowConfiguration wfCost = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson());
        resolveCostApprovalRecipient(ticket, wfCost, request.getCostApproverEmail());

        if (ticket.getManagerEmail() == null || ticket.getManagerEmail().isBlank()) {
            throw new IllegalStateException(
                    "Cannot submit cost: no approver email. Configure cost approvers in the product workflow or set a manager on the ticket.");
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
        
        String notes = String.format("Cost estimation submitted: %s %,.2f%s", 
                request.getCurrency(), request.getEstimatedCost(),
                request.getNotes() != null ? ". Notes: " + request.getNotes() : "");
        ticket.addTimelineEntry(TicketStatus.COST_APPROVAL_PENDING, userName, userEmail, notes);
        
        Ticket savedTicket = ticketRepository.save(ticket);
        evictTicketCaches();
        
        sendCostApprovalEmail(savedTicket, userName);
        
        TicketResponse response = mapToResponse(savedTicket);

        activityLogService.logActivity(
                "COST_SUBMITTED", "TICKET", savedTicket.getId(),
                userName, userEmail,
                "Cost estimation submitted: " + request.getCurrency() + " " + request.getEstimatedCost(),
                Map.of("currency", request.getCurrency() != null ? request.getCurrency() : "",
                       "estimatedCost", request.getEstimatedCost()));

        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketStatusChanged(savedTicket);
        
        log.info("Cost estimation submitted for ticket {}: {} {}", ticket.getId(), request.getCurrency(), request.getEstimatedCost());
        
        return response;
    }

    @Override
    public TicketResponse toggleTicketActive(String ticketId, ToggleActiveRequest request, String userName, String userEmail) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        assertTicketWritable(ticket);

        ticket.setActive(request.isActive());
        ticket.setUpdatedAt(Instant.now());
        String note = request.getNotes();
        if (note == null || note.isBlank()) {
            note = request.isActive() ? "Ticket marked as active" : "Ticket marked as inactive";
        }
        ticket.addNote(userName, userEmail, note);

        Ticket saved = ticketRepository.save(ticket);
        evictTicketCaches();
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
        assertTicketWritable(ticket);
        
        ticket.setUpdatedAt(Instant.now());
        ticket.addNote(userName, userEmail, request.getNotes(), request.getAttachments());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        evictTicketCaches();
        log.info("Note added to ticket {} successfully", ticketId);

        activityLogService.logActivity(
                "NOTE_ADDED", "TICKET", ticketId,
                userName, userEmail,
                "Note added to ticket " + ticketId,
                Map.of("note", request.getNotes() != null ? request.getNotes() : ""));

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
        assertTicketWritable(ticket);
        
        ticket.setAssignedTo(request.getAssigneeName());
        ticket.setAssignedToEmail(request.getAssigneeEmail());
        ticket.setUpdatedAt(Instant.now());
        ticket.addTimelineEntry(ticket.getStatus(), userName, userEmail, 
                "Ticket assigned to " + request.getAssigneeName());
        
        Ticket savedTicket = ticketRepository.save(ticket);
        evictTicketCaches();
        log.info("Ticket {} assigned successfully", ticketId);

        activityLogService.logActivity(
                "TICKET_ASSIGNED", "TICKET", ticketId,
                userName, userEmail,
                "Ticket assigned to " + request.getAssigneeName(),
                Map.of("assigneeName", request.getAssigneeName() != null ? request.getAssigneeName() : "",
                       "assigneeEmail", request.getAssigneeEmail() != null ? request.getAssigneeEmail() : ""));

        emailService.sendTicketAssignedEmail(savedTicket, userName);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("assigned", response);
        
        // Broadcast real-time WebSocket event
        webSocketEventService.broadcastTicketAssigned(savedTicket);
        
        return response;
    }
    
    @Override
    public void deleteTicket(String ticketId, String userName, String userEmail) {
        log.info("Soft-deleting ticket: {} by {} ({})", ticketId, userName, userEmail);

        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        if (ticket.isDeleted()) {
            log.info("Ticket {} already in recycle bin — idempotent skip", ticketId);
            return;
        }

        Instant now = Instant.now();
        ticket.setDeleted(true);
        ticket.setDeletedAt(now);
        ticket.setDeletedBy(userName != null && !userName.isBlank() ? userName : "Unknown");
        ticket.setDeletedByEmail(userEmail != null && !userEmail.isBlank() ? userEmail : "");
        ticket.setUpdatedAt(now);
        ticket.addTimelineEntry(ticket.getStatus(), ticket.getDeletedBy(), ticket.getDeletedByEmail(),
                "Ticket moved to recycle bin (soft delete)");
        Ticket saved = ticketRepository.save(ticket);
        evictTicketCaches();

        eventPublisher.publishTicketEvent("deleted", Map.of("ticketId", ticketId));

        String actorName = userName != null && !userName.isBlank() ? userName : "Unknown";
        String actorEmail = userEmail != null && !userEmail.isBlank() ? userEmail : "";
        activityLogService.logActivity(
                "TICKET_DELETED", "TICKET", ticketId,
                actorName, actorEmail,
                "Ticket moved to recycle bin: " + ticketId,
                Map.of("ticketId", ticketId));

        webSocketEventService.broadcastTicketDeleted(ticketId);
        webSocketEventService.broadcastTicketUpdated(saved);

        log.info("Ticket {} moved to recycle bin", ticketId);
    }
    
    @Override
    @Cacheable("ticket-stats")
    public TicketStatsResponse getTicketStats() {
        long total = ticketRepository.countActiveTickets();
        
        Map<TicketStatus, Long> byStatus = new EnumMap<>(TicketStatus.class);
        for (TicketStatus status : TicketStatus.values()) {
            byStatus.put(status, ticketRepository.countActiveByStatus(status));
        }
        
        Map<RequestType, Long> byRequestType = new EnumMap<>(RequestType.class);
        for (RequestType type : RequestType.values()) {
            byRequestType.put(type, ticketRepository.countActiveByRequestType(type));
        }
        
        Map<Environment, Long> byEnvironment = new EnumMap<>(Environment.class);
        for (Environment env : Environment.values()) {
            byEnvironment.put(env, ticketRepository.countActiveByEnvironment(env));
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
    @Cacheable(value = "ticket-stats-user", key = "#userEmail")
    public TicketStatsResponse getTicketStatsByUser(String userEmail) {
        List<Ticket> userTickets = ticketRepository.findActiveByRequesterEmailOrderByCreatedAtDesc(userEmail);
        
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
    
    private static final int SEARCH_QUERY_MAX_LEN = 160;

    /**
     * Mongo-safe substring match: wraps {@link Pattern#quote} so user input cannot inject regex operators.
     */
    private String buildSafeContainsRegex(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim();
        if (t.isEmpty() || t.length() > SEARCH_QUERY_MAX_LEN) {
            return null;
        }
        return ".*" + Pattern.quote(t) + ".*";
    }

    private String buildRequesterEmailAnchorRegex(String email) {
        if (email == null) {
            return "^$";
        }
        String e = email.trim();
        if (e.isEmpty()) {
            return "^$";
        }
        return "^" + Pattern.quote(e) + "$";
    }

    @Override
    public List<TicketResponse> searchTickets(String searchTerm) {
        String pat = buildSafeContainsRegex(searchTerm);
        if (pat == null) {
            return List.of();
        }
        return ticketRepository.searchTickets(pat).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public List<TicketResponse> searchMyTickets(String searchTerm, String requesterEmail) {
        String pat = buildSafeContainsRegex(searchTerm);
        if (pat == null) {
            return List.of();
        }
        String emailPat = buildRequesterEmailAnchorRegex(requesterEmail);
        return ticketRepository.searchMyTickets(pat, emailPat).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public List<TicketResponse> searchTicketsSuggest(String searchTerm, int limit) {
        int lim = Math.min(Math.max(limit, 1), 25);
        return searchTickets(searchTerm).stream().limit(lim).collect(Collectors.toList());
    }

    @Override
    public List<TicketResponse> searchMyTicketsSuggest(String searchTerm, String requesterEmail, int limit) {
        int lim = Math.min(Math.max(limit, 1), 25);
        return searchMyTickets(searchTerm, requesterEmail).stream().limit(lim).collect(Collectors.toList());
    }
    
    // Helper methods
    
    private String generateTicketId(CreateTicketRequest request) {
        String typeShort = requestTypeShortCode(request.getRequestType());
        String projectShort = projectShortCode(request.getProductName());
        String prefix = "EH-" + typeShort + "-" + projectShort + "-";
        long seq = ticketRepository.countByIdStartingWith(prefix) + 1;
        String seqStr = String.format("%04d", seq);
        return prefix + seqStr;
    }

    private String requestTypeShortCode(RequestType type) {
        if (type == null) return "GEN";
        switch (type) {
            case NEW_ENVIRONMENT:    return "NEWENV";
            case ENVIRONMENT_UP:     return "ENVUP";
            case ENVIRONMENT_DOWN:   return "ENVDN";
            case RELEASE_DEPLOYMENT: return "RELDEP";
            case BUILD_REQUEST:      return "GENREQ";
            case CODE_CUT:           return "CDCUT";
            case ISSUE_FIX:          return "ISFIX";
            case OTHER_QUERIES:      return "OTHER";
            default:                 return "GEN";
        }
    }

    private String projectShortCode(String productName) {
        if (productName == null || productName.isBlank()) return "PROJ";
        String cleaned = productName.toUpperCase().replaceAll("[^A-Z0-9]", "");
        return cleaned.isEmpty() ? "PROJ" : cleaned.substring(0, Math.min(8, cleaned.length()));
    }


    private void applyManagerApprovalRecipient(Ticket ticket, UpdateStatusRequest request) {
        String explicit = request.getApprovalTargetEmail() != null ? request.getApprovalTargetEmail().trim() : "";
        String fromNotes = extractApprovalTargetEmail(request.getNotes()).orElse("");
        String chosen = !explicit.isBlank() ? explicit : fromNotes;
        if (chosen.isBlank()) {
            return;
        }
        String normalized = chosen.trim();
        WorkflowConfiguration wf = workflowSnapshotService.parse(ticket.getWorkflowSnapshotJson());
        findApproverByEmail(wf, normalized).ifPresentOrElse(
                a -> {
                    ticket.setManagerEmail(a.getEmail() != null ? a.getEmail().trim() : normalized);
                    String nm = a.getName();
                    ticket.setManagerName(nm != null && !nm.isBlank() ? nm.trim()
                            : (a.getEmail() != null ? a.getEmail() : normalized));
                    String role = a.getRole();
                    ticket.setManagerDesignation(role != null && !role.isBlank() ? role.trim() : null);
                },
                () -> {
                    ticket.setManagerEmail(normalized);
                    ticket.setManagerName(parseNameFromDesignationNotes(request.getNotes())
                            .orElseGet(() -> localPartOfEmail(normalized)));
                    ticket.setManagerDesignation(parseRoleFromDesignationNotes(request.getNotes()).orElse(null));
                }
        );
    }

    private static String localPartOfEmail(String email) {
        if (email == null || !email.contains("@")) {
            return email != null ? email : "Approver";
        }
        return email.substring(0, email.indexOf('@'));
    }

    private static Optional<String> parseNameFromDesignationNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            return Optional.empty();
        }
        Matcher m = Pattern.compile("Designation:\\s*[^—]*—\\s*([^·]+)\\s*·", Pattern.CASE_INSENSITIVE).matcher(notes);
        if (m.find()) {
            String name = m.group(1).trim();
            if (!name.isBlank()) {
                return Optional.of(name);
            }
        }
        return Optional.empty();
    }

    private static Optional<String> parseRoleFromDesignationNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            return Optional.empty();
        }
        Matcher m = Pattern.compile("Designation:\\s*([^—]+)\\s*—", Pattern.CASE_INSENSITIVE).matcher(notes);
        if (m.find()) {
            String role = m.group(1).trim();
            if (!role.isBlank()) {
                return Optional.of(role);
            }
        }
        return Optional.empty();
    }

    private Optional<String> extractApprovalTargetEmail(String notes) {
        if (notes == null || notes.isBlank()) {
            return Optional.empty();
        }
        Matcher matcher = EMAIL_IN_PAREN_PATTERN.matcher(notes);
        String lastParen = null;
        while (matcher.find()) {
            String email = matcher.group(1);
            if (email != null && !email.isBlank()) {
                lastParen = email.trim();
            }
        }
        if (lastParen != null) {
            return Optional.of(lastParen.toLowerCase());
        }
        Matcher des = DESIGNATION_EMAIL_PATTERN.matcher(notes);
        if (des.find()) {
            return Optional.of(des.group(1).trim().toLowerCase());
        }
        return Optional.empty();
    }

    private Optional<com.devops.backend.model.workflow.WorkflowApprover> findApproverByEmail(WorkflowConfiguration wf, String email) {
        if (wf == null || wf.getApprovalLevels() == null || email == null) {
            return Optional.empty();
        }
        return wf.getApprovalLevels().stream()
                .filter(Objects::nonNull)
                .flatMap(level -> (level.getApprovers() == null ? List.<com.devops.backend.model.workflow.WorkflowApprover>of() : level.getApprovers()).stream())
                .filter(Objects::nonNull)
                .filter(a -> a.getEmail() != null && a.getEmail().trim().equalsIgnoreCase(email))
                .findFirst();
    }

    @Override
    public TicketResponse forwardTicket(String ticketId, ForwardTicketRequest request, 
                                        String userName, String userEmail) {
        log.info("Forwarding ticket {} from {} to {}", ticketId, userName, request.getNewAssigneeName());
        
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with id: " + ticketId));
        assertTicketWritable(ticket);
        
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
        evictTicketCaches();
        log.info("Ticket {} forwarded successfully", ticketId);
        
        TicketResponse response = mapToResponse(savedTicket);
        eventPublisher.publishTicketEvent("forwarded", response);
        return response;
    }
    
    @Override
    @Cacheable("tickets-unassigned")
    public List<TicketResponse> getUnassignedTickets() {
        log.info("Fetching unassigned tickets");
        List<Ticket> tickets = ticketRepository.findActiveUnassignedByStatus(TicketStatus.CREATED);
        return tickets.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    @Cacheable(value = "tickets-assignee", key = "#assigneeEmail")
    public List<TicketResponse> getTicketsByAssignee(String assigneeEmail) {
        log.info("Fetching tickets assigned to: {}", assigneeEmail);
        List<Ticket> tickets = ticketRepository.findActiveByAssignedToEmail(assigneeEmail);
        return tickets.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    @Cacheable(value = "tickets-active-assignee", key = "#assigneeEmail")
    public List<TicketResponse> getActiveTickets(String assigneeEmail) {
        log.info("Fetching active tickets for assignee: {}", assigneeEmail);
        List<TicketStatus> activeStatuses = Arrays.asList(
            TicketStatus.ACCEPTED,
            TicketStatus.MANAGER_APPROVAL_PENDING,
            TicketStatus.IN_PROGRESS,
            TicketStatus.ACTION_REQUIRED,
            TicketStatus.ON_HOLD
        );
        String normalizedEmail = assigneeEmail != null ? assigneeEmail.trim().toLowerCase(Locale.ROOT) : "";
        List<Ticket> tickets = ticketRepository.findActiveByStatusIn(activeStatuses);
        return tickets.stream()
                .filter(t -> {
                    String assigned = t.getAssignedToEmail();
                    return assigned != null && assigned.trim().toLowerCase(Locale.ROOT).equals(normalizedEmail);
                })
                .filter(Ticket::isActive)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }
    
    @Override
    @Cacheable(value = "tickets-completed-assignee", key = "#assigneeEmail")
    public List<TicketResponse> getCompletedTickets(String assigneeEmail) {
        log.info("Fetching completed tickets for assignee: {}", assigneeEmail);
        List<TicketStatus> completedStatuses = Arrays.asList(
            TicketStatus.COMPLETED,
            TicketStatus.CLOSED,
            TicketStatus.REJECTED
        );
        String normalizedEmail = assigneeEmail != null ? assigneeEmail.trim().toLowerCase(Locale.ROOT) : "";
        List<Ticket> tickets = ticketRepository.findActiveByStatusIn(completedStatuses);
        return tickets.stream()
                .filter(t -> {
                    String assigned = t.getAssignedToEmail();
                    return assigned != null && assigned.trim().toLowerCase(Locale.ROOT).equals(normalizedEmail);
                })
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
            InfrastructureConfig mergedInfra = projectWorkflowService.mergeInfrastructureForEnvironment(
                    project.getId(), request.getEnvironment(), wf.getInfrastructure());
            wf.setInfrastructure(mergedInfra);
            ticket.setWorkflowSnapshotJson(workflowSnapshotService.serialize(wf));
            if (wf.getEmailRouting() != null) {
                ticket.setWorkflowEmailTo(copyEmailListFromApprovers(wf.getEmailRouting().getTo()));
                ticket.setWorkflowEmailCc(copyEmailListFromApprovers(wf.getEmailRouting().getCc()));
                ticket.setWorkflowEmailBcc(copyEmailListFromApprovers(wf.getEmailRouting().getBcc()));
                ticket.setWorkflowEmailToMandatory(copyEmailList(wf.getEmailRouting().getToMandatory()));
                ticket.setWorkflowEmailCcMandatory(copyEmailList(wf.getEmailRouting().getCcMandatory()));
                ticket.setWorkflowEmailBccMandatory(copyEmailList(wf.getEmailRouting().getBccMandatory()));
            }
            ticket.setTotalApprovalLevels(null);
            ticket.setCurrentApprovalLevel(null);
            int approverSlots = countConfiguredApproverSlots(wf);
            if (approverSlots > 0) {
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

    private static List<String> copyEmailListFromApprovers(List<WorkflowApprover> raw) {
        if (raw == null) {
            return null;
        }
        List<String> out = raw.stream()
                .filter(Objects::nonNull)
                .map(WorkflowApprover::getEmail)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .distinct()
                .collect(Collectors.toList());
        return out.isEmpty() ? null : out;
    }

    /**
     * Rows in workflow with at least one approver email — used only to know if approval is configured (fully manual; no level chain).
     */
    private static int countConfiguredApproverSlots(WorkflowConfiguration wf) {
        if (wf == null || wf.getApprovalLevels() == null || wf.getApprovalLevels().isEmpty()) {
            return 0;
        }
        return (int) wf.getApprovalLevels().stream()
                .filter(Objects::nonNull)
                .filter(lvl -> lvl.getApprovers() != null
                        && lvl.getApprovers().stream()
                        .filter(Objects::nonNull)
                        .anyMatch(a -> a.getEmail() != null && !a.getEmail().isBlank()))
                .count();
    }

    private static List<String> parseEmailCsv(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split("[,;]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(String::toLowerCase)
                .filter(s -> s.contains("@"))
                .distinct()
                .collect(Collectors.toList());
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
                    .map(WorkflowApprover::getEmail)
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(e -> cc.add(e.toLowerCase(Locale.ROOT)));
        }
        if (!cc.isEmpty()) {
            ticket.setCcEmail(String.join(", ", cc));
        }
    }

    private static void mergeUserProvidedRoutingIntoTicket(Ticket ticket, CreateTicketRequest request) {
        LinkedHashSet<String> to = new LinkedHashSet<>();
        if (ticket.getWorkflowEmailTo() != null) {
            ticket.getWorkflowEmailTo().stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(String::toLowerCase)
                    .forEach(to::add);
        }
        parseEmailCsv(request.getToEmail()).forEach(to::add);
        if (!to.isEmpty()) {
            ticket.setWorkflowEmailTo(new ArrayList<>(to));
        }

        LinkedHashSet<String> cc = new LinkedHashSet<>();
        if (ticket.getCcEmail() != null && !ticket.getCcEmail().isBlank()) {
            parseEmailCsv(ticket.getCcEmail()).forEach(cc::add);
        }
        parseEmailCsv(request.getCcEmail()).forEach(cc::add);
        if (!cc.isEmpty()) {
            ticket.setCcEmail(String.join(", ", cc));
        }

        LinkedHashSet<String> bcc = new LinkedHashSet<>();
        if (ticket.getWorkflowEmailBcc() != null) {
            ticket.getWorkflowEmailBcc().stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(String::toLowerCase)
                    .forEach(bcc::add);
        }
        parseEmailCsv(request.getBccEmail()).forEach(bcc::add);
        ticket.setWorkflowEmailBcc(bcc.isEmpty() ? ticket.getWorkflowEmailBcc() : new ArrayList<>(bcc));
    }

    private List<WorkflowStageView> buildWorkflowStages(Ticket ticket, WorkflowConfiguration wf) {
        TicketStatus st = ticket.getStatus();
        int approverSlots = wf != null ? countConfiguredApproverSlots(wf) : 0;
        boolean showManagerApprovalStage = approverSlots > 0
                || ticket.isManagerApprovalRequired()
                || st == TicketStatus.MANAGER_APPROVAL_PENDING
                || st == TicketStatus.MANAGER_APPROVED;
        boolean showCost = ticket.isCostApprovalRequired()
                || st == TicketStatus.COST_APPROVAL_PENDING
                || st == TicketStatus.COST_APPROVED
                || (wf != null && wf.isCostApprovalRequired());
        List<WorkflowStageView> stages = new ArrayList<>();
        stages.add(stageState("raised", "Ticket raised", st == TicketStatus.CREATED ? "current" : "done"));
        if (showManagerApprovalStage) {
            stages.add(WorkflowStageView.builder()
                    .id("approval")
                    .label("Manager approval")
                    .state(resolveManualManagerApprovalStageState(st))
                    .build());
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

    private static String resolveManualManagerApprovalStageState(TicketStatus st) {
        if (st == TicketStatus.MANAGER_APPROVAL_PENDING) {
            return "current";
        }
        if (st == TicketStatus.MANAGER_APPROVED || pastManagerApproval(st)) {
            return "done";
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
        if (ticket.getProjectId() != null && ticket.getEnvironment() != null) {
            InfrastructureConfig merged = projectWorkflowService.mergeInfrastructureForEnvironment(
                    ticket.getProjectId(), ticket.getEnvironment(), wf.getInfrastructure());
            wf.setInfrastructure(merged);
        }
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
                .managerDesignation(ticket.getManagerDesignation())
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
                .deleted(ticket.isDeleted())
                .deletedAt(ticket.getDeletedAt())
                .deletedBy(ticket.getDeletedBy())
                .deletedByEmail(ticket.getDeletedByEmail())
                .build();
    }

    @Override
    public void dispatchManagerApprovalEmail(String ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found with ID: " + ticketId));
        assertTicketWritable(ticket);
        sendManagerApprovalEmail(ticket, latestManagerApprovalPendingNotes(ticket));
    }

}
