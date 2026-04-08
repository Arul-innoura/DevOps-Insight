package com.devops.backend.service;

import com.devops.backend.model.ActivityLog;

import java.util.List;
import java.util.Map;

public interface ActivityLogService {

    void logActivity(String action,
                     String entityType,
                     String entityId,
                     String performedBy,
                     String performedByEmail,
                     String description,
                     Map<String, Object> metadata);

    List<ActivityLog> getRecentLogs(int limit);

    List<ActivityLog> getLogsByTicket(String ticketId);
}
