package com.devops.backend.dto;

import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TicketStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * DTO for ticket filter/search parameters.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TicketFilterRequest {
    
    private TicketStatus status;
    private RequestType requestType;
    private Environment environment;
    private String search;
    private Instant dateFrom;
    private Instant dateTo;
    private String requesterEmail;
    private String assignedTo;
    
    // Pagination
    private Integer page;
    private Integer size;
    
    // Sorting
    private String sortBy;
    private String sortDirection;
}
