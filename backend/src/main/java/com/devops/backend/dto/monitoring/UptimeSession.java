package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UptimeSession {
    private String environment;
    /** ISO-8601 start of uptime interval. */
    private String startTime;
    /** ISO-8601 end of uptime interval. {@code null} means the env is still running (live). */
    private String endTime;
}
