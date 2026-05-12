package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.CycleRecord;
import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;
import com.devops.backend.dto.monitoring.UptimeSession;
import com.devops.backend.model.Environment;
import com.devops.backend.model.analytics.MonitoringCycleRecord;
import com.devops.backend.repository.MonitoringCycleRecordRepository;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TicketStatus;
import com.devops.backend.model.analytics.AnalyticsSettings;
import com.devops.backend.model.analytics.MonitoringDisplayToggle;
import com.devops.backend.repository.AnalyticsSettingsRepository;
import com.devops.backend.service.MonitoringService;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class MonitoringServiceImpl implements MonitoringService {
    private final MongoTemplate mongoTemplate;
    private final AnalyticsSettingsRepository analyticsSettingsRepository;
    private final MonitoringCycleRecordRepository cycleRepo;
    private static final ZoneId UTC = ZoneId.of("UTC");

    @Override
    public List<String> getProductNames() {
        List<String> products = mongoTemplate.query(com.devops.backend.model.Ticket.class)
                .distinct("productName")
                .as(String.class)
                .all();
        return products.stream()
                .filter(v -> v != null && !v.isBlank())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
    }

    @Override
    public EnvironmentMonitoringResponse getEnvironmentMonitoring(String productName, int year, int month) {
        YearMonth ym = YearMonth.of(year, month);
        Instant monthStart = ym.atDay(1).atStartOfDay(UTC).toInstant();
        Instant monthEnd = ym.plusMonths(1).atDay(1).atStartOfDay(UTC).toInstant();
        Instant now = Instant.now();

        List<TransitionEvent> events = fetchTransitionEvents(productName);
        Map<Environment, List<TransitionEvent>> byEnv = new EnumMap<>(Environment.class);
        for (Environment env : Environment.values()) {
            byEnv.put(env, new ArrayList<>());
        }
        for (TransitionEvent e : events) {
            if (e.getEnvironment() != null) {
                byEnv.computeIfAbsent(e.getEnvironment(), k -> new ArrayList<>()).add(e);
            }
        }

        String currentEnv = null;
        Instant currentSince = null;
        List<EnvironmentMonitoringResponse.EnvironmentSeries> series = new ArrayList<>();

        for (Environment env : Environment.values()) {
            List<TransitionEvent> envEvents = byEnv.getOrDefault(env, List.of())
                    .stream()
                    .sorted(Comparator.comparing(TransitionEvent::getOccurredAt))
                    .toList();

            List<Interval> activeIntervals = buildActiveIntervals(envEvents, now);
            double[] dailyHours = new double[ym.lengthOfMonth() + 1];
            double totalMonthHours = 0.0;
            for (Interval interval : activeIntervals) {
                totalMonthHours += distributeHours(interval.start, interval.end, monthStart, monthEnd, ym, dailyHours);
            }

            boolean activeNow = !activeIntervals.isEmpty() && activeIntervals.get(activeIntervals.size() - 1).end.equals(now);
            Instant activeSince = activeNow ? activeIntervals.get(activeIntervals.size() - 1).start : null;
            if (activeNow) {
                if (currentSince == null || activeSince.isAfter(currentSince)) {
                    currentSince = activeSince;
                    currentEnv = env.getDisplayName();
                }
            }

            List<EnvironmentMonitoringResponse.DailyActiveHours> daily = new ArrayList<>();
            int activeDays = 0;
            for (int d = 1; d <= ym.lengthOfMonth(); d++) {
                double h = round2(dailyHours[d]);
                if (h > 0.0) activeDays++;
                daily.add(EnvironmentMonitoringResponse.DailyActiveHours.builder()
                        .day(d)
                        .activeHours(h)
                        .build());
            }

            series.add(EnvironmentMonitoringResponse.EnvironmentSeries.builder()
                    .environment(env.getDisplayName())
                    .currentlyActive(activeNow)
                    .activeSince(activeSince != null ? activeSince.toString() : null)
                    .activeNowHours(activeSince != null ? round2(Duration.between(activeSince, now).toMinutes() / 60.0) : 0.0)
                    .totalActiveHours(round2(totalMonthHours))
                    .activeDays(activeDays)
                    .daily(daily)
                    .build());
        }

        return EnvironmentMonitoringResponse.builder()
                .productName(productName)
                .year(year)
                .month(month)
                .daysInMonth(ym.lengthOfMonth())
                .generatedAt(now.toString())
                .currentActiveEnvironment(currentEnv)
                .currentActiveSince(currentSince != null ? currentSince.toString() : null)
                .environments(series)
                .build();
    }

    @Override
    public List<UptimeSession> getUptimeSessions(String productName, Instant from, Instant to) {
        Instant now = Instant.now();
        List<TransitionEvent> events = fetchTransitionEvents(productName);
        List<UptimeSession> sessions = new ArrayList<>();

        // Load manual overrides from analytics settings
        AnalyticsSettings settings = analyticsSettingsRepository.findById("global").orElse(new AnalyticsSettings());
        List<MonitoringDisplayToggle> toggles = settings.getMonitoringDisplayToggles();
        if (toggles == null) toggles = List.of();
        final List<MonitoringDisplayToggle> finalToggles = toggles;

        // Track each env's current toggle startedAt so we can skip duplicates from cycleRepo
        Map<String, Instant> toggleSinceByEnv = new java.util.HashMap<>();

        for (Environment env : Environment.values()) {
            List<TransitionEvent> envEvents = events.stream()
                    .filter(e -> e.getEnvironment() == env)
                    .sorted(Comparator.comparing(TransitionEvent::getOccurredAt))
                    .toList();

            // Check for manual override
            MonitoringDisplayToggle toggle = finalToggles.stream()
                    .filter(t -> env.getDisplayName().equals(t.getEnvironment())
                            && (productName == null || productName.equals(t.getProductName())))
                    .findFirst().orElse(null);

            List<Interval> intervals;
            if (toggle != null && toggle.getRunningOverride() != null) {
                // Manual mode: replace ticket-based open interval with manual session
                intervals = new ArrayList<>(buildActiveIntervals(envEvents, now));
                // Remove any open (live) interval from ticket detection
                intervals.removeIf(i -> i.end.equals(now));

                if (toggle.getManualRunningSince() != null) {
                    if (Boolean.TRUE.equals(toggle.getRunningOverride())) {
                        // Still running manually — open session
                        Instant manualEnd = toggle.getManualRunningStoppedAt();
                        intervals.add(new Interval(toggle.getManualRunningSince(), manualEnd != null ? manualEnd : now));
                    } else if (Boolean.FALSE.equals(toggle.getRunningOverride()) && toggle.getManualRunningStoppedAt() != null) {
                        // Manually stopped — keep the completed session visible in history
                        intervals.add(new Interval(toggle.getManualRunningSince(), toggle.getManualRunningStoppedAt()));
                    }
                    // Remember to skip this session when scanning cycleRepo (avoid duplicates)
                    toggleSinceByEnv.put(env.getDisplayName(), toggle.getManualRunningSince());
                }
            } else {
                intervals = buildActiveIntervals(envEvents, now);
            }

            for (Interval interval : intervals) {
                boolean isLive = interval.end.equals(now);
                // Include if interval overlaps with [from, to]
                if (interval.end.isAfter(from) && interval.start.isBefore(to)) {
                    sessions.add(UptimeSession.builder()
                            .environment(env.getDisplayName())
                            .startTime(interval.start.toString())
                            .endTime(isLive ? null : interval.end.toString())
                            .build());
                }
            }
        }

        // Include all historical DevOps manual cycle records (start→stop history).
        // These are persisted by persistCycleRecord() on Stop/Auto actions and are the
        // source of truth for previous cycles that would otherwise be invisible.
        List<MonitoringCycleRecord> historicalCycles = (productName == null || productName.isBlank())
                ? cycleRepo.findAllByOrderByStartedAtDesc()
                : cycleRepo.findByProductNameOrderByStartedAtDesc(productName);

        for (MonitoringCycleRecord cycle : historicalCycles) {
            // Skip sessions already represented by the current toggle (same startedAt) to avoid duplicates
            Instant toggleSince = toggleSinceByEnv.get(cycle.getEnvironment());
            if (toggleSince != null && toggleSince.equals(cycle.getStartedAt())) continue;

            Instant cycleEnd = cycle.getStoppedAt() != null ? cycle.getStoppedAt() : now;
            boolean isLive   = cycle.getStoppedAt() == null;
            // Include if overlaps with requested range
            if (cycleEnd.isAfter(from) && cycle.getStartedAt().isBefore(to)) {
                sessions.add(UptimeSession.builder()
                        .environment(cycle.getEnvironment())
                        .startTime(cycle.getStartedAt().toString())
                        .endTime(isLive ? null : cycle.getStoppedAt().toString())
                        .build());
            }
        }

        return sessions;
    }

    @Override
    public List<CycleRecord> getCycleHistory(String productName, Instant from, Instant to) {
        Instant now = Instant.now();
        List<MonitoringCycleRecord> raw = (productName == null || productName.isBlank())
                ? cycleRepo.findAllByOrderByStartedAtDesc()
                : cycleRepo.findByProductNameAndStartedAtBetweenOrderByStartedAtDesc(productName, from, to);

        // Also include any currently-running manual session (not yet persisted)
        AnalyticsSettings settings = analyticsSettingsRepository.findById(AnalyticsSettings.GLOBAL_ID).orElse(null);
        List<CycleRecord> result = new ArrayList<>();
        if (settings != null && settings.getMonitoringDisplayToggles() != null) {
            for (var toggle : settings.getMonitoringDisplayToggles()) {
                if (Boolean.TRUE.equals(toggle.getRunningOverride()) && toggle.getManualRunningSince() != null) {
                    boolean matchesProduct = productName == null || productName.isBlank()
                            || productName.equalsIgnoreCase(toggle.getProductName());
                    boolean inRange = toggle.getManualRunningSince().isBefore(to) && now.isAfter(from);
                    if (matchesProduct && inRange) {
                        result.add(CycleRecord.builder()
                                .productName(toggle.getProductName())
                                .environment(toggle.getEnvironment())
                                .startedAt(toggle.getManualRunningSince().toString())
                                .startedBy(toggle.getStartedBy())
                                .stoppedAt(null)
                                .stoppedBy(null)
                                .durationSeconds(null)
                                .build());
                    }
                }
            }
        }

        for (MonitoringCycleRecord r : raw) {
            // filter by range
            if (r.getStartedAt().isAfter(to) || (r.getStoppedAt() != null && r.getStoppedAt().isBefore(from))) continue;
            Long dur = (r.getStoppedAt() != null)
                    ? Duration.between(r.getStartedAt(), r.getStoppedAt()).getSeconds()
                    : null;
            result.add(CycleRecord.builder()
                    .id(r.getId())
                    .productName(r.getProductName())
                    .environment(r.getEnvironment())
                    .startedAt(r.getStartedAt().toString())
                    .startedBy(r.getStartedBy())
                    .stoppedAt(r.getStoppedAt() != null ? r.getStoppedAt().toString() : null)
                    .stoppedBy(r.getStoppedBy())
                    .durationSeconds(dur)
                    .build());
        }
        return result;
    }

    private List<TransitionEvent> fetchTransitionEvents(String productName) {
        Criteria criteria = Criteria.where("requestType").in(RequestType.ENVIRONMENT_UP, RequestType.ENVIRONMENT_DOWN)
                .and("status").in(TicketStatus.COMPLETED, TicketStatus.CLOSED);
        if (productName != null && !productName.isBlank()) {
            criteria = criteria.and("productName").is(productName.trim());
        }

        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(criteria),
                Aggregation.unwind("timeline"),
                Aggregation.match(Criteria.where("timeline.status")
                        .in(TicketStatus.COMPLETED, TicketStatus.CLOSED)
                        .and("timeline.isNote").is(false)),
                Aggregation.project()
                        .and("requestType").as("requestType")
                        .and("environment").as("environment")
                        .and("productName").as("productName")
                        .and("timeline.timestamp").as("occurredAt"),
                Aggregation.sort(Sort.Direction.ASC, "occurredAt")
        );
        AggregationResults<TransitionEvent> results =
                mongoTemplate.aggregate(aggregation, "tickets", TransitionEvent.class);
        return results.getMappedResults().stream()
                .filter(v -> v.getEnvironment() != null && v.getOccurredAt() != null)
                .toList();
    }

    private List<Interval> buildActiveIntervals(List<TransitionEvent> events, Instant now) {
        List<Interval> intervals = new ArrayList<>();
        Instant activeStart = null;
        for (TransitionEvent e : events) {
            if (e.getRequestType() == RequestType.ENVIRONMENT_UP) {
                if (activeStart == null || e.getOccurredAt().isAfter(activeStart)) {
                    activeStart = e.getOccurredAt();
                }
            } else if (e.getRequestType() == RequestType.ENVIRONMENT_DOWN) {
                if (activeStart != null && e.getOccurredAt().isAfter(activeStart)) {
                    intervals.add(new Interval(activeStart, e.getOccurredAt()));
                    activeStart = null;
                }
            }
        }
        if (activeStart != null) {
            intervals.add(new Interval(activeStart, now));
        }
        return intervals;
    }

    private double distributeHours(Instant start, Instant end, Instant monthStart, Instant monthEnd, YearMonth ym, double[] dailyHours) {
        Instant s = start.isBefore(monthStart) ? monthStart : start;
        Instant e = end.isAfter(monthEnd) ? monthEnd : end;
        if (!e.isAfter(s)) return 0.0;

        Instant cursor = s;
        while (cursor.isBefore(e)) {
            LocalDate d = cursor.atZone(UTC).toLocalDate();
            Instant dayEnd = d.plusDays(1).atStartOfDay(UTC).toInstant();
            Instant segmentEnd = dayEnd.isBefore(e) ? dayEnd : e;
            double h = Duration.between(cursor, segmentEnd).toMinutes() / 60.0;
            if (d.getMonthValue() == ym.getMonthValue() && d.getYear() == ym.getYear()) {
                dailyHours[d.getDayOfMonth()] += h;
            }
            cursor = segmentEnd;
        }
        return Duration.between(s, e).toMinutes() / 60.0;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    @Data
    private static class TransitionEvent {
        private RequestType requestType;
        private Environment environment;
        private String productName;
        private Instant occurredAt;
    }

    @AllArgsConstructor
    private static class Interval {
        private final Instant start;
        private final Instant end;
    }
}
