package com.devops.backend.model;

/**
 * Enum representing the different statuses a ticket can have in the workflow.
 * 
 * Workflow Flow:
 * 1. CREATED → Ticket raised by user
 * 2. ACCEPTED → DevOps accepts the ticket
 * 3. MANAGER_APPROVAL_PENDING → Waiting for manager approval (if required)
 * 4. MANAGER_APPROVED → Manager has approved
 * 5. COST_APPROVAL_PENDING → Waiting for cost approval (if cost estimation needed)
 * 6. COST_APPROVED → Cost approved by manager
 * 7. IN_PROGRESS → Work has started
 * 8. COMPLETED → Work completed
 * 9. CLOSED → Ticket closed (includes manager/cost decline — no separate rejected status in the API)
 * REJECTED → Legacy value only (stored documents); API maps to CLOSED
 */
public enum TicketStatus {
    CREATED("Ticket Raised"),
    ACCEPTED("DevOps Accepted"),
    MANAGER_APPROVAL_PENDING("Waiting for Manager Approval"),
    MANAGER_APPROVED("Manager Approved"),
    COST_APPROVAL_PENDING("Cost Approval Pending"),
    COST_APPROVED("Cost Approved"),
    IN_PROGRESS("Work In Progress"),
    ACTION_REQUIRED("Action Required"),
    ON_HOLD("On Hold"),
    COMPLETED("Completed"),
    CLOSED("Closed"),
    REJECTED("Rejected");

    private final String displayName;

    TicketStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
