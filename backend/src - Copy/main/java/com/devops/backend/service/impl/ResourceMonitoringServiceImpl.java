package com.devops.backend.service.impl;

import com.devops.backend.dto.monitoring.FluctuationPoint;
import com.devops.backend.dto.monitoring.ResourceDetail;
import com.devops.backend.dto.monitoring.ResourceHierarchyNode;
import com.devops.backend.model.Project;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.monitoring.ResourceSnapshot;
import com.devops.backend.model.workflow.CloudServiceItem;
import com.devops.backend.model.workflow.ClusterInfrastructure;
import com.devops.backend.model.workflow.ProjectServiceItem;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.repository.ResourceSnapshotRepository;
import com.devops.backend.service.ResourceMonitoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class ResourceMonitoringServiceImpl implements ResourceMonitoringService {

    private static final String DEFAULT_CLUSTER = "default";
    private static final Pattern NUM = Pattern.compile("([0-9]*\\.?[0-9]+)");

    private final ProjectRepository projectRepository;
    private final ProjectWorkflowSettingsRepository settingsRepository;
    private final ResourceSnapshotRepository snapshotRepository;

    // ------------------------------------------------------------------
    // Hierarchy
    // ------------------------------------------------------------------

    @Override
    public List<ResourceHierarchyNode> getHierarchy() {
        return buildHierarchy(null);
    }

    @Override
    public List<ResourceHierarchyNode> getEnvironmentSubtree(String environment) {
        return buildHierarchy(environment);
    }

    private List<ResourceHierarchyNode> buildHierarchy(String filterEnvironment) {
        List<Project> projects = projectRepository.findAll();
        Map<String, ProjectWorkflowSettings> settingsByProject = new HashMap<>();
        for (ProjectWorkflowSettings s : settingsRepository.findAll()) {
            if (s.getProjectId() != null) settingsByProject.put(s.getProjectId(), s);
        }

        // group: envName -> clusterName -> list of (project, settings)
        Map<String, Map<String, List<ProjectEntry>>> grouped = new LinkedHashMap<>();

        for (Project p : projects) {
            ProjectWorkflowSettings s = settingsByProject.get(p.getId());
            List<String> envs = (p.getEnvironments() != null && !p.getEnvironments().isEmpty())
                    ? p.getEnvironments() : List.of("default");
            for (String env : envs) {
                if (filterEnvironment != null && !filterEnvironment.equalsIgnoreCase(env)) continue;
                String cluster = clusterNameFor(s, env);
                grouped
                        .computeIfAbsent(env, k -> new LinkedHashMap<>())
                        .computeIfAbsent(cluster, k -> new ArrayList<>())
                        .add(new ProjectEntry(p, s));
            }
        }

        List<ResourceHierarchyNode> roots = new ArrayList<>();
        for (Map.Entry<String, Map<String, List<ProjectEntry>>> envE : grouped.entrySet()) {
            String env = envE.getKey();
            ResourceHierarchyNode envNode = ResourceHierarchyNode.builder()
                    .level("ENVIRONMENT")
                    .id("env:" + env)
                    .name(env)
                    .cpuCores(0.0).memoryMb(0.0).hourlyRateUsd(0.0)
                    .build();
            for (Map.Entry<String, List<ProjectEntry>> cE : envE.getValue().entrySet()) {
                String cluster = cE.getKey();
                ResourceHierarchyNode clusterNode = ResourceHierarchyNode.builder()
                        .level("CLUSTER")
                        .id("cluster:" + env + ":" + cluster)
                        .name(cluster)
                        .cpuCores(0.0).memoryMb(0.0).hourlyRateUsd(0.0)
                        .detail(buildClusterDetail(cE.getValue(), env))
                        .build();

                for (ProjectEntry pe : cE.getValue()) {
                    ResourceHierarchyNode projNode = buildProjectNode(pe, env, cluster);
                    clusterNode.getChildren().add(projNode);
                    clusterNode.setCpuCores(nz(clusterNode.getCpuCores()) + nz(projNode.getCpuCores()));
                    clusterNode.setMemoryMb(nz(clusterNode.getMemoryMb()) + nz(projNode.getMemoryMb()));
                    clusterNode.setHourlyRateUsd(nz(clusterNode.getHourlyRateUsd()) + nz(projNode.getHourlyRateUsd()));
                }
                clusterNode.setProjectedMonthlyUsd(nz(clusterNode.getHourlyRateUsd()) * 730.0);

                envNode.getChildren().add(clusterNode);
                envNode.setCpuCores(nz(envNode.getCpuCores()) + nz(clusterNode.getCpuCores()));
                envNode.setMemoryMb(nz(envNode.getMemoryMb()) + nz(clusterNode.getMemoryMb()));
                envNode.setHourlyRateUsd(nz(envNode.getHourlyRateUsd()) + nz(clusterNode.getHourlyRateUsd()));
            }
            envNode.setProjectedMonthlyUsd(nz(envNode.getHourlyRateUsd()) * 730.0);
            roots.add(envNode);
        }
        return roots;
    }

    private ResourceHierarchyNode buildProjectNode(ProjectEntry pe, String env, String cluster) {
        Project p = pe.project;
        ProjectWorkflowSettings s = pe.settings;

        ResourceHierarchyNode projNode = ResourceHierarchyNode.builder()
                .level("PROJECT")
                .id(p.getId())
                .name(p.getName())
                .cpuCores(0.0).memoryMb(0.0).hourlyRateUsd(0.0)
                .build();

        List<ProjectServiceItem> micros = s != null && s.getProjectServices() != null
                ? s.getProjectServices() : Collections.emptyList();

        for (ProjectServiceItem ms : micros) {
            String msEnv = ms.getEnvironment();
            String msCluster = ms.getClusterName() == null || ms.getClusterName().isBlank()
                    ? DEFAULT_CLUSTER : ms.getClusterName();
            if (msEnv != null && !msEnv.isBlank() && !msEnv.equalsIgnoreCase(env)) continue;
            if (!msCluster.equalsIgnoreCase(cluster) && !DEFAULT_CLUSTER.equalsIgnoreCase(cluster)) continue;

            double cpu = ms.getCpuCores() != null ? ms.getCpuCores() : parseFirstNumber(ms.getCpu());
            double memMb = ms.getMemoryMb() != null ? ms.getMemoryMb() : parseMemoryMb(ms.getRam());

            ResourceHierarchyNode msNode = ResourceHierarchyNode.builder()
                    .level("MICROSERVICE")
                    .id(ms.getId())
                    .name(ms.getServiceName())
                    .cpuCores(cpu)
                    .memoryMb(memMb)
                    .detail(ResourceDetail.builder()
                            .cpuRange(ms.getCpu())
                            .ramRange(ms.getRam())
                            .notes(ms.getNotes())
                            .environment(env)
                            .clusterName(msCluster)
                            .build())
                    .build();

            projNode.getChildren().add(msNode);
            projNode.setCpuCores(nz(projNode.getCpuCores()) + cpu);
            projNode.setMemoryMb(nz(projNode.getMemoryMb()) + memMb);
        }

        // Add cloud services pricing to project total (Azure hourly)
        if (s != null && s.getCloudServices() != null) {
            double hourly = 0.0;
            for (CloudServiceItem c : s.getCloudServices()) {
                if (c.getHourlyRateUsd() != null) hourly += shareFor(c, p.getId()) * c.getHourlyRateUsd();
            }
            projNode.setHourlyRateUsd(hourly);
            projNode.setProjectedMonthlyUsd(hourly * 730.0);
        }
        return projNode;
    }

    private ResourceDetail buildClusterDetail(List<ProjectEntry> entries, String env) {
        ClusterInfrastructure merged = null;
        List<CloudServiceItem> clusterCloud = new ArrayList<>();
        for (ProjectEntry pe : entries) {
            if (pe.settings == null) continue;
            ClusterInfrastructure ci = pe.settings.getClusterInfrastructure() != null
                    ? pe.settings.getClusterInfrastructure().get(env) : null;
            if (ci != null && merged == null) merged = ci;
            if (pe.settings.getCloudServices() != null) {
                for (CloudServiceItem cs : pe.settings.getCloudServices()) {
                    if (cs.getCategory() != null &&
                            (cs.getCategory().equalsIgnoreCase("Compute")
                                || cs.getCategory().equalsIgnoreCase("Networking"))) {
                        clusterCloud.add(cs);
                    }
                }
            }
        }
        return ResourceDetail.builder()
                .environment(env)
                .clusterInfrastructure(merged)
                .cloudServices(clusterCloud)
                .build();
    }

    private String clusterNameFor(ProjectWorkflowSettings s, String env) {
        if (s == null || s.getClusterInfrastructure() == null) return DEFAULT_CLUSTER;
        ClusterInfrastructure ci = s.getClusterInfrastructure().get(env);
        if (ci == null || ci.getClusterName() == null || ci.getClusterName().isBlank()) return DEFAULT_CLUSTER;
        return ci.getClusterName();
    }

    private double shareFor(CloudServiceItem c, String projectId) {
        if (!Boolean.TRUE.equals(c.getSharedAcrossProjects())) return 1.0;
        List<String> ids = c.getSharedProjectIds();
        if (ids == null || ids.isEmpty()) return 1.0;
        if (!ids.contains(projectId)) return 0.0;
        return 1.0 / ids.size();
    }

    // ------------------------------------------------------------------
    // Fluctuation queries
    // ------------------------------------------------------------------

    @Override
    public List<FluctuationPoint> getClusterFluctuation(String environment, String clusterName,
                                                        Instant from, Instant to) {
        List<ResourceSnapshot> all = snapshotRepository
                .findByScopeAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc("CLUSTER", environment, from, to);
        return all.stream()
                .filter(s -> clusterName == null || clusterName.equalsIgnoreCase(s.getClusterName()))
                .map(ResourceMonitoringServiceImpl::toFluct)
                .toList();
    }

    @Override
    public List<FluctuationPoint> getProjectFluctuation(String projectId, String environment,
                                                        Instant from, Instant to) {
        List<ResourceSnapshot> all = snapshotRepository
                .findByProjectIdAndEnvironmentAndCapturedAtBetweenOrderByCapturedAtAsc(projectId, environment, from, to);
        return all.stream()
                .filter(s -> "PROJECT".equals(s.getScope()))
                .map(ResourceMonitoringServiceImpl::toFluct)
                .toList();
    }

    @Override
    public List<FluctuationPoint> getMicroserviceFluctuation(String microserviceId, Instant from, Instant to) {
        return snapshotRepository
                .findByMicroserviceIdAndCapturedAtBetweenOrderByCapturedAtAsc(microserviceId, from, to)
                .stream().map(ResourceMonitoringServiceImpl::toFluct).toList();
    }

    private static FluctuationPoint toFluct(ResourceSnapshot s) {
        return FluctuationPoint.builder()
                .capturedAt(s.getCapturedAt())
                .cpuCores(s.getCpuCores())
                .memoryMb(s.getMemoryMb())
                .nodeCount(s.getNodeCount())
                .source(s.getSource())
                .build();
    }

    // ------------------------------------------------------------------
    // Snapshot writers
    // ------------------------------------------------------------------

    @Override
    public int snapshotProject(String projectId, String environment, String actor) {
        Project p = projectRepository.findById(projectId).orElse(null);
        if (p == null) return 0;
        ProjectWorkflowSettings s = settingsRepository.findByProjectId(projectId).orElse(null);
        return writeSnapshotFor(p, s, environment, "MANUAL", actor);
    }

    @Override
    public int snapshotAll(String source) {
        List<Project> projects = projectRepository.findAll();
        Map<String, ProjectWorkflowSettings> map = new HashMap<>();
        settingsRepository.findAll().forEach(x -> {
            if (x.getProjectId() != null) map.put(x.getProjectId(), x);
        });
        int n = 0;
        for (Project p : projects) {
            ProjectWorkflowSettings s = map.get(p.getId());
            List<String> envs = p.getEnvironments() == null || p.getEnvironments().isEmpty()
                    ? List.of("default") : p.getEnvironments();
            for (String env : envs) n += writeSnapshotFor(p, s, env, source, "system");
        }
        return n;
    }

    private int writeSnapshotFor(Project p, ProjectWorkflowSettings s, String env, String source, String actor) {
        Instant now = Instant.now();
        String cluster = clusterNameFor(s, env);
        double cpuTotal = 0.0, memTotal = 0.0;
        int count = 0;

        if (s != null && s.getProjectServices() != null) {
            for (ProjectServiceItem ms : s.getProjectServices()) {
                String msEnv = ms.getEnvironment();
                if (msEnv != null && !msEnv.isBlank() && !msEnv.equalsIgnoreCase(env)) continue;
                double cpu = ms.getCpuCores() != null ? ms.getCpuCores() : parseFirstNumber(ms.getCpu());
                double mem = ms.getMemoryMb() != null ? ms.getMemoryMb() : parseMemoryMb(ms.getRam());
                cpuTotal += cpu;
                memTotal += mem;
                snapshotRepository.save(ResourceSnapshot.builder()
                        .scope("MICROSERVICE")
                        .projectId(p.getId())
                        .environment(env)
                        .clusterName(cluster)
                        .microserviceId(ms.getId())
                        .microserviceName(ms.getServiceName())
                        .cpuCores(cpu).memoryMb(mem)
                        .capturedAt(now).source(source).capturedBy(actor)
                        .build());
                count++;
            }
        }
        // Project roll-up
        snapshotRepository.save(ResourceSnapshot.builder()
                .scope("PROJECT")
                .projectId(p.getId())
                .environment(env)
                .clusterName(cluster)
                .cpuCores(cpuTotal).memoryMb(memTotal)
                .capturedAt(now).source(source).capturedBy(actor)
                .build());
        count++;

        // Cluster roll-up per env
        ClusterInfrastructure ci = s != null && s.getClusterInfrastructure() != null
                ? s.getClusterInfrastructure().get(env) : null;
        int nodeCount = 0;
        String nodeSize = null;
        if (ci != null && ci.getNodePools() != null) {
            for (ClusterInfrastructure.NodePool np : ci.getNodePools()) {
                if (np.getNodeCount() != null) nodeCount += np.getNodeCount();
                if (nodeSize == null) nodeSize = np.getVmSize();
            }
        }
        snapshotRepository.save(ResourceSnapshot.builder()
                .scope("CLUSTER")
                .projectId(p.getId())
                .environment(env)
                .clusterName(cluster)
                .cpuCores(cpuTotal).memoryMb(memTotal)
                .nodeCount(nodeCount > 0 ? nodeCount : null)
                .nodeSize(nodeSize)
                .capturedAt(now).source(source).capturedBy(actor)
                .build());
        count++;
        return count;
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private record ProjectEntry(Project project, ProjectWorkflowSettings settings) {}

    private static double nz(Double d) { return d == null ? 0.0 : d; }

    static double parseFirstNumber(String s) {
        if (s == null) return 0.0;
        Matcher m = NUM.matcher(s);
        return m.find() ? Double.parseDouble(m.group(1)) : 0.0;
    }

    /** Parse "512 MB", "4 GB", "1.5 GB – 4 GB" → MB value. Uses the first number. */
    static double parseMemoryMb(String s) {
        if (s == null) return 0.0;
        Matcher m = NUM.matcher(s);
        if (!m.find()) return 0.0;
        double v = Double.parseDouble(m.group(1));
        String rest = s.substring(m.end()).toLowerCase(Locale.ROOT);
        if (rest.contains("gb") || rest.contains("gib")) return v * 1024.0;
        if (rest.contains("tb") || rest.contains("tib")) return v * 1024.0 * 1024.0;
        return v; // default MB
    }
}
