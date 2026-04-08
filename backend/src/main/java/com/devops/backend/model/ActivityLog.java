package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

@Document(collection = "activity_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ActivityLog {

    @Id
    private String id;

    /** e.g. "TICKET_CREATED", "STATUS_CHANGED", "NOTE_ADDED", "TICKET_ASSIGNED", "TICKET_DELETED", "COST_SUBMITTED" */
    private String action;

    /** "TICKET", "USER", "PROJECT" */
    private String entityType;

    private String entityId;

    private String performedBy;

    private String performedByEmail;

    /** Human-readable summary */
    private String description;

    /** Old/new values, extra context */
    private Map<String, Object> metadata;

    private Instant timestamp;

    /** Optional – populated from X-Forwarded-For or RemoteAddr */
    private String ipAddress;
}
