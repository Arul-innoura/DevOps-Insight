package com.devops.backend.dto;

import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TicketStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * DTO for ticket statistics response.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TicketStatsResponse {
    
    private long total;
    private Map<TicketStatus, Long> byStatus;
    private Map<RequestType, Long> byRequestType;
    private Map<Environment, Long> byEnvironment;
    
    private long pendingCount;
    private long activeCount;
    private long completedCount;
    private long rejectedCount;
}
