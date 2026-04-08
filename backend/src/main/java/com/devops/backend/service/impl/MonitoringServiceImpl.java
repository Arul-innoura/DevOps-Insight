package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.EnvironmentMonitoringResponse;
import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.TicketStatus;
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

