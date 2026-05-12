package com.devops.backend.service.impl;

import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.monitoring.ClusterConnection;
import com.devops.backend.model.monitoring.ClusterLiveMetrics;
import com.devops.backend.model.monitoring.ClusterLiveMetrics.NamespaceCostBreakdown;
import com.devops.backend.model.monitoring.ClusterLiveMetrics.NamespaceMetric;
import com.devops.backend.model.monitoring.ClusterLiveMetrics.NodeMetric;
import com.devops.backend.model.monitoring.ClusterLiveMetrics.NodePoolSummary;
import com.devops.backend.repository.CloudEnvironmentRepository;
import com.devops.backend.repository.ClusterConnectionRepository;
import com.devops.backend.repository.ClusterLiveMetricsRepository;
import com.devops.backend.service.ClusterMetricsService;
import io.fabric8.kubernetes.api.model.*;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.api.model.metrics.v1beta1.ContainerMetrics;
import io.fabric8.kubernetes.api.model.metrics.v1beta1.NodeMetricsList;
import io.fabric8.kubernetes.api.model.metrics.v1beta1.PodMetrics;
import io.fabric8.kubernetes.api.model.metrics.v1beta1.PodMetricsList;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClusterMetricsServiceImpl implements ClusterMetricsService {

    private static final Set<String> SYSTEM_NAMESPACES = Set.of(
            "kube-system", "kube-public", "kube-node-lease",
            "cert-manager", "ingress-nginx", "monitoring",
            "kube-flannel", "gatekeeper-system"
    );

    private final ClusterConnectionRepository connectionRepo;
    private final ClusterLiveMetricsRepository metricsRepo;
    private final CloudEnvironmentRepository cloudEnvRepo;

    /** Cached clients — one per environmentId. Invalidated when kubeconfig changes. */
    private final Map<String, KubernetesClient> clientCache = new ConcurrentHashMap<>();

    // =========================================================================
    // Connection management
    // =========================================================================

    @Override
    public ClusterConnection saveConnection(String environmentId, String environmentName,
                                             String kubeconfigContent, String jenkinsNodePool,
                                             String actor) {
        invalidateClient(environmentId);

        ClusterConnection conn = connectionRepo.findByEnvironmentId(environmentId)
                .orElseGet(() -> ClusterConnection.builder()
                        .environmentId(environmentId)
                        .createdAt(Instant.now())
                        .createdBy(actor)
                        .build());

        conn.setEnvironmentName(environmentName);
        conn.setKubeconfigContent(kubeconfigContent);
        conn.setUpdatedAt(Instant.now());
        conn.setUpdatedBy(actor);

        ClusterConnection saved = connectionRepo.save(conn);
        testConnection(environmentId);
        return connectionRepo.findByEnvironmentId(environmentId).orElse(saved);
    }

    @Override
    public void deleteConnection(String environmentId) {
        invalidateClient(environmentId);
        connectionRepo.deleteByEnvironmentId(environmentId);
        metricsRepo.deleteByEnvironmentId(environmentId);
    }

    @Override
    public boolean testConnection(String environmentId) {
        try {
            KubernetesClient client = buildClient(environmentId);
            client.nodes().list();
            connectionRepo.findByEnvironmentId(environmentId).ifPresent(c -> {
                c.setConnected(true);
                c.setLastConnectedAt(Instant.now());
                c.setLastError(null);
                connectionRepo.save(c);
            });
            clientCache.put(environmentId, client);
            return true;
        } catch (Exception e) {
            log.warn("Connection test failed for env {}: {}", environmentId, e.getMessage());
            connectionRepo.findByEnvironmentId(environmentId).ifPresent(c -> {
                c.setConnected(false);
                c.setLastError(e.getMessage());
                connectionRepo.save(c);
            });
            return false;
        }
    }

    @Override
    public Optional<ClusterConnection> getConnection(String environmentId) {
        return connectionRepo.findByEnvironmentId(environmentId);
    }

    @Override
    public List<ClusterConnection> listConnections() {
        return connectionRepo.findAll();
    }

    // =========================================================================
    // Metrics collection
    // =========================================================================

    @Override
    public void collectAllConnected() {
        connectionRepo.findAllByConnectedTrue().forEach(conn -> {
            try {
                collectAndSave(conn.getEnvironmentId());
            } catch (Exception e) {
                log.error("Metrics collection failed for env {}: {}", conn.getEnvironmentId(), e.getMessage());
            }
        });
    }

    @Override
    public ClusterLiveMetrics collectAndSave(String environmentId) {
        ClusterConnection conn = connectionRepo.findByEnvironmentId(environmentId)
                .orElseThrow(() -> new IllegalStateException("No cluster connection for env: " + environmentId));

        KubernetesClient client = getOrCreateClient(environmentId);
        Instant now = Instant.now();

        // ── 1. Nodes ──────────────────────────────────────────────────────────
        NodeList nodeList = client.nodes().list();

        // ── 2. Node metrics from metrics-server ───────────────────────────────
        Map<String, io.fabric8.kubernetes.api.model.metrics.v1beta1.NodeMetrics> nodeMetricsMap = new HashMap<>();
        boolean metricsAvailable = false;
        try {
            NodeMetricsList nml = client.top().nodes().metrics();
            nml.getItems().forEach(nm -> nodeMetricsMap.put(nm.getMetadata().getName(), nm));
            metricsAvailable = true;
        } catch (Exception e) {
            log.warn("Metrics-server unavailable for env {}: {}", environmentId, e.getMessage());
        }

        // ── 3. Pods (all namespaces) ───────────────────────────────────────────
        PodList podList = client.pods().inAnyNamespace().list();

        // ── 4. Pod metrics ────────────────────────────────────────────────────
        // namespace → podName → PodMetrics
        Map<String, Map<String, PodMetrics>> podMetricsMap = new HashMap<>();
        if (metricsAvailable) {
            try {
                PodMetricsList pml = client.top().pods().metrics();
                pml.getItems().forEach(pm -> {
                    String ns = pm.getMetadata().getNamespace();
                    String name = pm.getMetadata().getName();
                    podMetricsMap.computeIfAbsent(ns, k -> new HashMap<>()).put(name, pm);
                });
            } catch (Exception e) {
                log.warn("Pod metrics unavailable for env {}: {}", environmentId, e.getMessage());
            }
        }

        // ── 5. Namespaces, Deployments, Services ──────────────────────────────
        NamespaceList nsList = client.namespaces().list();
        DeploymentList depList = client.apps().deployments().inAnyNamespace().list();
        ServiceList svcList = client.services().inAnyNamespace().list();

        // ── 6. Build per-node metrics ─────────────────────────────────────────
        Map<String, List<Pod>> podsByNode = podList.getItems().stream()
                .filter(p -> p.getSpec() != null && p.getSpec().getNodeName() != null)
                .collect(Collectors.groupingBy(p -> p.getSpec().getNodeName()));

        List<NodeMetric> nodeMetrics = nodeList.getItems().stream()
                .map(n -> buildNodeMetric(n,
                        nodeMetricsMap.get(n.getMetadata().getName()),
                        podsByNode.getOrDefault(n.getMetadata().getName(), List.of())))
                .collect(Collectors.toList());

        // ── 7. Build per-namespace metrics ────────────────────────────────────
        Map<String, Long> depCountByNs = depList.getItems().stream()
                .filter(d -> d.getMetadata().getNamespace() != null)
                .collect(Collectors.groupingBy(d -> d.getMetadata().getNamespace(), Collectors.counting()));

        Map<String, Long> svcCountByNs = svcList.getItems().stream()
                .filter(s -> s.getMetadata().getNamespace() != null)
                .collect(Collectors.groupingBy(s -> s.getMetadata().getNamespace(), Collectors.counting()));

        List<NamespaceMetric> nsMetrics = nsList.getItems().stream()
                .map(ns -> buildNamespaceMetric(
                        ns.getMetadata().getName(),
                        podList,
                        podMetricsMap.getOrDefault(ns.getMetadata().getName(), Map.of()),
                        depCountByNs.getOrDefault(ns.getMetadata().getName(), 0L).intValue(),
                        svcCountByNs.getOrDefault(ns.getMetadata().getName(), 0L).intValue()))
                .collect(Collectors.toList());

        // ── 8. Node-pool summaries ────────────────────────────────────────────
        Map<String, List<NodeMetric>> byPool = nodeMetrics.stream()
                .collect(Collectors.groupingBy(n ->
                        n.getNodePoolName() != null ? n.getNodePoolName() : "default"));

        List<NodePoolSummary> poolSummaries = byPool.entrySet().stream()
                .map(e -> buildPoolSummary(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        // ── 9. Namespace cost breakdown (uses CloudEnvironment pricing) ────────
        boolean finalMetricsAvailable = metricsAvailable;
        List<NamespaceCostBreakdown> namespaceCosts = cloudEnvRepo.findById(environmentId)
                .map(env -> calculateNamespaceCosts(env, nsMetrics, finalMetricsAvailable))
                .orElse(List.of());

        // ── 10. Cluster-level aggregates ──────────────────────────────────────
        long totalCpuCap   = nodeMetrics.stream().mapToLong(NodeMetric::getCpuCapacityMillicores).sum();
        long totalCpuAlloc = nodeMetrics.stream().mapToLong(NodeMetric::getCpuAllocatableMillicores).sum();
        long totalCpuUsage = nodeMetrics.stream().mapToLong(NodeMetric::getCpuUsageMillicores).sum();
        long totalMemCap   = nodeMetrics.stream().mapToLong(NodeMetric::getMemoryCapacityBytes).sum();
        long totalMemAlloc = nodeMetrics.stream().mapToLong(NodeMetric::getMemoryAllocatableBytes).sum();
        long totalMemUsage = nodeMetrics.stream().mapToLong(NodeMetric::getMemoryUsageBytes).sum();
        long totalStorage  = nodeMetrics.stream().mapToLong(NodeMetric::getEphemeralStorageBytes).sum();

        int totalNodes = nodeMetrics.size();
        int readyNodes = (int) nodeMetrics.stream().filter(NodeMetric::isReady).count();

        ClusterLiveMetrics snapshot = ClusterLiveMetrics.builder()
                .environmentId(environmentId)
                .environmentName(conn.getEnvironmentName())
                .capturedAt(now)
                .metricsServerAvailable(metricsAvailable)
                .totalNodes(totalNodes)
                .readyNodes(readyNodes)
                .notReadyNodes(totalNodes - readyNodes)
                .totalNamespaces(nsList.getItems().size())
                .totalPods(podList.getItems().size())
                .runningPods(countByPhase(podList, "Running"))
                .pendingPods(countByPhase(podList, "Pending"))
                .failedPods(countByPhase(podList, "Failed"))
                .totalCpuCapacityMillicores(totalCpuCap)
                .totalCpuAllocatableMillicores(totalCpuAlloc)
                .totalCpuUsageMillicores(totalCpuUsage)
                .clusterCpuUtilizationPct(pct(totalCpuUsage, totalCpuAlloc))
                .totalMemoryCapacityBytes(totalMemCap)
                .totalMemoryAllocatableBytes(totalMemAlloc)
                .totalMemoryUsageBytes(totalMemUsage)
                .clusterMemoryUtilizationPct(pct(totalMemUsage, totalMemAlloc))
                .totalEphemeralStorageBytes(totalStorage)
                .nodePools(poolSummaries)
                .nodes(nodeMetrics)
                .namespaces(nsMetrics)
                .namespaceCosts(namespaceCosts)
                .build();

        ClusterLiveMetrics saved = metricsRepo.save(snapshot);

        conn.setConnected(true);
        conn.setLastConnectedAt(now);
        conn.setLastError(null);
        connectionRepo.save(conn);

        return saved;
    }

    // =========================================================================
    // Metrics retrieval
    // =========================================================================

    @Override
    public Optional<ClusterLiveMetrics> getLatest(String environmentId) {
        return metricsRepo.findFirstByEnvironmentIdOrderByCapturedAtDesc(environmentId);
    }

    @Override
    public List<ClusterLiveMetrics> getHistory(String environmentId, Instant from, Instant to) {
        return metricsRepo.findByEnvironmentIdAndCapturedAtBetweenOrderByCapturedAtAsc(environmentId, from, to);
    }

    @Override
    public List<Map<String, Object>> getAllLatestSummaries() {
        return connectionRepo.findAll().stream()
                .map(conn -> {
                    Map<String, Object> summary = new LinkedHashMap<>();
                    summary.put("environmentId", conn.getEnvironmentId());
                    summary.put("environmentName", conn.getEnvironmentName());
                    summary.put("connected", conn.isConnected());
                    summary.put("lastConnectedAt", conn.getLastConnectedAt());
                    summary.put("lastError", conn.getLastError());
                    metricsRepo.findFirstByEnvironmentIdOrderByCapturedAtDesc(conn.getEnvironmentId())
                            .ifPresent(m -> {
                                summary.put("capturedAt", m.getCapturedAt());
                                summary.put("totalNodes", m.getTotalNodes());
                                summary.put("readyNodes", m.getReadyNodes());
                                summary.put("totalPods", m.getTotalPods());
                                summary.put("clusterCpuUtilizationPct", m.getClusterCpuUtilizationPct());
                                summary.put("clusterMemoryUtilizationPct", m.getClusterMemoryUtilizationPct());
                                summary.put("metricsServerAvailable", m.isMetricsServerAvailable());
                            });
                    return summary;
                })
                .collect(Collectors.toList());
    }

    // =========================================================================
    // Namespace cost calculation
    // =========================================================================

    private List<NamespaceCostBreakdown> calculateNamespaceCosts(
            CloudEnvironment env,
            List<NamespaceMetric> allNamespaces,
            boolean metricsAvailable) {

        // Total node pool hourly cost from CloudEnvironment
        double totalNodeHourly = computeNodePoolHourly(env);

        // Shared services (env-scoped only) split equally across app namespaces
        double totalSharedHourly = env.getSharedServices().stream()
                .filter(s -> !"global".equals(s.getScope()))
                .mapToDouble(s -> s.getHourlyRateUsd() != null ? s.getHourlyRateUsd() : 0.0)
                .sum();

        // Application namespaces only — exclude Kubernetes system namespaces
        List<NamespaceMetric> appNs = allNamespaces.stream()
                .filter(ns -> !SYSTEM_NAMESPACES.contains(ns.getNamespace()))
                .collect(Collectors.toList());

        if (appNs.isEmpty()) return List.of();

        double sharedPerNs = totalSharedHourly / appNs.size();

        // Decide whether to use actual usage or configured requests
        long totalCpu = appNs.stream()
                .mapToLong(ns -> metricsAvailable ? ns.getCpuUsageMillicores() : ns.getCpuRequestMillicores())
                .sum();
        long totalMem = appNs.stream()
                .mapToLong(ns -> metricsAvailable ? ns.getMemoryUsageBytes() : ns.getMemoryRequestBytes())
                .sum();

        return appNs.stream().map(ns -> {
            long nsCpu = metricsAvailable ? ns.getCpuUsageMillicores() : ns.getCpuRequestMillicores();
            long nsMem = metricsAvailable ? ns.getMemoryUsageBytes() : ns.getMemoryRequestBytes();

            // Equal fallback when no usage data at all (new namespace)
            double cpuShare = totalCpu > 0 ? (nsCpu * 100.0 / totalCpu) : (100.0 / appNs.size());
            double memShare = totalMem > 0 ? (nsMem * 100.0 / totalMem) : (100.0 / appNs.size());
            double costShare = Math.max(cpuShare, memShare) / 100.0;

            double nodeHourly = round4(costShare * totalNodeHourly);
            double totalHourly = round4(nodeHourly + sharedPerNs);

            return NamespaceCostBreakdown.builder()
                    .namespace(ns.getNamespace())
                    .cpuSharePct(round1(cpuShare))
                    .memSharePct(round1(memShare))
                    .costSharePct(round1(Math.max(cpuShare, memShare)))
                    .nodePoolCostHourlyUsd(nodeHourly)
                    .sharedServicesCostHourlyUsd(round4(sharedPerNs))
                    .totalHourlyUsd(totalHourly)
                    .totalMonthlyUsd(round4(totalHourly * 730))
                    .usingActualMetrics(metricsAvailable)
                    .build();
        }).collect(Collectors.toList());
    }

    private double computeNodePoolHourly(CloudEnvironment env) {
        double total = 0;
        total += poolHourly(env.getSystemNodePool());
        total += poolHourly(env.getUserNodePool());
        for (CloudEnvironment.NodePoolConfig p : env.getAdditionalNodePools()) {
            total += poolHourly(p);
        }
        return total;
    }

    private double poolHourly(CloudEnvironment.NodePoolConfig pool) {
        if (pool == null || pool.getHourlyRateUsd() == null || pool.getNodeCount() == null) return 0;
        return pool.getHourlyRateUsd() * pool.getNodeCount();
    }

    // =========================================================================
    // Builder helpers
    // =========================================================================

    private NodeMetric buildNodeMetric(Node node,
                                        io.fabric8.kubernetes.api.model.metrics.v1beta1.NodeMetrics metrics,
                                        List<Pod> podsOnNode) {
        Map<String, String> labels = Optional.ofNullable(node.getMetadata().getLabels()).orElse(Map.of());
        Map<String, Quantity> capacity = Optional.ofNullable(node.getStatus().getCapacity()).orElse(Map.of());
        Map<String, Quantity> allocatable = Optional.ofNullable(node.getStatus().getAllocatable()).orElse(Map.of());

        String poolName = labels.getOrDefault("kubernetes.azure.com/agentpool",
                labels.getOrDefault("agentpool", "default"));
        String vmSize = labels.getOrDefault("node.kubernetes.io/instance-type",
                labels.getOrDefault("beta.kubernetes.io/instance-type", "unknown"));
        String zone = labels.getOrDefault("topology.kubernetes.io/zone",
                labels.getOrDefault("failure-domain.beta.kubernetes.io/zone", ""));
        String region = labels.getOrDefault("topology.kubernetes.io/region",
                labels.getOrDefault("failure-domain.beta.kubernetes.io/region", ""));
        boolean spotNode = "spot".equalsIgnoreCase(
                labels.getOrDefault("kubernetes.azure.com/scalesetpriority", ""));

        NodeSystemInfo sysInfo = node.getStatus().getNodeInfo();

        long cpuCap = parseCpuMillicores(capacity.get("cpu"));
        long cpuAlloc = parseCpuMillicores(allocatable.get("cpu"));
        long memCap = parseMemoryBytes(capacity.get("memory"));
        long memAlloc = parseMemoryBytes(allocatable.get("memory"));
        long storageBytes = parseMemoryBytes(capacity.get("ephemeral-storage"));
        int maxPods = parseMaxPods(capacity.get("pods"));

        long cpuUsage = 0;
        long memUsage = 0;
        if (metrics != null && metrics.getUsage() != null) {
            cpuUsage = parseCpuMillicores(metrics.getUsage().get("cpu"));
            memUsage = parseMemoryBytes(metrics.getUsage().get("memory"));
        }

        long cpuReq = 0, memReq = 0;
        for (Pod p : podsOnNode) {
            if (p.getSpec() == null) continue;
            for (Container c : p.getSpec().getContainers()) {
                if (c.getResources() == null || c.getResources().getRequests() == null) continue;
                cpuReq += parseCpuMillicores(c.getResources().getRequests().get("cpu"));
                memReq += parseMemoryBytes(c.getResources().getRequests().get("memory"));
            }
        }

        boolean ready = node.getStatus().getConditions().stream()
                .filter(nc -> "Ready".equals(nc.getType()))
                .anyMatch(nc -> "True".equals(nc.getStatus()));

        List<String> activeConditions = node.getStatus().getConditions().stream()
                .filter(nc -> !"Ready".equals(nc.getType()) && "True".equals(nc.getStatus()))
                .map(NodeCondition::getType)
                .collect(Collectors.toList());

        List<String> taints = Optional.ofNullable(node.getSpec().getTaints())
                .orElse(List.of())
                .stream()
                .map(t -> t.getKey() + (t.getEffect() != null ? ":" + t.getEffect() : ""))
                .collect(Collectors.toList());

        return NodeMetric.builder()
                .nodeName(node.getMetadata().getName())
                .nodePoolName(poolName)
                .vmSize(vmSize)
                .availabilityZone(zone)
                .region(region)
                .osImage(sysInfo != null ? sysInfo.getOsImage() : null)
                .kernelVersion(sysInfo != null ? sysInfo.getKernelVersion() : null)
                .containerRuntime(sysInfo != null ? sysInfo.getContainerRuntimeVersion() : null)
                .ready(ready)
                .spotNode(spotNode)
                .nodeCreatedAt(parseInstant(node.getMetadata().getCreationTimestamp()))
                .cpuCapacityMillicores(cpuCap)
                .cpuAllocatableMillicores(cpuAlloc)
                .cpuUsageMillicores(cpuUsage)
                .cpuUsagePct(pct(cpuUsage, cpuAlloc))
                .cpuRequestedByPodsMillicores(cpuReq)
                .memoryCapacityBytes(memCap)
                .memoryAllocatableBytes(memAlloc)
                .memoryUsageBytes(memUsage)
                .memoryUsagePct(pct(memUsage, memAlloc))
                .memoryRequestedByPodsBytes(memReq)
                .podCount(podsOnNode.size())
                .maxPods(maxPods)
                .ephemeralStorageBytes(storageBytes)
                .activeConditions(activeConditions)
                .taints(taints)
                .build();
    }

    private NamespaceMetric buildNamespaceMetric(String namespace,
                                                  PodList allPods,
                                                  Map<String, PodMetrics> podMetricsInNs,
                                                  int deploymentCount,
                                                  int serviceCount) {
        List<Pod> nsPods = allPods.getItems().stream()
                .filter(p -> namespace.equals(p.getMetadata().getNamespace()))
                .collect(Collectors.toList());

        long cpuReq = 0, cpuLim = 0, memReq = 0, memLim = 0;
        for (Pod p : nsPods) {
            if (p.getSpec() == null) continue;
            for (Container c : p.getSpec().getContainers()) {
                ResourceRequirements res = c.getResources();
                if (res == null) continue;
                if (res.getRequests() != null) {
                    cpuReq += parseCpuMillicores(res.getRequests().get("cpu"));
                    memReq += parseMemoryBytes(res.getRequests().get("memory"));
                }
                if (res.getLimits() != null) {
                    cpuLim += parseCpuMillicores(res.getLimits().get("cpu"));
                    memLim += parseMemoryBytes(res.getLimits().get("memory"));
                }
            }
        }

        long cpuUsage = 0, memUsage = 0;
        for (PodMetrics pm : podMetricsInNs.values()) {
            if (pm.getContainers() == null) continue;
            for (ContainerMetrics cm : pm.getContainers()) {
                if (cm.getUsage() == null) continue;
                cpuUsage += parseCpuMillicores(cm.getUsage().get("cpu"));
                memUsage += parseMemoryBytes(cm.getUsage().get("memory"));
            }
        }

        int total = nsPods.size();
        int running = (int) nsPods.stream().filter(p -> "Running".equals(podPhase(p))).count();
        int pending = (int) nsPods.stream().filter(p -> "Pending".equals(podPhase(p))).count();
        int failed  = (int) nsPods.stream().filter(p -> "Failed".equals(podPhase(p))).count();

        return NamespaceMetric.builder()
                .namespace(namespace)
                .totalPods(total)
                .runningPods(running)
                .pendingPods(pending)
                .failedPods(failed)
                .cpuRequestMillicores(cpuReq)
                .cpuLimitMillicores(cpuLim)
                .cpuUsageMillicores(cpuUsage)
                .cpuUsagePct(pct(cpuUsage, cpuReq))
                .memoryRequestBytes(memReq)
                .memoryLimitBytes(memLim)
                .memoryUsageBytes(memUsage)
                .memoryUsagePct(pct(memUsage, memReq))
                .deploymentCount(deploymentCount)
                .serviceCount(serviceCount)
                .build();
    }

    private NodePoolSummary buildPoolSummary(String poolName, List<NodeMetric> nodes) {
        long cpuAlloc = nodes.stream().mapToLong(NodeMetric::getCpuAllocatableMillicores).sum();
        long cpuUsage = nodes.stream().mapToLong(NodeMetric::getCpuUsageMillicores).sum();
        long memAlloc = nodes.stream().mapToLong(NodeMetric::getMemoryAllocatableBytes).sum();
        long memUsage = nodes.stream().mapToLong(NodeMetric::getMemoryUsageBytes).sum();
        boolean spot = nodes.stream().anyMatch(NodeMetric::isSpotNode);

        return NodePoolSummary.builder()
                .poolName(poolName)
                .vmSize(nodes.isEmpty() ? "unknown" : nodes.get(0).getVmSize())
                .nodeCount(nodes.size())
                .spotPool(spot)
                .totalCpuAllocatableMillicores(cpuAlloc)
                .totalCpuUsageMillicores(cpuUsage)
                .cpuUtilizationPct(pct(cpuUsage, cpuAlloc))
                .totalMemoryAllocatableBytes(memAlloc)
                .totalMemoryUsageBytes(memUsage)
                .memoryUtilizationPct(pct(memUsage, memAlloc))
                .totalPodCount(nodes.stream().mapToInt(NodeMetric::getPodCount).sum())
                .build();
    }

    // =========================================================================
    // Quantity parsers
    // =========================================================================

    private long parseCpuMillicores(Quantity q) {
        return q == null ? 0 : parseCpuMillicores(q.toString());
    }

    private long parseCpuMillicores(String val) {
        if (val == null || val.isBlank()) return 0;
        val = val.trim();
        if (val.endsWith("m")) {
            try { return Long.parseLong(val.substring(0, val.length() - 1)); } catch (NumberFormatException e) { return 0; }
        }
        if (val.endsWith("n")) {
            try { return Long.parseLong(val.substring(0, val.length() - 1)) / 1_000_000; } catch (NumberFormatException e) { return 0; }
        }
        try { return (long)(Double.parseDouble(val) * 1000); } catch (NumberFormatException e) { return 0; }
    }

    private long parseMemoryBytes(Quantity q) {
        return q == null ? 0 : parseMemoryBytes(q.toString());
    }

    private long parseMemoryBytes(String val) {
        if (val == null || val.isBlank()) return 0;
        val = val.trim();
        try {
            if (val.endsWith("Ki")) return Long.parseLong(val.replace("Ki", "")) * 1024L;
            if (val.endsWith("Mi")) return Long.parseLong(val.replace("Mi", "")) * 1024L * 1024L;
            if (val.endsWith("Gi")) return Long.parseLong(val.replace("Gi", "")) * 1024L * 1024L * 1024L;
            if (val.endsWith("Ti")) return Long.parseLong(val.replace("Ti", "")) * 1024L * 1024L * 1024L * 1024L;
            if (val.endsWith("k"))  return Long.parseLong(val.replace("k", ""))  * 1000L;
            if (val.endsWith("M"))  return Long.parseLong(val.replace("M", ""))  * 1000L * 1000L;
            if (val.endsWith("G"))  return Long.parseLong(val.replace("G", ""))  * 1000L * 1000L * 1000L;
            return Long.parseLong(val);
        } catch (NumberFormatException e) { return 0; }
    }

    private int parseMaxPods(Quantity q) {
        if (q == null) return 0;
        try { return Integer.parseInt(q.toString().trim()); } catch (NumberFormatException e) { return 0; }
    }

    // =========================================================================
    // Client helpers
    // =========================================================================

    private KubernetesClient getOrCreateClient(String environmentId) {
        return clientCache.computeIfAbsent(environmentId, this::buildClient);
    }

    private KubernetesClient buildClient(String environmentId) {
        ClusterConnection conn = connectionRepo.findByEnvironmentId(environmentId)
                .orElseThrow(() -> new IllegalStateException("No kubeconfig for env: " + environmentId));
        Config config = Config.fromKubeconfig(conn.getKubeconfigContent());
        return new KubernetesClientBuilder().withConfig(config).build();
    }

    private void invalidateClient(String environmentId) {
        KubernetesClient old = clientCache.remove(environmentId);
        if (old != null) { try { old.close(); } catch (Exception ignored) {} }
    }

    // =========================================================================
    // Math helpers
    // =========================================================================

    private static double pct(long used, long total) {
        return total > 0 ? Math.round(used * 1000.0 / total) / 10.0 : 0.0;
    }

    private static double round1(double v) { return Math.round(v * 10) / 10.0; }
    private static double round4(double v) { return Math.round(v * 10000) / 10000.0; }

    private static int countByPhase(PodList podList, String phase) {
        return (int) podList.getItems().stream().filter(p -> phase.equals(podPhase(p))).count();
    }

    private static String podPhase(Pod p) {
        return p.getStatus() != null ? p.getStatus().getPhase() : "Unknown";
    }

    private static Instant parseInstant(String ts) {
        if (ts == null || ts.isBlank()) return null;
        try { return Instant.parse(ts); } catch (Exception e) { return null; }
    }
}
