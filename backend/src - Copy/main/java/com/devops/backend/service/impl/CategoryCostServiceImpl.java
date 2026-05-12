package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.BillLineItem;
import com.devops.backend.dto.monitoring.ProjectBill;
import com.devops.backend.model.Project;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.environment.CloudEnvironment.AksNodeSpec;
import com.devops.backend.model.environment.CloudEnvironment.CategoryGroup;
import com.devops.backend.model.environment.CloudEnvironment.CategoryServiceItem;
import com.devops.backend.model.workflow.ExternalServiceItem;
import com.devops.backend.model.workflow.ProjectServiceItem;
import com.devops.backend.model.workflow.ProjectServiceUsage;
import com.devops.backend.repository.CloudEnvironmentRepository;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.CategoryCostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryCostServiceImpl implements CategoryCostService {

    private static final double HOURS_PER_MONTH = 730.0;

    private final ProjectRepository projectRepo;
    private final ProjectWorkflowSettingsRepository settingsRepo;
    private final CloudEnvironmentRepository envRepo;

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    @Override
    public ProjectBill currentMonthBill(String projectId) {
        Instant[] window = currentMonthWindow();
        return billForRange(projectId, window[0], window[1], windowLabel(window[0]));
    }

    @Override
    public ProjectBill previousMonthBill(String projectId) {
        Instant[] window = previousMonthWindow();
        return billForRange(projectId, window[0], window[1], windowLabel(window[0]));
    }

    @Override
    public ProjectBill billForRange(String projectId, Instant from, Instant to, String windowLabel) {
        Bundle bundle = loadBundle();
        return buildBill(projectId, from, to, windowLabel, bundle);
    }

    @Override
    public List<ProjectBill> liveBillsAllProjects() {
        Instant[] window = currentMonthWindow();
        Bundle bundle = loadBundle();
        List<ProjectBill> out = new ArrayList<>();
        for (Project p : bundle.projects.values()) {
            out.add(buildBill(p.getId(), window[0], window[1], windowLabel(window[0]), bundle));
        }
        out.sort(Comparator.comparing(ProjectBill::getProjectName,
                Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));
        return out;
    }

    // ------------------------------------------------------------------
    // Core bill construction
    // ------------------------------------------------------------------

    private ProjectBill buildBill(String projectId, Instant from, Instant to,
                                  String windowLabel, Bundle bundle) {
        Project project = bundle.projects.get(projectId);
        ProjectWorkflowSettings settings = bundle.settingsByProject.get(projectId);

        ProjectBill bill = ProjectBill.builder()
                .projectId(projectId)
                .projectName(project != null ? project.getName() : projectId)
                .windowStart(from)
                .windowEnd(to)
                .windowLabel(windowLabel)
                .lines(new ArrayList<>())
                .totalHourlyUsd(0.0)
                .totalMonthlyUsd(0.0)
                .totalMonthToDateUsd(0.0)
                .byEnvironment(new LinkedHashMap<>())
                .byCategory(new LinkedHashMap<>())
                .byNamespace(new LinkedHashMap<>())
                .capturedAt(Instant.now())
                .build();

        if (settings == null) return bill;

        double elapsedHours = elapsedHours(from, to);

        // ---- Catalog services this project opted into ----
        for (ProjectServiceUsage usage : nullSafe(settings.getServiceUsages())) {
            if (Boolean.FALSE.equals(usage.getEnabled())) continue;
            CloudEnvironment env = bundle.envsById.get(usage.getEnvironmentId());
            if (env == null) continue;
            CategoryServiceItem svc = findService(env, usage.getServiceId());
            if (svc == null) continue;

            int projectCount = (usage.getCount() == null || usage.getCount() < 1) ? 1 : usage.getCount();
            int catalogCount = (svc.getCount() == null || svc.getCount() < 1) ? 1 : svc.getCount();

            // Catalog hourly may be on the item itself or summed across AKS sub-nodes
            double itemHourly = computeCatalogHourly(svc) * catalogCount;
            if (itemHourly <= 0) continue;

            double subtotalHourly = itemHourly * projectCount;
            double share = computeShare(svc, env, usage, projectId, bundle);
            if (share <= 0) continue;

            double effHourly = subtotalHourly * share;
            double effMonthly = effHourly * HOURS_PER_MONTH;
            double mtd = effHourly * elapsedHours;

            String namespace = pickNamespace(usage, settings, env);
            String catKey = usage.getCategoryKey();
            String catDisplay = findCategoryDisplay(env, catKey);

            BillLineItem line = BillLineItem.builder()
                    .source("AZURE_CATALOG")
                    .environmentId(env.getId())
                    .environmentName(env.getName())
                    .categoryKey(catKey)
                    .categoryDisplayName(catDisplay)
                    .serviceId(svc.getId())
                    .serviceName(svc.getDisplayName() != null ? svc.getDisplayName() : svc.getName())
                    .customName(usage.getCustomName())
                    .allocation(svc.getAllocation() != null ? svc.getAllocation() : "GENERAL")
                    .count(projectCount)
                    .catalogHourlyUsd(itemHourly)
                    .subtotalHourlyUsd(subtotalHourly)
                    .shareFraction(share)
                    .effectiveHourlyUsd(effHourly)
                    .effectiveMonthlyUsd(effMonthly)
                    .monthToDateUsd(mtd)
                    .namespace(namespace)
                    .notes(usage.getNotes())
                    .build();
            addLine(bill, line);
        }

        // ---- External (manually-priced) services ----
        for (ExternalServiceItem ext : nullSafe(settings.getExternalServices())) {
            double monthly = ext.getMonthlyCostUsd() != null ? ext.getMonthlyCostUsd() : 0.0;
            if (monthly <= 0) continue;
            double hourly = monthly / HOURS_PER_MONTH;
            double mtd = hourly * elapsedHours;

            BillLineItem line = BillLineItem.builder()
                    .source("EXTERNAL")
                    .environmentId(null)
                    .environmentName(ext.getEnvironment() != null && !ext.getEnvironment().isBlank()
                            ? ext.getEnvironment() : "All envs")
                    .categoryKey("external")
                    .categoryDisplayName("External")
                    .serviceId(ext.getId())
                    .serviceName(ext.getName() != null ? ext.getName() : ext.getVendor())
                    .customName(null)
                    .allocation("EXTERNAL")
                    .count(1)
                    .catalogHourlyUsd(hourly)
                    .subtotalHourlyUsd(hourly)
                    .shareFraction(1.0)
                    .effectiveHourlyUsd(hourly)
                    .effectiveMonthlyUsd(monthly)
                    .monthToDateUsd(mtd)
                    .namespace(null)
                    .notes(ext.getNotes())
                    .build();
            addLine(bill, line);
        }

        return bill;
    }

    // ------------------------------------------------------------------
    // Allocation
    // ------------------------------------------------------------------

    private double computeShare(CategoryServiceItem svc, CloudEnvironment env,
                                ProjectServiceUsage usage, String projectId, Bundle bundle) {
        String alloc = svc.getAllocation() != null ? svc.getAllocation().toUpperCase(Locale.ROOT) : "GENERAL";

        switch (alloc) {
            case "EXTERNAL":
                return 1.0;
            case "AI_SHARED": {
                int cohort = bundle.aiSharedCohortSize();
                return cohort <= 0 ? 0.0 : 1.0 / cohort;
            }
            case "USER_NODE":
            case "SPOT_NODE": {
                double mine = bundle.microLoadFor(env.getName(), env.getId(), projectId);
                double total = bundle.envMicroLoadTotal(env.getName(), env.getId());
                if (total <= 0) {
                    int n = bundle.envServiceCohort(env.getId(), svc.getId());
                    return n <= 0 ? 0.0 : 1.0 / n;
                }
                return Math.max(0.0, Math.min(1.0, mine / total));
            }
            case "SYSTEM_NODE":
            case "NETWORK":
            case "SECURITY":
            case "GENERAL":
            default: {
                int n = bundle.envServiceCohort(env.getId(), svc.getId());
                return n <= 0 ? 0.0 : 1.0 / n;
            }
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static double computeCatalogHourly(CategoryServiceItem svc) {
        // AKS composite — sum the sub-nodes (each multiplied by its nodeCount)
        if (svc.getAksNodes() != null && !svc.getAksNodes().isEmpty()) {
            double sum = 0.0;
            for (AksNodeSpec n : svc.getAksNodes()) {
                if (n.getHourlyRateUsd() == null) continue;
                int nodes = n.getNodeCount() == null || n.getNodeCount() < 1 ? 1 : n.getNodeCount();
                sum += n.getHourlyRateUsd() * nodes;
            }
            // Plus the catalog's own hourly (if any) — usually 0 for AKS
            if (svc.getHourlyRateUsd() != null) sum += svc.getHourlyRateUsd();
            return sum;
        }
        return svc.getHourlyRateUsd() != null ? svc.getHourlyRateUsd() : 0.0;
    }

    private static CategoryServiceItem findService(CloudEnvironment env, String svcId) {
        if (env.getCategoryGroups() == null || svcId == null) return null;
        for (CategoryGroup g : env.getCategoryGroups()) {
            if (g.getServices() == null) continue;
            for (CategoryServiceItem s : g.getServices()) {
                if (svcId.equals(s.getId())) return s;
            }
        }
        return null;
    }

    private static String findCategoryDisplay(CloudEnvironment env, String catKey) {
        if (env.getCategoryGroups() == null || catKey == null) return catKey;
        for (CategoryGroup g : env.getCategoryGroups()) {
            if (catKey.equalsIgnoreCase(g.getKey())) return g.getDisplayName();
        }
        return catKey;
    }

    private static String pickNamespace(ProjectServiceUsage usage,
                                        ProjectWorkflowSettings settings,
                                        CloudEnvironment env) {
        // Prefer the env name as the namespace bucket for env-scoped services;
        // for compute/aks lines, attribute to the first microservice's namespace
        // when one is configured for that env.
        String envName = env.getName();
        if (settings.getProjectServices() != null) {
            for (ProjectServiceItem ms : settings.getProjectServices()) {
                if (ms.getEnvironment() == null || ms.getEnvironment().isBlank()
                        || ms.getEnvironment().equalsIgnoreCase(envName)) {
                    if (ms.getNamespace() != null && !ms.getNamespace().isBlank()) {
                        return ms.getNamespace();
                    }
                }
            }
        }
        return envName;
    }

    private static void addLine(ProjectBill bill, BillLineItem line) {
        bill.getLines().add(line);
        if (line.getEffectiveHourlyUsd() != null)
            bill.setTotalHourlyUsd(bill.getTotalHourlyUsd() + line.getEffectiveHourlyUsd());
        if (line.getEffectiveMonthlyUsd() != null)
            bill.setTotalMonthlyUsd(bill.getTotalMonthlyUsd() + line.getEffectiveMonthlyUsd());
        if (line.getMonthToDateUsd() != null)
            bill.setTotalMonthToDateUsd(bill.getTotalMonthToDateUsd() + line.getMonthToDateUsd());

        String envKey = line.getEnvironmentName() != null ? line.getEnvironmentName() : "—";
        bill.getByEnvironment().merge(envKey, nz(line.getEffectiveMonthlyUsd()), Double::sum);
        String catKey = line.getCategoryKey() != null ? line.getCategoryKey() : "other";
        bill.getByCategory().merge(catKey, nz(line.getEffectiveMonthlyUsd()), Double::sum);
        String nsKey = line.getNamespace() != null ? line.getNamespace() : envKey;
        bill.getByNamespace().merge(nsKey, nz(line.getEffectiveMonthlyUsd()), Double::sum);
    }

    private static double nz(Double v) { return v == null ? 0.0 : v; }

    private static <T> List<T> nullSafe(List<T> in) { return in == null ? List.of() : in; }

    private static double elapsedHours(Instant from, Instant to) {
        long secs = Math.max(0, ChronoUnit.SECONDS.between(from, to));
        return secs / 3600.0;
    }

    private static Instant[] currentMonthWindow() {
        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        Instant start = ym.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return new Instant[]{ start, Instant.now() };
    }

    private static Instant[] previousMonthWindow() {
        YearMonth prev = YearMonth.now(ZoneOffset.UTC).minusMonths(1);
        Instant start = prev.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant end = prev.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return new Instant[]{ start, end };
    }

    private static String windowLabel(Instant start) {
        YearMonth ym = YearMonth.from(start.atZone(ZoneOffset.UTC));
        return ym.getMonth().name().substring(0, 1).toUpperCase()
                + ym.getMonth().name().substring(1).toLowerCase()
                + " " + ym.getYear();
    }

    // ------------------------------------------------------------------
    // Bundle — pre-loaded view of repos to avoid N+1 reads per project
    // ------------------------------------------------------------------

    private Bundle loadBundle() {
        Bundle b = new Bundle();
        for (Project p : projectRepo.findAll()) {
            b.projects.put(p.getId(), p);
        }
        for (ProjectWorkflowSettings s : settingsRepo.findAll()) {
            b.settingsByProject.put(s.getProjectId(), s);
        }
        for (CloudEnvironment env : envRepo.findAll()) {
            b.envsById.put(env.getId(), env);
        }
        b.indexCohorts();
        return b;
    }

    private static class Bundle {
        final Map<String, Project> projects = new HashMap<>();
        final Map<String, ProjectWorkflowSettings> settingsByProject = new HashMap<>();
        final Map<String, CloudEnvironment> envsById = new HashMap<>();

        // (envId, serviceId) → projects that toggled it
        final Map<String, Set<String>> envServiceCohort = new HashMap<>();
        // envId → project → microservice load (replicas × (cpu+memory))
        final Map<String, Map<String, Double>> envMicroLoad = new HashMap<>();
        // projects with at least one AI_SHARED toggle
        final Set<String> aiSharedCohort = new HashSet<>();

        void indexCohorts() {
            for (ProjectWorkflowSettings s : settingsByProject.values()) {
                for (ProjectServiceUsage u : nullSafe(s.getServiceUsages())) {
                    if (Boolean.FALSE.equals(u.getEnabled())) continue;
                    CloudEnvironment env = envsById.get(u.getEnvironmentId());
                    if (env == null) continue;
                    String key = u.getEnvironmentId() + "::" + u.getServiceId();
                    envServiceCohort.computeIfAbsent(key, k -> new HashSet<>()).add(s.getProjectId());

                    CategoryServiceItem svc = findService(env, u.getServiceId());
                    if (svc != null && "AI_SHARED".equalsIgnoreCase(svc.getAllocation())) {
                        aiSharedCohort.add(s.getProjectId());
                    }
                }
                // Microservice load per env
                for (ProjectServiceItem ms : nullSafe(s.getProjectServices())) {
                    String envName = ms.getEnvironment();
                    String envId = resolveEnvIdByName(envName);
                    int reps = ms.getReplicas() == null ? 1 : Math.max(1, ms.getReplicas());
                    double cpu = ms.getCpuRequestMillicores() != null ? ms.getCpuRequestMillicores() / 1000.0 : 0.0;
                    double mem = ms.getMemoryRequestMb() != null ? ms.getMemoryRequestMb() / 1024.0 : 0.0;
                    double load = reps * (cpu + mem);
                    if (load <= 0) load = reps; // Fall back to replica count
                    String envKey = envId != null ? envId : (envName != null ? envName : "default");
                    envMicroLoad
                            .computeIfAbsent(envKey, k -> new HashMap<>())
                            .merge(s.getProjectId(), load, Double::sum);
                }
            }
        }

        String resolveEnvIdByName(String envName) {
            if (envName == null || envName.isBlank()) return null;
            for (CloudEnvironment e : envsById.values()) {
                if (envName.equalsIgnoreCase(e.getName())) return e.getId();
            }
            return null;
        }

        int envServiceCohort(String envId, String serviceId) {
            Set<String> set = envServiceCohort.get(envId + "::" + serviceId);
            return set == null ? 0 : set.size();
        }

        int aiSharedCohortSize() { return aiSharedCohort.size(); }

        double microLoad(String envName, String envId, ProjectServiceUsage usage) {
            // Identify the project from the usage — caller ensured it
            // (we get there via the cohort key indirectly — but Bundle stores by env).
            // Simplest: look up by usage owner via cohort map reverse — but we don't
            // have the owner here. The caller passes ProjectServiceUsage from the
            // current project's settings, so use getEnvironmentName() to resolve.
            String envKey = envId != null ? envId : envName;
            Map<String, Double> m = envMicroLoad.get(envKey);
            if (m == null) return 0.0;
            // Caller's project id isn't on usage — reconstruct via cohort
            // (this method is invoked per-project in buildBill which knows projectId).
            return 0.0; // overridden by overload that passes projectId
        }

        double microLoadFor(String envName, String envId, String projectId) {
            String envKey = envId != null ? envId : envName;
            Map<String, Double> m = envMicroLoad.get(envKey);
            if (m == null) return 0.0;
            Double d = m.get(projectId);
            return d == null ? 0.0 : d;
        }

        double envMicroLoadTotal(String envName, String envId) {
            String envKey = envId != null ? envId : envName;
            Map<String, Double> m = envMicroLoad.get(envKey);
            if (m == null) return 0.0;
            return m.values().stream().mapToDouble(Double::doubleValue).sum();
        }
    }
}
