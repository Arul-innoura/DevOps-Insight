package com.devops.backend.controller;

import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;
import com.devops.backend.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/monitoring")
@RequiredArgsConstructor
public class MonitoringController {
    private final MonitoringService monitoringService;

    @GetMapping("/products")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public List<String> getProducts() {
        return monitoringService.getProductNames();
    }

    @GetMapping("/environment")
    @PreAuthorize("hasAnyAuthority('APPROLE_User','APPROLE_DevOps','APPROLE_Admin')")
    public EnvironmentMonitoringResponse getEnvironmentMonitoring(
            @RequestParam String productName,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month
    ) {
        LocalDate now = LocalDate.now();
        int y = year != null ? year : now.getYear();
        int m = month != null ? month : now.getMonthValue();
        return monitoringService.getEnvironmentMonitoring(productName, y, m);
    }
}

