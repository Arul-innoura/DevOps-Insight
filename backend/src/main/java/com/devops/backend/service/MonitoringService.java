package com.devops.backend.service;

import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;

import java.util.List;

public interface MonitoringService {
    List<String> getProductNames();
    EnvironmentMonitoringResponse getEnvironmentMonitoring(String productName, int year, int month);
}

