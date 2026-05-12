package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown;
import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown.MicroserviceCostRow;
import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown.ProjectCapacityRow;
import com.devops.backend.dto.monitoring.EnvironmentCapacityBreakdown.SavingsSuggestion;
import com.devops.backend.model.Environment;
import com.devops.backend.model.Project;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.workflow.ProjectServiceItem;
import com.devops.backend.repository.CloudEnvironmentRepository;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.NodeCapacityCostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class NodeCapacityCostServiceImpl implements NodeCapacityCostService {

    private static final double HOURS_PER_MONTH = 730.0;
    private static final double HEADROOM_WARN_PCT = 30.0;

    private final CloudEnvironmentRepository envRepo;
    private final ProjectRepository projectRepo;
    private final ProjectWorkflowSettingsRepository workflowRepo;

    @Override
    public List<EnvironmentCapacityBreakdown> breakdownAll() {
        List<Project> allProjects = projectRepo.findAll();
        Map<String, ProjectWorkflowSettings> settingsByProject = new HashMap<>();
        for (ProjectWorkflowSettings s : workflowRepo.findAll()) {
            if (s.getProjectId() != null) settingsByProject.put(s.getProjectId(), s);
        }

        List<EnvironmentCapacityBreakdown> out = new ArrayList<>();
        for (CloudEnvironment env : envRepo.findAllByOrderByNameAsc()) {
            out.add(computeOne(env, allProjects, settingsByProject));
        }
        return out;
    }

    @Override
    public Optional<EnvironmentCapacityBreakdown> breakdownFor(String environmentId) {
        return envRepo.findById(environmentId).map(env -> {
            List<Project> allProjects = projectRepo.findAll();
            Map<String, ProjectWorkflowSettings> settingsByProject = new HashMap<>();
            for (ProjectWorkflowSettings s : workflowRepo.findAll()) {
                if (s.getProjectId() != null) settingsByProject.put(s.getProjectId(), s);
            }
            return computeOne(env, allProjects, settingsByProject);
        });
    }

    // ------------------------------------------------------------------

    private EnvironmentCapacityBreakdown computeOne(CloudEnvironment env,
                                                    List<Project> allProjects,
                                                    Map<String, ProjectWorkflowSettings> settingsByProject) {
        // ---- node pool totals (system + user + any additional pools) ----
        double nodeHourly = nodeHourly(env.getSystemNodePool()) + nodeHourly(env.getUserNodePool());
        double totalVCpu   = poolVCpu(env.getSystemNodePool())   + poolVCpu(env.getUserNodePool());
        double totalMemGb  = poolMemGb(env.getSystemNodePool()) + poolMemGb(env.getUserNodePool());
        if (env.getAdditionalNodePools() != null) {
            for (CloudEnvironment.NodePoolConfig pool : env.getAdditionalNodePools()) {
                nodeHourly += nodeHourly(pool);
                totalVCpu  += poolVCpu(pool);
                totalMemGb += poolMemGb(pool);
            }
        }

        // ---- shared infra / services (skip global-scoped resources to avoid cross-env double-counting) ----
        double sharedInfraHourly = 0.0;
        sharedInfraHourly += infraHourly(env.getIngress());
        sharedInfraHourly += infraHourly(env.getLoadBalancer());
        if (!isGlobalScope(env.getContainerRegistry())) {
            sharedInfraHourly += infraHourly(env.getContainerRegistry());
        }
        sharedInfraHourly += infraHourly(env.getDomain());
        sharedInfraHourly += infraHourly(env.getKeyVault());
        sharedInfraHourly += infraHourly(env.getStorage());

        double sharedSvcHourly = 0.0;
        if (env.getSharedServices() != null) {
            for (CloudEnvironment.SharedEnvService s : env.getSharedServices()) {
                // Skip global-scoped shared services — they are shared across all envs and
                // should not be attributed to each environment individually.
                if (s != null && s.getHourlyRateUsd() != null && !"global".equals(s.getScope())) {
                    sharedSvcHourly += s.getHourlyRateUsd();
                }
            }
        }

        // ---- projects attached to this env ----
        List<Project> attached = new ArrayList<>();
        for (Project p : allProjects) {
            if (p.getEnvironments() == null) continue;
            for (String e : p.getEnvironments()) {
                if (envMatches(env, e)) { attached.add(p); break; }
            }
        }
        int projCount = Math.max(1, attached.size());

        // ---- per-project capacity math ----
        List<ProjectCapacityRow> projectRows = new ArrayList<>();
        double sumRequestedCpu = 0.0;
        double sumRequestedMem = 0.0;

        for (Project p : attached) {
            ProjectWorkflowSettings settings = settingsByProject.get(p.getId());
            List<ProjectServiceItem> microservices = microservicesFor(settings, env);

            double reqCpu = 0.0;
            double reqMemGb = 0.0;
            double totalWeight = 0.0;
            for (ProjectServiceItem ms : microservices) {
                int replicas = ms.getReplicas() != null && ms.getReplicas() > 0 ? ms.getReplicas() : 1;
                double cpu = toCores(ms) * replicas;
                double mem = toGb(ms) * replicas;
                reqCpu += cpu;
                reqMemGb += mem;
                totalWeight += cpu + mem;
            }

            // If microservices exist but have no CPU/memory requests configured, apply a
            // minimum per-replica default so the project is not priced at $0.
            // Default: 100 mCPU (0.1 core) and 128 MB (0.125 GB) per replica.
            boolean usingDefault = reqCpu == 0.0 && reqMemGb == 0.0 && !microservices.isEmpty();
            if (usingDefault) {
                int totalReplicas = microservices.stream()
                        .mapToInt(ms -> ms.getReplicas() != null && ms.getReplicas() > 0 ? ms.getReplicas() : 1)
                        .sum();
                reqCpu   = 0.1   * totalReplicas;
                reqMemGb = 0.125 * totalReplicas;
                totalWeight = reqCpu + reqMemGb;
            }

            sumRequestedCpu += reqCpu;
            sumRequestedMem += reqMemGb;

            double capacityShare = capacityShare(reqCpu, reqMemGb, totalVCpu, totalMemGb);
            double nodeCostHourly = capacityShare * nodeHourly;
            double infraShare = sharedInfraHourly / projCount;
            double svcShare   = sharedSvcHourly   / projCount;
            double totalHourly = nodeCostHourly + infraShare + svcShare;

            List<MicroserviceCostRow> msRows = new ArrayList<>();
            for (ProjectServiceItem ms : microservices) {
                int replicas = ms.getReplicas() != null && ms.getReplicas() > 0 ? ms.getReplicas() : 1;
                double cpu = toCores(ms) * replicas;
                double mem = toGb(ms) * replicas;
                double weight = (cpu + mem) > 0 ? (cpu + mem) : (0.1 + 0.125) * replicas; // match fallback
                double projectShare = totalWeight > 0 ? weight / totalWeight : (microservices.isEmpty() ? 0 : 1.0 / microservices.size());
                msRows.add(MicroserviceCostRow.builder()
                        .id(ms.getId())
                        .name(ms.getServiceName())
                        .replicas(replicas)
                        .cpuRequestMillicores(ms.getCpuRequestMillicores())
                        .memoryRequestMb(ms.getMemoryRequestMb())
                        .projectShare(round(projectShare))
                        .hourlyUsd(round(projectShare * totalHourly))
                        .build());
            }

            projectRows.add(ProjectCapacityRow.builder()
                    .projectId(p.getId())
                    .projectName(p.getName())
                    .requestedVCpu(round(reqCpu))
                    .requestedMemoryGb(round(reqMemGb))
                    .capacityShare(round(capacityShare))
                    .nodeCostHourlyUsd(round(nodeCostHourly))
                    .sharedInfraHourlyUsd(round(infraShare))
                    .sharedServicesHourlyUsd(round(svcShare))
                    .totalHourlyUsd(round(totalHourly))
                    .projectedMonthlyUsd(round(totalHourly * HOURS_PER_MONTH))
                    .usingDefaultRequests(usingDefault)
                    .microservices(msRows)
                    .build());
        }

        double totalHourly = nodeHourly + sharedInfraHourly + sharedSvcHourly;
        double utilizationPct = capacityUtilizationPct(sumRequestedCpu, sumRequestedMem, totalVCpu, totalMemGb);

        List<SavingsSuggestion> suggestions = buildSuggestions(env, nodeHourly, totalVCpu, totalMemGb,
                sumRequestedCpu, sumRequestedMem, utilizationPct, projectRows);

        return EnvironmentCapacityBreakdown.builder()
                .environmentId(env.getId())
                .environmentName(env.getName())
                .azureRegion(env.getAzureRegion())
                .nodePoolHourlyUsd(round(nodeHourly))
                .sharedInfraHourlyUsd(round(sharedInfraHourly))
                .sharedServicesHourlyUsd(round(sharedSvcHourly))
                .totalHourlyUsd(round(totalHourly))
                .projectedMonthlyUsd(round(totalHourly * HOURS_PER_MONTH))
                .totalVCpu(round(totalVCpu))
                .totalMemoryGb(round(totalMemGb))
                .requestedVCpu(round(sumRequestedCpu))
                .requestedMemoryGb(round(sumRequestedMem))
                .utilizationPct(round(utilizationPct))
                .projects(projectRows)
                .suggestions(suggestions)
                .capturedAt(Instant.now())
                .build();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private List<ProjectServiceItem> microservicesFor(ProjectWorkflowSettings settings, CloudEnvironment env) {
        if (settings == null || settings.getProjectServices() == null) return Collections.emptyList();
        List<ProjectServiceItem> out = new ArrayList<>();
        for (ProjectServiceItem svc : settings.getProjectServices()) {
            if (svc == null) continue;
            String msEnv = svc.getEnvironment();
            if (msEnv == null || msEnv.isBlank() || envMatches(env, msEnv)) out.add(svc);
        }
        return out;
    }

    /**
     * True if {@code key} references the given environment. Accepts the
     * environment's name, id, displayName, or a legacy {@link Environment}
     * enum name that resolves to the environment's name.
     */
    private boolean envMatches(CloudEnvironment env, String key) {
        if (key == null) return false;
        String k = key.trim();
        if (k.isEmpty()) return false;
        if (k.equalsIgnoreCase(env.getName())) return true;
        if (env.getDisplayName() != null && k.equalsIgnoreCase(env.getDisplayName())) return true;
        if (env.getId() != null && env.getId().equals(k)) return true;
        Environment legacy = Environment.fromFlexibleKey(k);
        return legacy != null && legacy.name().equalsIgnoreCase(env.getName());
    }

    private double nodeHourly(CloudEnvironment.NodePoolConfig pool) {
        if (pool == null || pool.getHourlyRateUsd() == null) return 0.0;
        int count = pool.getNodeCount() != null ? pool.getNodeCount() : 0;
        return pool.getHourlyRateUsd() * count;
    }

    private double poolVCpu(CloudEnvironment.NodePoolConfig pool) {
        if (pool == null || pool.getVCpuPerNode() == null || pool.getNodeCount() == null) return 0.0;
        return pool.getVCpuPerNode() * pool.getNodeCount();
    }

    private double poolMemGb(CloudEnvironment.NodePoolConfig pool) {
        if (pool == null || pool.getMemoryGbPerNode() == null || pool.getNodeCount() == null) return 0.0;
        return pool.getMemoryGbPerNode() * pool.getNodeCount();
    }

    private double infraHourly(CloudEnvironment.InfraResource res) {
        if (res == null || res.getHourlyRateUsd() == null) return 0.0;
        int count = res.getCount() != null && res.getCount() > 0 ? res.getCount() : 1;
        return res.getHourlyRateUsd() * count;
    }

    private boolean isGlobalScope(CloudEnvironment.InfraResource res) {
        return res != null && "global".equals(res.getScope());
    }

    /** Millicores → cores. Falls back to 0 when unset. */
    private double toCores(ProjectServiceItem ms) {
        if (ms.getCpuRequestMillicores() != null) return ms.getCpuRequestMillicores() / 1000.0;
        if (ms.getCpuCores() != null) return ms.getCpuCores();
        return 0.0;
    }

    /** MB → GB. Falls back to 0. */
    private double toGb(ProjectServiceItem ms) {
        if (ms.getMemoryRequestMb() != null) return ms.getMemoryRequestMb() / 1024.0;
        if (ms.getMemoryMb() != null) return ms.getMemoryMb() / 1024.0;
        return 0.0;
    }

    /** Share of cluster capacity taken by this project — the max of cpu share and memory share. */
    private double capacityShare(double reqCpu, double reqMemGb, double totalCpu, double totalMemGb) {
        double cpuShare = totalCpu > 0 ? Math.min(1.0, reqCpu / totalCpu) : 0.0;
        double memShare = totalMemGb > 0 ? Math.min(1.0, reqMemGb / totalMemGb) : 0.0;
        return Math.max(cpuShare, memShare);
    }

    private double capacityUtilizationPct(double reqCpu, double reqMemGb, double totalCpu, double totalMemGb) {
        double cpuPct = totalCpu > 0 ? (reqCpu / totalCpu) * 100.0 : 0.0;
        double memPct = totalMemGb > 0 ? (reqMemGb / totalMemGb) * 100.0 : 0.0;
        return Math.max(cpuPct, memPct);
    }

    private List<SavingsSuggestion> buildSuggestions(CloudEnvironment env, double nodeHourly,
                                                     double totalCpu, double totalMemGb,
                                                     double reqCpu, double reqMemGb,
                                                     double utilizationPct,
                                                     List<ProjectCapacityRow> rows) {
        List<SavingsSuggestion> out = new ArrayList<>();

        if (totalCpu > 0 && utilizationPct < (100.0 - HEADROOM_WARN_PCT)) {
            double headroomPct = 100.0 - utilizationPct;
            double wastedHourly = nodeHourly * (headroomPct / 100.0);
            out.add(SavingsSuggestion.builder()
                    .severity(utilizationPct < 40 ? "warn" : "info")
                    .scope("environment")
                    .target(env.getName())
                    .message(String.format(
                            "Environment %s is %.0f%% utilised — %.0f%% headroom. "
                                    + "Consider reducing node count or moving to a smaller VM size.",
                            env.getName(), utilizationPct, headroomPct))
                    .potentialMonthlyUsd(round(wastedHourly * HOURS_PER_MONTH))
                    .build());
        }

        if (totalCpu > 0 && (reqCpu > totalCpu || reqMemGb > totalMemGb)) {
            out.add(SavingsSuggestion.builder()
                    .severity("warn")
                    .scope("environment")
                    .target(env.getName())
                    .message(String.format(
                            "Requested capacity (%.1f vCPU / %.1f GB) exceeds node capacity (%.1f vCPU / %.1f GB). "
                                    + "Projects may be throttled — scale out or right-size replicas.",
                            reqCpu, reqMemGb, totalCpu, totalMemGb))
                    .build());
        }

        for (ProjectCapacityRow row : rows) {
            if (row.getCapacityShare() != null && row.getCapacityShare() > 0.6) {
                out.add(SavingsSuggestion.builder()
                        .severity("info")
                        .scope("project")
                        .target(row.getProjectName())
                        .message(String.format(
                                "%s reserves %.0f%% of environment capacity — a dedicated environment may be more cost-effective.",
                                row.getProjectName(), row.getCapacityShare() * 100))
                        .build());
            }
        }

        return out;
    }

    private static Double round(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return null;
        return Math.round(v * 10000.0) / 10000.0;
    }
}
