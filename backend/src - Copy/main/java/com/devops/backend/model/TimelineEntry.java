package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * Represents a single entry in the ticket timeline.
 * Each action on a ticket creates a new timeline entry.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TimelineEntry {
    
    private TicketStatus status;
    private Instant timestamp;
    private String user;
    private String userEmail;
    private String notes;
    private List<String> attachments;
    private boolean isNote; // True if this is just a note without status change
    
    // For ticket forwarding/assignment tracking
    private String action; // e.g., "forwarded", "assigned", "accepted"
    private String previousAssignee;
    private String newAssignee;
}
