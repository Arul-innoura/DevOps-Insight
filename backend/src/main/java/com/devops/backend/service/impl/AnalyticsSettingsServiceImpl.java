package com.devops.backend.service.impl;

import com.devops.backend.model.analytics.AnalyticsSettings;
import com.devops.backend.model.analytics.EnvTrafficDelta;
import com.devops.backend.model.analytics.ProjectTimelineSegment;
import com.devops.backend.model.analytics.TrafficDayDelta;
import com.devops.backend.model.analytics.TrafficMonthDelta;
import com.devops.backend.repository.AnalyticsSettingsRepository;
import com.devops.backend.service.AnalyticsSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;

@Service
@RequiredArgsConstructor
public class AnalyticsSettingsServiceImpl implements AnalyticsSettingsService {

    private final AnalyticsSettingsRepository repository;

    @Override
    public AnalyticsSettings getOrDefault() {
        return repository.findById(AnalyticsSettings.GLOBAL_ID)
                .orElse(AnalyticsSettings.builder()
                        .id(AnalyticsSettings.GLOBAL_ID)
                        .dayTrafficDeltas(new ArrayList<>())
                        .monthTrafficDeltas(new ArrayList<>())
                        .envTrafficDeltas(new ArrayList<>())
                        .projectTimelineSegments(new ArrayList<>())
                        .build());
    }

    @Override
    public AnalyticsSettings save(AnalyticsSettings body, String actorName) {
        if (body.getDayTrafficDeltas() == null) {
            body.setDayTrafficDeltas(new ArrayList<>());
        }
        if (body.getMonthTrafficDeltas() == null) {
            body.setMonthTrafficDeltas(new ArrayList<>());
        }
        if (body.getEnvTrafficDeltas() == null) {
            body.setEnvTrafficDeltas(new ArrayList<>());
        }
        if (body.getProjectTimelineSegments() == null) {
            body.setProjectTimelineSegments(new ArrayList<>());
        }
        for (TrafficDayDelta d : body.getDayTrafficDeltas()) {
            if (d.getEnvironment() == null) {
                d.setEnvironment("");
            }
        }
        for (TrafficMonthDelta m : body.getMonthTrafficDeltas()) {
            if (m.getYearMonth() == null) {
                m.setYearMonth("");
            }
        }
        for (EnvTrafficDelta e : body.getEnvTrafficDeltas()) {
            if (e.getEnvironment() == null) {
                e.setEnvironment("");
            }
        }
        for (ProjectTimelineSegment seg : body.getProjectTimelineSegments()) {
            if (seg.getProjectName() == null) {
                seg.setProjectName("");
            }
            if (seg.getEnvironment() == null) {
                seg.setEnvironment("");
            }
            if (seg.getStartDate() == null) {
                seg.setStartDate("");
            }
            if (seg.getEndDate() == null) {
                seg.setEndDate("");
            }
            if (seg.getLabel() == null) {
                seg.setLabel("");
            }
            if (seg.getColor() == null) {
                seg.setColor("");
            }
        }
        body.setId(AnalyticsSettings.GLOBAL_ID);
        body.setUpdatedAt(Instant.now());
        body.setUpdatedBy(actorName);
        return repository.save(body);
    }
}
