package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.CostTimelinePoint;
import com.devops.backend.dto.monitoring.LiveCostRow;
import com.devops.backend.dto.monitoring.ProjectCostBreakdown;
import com.devops.backend.model.Project;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.monitoring.AzurePriceRecord;
import com.devops.backend.model.monitoring.CostCycleRecord;
import com.devops.backend.model.monitoring.CostSnapshot;
import com.devops.backend.model.monitoring.ServiceRuntimeState;
import com.devops.backend.model.workflow.CloudServiceItem;
import com.devops.backend.model.workflow.ClusterInfrastructure;
import com.devops.backend.repository.*;
import com.devops.backend.service.CostMonitoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CostMonitoringServiceImpl implements CostMonitoringService {

    private final ProjectRepository projectRepository;
    private final ProjectWorkflowSettingsRepository settingsRepository;
    private final AzurePriceRecordRepository priceRepository;
    private final CostSnapshotRepository costSnapshotRepository;
    private final ServiceRuntimeStateRepository runtimeRepository;
    private final CostCycleRecordRepository cycleRecordRepository;

    // ------------------------------------------------------------------
    // Price application
    // ------------------------------------------------------------------

    @Override
    public int applyLatestPricesToProjects() {
        int updated = 0;
        List<ProjectWorkflowSettings> all = settingsRepository.findAll();
        for (ProjectWorkflowSettings s : all) {
            boolean changed = false;
            if (s.getCloudServices() != null) {
                for (CloudServiceItem c : s.getCloudServices()) {
                    if (c.getAzureMeterId() == null || c.getAzureMeterId().isBlank()) continue;
                    Optional<AzurePriceRecord> row = priceRepository.findByMeterId(c.getAzureMeterId());
                    if (row.isEmpty()) continue;
                    AzurePriceRecord r = row.get();
                    Double hourly = normaliseToHourly(r.getRetailPrice(), r.getUnitOfMeasure());
                    if (hourly == null) continue;
                    c.setAzureRetailPriceUsd(r.getRetailPrice());
                    c.setAzureUnitOfMeasure(r.getUnitOfMeasure());
                    c.setAzureArmRegionName(r.getArmRegionName());
                    c.setAzureSkuName(r.getSkuName());
                    c.setAzureProductName(r.getProductName());
                    c.setAzureServiceName(r.getServiceName());
                    c.setAzureServiceFamily(r.getServiceFamily());
                    c.setHourlyRateUsd(hourly);
                    c.setMonthlyRateUsd(hourly * 730.0);
                    c.setLastPriceFetchedAt(Instant.now());
                    changed = true;
                    updated++;
                }
            }
            if (s.getClusterInfrastructure() != null) {
                for (ClusterInfrastructure ci : s.getClusterInfrastructure().values()) {
                    if (ci == null || ci.getNodePools() == null) continue;
                    for (ClusterInfrastructure.NodePool np : ci.getNodePools()) {
                        if (np.getAzureMeterId() == null || np.getAzureMeterId().isBlank()) continue;
                        Optional<AzurePriceRecord> row = priceRepository.findByMeterId(np.getAzureMeterId());
                        if (row.isEmpty()) continue;
                        Double hourly = normaliseToHourly(row.get().getRetailPrice(), row.get().getUnitOfMeasure());
                        if (hourly == null) continue;
                        np.setHourlyRateUsd(hourly);
                        changed = true;
                        updated++;
                    }
                }
            }
            if (changed) {
                s.setUpdatedAt(Instant.now());
                settingsRepository.save(s);
            }
        }

        return updated;
    }

    // ------------------------------------------------------------------
    // Real-time cost ticks
    // ------------------------------------------------------------------

    @Override
    public int tickLiveCosts() {
        List<ServiceRuntimeState> running = runtimeRepository.findByRunningTrue();
        Instant now = Instant.now();
        int count = 0;
        for (ServiceRuntimeState state : running) {
            if (state.getCycleStartedAt() == null) continue;

            CloudServiceItem svc = findCloudService(state.getProjectId(), state.getCloudServiceId());
            if (svc == null) continue;
            Double hourly = svc.getHourlyRateUsd();
            if (hourly == null) continue;

            Instant since = state.getLastTickAt() != null ? state.getLastTickAt() : state.getCycleStartedAt();
            long seconds = Math.max(0, ChronoUnit.SECONDS.between(since, now));
            double share = shareFor(svc, state.getProjectId());
            double delta = hourly * share * (seconds / 3600.0);

            double cycle = (state.getCurrentCycleUsd() != null ? state.getCurrentCycleUsd() : 0.0) + delta;
            double lifetime = (state.getLifetimeUsd() != null ? state.getLifetimeUsd() : 0.0) + delta;

            state.setCurrentCycleUsd(cycle);
            state.setLifetimeUsd(lifetime);
            state.setHourlyRateUsd(hourly);
            state.setLastTickAt(now);
            runtimeRepository.save(state);

            costSnapshotRepository.save(CostSnapshot.builder()
                    .projectId(state.getProjectId())
                    .environment(state.getEnvironment())
                    .cloudServiceId(svc.getId())
                    .cloudServiceName(nameOf(svc))
                    .cloudCategory(svc.getCategory())
                    .meterId(svc.getAzureMeterId())
                    .hourlyRateUsd(hourly)
                    .accumulatedUsd(cycle)
                    .shareFraction(share)
                    .cycleStartedAt(state.getCycleStartedAt())
                    .capturedAt(now)
                    .build());

            // Mirror into the CloudServiceItem so it shows on project screens
            svc.setRunningSince(state.getCycleStartedAt());
            svc.setCurrentCycleUsd(cycle);
            svc.setLifetimeUsd(lifetime);
            saveCloudServiceUpdate(state.getProjectId(), svc);
            count++;
        }
        return count;
    }

    // ------------------------------------------------------------------
    // Manual cycle control
    // ------------------------------------------------------------------

    @Override
    public void startCycle(String projectId, String environment, String cloudServiceId, String actor) {
        CloudServiceItem svc = findCloudService(projectId, cloudServiceId);
        if (svc == null) return;

        // Try exact (projectId, environment, cloudServiceId) first.
        // If the environment key drifted (e.g. null → "default" on first run) fall back to any
        // existing state for this service so we never lose accumulated cycle history.
        ServiceRuntimeState state = runtimeRepository
                .findByProjectIdAndEnvironmentAndCloudServiceId(projectId, environment, cloudServiceId)
                .orElseGet(() -> {
                    List<ServiceRuntimeState> anyStates =
                            runtimeRepository.findByProjectIdAndCloudServiceId(projectId, cloudServiceId);
                    if (!anyStates.isEmpty()) {
                        // Re-use the most recent state (carry over history + lifetime)
                        anyStates.sort(java.util.Comparator.comparing(
                                s -> s.getLastTickAt() != null ? s.getLastTickAt() : Instant.EPOCH,
                                java.util.Comparator.reverseOrder()));
                        ServiceRuntimeState existing = anyStates.get(0);
                        // Merge history from all env variants into one list
                        List<ServiceRuntimeState.CycleEntry> merged = anyStates.stream()
                                .filter(s -> s.getCycleHistory() != null)
                                .flatMap(s -> s.getCycleHistory().stream())
                                .sorted(java.util.Comparator.comparing(
                                        e -> e.getStartedAt() != null ? e.getStartedAt() : Instant.EPOCH))
                                .collect(java.util.stream.Collectors.toList());
                        double lifetime = anyStates.stream()
                                .mapToDouble(s -> s.getLifetimeUsd() != null ? s.getLifetimeUsd() : 0.0)
                                .max().orElse(0.0);
                        existing.setEnvironment(environment);
                        existing.setCycleHistory(merged);
                        existing.setLifetimeUsd(lifetime);
                        return existing;
                    }
                    return ServiceRuntimeState.builder()
                            .projectId(projectId)
                            .environment(environment)
                            .cloudServiceId(cloudServiceId)
                            .lifetimeUsd(0.0)
                            .build();
                });

        state.setCloudServiceName(nameOf(svc));
        state.setMeterId(svc.getAzureMeterId());
        state.setHourlyRateUsd(svc.getHourlyRateUsd());
        state.setRunning(true);
        state.setCycleStartedAt(Instant.now());
        state.setLastTickAt(Instant.now());
        state.setCurrentCycleUsd(0.0);
        runtimeRepository.save(state);

        svc.setRunningSince(state.getCycleStartedAt());
        svc.setCurrentCycleUsd(0.0);
        saveCloudServiceUpdate(projectId, svc);
        log.info("Cost cycle started by {} for project={} env={} service={}",
                actor, projectId, environment, cloudServiceId);
    }

    @Override
    public void stopCycle(String projectId, String environment, String cloudServiceId, String actor) {
        // Try exact lookup; fall back to any running state for this service
        Optional<ServiceRuntimeState> opt = runtimeRepository
                .findByProjectIdAndEnvironmentAndCloudServiceId(projectId, environment, cloudServiceId);
        if (opt.isEmpty()) {
            opt = runtimeRepository.findByProjectIdAndCloudServiceId(projectId, cloudServiceId)
                    .stream().filter(ServiceRuntimeState::isRunning).findFirst();
        }
        if (opt.isEmpty()) return;
        ServiceRuntimeState state = opt.get();
        // Final tick up to stop time
        tickSingle(state);
        Instant endedAt = Instant.now();

        // Record cycle to history before clearing currentCycleUsd
        if (state.getCycleStartedAt() != null) {
            long durationSec = Math.max(0,
                    java.time.temporal.ChronoUnit.SECONDS.between(state.getCycleStartedAt(), endedAt));
            double totalUsd = state.getCurrentCycleUsd() != null ? state.getCurrentCycleUsd() : 0.0;

            // Persist as a standalone document — this is the authoritative history store.
            // Keeping it separate from ServiceRuntimeState means it survives state recreation.
            cycleRecordRepository.save(CostCycleRecord.builder()
                    .projectId(projectId)
                    .cloudServiceId(cloudServiceId)
                    .cloudServiceName(state.getCloudServiceName())
                    .startedAt(state.getCycleStartedAt())
                    .endedAt(endedAt)
                    .durationSeconds(durationSec)
                    .totalUsd(totalUsd)
                    .hourlyRateUsd(state.getHourlyRateUsd())
                    .build());

            // Also keep the embedded list in sync (used as quick cache)
            ServiceRuntimeState.CycleEntry entry = ServiceRuntimeState.CycleEntry.builder()
                    .startedAt(state.getCycleStartedAt())
                    .endedAt(endedAt)
                    .durationSeconds(durationSec)
                    .totalUsd(totalUsd)
                    .hourlyRateUsd(state.getHourlyRateUsd())
                    .build();
            if (state.getCycleHistory() == null) state.setCycleHistory(new java.util.ArrayList<>());
            state.getCycleHistory().add(entry);
        }

        state.setRunning(false);
        state.setCurrentCycleUsd(0.0);
        state.setCycleStartedAt(null);
        runtimeRepository.save(state);

        CloudServiceItem svc = findCloudService(projectId, cloudServiceId);
        if (svc != null) {
            svc.setRunningSince(null);
            svc.setCurrentCycleUsd(0.0);
            saveCloudServiceUpdate(projectId, svc);
        }
        log.info("Cost cycle stopped by {} for project={} env={} service={}",
                actor, projectId, environment, cloudServiceId);
    }

    private void tickSingle(ServiceRuntimeState state) {
        CloudServiceItem svc = findCloudService(state.getProjectId(), state.getCloudServiceId());
        if (svc == null || svc.getHourlyRateUsd() == null) return;
        Instant since = state.getLastTickAt() != null ? state.getLastTickAt() : state.getCycleStartedAt();
        long seconds = Math.max(0, ChronoUnit.SECONDS.between(since, Instant.now()));
        double share = shareFor(svc, state.getProjectId());
        double delta = svc.getHourlyRateUsd() * share * (seconds / 3600.0);
        state.setCurrentCycleUsd((state.getCurrentCycleUsd() == null ? 0.0 : state.getCurrentCycleUsd()) + delta);
        state.setLifetimeUsd((state.getLifetimeUsd() == null ? 0.0 : state.getLifetimeUsd()) + delta);
        state.setLastTickAt(Instant.now());
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    @Override
    public List<LiveCostRow> getLiveCosts() {
        List<Project> projects = projectRepository.findAll();
        Map<String, String> projectNames = new HashMap<>();
        projects.forEach(p -> projectNames.put(p.getId(), p.getName()));

        List<LiveCostRow> rows = new ArrayList<>();
        for (ProjectWorkflowSettings s : settingsRepository.findAll()) {
            if (s.getCloudServices() == null) continue;
            for (CloudServiceItem c : s.getCloudServices()) {
                rows.add(buildRow(s.getProjectId(), projectNames.get(s.getProjectId()), null, c));
            }
        }
        return rows;
    }

    @Override
    public ProjectCostBreakdown getProjectBreakdown(String projectId, String environment) {
        Project p = projectRepository.findById(projectId).orElse(null);
        ProjectWorkflowSettings s = settingsRepository.findByProjectId(projectId).orElse(null);
        ProjectCostBreakdown out = ProjectCostBreakdown.builder()
                .projectId(projectId)
                .projectName(p != null ? p.getName() : projectId)
                .environment(environment)
                .capturedAt(Instant.now())
                .hourlyTotalUsd(0.0).currentCycleTotalUsd(0.0).lifetimeTotalUsd(0.0)
                .services(new ArrayList<>())
                .build();
        if (s == null || s.getCloudServices() == null) return out;

        for (CloudServiceItem c : s.getCloudServices()) {
            LiveCostRow row = buildRow(projectId, out.getProjectName(), environment, c);
            out.getServices().add(row);
            out.setHourlyTotalUsd(out.getHourlyTotalUsd() + (row.getHourlyRateUsd() != null ? row.getHourlyRateUsd() : 0.0));
            out.setCurrentCycleTotalUsd(out.getCurrentCycleTotalUsd() + (row.getCurrentCycleUsd() != null ? row.getCurrentCycleUsd() : 0.0));
            out.setLifetimeTotalUsd(out.getLifetimeTotalUsd() + (row.getLifetimeUsd() != null ? row.getLifetimeUsd() : 0.0));
        }
        out.setProjectedMonthlyUsd(out.getHourlyTotalUsd() * 730.0);
        return out;
    }

    @Override
    public List<CostTimelinePoint> getCostTimeline(String projectId, String environment,
                                                   String cloudServiceId, Instant from, Instant to) {
        List<CostSnapshot> rows;
        if (cloudServiceId != null && !cloudServiceId.isBlank()) {
            rows = costSnapshotRepository.findByCloudServiceIdAndCapturedAtBetweenOrderByCapturedAtAsc(cloudServiceId, from, to);
        } else if (environment != null && !environment.isBlank()) {
            rows = costSnapshotRepository.findByProjectIdAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc(projectId, environment, from, to);
        } else {
            rows = costSnapshotRepository.findByProjectIdAndCapturedAtBetweenOrderByCapturedAtAsc(projectId, from, to);
        }
        return rows.stream().map(r -> CostTimelinePoint.builder()
                .capturedAt(r.getCapturedAt())
                .cloudServiceId(r.getCloudServiceId())
                .cloudServiceName(r.getCloudServiceName())
                .hourlyRateUsd(r.getHourlyRateUsd())
                .accumulatedUsd(r.getAccumulatedUsd())
                .build()).toList();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private LiveCostRow buildRow(String projectId, String projectName, String environment, CloudServiceItem c) {
        double share = shareFor(c, projectId);
        Double hourlyEffective = c.getHourlyRateUsd() != null ? c.getHourlyRateUsd() * share : null;

        // Find the current runtime state (for running/currentCycleUsd/lifetime)
        Optional<ServiceRuntimeState> state;
        if (environment != null) {
            state = runtimeRepository.findByProjectIdAndEnvironmentAndCloudServiceId(
                    projectId, environment, c.getId());
        } else {
            List<ServiceRuntimeState> allStates = runtimeRepository
                    .findByProjectIdAndCloudServiceId(projectId, c.getId());
            state = allStates.stream()
                    .filter(ServiceRuntimeState::isRunning)
                    .findFirst()
                    .or(() -> allStates.stream()
                            .filter(s -> s.getLastTickAt() != null)
                            .max(java.util.Comparator.comparing(ServiceRuntimeState::getLastTickAt)));
        }

        // Cycle history comes from the dedicated collection — one document per completed cycle.
        // This is the authoritative source and survives state recreation or environment key changes.
        List<ServiceRuntimeState.CycleEntry> cycleHistory = cycleRecordRepository
                .findByProjectIdAndCloudServiceIdOrderByStartedAtAsc(projectId, c.getId())
                .stream()
                .map(r -> ServiceRuntimeState.CycleEntry.builder()
                        .startedAt(r.getStartedAt())
                        .endedAt(r.getEndedAt())
                        .durationSeconds(r.getDurationSeconds())
                        .totalUsd(r.getTotalUsd())
                        .hourlyRateUsd(r.getHourlyRateUsd())
                        .build())
                .collect(java.util.stream.Collectors.toList());

        boolean running = state.map(ServiceRuntimeState::isRunning).orElse(c.getRunningSince() != null);
        return LiveCostRow.builder()
                .projectId(projectId)
                .projectName(projectName)
                .environment(environment != null ? environment
                        : state.map(ServiceRuntimeState::getEnvironment).orElse(null))
                .cloudServiceId(c.getId())
                .cloudServiceName(nameOf(c))
                .cloudCategory(c.getCategory())
                .cloudPlatform(c.getCloudPlatform())
                .meterId(c.getAzureMeterId())
                .unitOfMeasure(c.getAzureUnitOfMeasure())
                .azureSkuName(c.getAzureSkuName())
                .azureProductName(c.getAzureProductName())
                .azureArmRegionName(c.getAzureArmRegionName())
                .azureRetailPriceUsd(c.getAzureRetailPriceUsd())
                .monthlyRateUsd(hourlyEffective != null ? hourlyEffective * 730.0 : null)
                .running(running)
                .shared(Boolean.TRUE.equals(c.getSharedAcrossProjects()))
                .shareFraction(share)
                .hourlyRateUsd(hourlyEffective)
                .currentCycleUsd(state.map(ServiceRuntimeState::getCurrentCycleUsd).orElse(c.getCurrentCycleUsd()))
                .lifetimeUsd(state.map(ServiceRuntimeState::getLifetimeUsd).orElse(c.getLifetimeUsd()))
                .cycleStartedAt(state.map(ServiceRuntimeState::getCycleStartedAt).orElse(c.getRunningSince()))
                .lastTickAt(state.map(ServiceRuntimeState::getLastTickAt).orElse(null))
                .cycleHistory(cycleHistory)
                .build();
    }

    private CloudServiceItem findCloudService(String projectId, String cloudServiceId) {
        ProjectWorkflowSettings s = settingsRepository.findByProjectId(projectId).orElse(null);
        if (s == null || s.getCloudServices() == null) return null;
        return s.getCloudServices().stream()
                .filter(c -> c.getId() != null && c.getId().equals(cloudServiceId))
                .findFirst().orElse(null);
    }

    private void saveCloudServiceUpdate(String projectId, CloudServiceItem updated) {
        settingsRepository.findByProjectId(projectId).ifPresent(s -> {
            if (s.getCloudServices() == null) return;
            for (int i = 0; i < s.getCloudServices().size(); i++) {
                CloudServiceItem c = s.getCloudServices().get(i);
                if (c.getId() != null && c.getId().equals(updated.getId())) {
                    s.getCloudServices().set(i, updated);
                    break;
                }
            }
            s.setUpdatedAt(Instant.now());
            settingsRepository.save(s);
        });
    }

    private static String nameOf(CloudServiceItem c) {
        if (c.getCustomName() != null && !c.getCustomName().isBlank()) return c.getCustomName();
        return c.getName();
    }

    private static double shareFor(CloudServiceItem c, String projectId) {
        if (!Boolean.TRUE.equals(c.getSharedAcrossProjects())) return 1.0;
        List<String> ids = c.getSharedProjectIds();
        if (ids == null || ids.isEmpty()) return 1.0;
        if (!ids.contains(projectId)) return 0.0;
        return 1.0 / ids.size();
    }

    /**
     * Normalise an Azure retail price to a per-hour USD rate using
     * the Azure-returned unitOfMeasure string (e.g. "1 Hour", "1/Month").
     */
    public static Double normaliseToHourly(Double retail, String unitOfMeasure) {
        if (retail == null) return null;
        String u = unitOfMeasure == null ? "" : unitOfMeasure.toLowerCase(Locale.ROOT);
        if (u.contains("hour")) return retail;
        if (u.contains("month")) return retail / 730.0;
        if (u.contains("day")) return retail / 24.0;
        if (u.contains("year")) return retail / (730.0 * 12.0);
        // GB, GB-month etc. — treat as monthly unit
        if (u.contains("gb/month") || u.contains("gb-month")) return retail / 730.0;
        return retail;
    }
}
