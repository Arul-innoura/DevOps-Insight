package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Persists every DevOps engineer status change for timeline/audit tracking.
 * Used by the Admin dashboard to render day-wise Jira-style timelines.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "devops_status_logs")
public class StatusChangeLog {

    @Id
    private String id;

    private String memberEmail;
    private String memberName;

    private DevOpsAvailabilityStatus previousStatus;
    private DevOpsAvailabilityStatus newStatus;

    /** "SYSTEM" for auto-offline, or the user's display name for manual changes */
    private String changedBy;

    /** "manual", "inactivity_timeout", "session_closed", "heartbeat_resume" */
    private String changeReason;

    private Instant changedAt;
}
