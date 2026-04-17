package com.devops.backend.dto;

import com.devops.backend.model.analytics.MonitoringDisplayToggle;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MonitoringDisplayUpdateRequest {

    @Builder.Default
    private List<MonitoringDisplayToggle> monitoringDisplayToggles = new ArrayList<>();
}
