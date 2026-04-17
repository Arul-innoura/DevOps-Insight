package com.devops.backend.service.impl;

import com.devops.backend.model.analytics.AnalyticsSettings;
import com.devops.backend.model.analytics.EnvTrafficDelta;
import com.devops.backend.model.analytics.MonitoringDisplayToggle;
import com.devops.backend.model.analytics.ProjectTimelineSegment;
import com.devops.backend.model.analytics.TrafficDayDelta;
import com.devops.backend.model.analytics.TrafficMonthDelta;
import com.devops.backend.repository.AnalyticsSettingsRepository;
import com.devops.backend.service.AnalyticsSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AnalyticsSettingsServiceImpl implements AnalyticsSettingsService {

    private final AnalyticsSettingsRepository repository;

    @Override
    public AnalyticsSettings getOrDefault() {
        return repository.findById(AnalyticsSettings.GLOBAL_ID)
                .map(AnalyticsSettingsServiceImpl::ensureCollections)
                .orElse(AnalyticsSettings.builder()
                        .id(AnalyticsSettings.GLOBAL_ID)
                        .dayTrafficDeltas(new ArrayList<>())
                        .monthTrafficDeltas(new ArrayList<>())
                        .envTrafficDeltas(new ArrayList<>())
                        .projectTimelineSegments(new ArrayList<>())
                        .monitoringDisplayToggles(new ArrayList<>())
                        .build());
    }

    private static AnalyticsSettings ensureCollections(AnalyticsSettings doc) {
        if (doc.getMonitoringDisplayToggles() == null) {
            doc.setMonitoringDisplayToggles(new ArrayList<>());
        }
        return doc;
    }

    @Override
    public AnalyticsSettings saveMonitoringDisplayToggles(
            List<MonitoringDisplayToggle> toggles, String actorName) {
        AnalyticsSettings cur = getOrDefault();
        if (toggles == null) {
            cur.setMonitoringDisplayToggles(new ArrayList<>());
        } else {
            for (MonitoringDisplayToggle t : toggles) {
                if (t.getProductName() == null) {
                    t.setProductName("");
                }
                if (t.getEnvironment() == null) {
                    t.setEnvironment("");
                }
                if (t.getEnabled() == null) {
                    t.setEnabled(Boolean.TRUE);
                }
            }
            cur.setMonitoringDisplayToggles(new ArrayList<>(toggles));
        }
        cur.setId(AnalyticsSettings.GLOBAL_ID);
        cur.setUpdatedAt(Instant.now());
        cur.setUpdatedBy(actorName);
        return repository.save(cur);
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
        if (body.getMonitoringDisplayToggles() == null) {
            body.setMonitoringDisplayToggles(new ArrayList<>());
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
        for (MonitoringDisplayToggle mt : body.getMonitoringDisplayToggles()) {
            if (mt.getProductName() == null) {
                mt.setProductName("");
            }
            if (mt.getEnvironment() == null) {
                mt.setEnvironment("");
            }
            if (mt.getEnabled() == null) {
                mt.setEnabled(Boolean.TRUE);
            }
        }
        body.setId(AnalyticsSettings.GLOBAL_ID);
        body.setUpdatedAt(Instant.now());
        body.setUpdatedBy(actorName);
        return repository.save(body);
    }
}
