package com.devops.backend.service.impl;

import com.devops.backend.model.ActivityLog;
import com.devops.backend.repository.ActivityLogRepository;
import com.devops.backend.service.ActivityLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ActivityLogServiceImpl implements ActivityLogService {

    private final ActivityLogRepository activityLogRepository;

    @Override
    public void logActivity(String action,
                            String entityType,
                            String entityId,
                            String performedBy,
                            String performedByEmail,
                            String description,
                            Map<String, Object> metadata) {
        try {
            ActivityLog entry = ActivityLog.builder()
                    .action(action)
                    .entityType(entityType)
                    .entityId(entityId)
                    .performedBy(performedBy)
                    .performedByEmail(performedByEmail)
                    .description(description)
                    .metadata(metadata)
                    .timestamp(Instant.now())
                    .build();
            activityLogRepository.save(entry);
            log.debug("Activity logged: {} on {} {}", action, entityType, entityId);
        } catch (Exception e) {
            log.error("Failed to persist activity log [{} {} {}]: {}", action, entityType, entityId, e.getMessage());
        }
    }

    @Override
    public List<ActivityLog> getRecentLogs(int limit) {
        List<ActivityLog> logs = activityLogRepository.findTop200ByOrderByTimestampDesc();
        if (limit <= 0 || limit >= logs.size()) {
            return logs;
        }
        return logs.stream().limit(limit).collect(Collectors.toList());
    }

    @Override
    public List<ActivityLog> getLogsByTicket(String ticketId) {
        return activityLogRepository.findByEntityTypeAndEntityIdOrderByTimestampDesc("TICKET", ticketId);
    }
}
