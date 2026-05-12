package com.devops.backend.controller;

import com.devops.backend.dto.monitoring.ProjectBill;
import com.devops.backend.dto.monitoring.PrometheusExtraMetrics;
import com.devops.backend.dto.monitoring.PrometheusLiveCostSnapshot;
import com.devops.backend.model.monitoring.ClusterCostTimeseriesPoint;
import com.devops.backend.service.CategoryCostService;
import com.devops.backend.service.prometheus.PrometheusCostService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Cost engine v2 — bill-style cost views computed from the redesigned
 * Cloud Services catalog, project {@code serviceUsages}, microservice
 * specs, and {@code externalServices}.
 *
 * <p>Reads-only — start/stop cycle controls remain on the legacy
 * {@code /api/cost-monitoring} endpoints.
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final CategoryCostService service;
    private final PrometheusCostService prometheusCost;

    /** Live month-to-date bills for every project. */
    @GetMapping("/live")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<ProjectBill> liveAll() {
        return service.liveBillsAllProjects();
    }

    /** Current-month bill for one project. */
    @GetMapping("/projects/{projectId}/current")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps','APPROLE_User')")
    public ProjectBill current(@PathVariable String projectId) {
        return service.currentMonthBill(projectId);
    }

    /** Previous-month bill for one project. */
    @GetMapping("/projects/{projectId}/previous")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps','APPROLE_User')")
    public ProjectBill previous(@PathVariable String projectId) {
        return service.previousMonthBill(projectId);
    }

    /** Custom-range bill for one project. */
    @GetMapping("/projects/{projectId}/range")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public ProjectBill range(
            @PathVariable String projectId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false, defaultValue = "Custom") String label
    ) {
        return service.billForRange(projectId, from, to, label);
    }

    // ----------------------------------------------------------------------
    // Prometheus-driven live cost (auto-discovered services + per-namespace
    // attribution). Read-only — the engine ticks itself from a scheduler.
    // ----------------------------------------------------------------------

    /** Envs that have a live Prometheus endpoint configured. */
    @GetMapping("/prometheus/envs")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public Map<String, Object> prometheusEnvs() {
        Set<String> envs = prometheusCost.availableEnvs();
        return Map.of("envs", envs);
    }

    /**
     * Full live snapshot for one env — namespaces, microservices, cloud
     * services, cluster totals, with cumulative + month-to-date USD figures.
     * The act of calling this also runs a fresh tick of the cost engine.
     */
    @GetMapping("/prometheus/{env}/live")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public PrometheusLiveCostSnapshot prometheusLive(@PathVariable String env) {
        return prometheusCost.getLatestSnapshot(env);
    }

    /** Operational metrics — req/error/latency/restarts/top consumers. */
    @GetMapping("/prometheus/{env}/metrics")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public PrometheusExtraMetrics prometheusMetrics(
            @PathVariable String env,
            @RequestParam(required = false) String namespace
    ) {
        return prometheusCost.extraMetrics(env, namespace);
    }

    /**
     * Historical cost time-series for one env, aggregated into fixed buckets.
     *
     * <p>{@code granularity} is one of:
     * <ul>
     *   <li>{@code minute} — raw tick resolution (default)</li>
     *   <li>{@code hour}   — averaged into hourly buckets</li>
     *   <li>{@code day}    — averaged into daily buckets</li>
     *   <li>{@code month}  — averaged into monthly buckets</li>
     * </ul>
     *
     * <p>Each bucket carries {@code totalHourlyUsd}, {@code smoothedHourlyUsd},
     * cluster CPU/mem allocated/used, and the per-namespace cost lines so the
     * UI can render comparison charts (per-project, per-namespace, totals).
     */
    @GetMapping("/prometheus/{env}/timeseries")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public Map<String, Object> prometheusTimeseries(
            @PathVariable String env,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false, defaultValue = "minute") String granularity
    ) {
        List<ClusterCostTimeseriesPoint> raw = prometheusCost.queryTimeseries(env, from, to);
        ChronoUnit unit = switch (granularity == null ? "minute" : granularity.toLowerCase()) {
            case "hour"  -> ChronoUnit.HOURS;
            case "day"   -> ChronoUnit.DAYS;
            case "month" -> ChronoUnit.MONTHS;
            default      -> ChronoUnit.MINUTES;
        };

        // Bucket points by truncated timestamp; averaging $/hr inside each bucket
        // (the rate doesn't change much within a bucket once smoothed).
        Map<Instant, List<ClusterCostTimeseriesPoint>> buckets = new TreeMap<>();
        for (ClusterCostTimeseriesPoint p : raw) {
            Instant key = unit == ChronoUnit.MONTHS
                    ? p.getCapturedAt().atZone(java.time.ZoneOffset.UTC)
                            .withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0)
                            .toInstant()
                    : p.getCapturedAt().truncatedTo(unit);
            buckets.computeIfAbsent(key, k -> new ArrayList<>()).add(p);
        }

        List<Map<String, Object>> points = new ArrayList<>();
        for (var e : buckets.entrySet()) {
            List<ClusterCostTimeseriesPoint> bucket = e.getValue();
            int n = bucket.size();
            double avgTotalHourly    = avg(bucket, ClusterCostTimeseriesPoint::getTotalHourlyUsd);
            double avgSmoothed       = avg(bucket, ClusterCostTimeseriesPoint::getSmoothedHourlyUsd);
            double avgCpuTotal       = avg(bucket, ClusterCostTimeseriesPoint::getTotalCpuCores);
            double avgCpuUsed        = avg(bucket, ClusterCostTimeseriesPoint::getUsedCpuCores);
            double avgMemTotal       = avg(bucket, ClusterCostTimeseriesPoint::getTotalMemoryGb);
            double avgMemUsed        = avg(bucket, ClusterCostTimeseriesPoint::getUsedMemoryGb);
            // Use the latest point's MTD/cumulative — they're monotonic and
            // averaging would be misleading.
            ClusterCostTimeseriesPoint latest = bucket.get(bucket.size() - 1);

            // Average the per-namespace lines inside this bucket so per-project
            // charts can compare like-for-like across buckets.
            // [hourlySum, count, cpuUsedSum, cpuReqSum, memUsedSum, memReqSum]
            Map<String, double[]> nsAcc = new HashMap<>();
            Map<String, String>   nsProj = new HashMap<>();
            for (ClusterCostTimeseriesPoint pt : bucket) {
                if (pt.getNamespaces() == null) continue;
                for (var nl : pt.getNamespaces()) {
                    double[] acc = nsAcc.computeIfAbsent(nl.getNamespace(), k -> new double[]{0d, 0d, 0d, 0d, 0d, 0d});
                    acc[0] += nl.getHourlyUsd() == null ? 0d : nl.getHourlyUsd();
                    acc[1] += 1d;
                    acc[2] += nl.getCpuUsedCores()    == null ? 0d : nl.getCpuUsedCores();
                    acc[3] += nl.getCpuRequestCores() == null ? 0d : nl.getCpuRequestCores();
                    acc[4] += nl.getMemoryUsedGb()    == null ? 0d : nl.getMemoryUsedGb();
                    acc[5] += nl.getMemoryRequestGb() == null ? 0d : nl.getMemoryRequestGb();
                    if (nl.getMatchedProjectName() != null) nsProj.put(nl.getNamespace(), nl.getMatchedProjectName());
                }
            }
            List<Map<String, Object>> nsAvg = new ArrayList<>();
            for (var ne : nsAcc.entrySet()) {
                double[] v = ne.getValue();
                double cnt = Math.max(1d, v[1]);
                Map<String, Object> row = new HashMap<>();
                row.put("namespace", ne.getKey());
                row.put("matchedProjectName", nsProj.get(ne.getKey()));
                row.put("hourlyUsd", v[0] / cnt);
                row.put("cpuUsedCores", v[2] / cnt);
                row.put("cpuRequestCores", v[3] / cnt);
                row.put("memoryUsedGb", v[4] / cnt);
                row.put("memoryRequestGb", v[5] / cnt);
                nsAvg.add(row);
            }

            Map<String, Object> point = new HashMap<>();
            point.put("t", e.getKey().toString());
            point.put("samples", n);
            point.put("totalHourlyUsd", avgTotalHourly);
            point.put("smoothedHourlyUsd", avgSmoothed);
            point.put("totalCpuCores", avgCpuTotal);
            point.put("usedCpuCores", avgCpuUsed);
            point.put("totalMemoryGb", avgMemTotal);
            point.put("usedMemoryGb", avgMemUsed);
            point.put("monthToDateUsd", latest.getMonthToDateUsd());
            point.put("cumulativeUsd", latest.getCumulativeUsd());
            point.put("namespaces", nsAvg);
            points.add(point);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("env", env);
        resp.put("from", from.toString());
        resp.put("to", to.toString());
        resp.put("granularity", granularity);
        resp.put("count", points.size());
        resp.put("points", points);
        return resp;
    }

    private static double avg(List<ClusterCostTimeseriesPoint> pts,
                              java.util.function.Function<ClusterCostTimeseriesPoint, Double> getter) {
        double sum = 0d;
        int n = 0;
        for (ClusterCostTimeseriesPoint p : pts) {
            Double v = getter.apply(p);
            if (v == null) continue;
            sum += v;
            n++;
        }
        return n == 0 ? 0d : sum / n;
    }
}
