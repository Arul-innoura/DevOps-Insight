package com.devops.backend.service;

import com.devops.backend.dto.monitoring.CycleRecord;
import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;
import com.devops.backend.dto.monitoring.UptimeSession;

import java.time.Instant;
import java.util.List;

public interface MonitoringService {
    List<String> getProductNames();
    EnvironmentMonitoringResponse getEnvironmentMonitoring(String productName, int year, int month);
    List<UptimeSession> getUptimeSessions(String productName, Instant from, Instant to);
    /** Returns completed + live manual cycle records for a product (all products if productName blank). */
    List<CycleRecord> getCycleHistory(String productName, Instant from, Instant to);
}
