package com.devops.backend.service.prometheus;

import com.devops.backend.dto.monitoring.PrometheusExtraMetrics;
import com.devops.backend.dto.monitoring.PrometheusLiveCostSnapshot;
import com.devops.backend.dto.monitoring.PrometheusLiveCostSnapshot.*;
import com.devops.backend.model.Project;
import com.devops.backend.model.monitoring.AzurePriceRecord;
import com.devops.backend.model.monitoring.ClusterCostTimeseriesPoint;
import com.devops.backend.model.monitoring.PrometheusCostAccumulator;
import com.devops.backend.repository.ClusterCostTimeseriesRepository;
import com.devops.backend.repository.ProjectRepository;
import com.devops.backend.repository.PrometheusCostAccumulatorRepository;
import com.devops.backend.service.AzurePricingService;
import com.devops.backend.service.prometheus.PrometheusDiscoveryService.Node;
import com.devops.backend.service.prometheus.PrometheusDiscoveryService.Pod;
import com.devops.backend.service.prometheus.PrometheusDiscoveryService.Pvc;
import com.devops.backend.service.prometheus.PrometheusDiscoveryService.Topology;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Heart of the live, Prometheus-driven cost engine.
 *
 * <p>For every poll cycle we:
 * <ol>
 *   <li>Pull a {@link Topology} snapshot from Prometheus (no DB writes).</li>
 *   <li>Look up live Azure prices for every distinct VM SKU + storage class +
 *       discovered cloud service (ACR / Load Balancer / Key Vault).</li>
 *   <li>Compute the live $/hr for each (namespace, microservice) and each
 *       cloud service, weighted by CPU/memory share of the node.</li>
 *   <li>Upsert {@link PrometheusCostAccumulator} rows so cumulative + MTD
 *       totals survive restarts. Cumulative never resets.</li>
 *   <li>Return a {@link PrometheusLiveCostSnapshot} for the UI.</li>
 * </ol>
 *
 * <p>The whole pipeline is best-effort — if Prometheus is unreachable, an
 * empty snapshot with {@code prometheusReachable=false} is returned and no
 * accumulators are written.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PrometheusCostService {

    private static final double HOURS_PER_MONTH = 730d;
    private static final double HOURS_PER_DAY = 24d;
    /** EMA smoothing factor — α = 0.3 means each tick contributes 30% of the new rate. */
    private static final double EMA_ALPHA = 0.3d;

    private final PrometheusClient client;
    private final PrometheusDiscoveryService discovery;
    private final AzurePricingService azure;
    private final PrometheusCostAccumulatorRepository repo;
    private final ProjectRepository projectRepo;
    private final PrometheusProperties props;
    private final ClusterCostTimeseriesRepository timeseriesRepo;

    /** In-memory per-env last-good snapshot cache. Survives individual tick failures within the JVM session. */
    private final Map<String, PrometheusLiveCostSnapshot> lastGoodSnapshot = new ConcurrentHashMap<>();

    /**
     * Cross-tick Azure VM price cache keyed by {@code sku|region|spot}.
     * Prevents transient Azure API failures from zeroing out node prices.
     * Entries are refreshed on every successful API call; stale entries are
     * used as fallback when the API returns no results.
     */
    private record CachedPrice(AzurePriceRecord record, java.time.Instant expiry) {
        boolean fresh() { return java.time.Instant.now().isBefore(expiry); }
    }
    private static final java.time.Duration VM_PRICE_TTL = java.time.Duration.ofMinutes(15);
    private final ConcurrentHashMap<String, CachedPrice> vmPriceCache = new ConcurrentHashMap<>();

    private String defaultRegion() {
        String r = props.getDefaultRegion();
        return r == null || r.isBlank() ? "eastus" : r;
    }

    /** Envs the engine knows about (have a configured Prometheus endpoint). */
    public Set<String> availableEnvs() {
        return client.availableEnvs();
    }

    /** Build a live snapshot AND persist cumulative cost ticks. */
    public PrometheusLiveCostSnapshot tick(String env) {
        Instant now = Instant.now();
        if (!client.hasEnv(env)) {
            return lastKnownGoodOrEmpty(env, now, "no Prometheus endpoint configured for env=" + env);
        }

        Topology t = discovery.discover(env);
        if (!t.reachable()) {
            // Transient Prometheus failure: serve the last persisted figures
            // from Mongo accumulators so the UI doesn't flicker back to $0.
            return lastKnownGoodOrEmpty(env, now, "Prometheus returned no metrics this tick — showing last persisted values");
        }

        List<String> warnings = new ArrayList<>();

        // ----- Live VM SKU pricing -----
        // Preserve original casing — Azure {@code armSkuName} matching is case-sensitive.
        // Build per-node priced detail and a SKU → hourly index keyed by ORIGINAL SKU string.
        SkuPricing sku = priceNodes(t, warnings);
        Map<String, NodePrice> nodePrices = sku.nodePrices;
        double clusterNodeHourly = nodePrices.values().stream()
            .mapToDouble(np -> np.getHourly() + np.getOsDiskHourly()).sum();

        // ----- Pool cohort totals -----
        // System pool: nodes whose role label says "System" or whose pool name
        // contains "system". Their cost is split EQUALLY across all application
        // namespaces (platform overhead regardless of workload size).
        //
        // User / spot pools: split proportionally by CPU+memory resource.requests.
        double systemPoolVmHourly = 0d;
        double systemPoolOsDiskHourly = 0d;
        double userPoolVmHourly = 0d;
        double userPoolOsDiskHourly = 0d;
        double spotPoolVmHourly = 0d;
        double spotPoolOsDiskHourly = 0d;
        int systemNodeCount = 0;
        int userNodeCount = 0;
        int spotNodeCount = 0;
        // Track per-pool OS disk tier for component description (most common tier)
        Map<String, Integer> systemDiskTiers = new LinkedHashMap<>();
        Map<String, Integer> userDiskTiers   = new LinkedHashMap<>();
        for (Node n : t.getNodes().values()) {
            NodePrice np = nodePrices.get(n.getName());
            if (isSystemPool(n)) {
                systemNodeCount++;
                if (np != null) {
                    systemPoolVmHourly += np.hourly;
                    systemPoolOsDiskHourly += np.osDiskHourly;
                    String tier = np.osDiskTierSku != null ? np.osDiskTierSku : "E10";
                    systemDiskTiers.merge(tier, 1, Integer::sum);
                }
            } else if (isSpotPool(n)) {
                spotNodeCount++;
                if (np != null) {
                    spotPoolVmHourly += np.hourly;
                    spotPoolOsDiskHourly += np.osDiskHourly;
                    String tier = np.osDiskTierSku != null ? np.osDiskTierSku : "E10";
                    userDiskTiers.merge(tier, 1, Integer::sum);
                }
            } else {
                userNodeCount++;
                if (np != null) {
                    userPoolVmHourly += np.hourly;
                    userPoolOsDiskHourly += np.osDiskHourly;
                    String tier = np.osDiskTierSku != null ? np.osDiskTierSku : "E10";
                    userDiskTiers.merge(tier, 1, Integer::sum);
                }
            }
        }
        String systemDiskDesc = dominantDiskTierDesc(systemDiskTiers);
        String userDiskDesc   = dominantDiskTierDesc(userDiskTiers);
        double systemPoolHourly = systemPoolVmHourly + systemPoolOsDiskHourly;
        // Spot and user pools combined for proportional attribution —
        // both run user workloads and are split by CPU+memory requests.
        double userPoolHourly = userPoolVmHourly + userPoolOsDiskHourly
                              + spotPoolVmHourly + spotPoolOsDiskHourly;

        // Resource request floors — applied per-pod so every workload gets a
        // non-zero allocation even when resource.requests are not set.
        final double CPU_REQUEST_FLOOR = 0.05;             // 50m
        final double MEM_REQUEST_FLOOR = 64L * 1024 * 1024; // 64 MiB

        // Group by namespace + microservice (workload)
        Map<String, List<Pod>> podsByNs = new HashMap<>();
        Map<String, List<Pod>> podsByWorkload = new HashMap<>();
        for (Pod p : t.getPods().values()) {
            podsByNs.computeIfAbsent(p.getNamespace(), k -> new ArrayList<>()).add(p);
            String wl = p.getWorkload() == null || p.getWorkload().isBlank() ? p.getName() : p.getWorkload();
            podsByWorkload.computeIfAbsent(p.getNamespace() + "/" + wl, k -> new ArrayList<>()).add(p);
        }

        // ----- Cloud services discovered (ACR / LB / Storage / Key Vault hint) -----
        List<CloudServiceCost> cloudServices = new ArrayList<>();
        // Container Registry — one row per discovered ACR host. Standard tier price.
        for (String acrHost : t.getAcrHosts()) {
            AzurePriceRecord pr = firstPrice(
                    "serviceName eq 'Container Registry' and skuName eq 'Standard' and type eq 'Consumption'");
            double daily = pr == null ? 0.1667 : safe(pr.getRetailPrice()); // ACR Standard ~$5/mo = $0.1667/day
            String unit = pr == null ? "1 Day" : pr.getUnitOfMeasure();
            // Convert to hourly
            double hourly = unitToHourly(daily, unit);
            cloudServices.add(CloudServiceCost.builder()
                    .key("acr-" + acrHost)
                    .name("Container Registry — " + acrHost)
                    .category("registry")
                    .azureMeterId(pr == null ? null : pr.getMeterId())
                    .azureSkuName(pr == null ? "Standard" : pr.getSkuName())
                    .azureUnitPriceUsd(daily)
                    .unitOfMeasure(unit)
                    .quantity(1d)
                    .hourlyRateUsd(hourly)
                    .monthlyEstUsd(hourly * HOURS_PER_MONTH)
                    .evidence(Map.of("registryHost", acrHost))
                    .build());
        }
        // Load Balancers — record per-unit price so we can attribute to ns
        double lbHourlyPerUnit = 0d;
        AzurePriceRecord lbPr = null;
        if (t.getLoadBalancerCount() > 0) {
            lbPr = firstPrice(
                    "serviceName eq 'Load Balancer' and skuName eq 'Standard Overage' and armRegionName eq '" + defaultRegion() + "' and type eq 'Consumption'");
            if (lbPr == null) {
                lbPr = firstPrice("serviceName eq 'Load Balancer' and armRegionName eq '" + defaultRegion() + "' and type eq 'Consumption'");
            }
            double unitPrice = lbPr == null ? 0.025 : safe(lbPr.getRetailPrice());
            String unit = lbPr == null ? "1 Hour" : lbPr.getUnitOfMeasure();
            lbHourlyPerUnit = unitToHourly(unitPrice, unit);
            double hourly = lbHourlyPerUnit * t.getLoadBalancerCount();
            cloudServices.add(CloudServiceCost.builder()
                    .key("lb")
                    .name("Load Balancer × " + t.getLoadBalancerCount())
                    .category("network")
                    .azureMeterId(lbPr == null ? null : lbPr.getMeterId())
                    .azureSkuName(lbPr == null ? "Standard" : lbPr.getSkuName())
                    .azureUnitPriceUsd(unitPrice)
                    .unitOfMeasure(unit)
                    .quantity((double) t.getLoadBalancerCount())
                    .hourlyRateUsd(hourly)
                    .monthlyEstUsd(hourly * HOURS_PER_MONTH)
                    .evidence(Map.of("loadBalancers", String.valueOf(t.getLoadBalancerCount())))
                    .build());
        }
        // Storage — price each PVC live, attribute to its owning namespace,
        // and roll up to a per-storage-class line in the cloud-services table
        // so admins still see "you have 240 GB of Premium SSD".
        Map<String, Double> classToGb = new HashMap<>();
        Map<String, Double> classToHourly = new HashMap<>();
        Map<String, AzurePriceRecord> classToPrice = new HashMap<>();
        Map<String, List<NamespaceStorage>> storageByNs = new HashMap<>();
        for (Pvc p : t.getPvcs().values()) {
            String sc = p.getStorageClass() == null || p.getStorageClass().isBlank() ? "default" : p.getStorageClass();
            double gb = p.getRequestBytes() / (1024d * 1024d * 1024d);
            if (gb <= 0) continue;

            AzurePriceRecord pr = classToPrice.computeIfAbsent(sc, k -> {
                String azureSkuName = mapStorageClassToAzureSku(k);
                AzurePriceRecord found = firstPrice(
                        "serviceName eq 'Storage' and contains(productName, '" + azureSkuName + "') and armRegionName eq '"
                                + defaultRegion() + "' and type eq 'Consumption'");
                return found;
            });
            String azureSkuName = pr == null ? mapStorageClassToAzureSku(sc) : pr.getSkuName();
            int pvcGbInt = (int) Math.ceil(gb);
            boolean pvcPremium = azureSkuName.toLowerCase().contains("premium");
            boolean pvcStdSsd  = azureSkuName.toLowerCase().contains("standard ssd");
            double pvcMonthly = managedDiskTierMonthly(pvcGbInt, pvcPremium, pvcStdSsd, defaultRegion());
            double perGbMonth = gb > 0 ? pvcMonthly / gb : 0d; // for display only
            double pvcHourly = pvcMonthly / HOURS_PER_MONTH;

            classToGb.merge(sc, gb, Double::sum);
            classToHourly.merge(sc, pvcHourly, Double::sum);

            storageByNs.computeIfAbsent(p.getNamespace(), k -> new ArrayList<>())
                    .add(NamespaceStorage.builder()
                            .pvcName(p.getName())
                            .storageClass(sc)
                            .sizeGb(gb)
                            .monthlyUsd(pvcMonthly)
                            .hourlyUsd(pvcHourly)
                            .azureSkuName(azureSkuName)
                            .azureMeterId(pr == null ? null : pr.getMeterId())
                            .build());
        }
        // Roll up each storage-class total into the cloud-services list
        for (var e : classToGb.entrySet()) {
            String sc = e.getKey();
            double gb = e.getValue();
            double hourly = classToHourly.getOrDefault(sc, 0d);
            AzurePriceRecord pr = classToPrice.get(sc);
            String azureSkuName = pr == null ? mapStorageClassToAzureSku(sc) : pr.getSkuName();
            double perGbMonth = pr == null ? defaultStoragePrice(sc) : safe(pr.getRetailPrice());

            cloudServices.add(CloudServiceCost.builder()
                    .key("storage-" + sc)
                    .name("Storage · " + sc + " · " + String.format("%.1f", gb) + " GB")
                    .category("storage")
                    .azureMeterId(pr == null ? null : pr.getMeterId())
                    .azureSkuName(azureSkuName)
                    .azureUnitPriceUsd(perGbMonth)
                    .unitOfMeasure(pr == null ? "1 GB/Month" : pr.getUnitOfMeasure())
                    .quantity(gb)
                    .hourlyRateUsd(hourly)
                    .monthlyEstUsd(hourly * HOURS_PER_MONTH)
                    .evidence(Map.of(
                            "storageClass", sc,
                            "totalGB", String.format("%.2f", gb),
                            "namespacesUsing", String.valueOf(storageByNs.values().stream()
                                    .filter(list -> list.stream().anyMatch(ns -> sc.equals(ns.getStorageClass())))
                                    .count())))
                    .build());
        }

        // Project name lookup for namespaces
        Map<String, Project> nameToProject = projectRepo.findAll().stream()
                .collect(Collectors.toMap(p -> normaliseNs(p.getName()), p -> p, (a, b) -> a));

        // ===== PROPORTIONAL ALLOCATION — 100% attribution, no idle/wastage cost line =====
        //
        // Every dollar of node cost is attributed to a namespace. No "idle" category.
        //   System pool  → equal split across N application namespaces
        //   User pool    → proportional by avg(cpu_req %, mem_req %) across cluster
        //   Storage      → exact PVC ownership
        //   Network      → per-namespace LoadBalancer count
        //   Registry/Egress → equal split (shared services)
        //
        // Guarantee: sum(ns.userPoolHourly) == userPoolHourly  (normalised weights)

        // AKS control plane surcharge — only Standard tier has a fee (~$0.10/hr).
        // Free tier: $0 (just the node VMs). Added to totalHourly as cluster-level overhead
        // split equally across all namespaces (same rationale as system pool).
        double controlPlaneHourly = "standard".equalsIgnoreCase(props.getAksControlPlaneTier()) ? 0.10 : 0d;

        // Step 1: namespace union
        Set<String> nsUnion = new TreeSet<>(t.namespaces());
        nsUnion.addAll(storageByNs.keySet());
        nsUnion.addAll(t.getLoadBalancerByNamespace().keySet());
        final double lbHourlyPerUnitFinal = lbHourlyPerUnit;
        int nsCount = nsUnion.size();

        // Pre-compute which workload namespaces are RUNNING — a namespace is UP only
        // when it has at least one running pod whose name contains "service".
        // DOWN namespaces (deployment=0 or all pods are cert/infra pods) receive ZERO
        // shared overhead (system pool, registry, egress). Those costs flow entirely
        // to running namespaces so the cluster total is preserved.
        Set<String> runningProductNs = new HashSet<>();
        for (Map.Entry<String, List<Pod>> e : podsByNs.entrySet()) {
            if (isSystemNs(e.getKey())) continue;
            boolean hasServicePod = e.getValue().stream()
                    .anyMatch(p -> p.isRunning() && isApplicationPod(p));
            if (hasServicePod) runningProductNs.add(e.getKey());
        }

        // System-pool overhead is split only across RUNNING workload namespaces.
        // System namespaces run ON the system pool (circular if charged back).
        // DOWN products pay zero overhead — only direct costs (storage, network).
        long runningWorkloadCount = nsUnion.stream()
                .filter(ns -> !isSystemNs(ns))
                .filter(runningProductNs::contains)
                .count();
        long allWorkloadCount = nsUnion.stream().filter(ns -> !isSystemNs(ns)).count();
        // Fallback: if everything is DOWN, spread to all workload ns so no cost is lost
        int effectiveSystemShareCount = runningWorkloadCount > 0
                ? (int) runningWorkloadCount
                : (allWorkloadCount > 0 ? (int) allWorkloadCount : nsCount);

        // Pre-pass: sum effective CPU/mem per user-pool node (denominator for proportional share).
        // OpenCost spec: effective resource = max(request, usage).
        //   If a pod bursts above its request, it pays for what it actually consumed.
        //   If a pod under-uses its reservation, it still pays for what it reserved.
        // Example: node $1/hr, pod A eff=2 cores, pod B eff=6 cores → A pays $0.25, B pays $0.75 (total $1 ✓)
        Map<String, double[]> nodeReqTotals = new HashMap<>(); // [totalEffCpu, totalEffMemBytes]
        for (Pod p : t.getPods().values()) {
            if (p.getNode() == null) continue;
            Node pn = t.getNodes().get(p.getNode());
            if (pn == null || isSystemPool(pn)) continue;
            double[] tot = nodeReqTotals.computeIfAbsent(p.getNode(), k -> new double[]{0d, 0d});
            // effective = max(request, usage) then clamp to floor
            tot[0] += Math.max(Math.max(p.getCpuRequestCores(), p.getCpuCores()), CPU_REQUEST_FLOOR);
            tot[1] += Math.max(Math.max(p.getMemoryRequestBytes(), p.getMemoryBytes()), MEM_REQUEST_FLOOR);
        }

        // Step 2: per-pod per-node attribution.
        // Denominator = total requests on that node → 100% of (VM + OS disk) cost flows to pods.
        // Spot pods automatically get spot node prices; system-pool pods handled by equal-split below.
        Map<String, Double> nsCpuReqAgg  = new HashMap<>();
        Map<String, Double> nsMemReqAgg  = new HashMap<>();
        // Tracks each namespace's share of its node's total CPU/mem requests (for description %)
        Map<String, Double> nsCpuFracAgg = new HashMap<>();
        Map<String, Double> nsMemFracAgg = new HashMap<>();
        Map<String, WorkloadAttrib> workloadAttribs = new HashMap<>();
        Map<String, Double> nsCpuHourlyMap = new LinkedHashMap<>();
        Map<String, Double> nsMemHourlyMap = new LinkedHashMap<>();

        for (Pod p : t.getPods().values()) {
            // OpenCost: effective resource = max(request, usage) — charge for reservation OR actual, whichever is larger
            double cr = Math.max(Math.max(p.getCpuRequestCores(), p.getCpuCores()), CPU_REQUEST_FLOOR);
            double mr = Math.max(Math.max(p.getMemoryRequestBytes(), p.getMemoryBytes()), MEM_REQUEST_FLOOR);
            nsCpuReqAgg.merge(p.getNamespace(), cr, Double::sum);
            nsMemReqAgg.merge(p.getNamespace(), mr, Double::sum);

            Node podNode = p.getNode() != null ? t.getNodes().get(p.getNode()) : null;
            NodePrice podNp = podNode != null ? nodePrices.get(p.getNode()) : null;

            double podCpuH = 0d, podMemH = 0d, allocShare = 0d;
            String vmSize = null;
            boolean isSpot = false;

            if (podNode != null && podNp != null && podNp.hourly > 0 && !isSystemPool(podNode)) {
                double[] totals        = nodeReqTotals.getOrDefault(p.getNode(), new double[]{1e-9, 1e-9});
                double nodeCpuReqTotal = Math.max(totals[0], 1e-9);
                double nodeMemReqGbTotal = Math.max(totals[1] / (1024d * 1024d * 1024d), 1e-9);
                double memEffGb        = mr / (1024d * 1024d * 1024d);
                // Full node hourly = VM + OS disk; pod's share = its effective resource / total effective on node
                double nodeHourlyFull  = podNp.hourly + podNp.osDiskHourly;
                double cpuFrac  = cr / nodeCpuReqTotal;
                double memFrac  = memEffGb / nodeMemReqGbTotal;
                // 50% of node cost attributed via CPU dimension, 50% via RAM dimension
                // (when per-resource Azure prices are not available, 50/50 is the principled default)
                podCpuH    = cpuFrac * nodeHourlyFull * 0.5;
                podMemH    = memFrac * nodeHourlyFull * 0.5;
                allocShare = (cpuFrac + memFrac) / 2d;
                nsCpuFracAgg.merge(p.getNamespace(), cpuFrac, Double::sum);
                nsMemFracAgg.merge(p.getNamespace(), memFrac, Double::sum);
                vmSize = (podNode.getVmSize() != null && !podNode.getVmSize().isBlank())
                        ? podNode.getVmSize()
                        : (podNp.vmSize != null ? podNp.vmSize : null);
                isSpot = isSpotPool(podNode);
            }

            String wl = p.getWorkload() == null || p.getWorkload().isBlank() ? p.getName() : p.getWorkload();
            workloadAttribs
                    .computeIfAbsent(p.getNamespace() + "/" + wl, k -> new WorkloadAttrib())
                    .addPod(podCpuH, podMemH, allocShare, p.getNode(), vmSize, isSpot);

            nsCpuHourlyMap.merge(p.getNamespace(), podCpuH, Double::sum);
            nsMemHourlyMap.merge(p.getNamespace(), podMemH, Double::sum);
        }
        // Ensure every namespace has an entry even if it has no pods
        for (String ns : nsUnion) {
            nsCpuReqAgg.putIfAbsent(ns, CPU_REQUEST_FLOOR);
            nsMemReqAgg.putIfAbsent(ns, MEM_REQUEST_FLOOR);
            nsCpuFracAgg.putIfAbsent(ns, 0d);
            nsMemFracAgg.putIfAbsent(ns, 0d);
            nsCpuHourlyMap.putIfAbsent(ns, 0d);
            nsMemHourlyMap.putIfAbsent(ns, 0d);
        }
        double clusterCpuReqTotal = Math.max(nsCpuReqAgg.values().stream().mapToDouble(v -> v).sum(), 1e-9);
        double clusterMemReqTotal = Math.max(nsMemReqAgg.values().stream().mapToDouble(v -> v).sum(), 1e-9);

        // Step 3: close the attribution gap.
        // Some user-pool nodes may host pods whose namespaces are filtered out of
        // the topology (e.g. monitoring, prometheus on a user node). Their cost is
        // already in userPoolHourly but no pod claims it. Distribute the gap
        // proportionally to workload namespaces by their effective CPU fraction.
        // This ensures invariant: sum(ns.computeHourly) == userPoolHourly exactly.
        double userPoolAttributed = nsCpuHourlyMap.values().stream().mapToDouble(v -> v).sum()
                + nsMemHourlyMap.values().stream().mapToDouble(v -> v).sum();
        double userPoolGap = userPoolHourly - userPoolAttributed;
        if (userPoolGap > 1e-6 && effectiveSystemShareCount > 0) {
            // Distribute the gap proportionally by each workload namespace's CPU request weight
            double workloadCpuTotal = nsUnion.stream()
                    .filter(ns -> !isSystemNs(ns))
                    .mapToDouble(ns -> nsCpuReqAgg.getOrDefault(ns, CPU_REQUEST_FLOOR))
                    .sum();
            workloadCpuTotal = Math.max(workloadCpuTotal, 1e-9);
            for (String ns : nsUnion) {
                if (isSystemNs(ns)) continue;
                double weight = nsCpuReqAgg.getOrDefault(ns, CPU_REQUEST_FLOOR) / workloadCpuTotal;
                double share = userPoolGap * weight;
                nsCpuHourlyMap.merge(ns, share * 0.5, Double::sum);
                nsMemHourlyMap.merge(ns, share * 0.5, Double::sum);
            }
        }

        // Step 4: shared cost lines
        // System-pool + control-plane overhead → workload namespaces only (not circular)
        double systemSharePerWorkloadNs = effectiveSystemShareCount > 0
                ? (systemPoolHourly + controlPlaneHourly) / effectiveSystemShareCount : 0d;
        double registryTotalHourly = cloudServices.stream()
                .filter(cs -> "registry".equals(cs.getCategory()))
                .mapToDouble(cs -> safe(cs.getHourlyRateUsd())).sum();
        // Registry and egress are workload costs — system namespaces don't pull from ACR
        // or generate billable internet egress. Split to workload namespaces only.
        double registrySharePerWorkloadNs = effectiveSystemShareCount > 0 ? registryTotalHourly / effectiveSystemShareCount : 0d;
        double egressBytesPerSec = t.getNetworkTransmitBytesPerSec();
        double egressRawGbPerMonth = (egressBytesPerSec * 60d * 60d * HOURS_PER_MONTH) / 1e9;
        double egressGbPerMonth = egressRawGbPerMonth * props.getEgressInternetFraction();
        double egressBillableGb = Math.max(0d, egressGbPerMonth - 100d);
        double egressMonthly = egressBillableGb * 0.087;
        double egressHourlyTotal = egressMonthly / HOURS_PER_MONTH;
        double egressSharePerWorkloadNs = effectiveSystemShareCount > 0 ? egressHourlyTotal / effectiveSystemShareCount : 0d;

        // Step 5: build microservice cost rows using per-pod per-node attribution from workloadAttribs
        Map<String, List<MicroserviceCost>> microsByNs = new HashMap<>();
        for (var ent : podsByWorkload.entrySet()) {
            String[] wlSplit = ent.getKey().split("/", 2);
            String ns = wlSplit[0];
            String ms = wlSplit[1];
            List<Pod> pods = ent.getValue();
            double cpu = pods.stream().mapToDouble(Pod::getCpuCores).sum();
            double mem = pods.stream().mapToDouble(Pod::getMemoryBytes).sum();
            double cpuReq = pods.stream().mapToDouble(p -> Math.max(p.getCpuRequestCores(), CPU_REQUEST_FLOOR)).sum();
            double memReq = pods.stream().mapToDouble(p -> Math.max(p.getMemoryRequestBytes(), MEM_REQUEST_FLOOR)).sum();
            int replicas = (int) pods.stream().filter(Pod::isRunning).count();
            int restarts = pods.stream().mapToInt(Pod::getRestarts).sum();
            String image = pods.stream().flatMap(p -> p.getImages().stream()).findFirst().orElse(null);

            // Use per-pod per-node attribution: cost already computed per pod in Step 2
            WorkloadAttrib wa = workloadAttribs.get(ent.getKey());
            double msCpuHourly = wa != null ? wa.cpuHourly : 0d;
            double msMemHourly = wa != null ? wa.memHourly : 0d;
            double msComputeHourly = msCpuHourly + msMemHourly;
            double msCombinedW = wa != null ? wa.avgAllocShare() : 0d;

            PrometheusCostAccumulator acc = upsertAccumulator(env, "microservice", ns + "/" + ms, "compute",
                    ns, ms, null, msComputeHourly, cpu, mem / (1024d * 1024d * 1024d), replicas, now);
            double smoothed = safe(acc.getSmoothedRateUsd());

            PrometheusDiscoveryService.HorizontalAutoscaler hpa = t.getHpas().values().stream()
                    .filter(h -> ns.equals(h.getNamespace())
                            && (ms.equalsIgnoreCase(h.getTargetName()) || ms.equalsIgnoreCase(h.getName())))
                    .findFirst().orElse(null);

            microsByNs.computeIfAbsent(ns, k -> new ArrayList<>()).add(MicroserviceCost.builder()
                    .name(ms).namespace(ns).replicas(replicas)
                    .cpuCores(cpu).memoryGb(mem / (1024d * 1024d * 1024d))
                    .cpuRequestCores(cpuReq).memoryRequestGb(memReq / (1024d * 1024d * 1024d))
                    .hourlyRateUsd(msComputeHourly).smoothedHourlyUsd(smoothed)
                    .computeHourlyUsd(msCpuHourly).memoryHourlyUsd(msMemHourly)
                    .dailyEstUsd(msComputeHourly * HOURS_PER_DAY).monthlyEstUsd(msComputeHourly * HOURS_PER_MONTH)
                    .monthToDateUsd(safe(acc.getMonthToDateUsd())).cumulativeUsd(safe(acc.getCumulativeUsd()))
                    .uptimeSeconds(acc.getUptimeSeconds()).restarts(restarts).image(image)
                    .allocationShare(msCombinedW)
                    .nodeName(wa != null ? wa.displayNodeName() : null)
                    .nodeVmSize(wa != null ? wa.displayVmSize() : null)
                    .nodeIsSpot(wa != null ? wa.anySpot : null)
                    .hpaMinReplicas(hpa == null ? null : hpa.getMinReplicas())
                    .hpaMaxReplicas(hpa == null ? null : hpa.getMaxReplicas())
                    .hpaCurrentReplicas(hpa == null ? null : hpa.getCurrentReplicas())
                    .build());
        }

        // Step 6: build namespace cost rows
        List<NamespaceCost> namespaceCosts = new ArrayList<>();
        double totalHourly = 0d;
        double totalMtd = 0d;
        double totalCum = 0d;
        for (String ns : nsUnion) {
            List<Pod> pods = podsByNs.getOrDefault(ns, List.of());
            double cpu = pods.stream().mapToDouble(Pod::getCpuCores).sum();
            double mem = pods.stream().mapToDouble(Pod::getMemoryBytes).sum();
            double cpuReq = pods.stream().mapToDouble(Pod::getCpuRequestCores).sum();
            double memReq = pods.stream().mapToDouble(Pod::getMemoryRequestBytes).sum();

            // OpenCost model: CPU and RAM dimensions are attributed independently
            double nsCpuAgg = nsCpuReqAgg.getOrDefault(ns, CPU_REQUEST_FLOOR);
            double nsMemAgg = nsMemReqAgg.getOrDefault(ns, MEM_REQUEST_FLOOR);
            double cpuHourly = nsCpuHourlyMap.getOrDefault(ns, 0d);
            double memHourly = nsMemHourlyMap.getOrDefault(ns, 0d);
            double userShareNs = cpuHourly + memHourly;

            List<NamespaceStorage> nsStorage = storageByNs.getOrDefault(ns, List.of());
            double storageHourly = nsStorage.stream().mapToDouble(NamespaceStorage::getHourlyUsd).sum();

            int nsLbCount = t.getLoadBalancerByNamespace().getOrDefault(ns, 0);
            double networkHourly = nsLbCount * lbHourlyPerUnitFinal;
            int nsIngressCount = t.getIngressCountByNamespace().getOrDefault(ns, 0);

            // Overhead rules:
            //  - System namespaces: never pay overhead (circular — they run on the system pool).
            //  - DOWN workload namespaces: never pay overhead — system pool, registry and egress
            //    are services used only by running workloads. Cost flows entirely to running ones.
            //  - UP workload namespaces: pay their equal share of shared overhead.
            boolean isSys    = isSystemNs(ns);
            boolean isRunning = runningProductNs.contains(ns);
            double sysShare      = (isSys || !isRunning) ? 0d : systemSharePerWorkloadNs;
            double registryShare = (isSys || !isRunning) ? 0d : registrySharePerWorkloadNs;
            double egressShare   = (isSys || !isRunning) ? 0d : egressSharePerWorkloadNs;
            // Total: system + compute + storage + network + registry + egress
            double hourly = sysShare + userShareNs + storageHourly
                    + networkHourly + registryShare + egressShare;

            PrometheusCostAccumulator acc = upsertAccumulator(env, "namespace", ns, "total",
                    ns, null, null, hourly, cpu, mem / (1024d * 1024d * 1024d), pods.size(), now);
            double smoothed = safe(acc.getSmoothedRateUsd());

            List<NamespaceServiceLine> serviceLines = new ArrayList<>();
            if (sysShare > 0) {
                serviceLines.add(line("system", "System pool + Control plane (split to workload ns)",
                        (double) effectiveSystemShareCount, "ns", sysShare,
                        String.format("%d system nodes $%.4f/hr (VM+disk) + control plane $%.4f/hr = $%.4f/hr ÷ %d workload ns = $%.4f/hr each",
                                systemNodeCount, systemPoolHourly, controlPlaneHourly,
                                systemPoolHourly + controlPlaneHourly, effectiveSystemShareCount, sysShare)));
            }
            if (userShareNs > 0) {
                // OpenCost: effective = max(req, usage). nsCpuAgg already holds max(req,usage) sum.
                double nsCpuFrac = nsCpuFracAgg.getOrDefault(ns, 0d);
                double nsMemFrac = nsMemFracAgg.getOrDefault(ns, 0d);
                serviceLines.add(line("compute", "Compute — CPU cost",
                        nsCpuAgg, "cores", cpuHourly,
                        String.format("%.3f cores eff [max(req,usage)] = %.1f%% on node(s) → × (vmHourly+diskHourly) × 50%% = $%.5f/hr",
                                nsCpuAgg, nsCpuFrac * 100d, cpuHourly)));
                serviceLines.add(line("memory", "Compute — Memory cost",
                        nsMemAgg / (1024d * 1024d * 1024d),
                        "GB", memHourly,
                        String.format("%.2f GB eff [max(req,usage)] = %.1f%% on node(s) → × (vmHourly+diskHourly) × 50%% = $%.5f/hr",
                                nsMemAgg / (1024d * 1024d * 1024d), nsMemFrac * 100d, memHourly)));
            }
            for (NamespaceStorage s : nsStorage) {
                serviceLines.add(line("storage", "Storage · " + s.getStorageClass() + " (" + s.getPvcName() + ")",
                        s.getSizeGb(), "GB", safe(s.getHourlyUsd()),
                        String.format("%.1f GB actual → %s (Azure managed disk tier) · Azure retail $%.2f/mo = $%.5f/hr",
                                s.getSizeGb(),
                                s.getAzureSkuName() != null ? s.getAzureSkuName() : "Managed Disk",
                                safe(s.getMonthlyUsd()), safe(s.getHourlyUsd()))));
            }
            if (nsLbCount > 0 && lbHourlyPerUnitFinal > 0) {
                serviceLines.add(line("network", "Load Balancer × " + nsLbCount,
                        (double) nsLbCount, "LB", networkHourly,
                        String.format("Azure LB Standard $%.5f/hr each (Azure Retail %s) · %d × $%.5f = $%.5f/hr",
                                lbHourlyPerUnitFinal, defaultRegion(), nsLbCount, lbHourlyPerUnitFinal, networkHourly)));
            }
            if (nsIngressCount > 0) {
                serviceLines.add(line("network", "Ingress rules × " + nsIngressCount,
                        (double) nsIngressCount, "rule", 0d,
                        "No direct charge — traffic handled by cluster ingress controller (not billed per-rule)"));
            }
            if (registryShare > 0) {
                serviceLines.add(line("registry", "Container Registry (split to workload ns)",
                        (double) effectiveSystemShareCount, "ns", registryShare,
                        String.format("ACR Standard $%.2f/mo total = $%.5f/hr ÷ %d workload ns = $%.5f/hr each",
                                registryTotalHourly * HOURS_PER_MONTH, registryTotalHourly, effectiveSystemShareCount, registryShare)));
            }
            if (egressShare > 0) {
                serviceLines.add(line("network", "Outbound egress (estimated, split to workload ns)",
                        (double) effectiveSystemShareCount, "ns", egressShare,
                        String.format("%.0f GB/mo NIC × %.0f%% internet = %.0f GB/mo − 100 GB free = %.0f GB × $0.087 = $%.2f/mo ÷ %d workload ns = $%.5f/hr",
                                egressRawGbPerMonth, props.getEgressInternetFraction() * 100d,
                                egressGbPerMonth, Math.max(0d, egressGbPerMonth - 100d),
                                egressMonthly, effectiveSystemShareCount, egressShare)));
            }

            Project proj = nameToProject.get(normaliseNs(ns));
            namespaceCosts.add(NamespaceCost.builder()
                    .namespace(ns)
                    .matchedProjectId(proj == null ? null : proj.getId())
                    .matchedProjectName(proj == null ? null : proj.getName())
                    .cpuCores(cpu).memoryGb(mem / (1024d * 1024d * 1024d))
                    .cpuRequestCores(cpuReq).memoryRequestGb(memReq / (1024d * 1024d * 1024d))
                    .podCount(pods.size()).microserviceCount(microsByNs.getOrDefault(ns, List.of()).size())
                    .hourlyRateUsd(hourly).smoothedHourlyUsd(smoothed)
                    .computeHourlyUsd(cpuHourly).memoryHourlyUsd(memHourly)
                    .storageHourlyUsd(storageHourly).networkHourlyUsd(networkHourly)
                    .dailyEstUsd(hourly * HOURS_PER_DAY).monthlyEstUsd(hourly * HOURS_PER_MONTH)
                    .monthToDateUsd(safe(acc.getMonthToDateUsd())).cumulativeUsd(safe(acc.getCumulativeUsd()))
                    .uptimeSeconds(acc.getUptimeSeconds())
                    .allocationShare((nsCpuAgg / clusterCpuReqTotal + nsMemAgg / clusterMemReqTotal) / 2d)
                    .storage(nsStorage).serviceLines(serviceLines)
                    .microservices(microsByNs.getOrDefault(ns, List.of()))
                    .build());
            totalHourly += hourly;
            totalMtd += safe(acc.getMonthToDateUsd());
            totalCum += safe(acc.getCumulativeUsd());
        }

        // No idle cost line — all node cost is proportionally attributed to namespaces.
        // sum(ns.userShareNs) == userPoolHourly by construction (normalised weights).
        double idleHourly = 0d;

        // Persist cumulative ticks for cloud services for display, but don't
        // re-add them to the totals — storage and registry are already inside
        // each namespace.hourlyRateUsd via the equal-split / PVC-ownership rules.
        for (CloudServiceCost cs : cloudServices) {
            PrometheusCostAccumulator acc = upsertAccumulator(env, "cloud-service", cs.getKey(), cs.getCategory(),
                    null, null, cs.getName(), safe(cs.getHourlyRateUsd()),
                    null, null, null, now);
            cs.setMonthToDateUsd(safe(acc.getMonthToDateUsd()));
            cs.setCumulativeUsd(safe(acc.getCumulativeUsd()));
            // Only the LB ($/hr) cloud-service line is not yet inside any namespace
            // attribution we trust — but namespace.networkHourly already covers it
            // exactly (per-ns LB count × per-unit price). So we skip ALL cloud-service
            // categories from the global total to avoid double counting.
        }

        // Cluster totals
        double totalCpu = t.getNodes().values().stream().mapToDouble(Node::getCpuCores).sum();
        double totalMem = t.getNodes().values().stream().mapToDouble(Node::getMemoryBytes).sum() / (1024d * 1024d * 1024d);
        double usedCpu = t.getPods().values().stream().mapToDouble(Pod::getCpuCores).sum();
        double usedMem = t.getPods().values().stream().mapToDouble(Pod::getMemoryBytes).sum() / (1024d * 1024d * 1024d);

        // Build per-SKU display map (one representative price per distinct SKU)
        Map<String, Double> skuToHourly = new LinkedHashMap<>();
        for (NodePrice np : nodePrices.values()) {
            if (np.vmSize != null && !np.vmSize.isBlank()) {
                skuToHourly.putIfAbsent(np.vmSize, np.hourly);
            }
        }

        // ----- Build component breakdown (sums to 100%) -----
        // Each cost line in the cluster gets a row with $/hr, $/day, $/month and
        // its % of total. The UI renders this as a stacked bar so admins see at
        // a glance where the money goes.
        // 100% of user pool is attributed proportionally — no idle line.
        double sumUserAllocated = userPoolHourly;
        double sumStorage = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getStorageHourlyUsd())).sum();
        double sumNetwork = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getNetworkHourlyUsd())).sum();
        double sumRegistry = registryTotalHourly;
        double sumEgress = egressHourlyTotal;
        // Informational wastage%: how much of user-pool CPU capacity is unrequested.
        double userPoolCpuCapacity = t.getNodes().values().stream()
                .filter(n -> !isSystemPool(n)).mapToDouble(Node::getCpuCores).sum();
        double userPoolCpuRequested = nsCpuReqAgg.values().stream().mapToDouble(v -> v).sum();
        double userPoolWastagePct = userPoolCpuCapacity > 0
                ? Math.max(0d, (userPoolCpuCapacity - Math.min(userPoolCpuRequested, userPoolCpuCapacity))
                        / userPoolCpuCapacity * 100d)
                : 0d;

        List<ComponentLine> componentBreakdown = new ArrayList<>();
        int pvcCount = t.getPvcs().size();

        // AKS Control plane — always shown (even when $0 on free tier)
        componentBreakdown.add(componentLine(
                "control-plane",
                "AKS Control Plane",
                controlPlaneHourly, totalHourly,
                "standard".equalsIgnoreCase(props.getAksControlPlaneTier())
                    ? "Standard tier · Uptime SLA · $0.10/hr"
                    : "Free tier · no SLA · $0.00/hr"));

        // System node pool VMs — always shown with count (shows 0 if undetected)
        componentBreakdown.add(componentLine(
                "system-vms",
                "System node pool VMs · " + systemNodeCount + " node" + (systemNodeCount == 1 ? "" : "s"),
                systemPoolVmHourly, totalHourly,
                systemNodeCount == 0
                    ? "No system-pool nodes detected — check agentPool/role labels on nodes"
                    : systemNodeCount + " system node" + (systemNodeCount == 1 ? "" : "s")
                        + " · equal split across " + nsCount + " namespace" + (nsCount == 1 ? "" : "s")));

        // System pool OS disks — only shown when they have a non-zero cost
        if (systemPoolOsDiskHourly > 0) componentBreakdown.add(componentLine(
                "system-osdisks",
                "System pool OS disks · " + systemNodeCount + " disk" + (systemNodeCount == 1 ? "" : "s"),
                systemPoolOsDiskHourly, totalHourly,
                systemNodeCount + " managed OS disk" + (systemNodeCount == 1 ? "" : "s")
                    + " · " + systemDiskDesc));

        // User node pool VMs — always shown with count
        componentBreakdown.add(componentLine(
                "user-vms",
                "User node pool VMs · " + userNodeCount + " node" + (userNodeCount == 1 ? "" : "s"),
                userPoolVmHourly, totalHourly,
                userNodeCount == 0
                    ? "No user-pool nodes detected"
                    : userNodeCount + " user node" + (userNodeCount == 1 ? "" : "s")
                        + " · proportional by CPU+memory resource.requests · on-demand pricing"));

        // User pool OS disks — only shown when they have a non-zero cost
        if (userPoolOsDiskHourly > 0) componentBreakdown.add(componentLine(
                "user-osdisks",
                "User pool OS disks · " + userNodeCount + " disk" + (userNodeCount == 1 ? "" : "s"),
                userPoolOsDiskHourly, totalHourly,
                userNodeCount + " managed OS disk" + (userNodeCount == 1 ? "" : "s")
                    + " · " + userDiskDesc));

        // Spot node pool VMs — always shown with count (shows 0 if none detected)
        componentBreakdown.add(componentLine(
                "spot-vms",
                "Spot node pool VMs · " + spotNodeCount + " node" + (spotNodeCount == 1 ? "" : "s"),
                spotPoolVmHourly, totalHourly,
                spotNodeCount == 0
                    ? "No spot-pool nodes detected"
                    : spotNodeCount + " spot node" + (spotNodeCount == 1 ? "" : "s")
                        + " · proportional by CPU+memory resource.requests · spot pricing (~60-90% cheaper)"));

        // Spot pool OS disks — only shown when they have a non-zero cost
        if (spotPoolOsDiskHourly > 0) componentBreakdown.add(componentLine(
                "spot-osdisks",
                "Spot pool OS disks · " + spotNodeCount + " disk" + (spotNodeCount == 1 ? "" : "s"),
                spotPoolOsDiskHourly, totalHourly,
                spotNodeCount + " managed OS disk" + (spotNodeCount == 1 ? "" : "s")
                    + " · billed at on-demand managed disk rates (same as regular nodes)"));

        // Persistent storage
        if (sumStorage > 0) componentBreakdown.add(componentLine(
                "storage",
                "Persistent storage · " + pvcCount + " PVC" + (pvcCount == 1 ? "" : "s"),
                sumStorage, totalHourly,
                pvcCount + " PVC" + (pvcCount == 1 ? "" : "s")
                    + " · per-PVC live Azure managed-disk tier pricing (P4/P6/P10…)"));

        // Network (Load Balancers)
        if (sumNetwork > 0) componentBreakdown.add(componentLine(
                "network",
                "Network · " + t.getLoadBalancerCount() + " Load Balancer" + (t.getLoadBalancerCount() == 1 ? "" : "s"),
                sumNetwork, totalHourly,
                t.getLoadBalancerCount() + " LB" + (t.getLoadBalancerCount() == 1 ? "" : "s")
                    + " · Azure Standard LB · per-namespace attribution"));

        // Container Registry
        if (sumRegistry > 0) componentBreakdown.add(componentLine(
                "registry",
                "Container Registry · " + t.getAcrHosts().size() + " ACR",
                sumRegistry, totalHourly,
                "ACR Standard · split equally across " + nsCount + " namespace" + (nsCount == 1 ? "" : "s")));

        // Egress — estimate only, with fraction clearly shown
        if (sumEgress > 0) componentBreakdown.add(componentLine(
                "egress",
                "Outbound egress (estimated)",
                sumEgress, totalHourly,
                String.format("%.0f GB/mo physical NIC × %.0f%% internet = %.0f GB/mo − 100 GB free = %.0f GB × $0.087 = $%.2f/mo",
                        egressRawGbPerMonth, props.getEgressInternetFraction() * 100d,
                        egressGbPerMonth, Math.max(0d, egressGbPerMonth - 100d), egressMonthly)));

        ClusterTotals cluster = ClusterTotals.builder()
                .nodeCount(t.getNodes().size())
                .totalCpuCores(totalCpu)
                .totalMemoryGb(totalMem)
                .usedCpuCores(usedCpu)
                .usedMemoryGb(usedMem)
                .cpuUtilPct(totalCpu > 0 ? (usedCpu / totalCpu) * 100d : 0d)
                .memoryUtilPct(totalMem > 0 ? (usedMem / totalMem) * 100d : 0d)
                .nodeHourlyUsd(clusterNodeHourly)
                .vmSkuToHourly(skuToHourly)
                .componentBreakdown(componentBreakdown)
                .userPoolWastagePct(userPoolWastagePct)
                .userPoolWastageUsd(0d)
                .userPoolAllocatedUsd(sumUserAllocated)
                .build();

        // Per-node detail list — surfaces what each node is, what it costs,
        // and how much of its capacity is currently claimed.
        List<NodeDetail> nodeDetails = new ArrayList<>();
        for (Node n : t.getNodes().values()) {
            NodePrice np = nodePrices.get(n.getName());
            double cpuUsed = t.getPods().values().stream()
                    .filter(p -> n.getName().equals(p.getNode()))
                    .mapToDouble(Pod::getCpuCores).sum();
            double memUsed = t.getPods().values().stream()
                    .filter(p -> n.getName().equals(p.getNode()))
                    .mapToDouble(Pod::getMemoryBytes).sum();
            double cpuReq = t.getPods().values().stream()
                    .filter(p -> n.getName().equals(p.getNode()))
                    .mapToDouble(Pod::getCpuRequestCores).sum();
            double memReq = t.getPods().values().stream()
                    .filter(p -> n.getName().equals(p.getNode()))
                    .mapToDouble(Pod::getMemoryRequestBytes).sum();
            double nodeMemGb = n.getMemoryBytes() / (1024d * 1024d * 1024d);
            double cpuPerCore = (np != null && n.getCpuCores() > 0) ? (np.hourly * 0.5) / n.getCpuCores() : 0d;
            double memPerGb = (np != null && nodeMemGb > 0) ? (np.hourly * 0.5) / nodeMemGb : 0d;

            // Per-namespace breakdown for THIS node — which teams are using it
            // and how much (max(cpu_share, mem_share) × node hourly).
            Map<String, double[]> nsAccum = new HashMap<>();
            for (Pod p : t.getPods().values()) {
                if (!n.getName().equals(p.getNode())) continue;
                double[] arr = nsAccum.computeIfAbsent(p.getNamespace(), k -> new double[2]);
                arr[0] += Math.max(p.getCpuRequestCores(), 0.05);
                arr[1] += Math.max(p.getMemoryRequestBytes(), 64L * 1024 * 1024);
            }
            List<NodeNamespaceShare> nsShares = new ArrayList<>();
            for (var entry : nsAccum.entrySet()) {
                double cpuC = entry.getValue()[0];
                double memB = entry.getValue()[1];
                double cpuShare = n.getCpuCores() > 0 ? cpuC / n.getCpuCores() : 0d;
                double memShare = n.getMemoryBytes() > 0 ? memB / n.getMemoryBytes() : 0d;
                double share = Math.max(cpuShare, memShare);
                double hourlyAlloc = share * (np == null ? 0d : np.hourly);
                nsShares.add(NodeNamespaceShare.builder()
                        .namespace(entry.getKey())
                        .cpuRequestCores(cpuC)
                        .memoryRequestGb(memB / (1024d * 1024d * 1024d))
                        .sharePct(share * 100d)
                        .hourlyUsd(hourlyAlloc)
                        .build());
            }
            nsShares.sort((a, b) -> Double.compare(safe(b.getHourlyUsd()), safe(a.getHourlyUsd())));

            // Prefer the label-derived vmSize; fall back to whatever the pricing engine matched
            // (from fuzzy or exact lookup) when the Prometheus label was absent.
            String displayVmSize = (n.getVmSize() != null && !n.getVmSize().isBlank())
                    ? n.getVmSize()
                    : (np != null && np.vmSize != null && !np.vmSize.isBlank() ? np.vmSize : null);
            nodeDetails.add(NodeDetail.builder()
                    .name(n.getName())
                    .vmSize(displayVmSize)
                    .region(n.getRegion())
                    .agentPool(n.getAgentPool())
                    .role(n.getRole())
                    .zone(n.getZone())
                    .cpuCores(n.getCpuCores())
                    .memoryGb(nodeMemGb)
                    .cpuUsedCores(cpuUsed)
                    .memoryUsedGb(memUsed / (1024d * 1024d * 1024d))
                    .cpuRequestedCores(cpuReq)
                    .memoryRequestedGb(memReq / (1024d * 1024d * 1024d))
                    .cpuRequestedPct(n.getCpuCores() > 0 ? (cpuReq / n.getCpuCores()) * 100d : 0d)
                    .memoryRequestedPct(n.getMemoryBytes() > 0 ? (memReq / n.getMemoryBytes()) * 100d : 0d)
                    .hourlyUsd(np == null ? 0d : np.hourly + np.osDiskHourly)
                    .cpuPerCoreHourlyUsd(cpuPerCore)
                    .memoryPerGbHourlyUsd(memPerGb)
                    .azureMeterId(np == null ? null : np.meterId)
                    .azureSkuName(np == null ? null : np.skuName)
                    .azureProductName(np == null ? null : np.productName)
                    .pricingMatch(np == null ? "none" : np.match)
                    .osDiskTierSku(np == null ? null : np.osDiskTierSku)
                    .osDiskSizeGb(np == null ? null : (np.osDiskSizeGb > 0 ? np.osDiskSizeGb : 128))
                    .osDiskHourlyUsd(np == null ? null : np.osDiskHourly)
                    .osDiskMonthlyUsd(np == null ? null : np.osDiskHourly * HOURS_PER_MONTH)
                    .namespaceShares(nsShares)
                    .build());
        }

        Diagnostics diagnostics = Diagnostics.builder()
                .nodesTotal(t.getNodes().size())
                .nodesWithVmSize((int) t.getNodes().values().stream()
                        .filter(n -> n.getVmSize() != null && !n.getVmSize().isBlank()).count())
                .nodesPriced((int) nodePrices.values().stream().filter(np -> np.hourly > 0).count())
                .vmSkusObserved(new ArrayList<>(sku.observedSkus))
                .vmSkusUnmatched(new ArrayList<>(sku.unmatchedSkus))
                .vmSkusFuzzyMatched(new ArrayList<>(sku.fuzzyMatchedSkus))
                .podsTotal(t.getPods().size())
                .podsWithRequests((int) t.getPods().values().stream()
                        .filter(p -> p.getCpuRequestCores() > 0 || p.getMemoryRequestBytes() > 0).count())
                .pvcsTotal(t.getPvcs().size())
                .acrHostsObserved(t.getAcrHosts().size())
                .loadBalancersObserved(t.getLoadBalancerCount())
                .allocationModel("proportional: system pool equal-split; user pool by cpu+mem requests; network/registry/egress equal-split")
                .warnings(warnings)
                .build();

        // Smoothed total = sum of every namespace's smoothed rate.
        // System pool, storage, registry, network and egress are already inside each
        // namespace's smoothed rate, so no other terms to add. No idle line.
        double smoothedHourly = namespaceCosts.stream().mapToDouble(nsc -> safe(nsc.getSmoothedHourlyUsd())).sum();

        // ----- Compute every namespace's % of total cluster cost -----
        double clusterBillForPct = totalHourly > 0 ? totalHourly : 1d;
        for (NamespaceCost nc : namespaceCosts) {
            nc.setPercentOfClusterTotal((safe(nc.getHourlyRateUsd()) / clusterBillForPct) * 100d);
        }

        // ----- Step 7: Product cost view -----
        // Product namespaces: those whose name starts with the env key (e.g. "qa-frontend" in env "qa").
        // Supportive namespaces (kube-system, monitoring, ingress-nginx, cert-manager, …) have no direct
        // product owner — their costs are redistributed proportionally to product namespaces by compute weight.
        // Guarantee: sum(product.totalHourlyUsd) == totalHourly  (no cost lost or double-counted).
        List<PrometheusLiveCostSnapshot.ProductCost> products = buildProductView(env, namespaceCosts, podsByNs);

        // ----- Fixed / inventory view -----
        InventoryView inventory = buildInventory(t, nodePrices, classToGb, classToHourly, classToPrice, lbHourlyPerUnitFinal, cloudServices);

        // ===== Reconciliation: 7 accounting invariants computed every tick =====
        // If all pass, the cost engine is 100% internally consistent — every dollar
        // that enters from Azure pricing exits through a namespace or component line.
        double totalPvcHourly      = classToHourly.values().stream().mapToDouble(v -> v).sum();
        double totalLbHourly       = lbHourlyPerUnitFinal * t.getLoadBalancerCount();
        double sharedOverheadTotal = systemPoolHourly + controlPlaneHourly + registryTotalHourly + egressHourlyTotal;

        double sumNsHourly      = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getHourlyRateUsd())).sum();
        double sumComputeHourly = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getComputeHourlyUsd()) + safe(nc.getMemoryHourlyUsd())).sum();
        double sumStorageHourly = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getStorageHourlyUsd())).sum();
        double sumNetworkHourly = namespaceCosts.stream().mapToDouble(nc -> safe(nc.getNetworkHourlyUsd())).sum();
        double sumOverheadActual = sumNsHourly - sumComputeHourly - sumStorageHourly - sumNetworkHourly;
        double sumComponents = componentBreakdown.stream().mapToDouble(c -> safe(c.getHourlyUsd())).sum();
        boolean noNegCosts   = namespaceCosts.stream().allMatch(nc -> safe(nc.getHourlyRateUsd()) >= -1e-6);

        var rcChecks = new java.util.ArrayList<PrometheusLiveCostSnapshot.ReconciliationCheck>();
        rcChecks.add(rcCheck("NS total ≡ cluster total",
                "sum(ns.hourly) must equal totalHourly — no cost created or lost",
                totalHourly, sumNsHourly));
        rcChecks.add(rcCheck("User-pool 100% attributed",
                "sum(ns.cpuHourly + ns.memHourly) == userPoolHourly — every node $ reaches a namespace",
                userPoolHourly, sumComputeHourly));
        rcChecks.add(rcCheck("Storage 100% attributed",
                "sum(ns.storageHourly) == sum(PVC hourly) — every PVC $ reaches a namespace",
                totalPvcHourly, sumStorageHourly));
        rcChecks.add(rcCheck("Network 100% attributed",
                "sum(ns.networkHourly) == totalLbHourly — every LB $ reaches a namespace",
                totalLbHourly, sumNetworkHourly));
        rcChecks.add(rcCheck("Shared overhead attributed",
                "system pool + ctrl-plane + registry + egress all flow to workload ns",
                sharedOverheadTotal, sumOverheadActual));
        rcChecks.add(rcCheck("Component breakdown sums",
                "sum(componentBreakdown.hourly) == totalHourly — no category double-counted",
                totalHourly, sumComponents));
        rcChecks.add(new PrometheusLiveCostSnapshot.ReconciliationCheck(
                "No negative costs", "every ns.hourly >= 0",
                0d, noNegCosts ? 0d : -1d, noNegCosts ? 0d : -1d, noNegCosts));

        int passCount = (int) rcChecks.stream().filter(PrometheusLiveCostSnapshot.ReconciliationCheck::isPass).count();
        boolean allRcPass = passCount == rcChecks.size();
        PrometheusLiveCostSnapshot.CostReconciliation reconciliation = PrometheusLiveCostSnapshot.CostReconciliation.builder()
                .checks(rcChecks)
                .allPass(allRcPass)
                .passCount(passCount)
                .totalChecks(rcChecks.size())
                .summary(allRcPass
                        ? "✓ All " + rcChecks.size() + " accounting invariants pass — costs are internally consistent."
                        : "⚠ " + (rcChecks.size() - passCount) + " of " + rcChecks.size() + " invariants failed — check deltas.")
                .build();

        PrometheusLiveCostSnapshot result = PrometheusLiveCostSnapshot.builder()
                .env(env)
                .capturedAt(now)
                .prometheusReachable(true)
                .totalHourlyUsd(totalHourly)
                .smoothedHourlyUsd(smoothedHourly)
                .dailyEstUsd(totalHourly * HOURS_PER_DAY)
                .monthlyEstUsd(totalHourly * HOURS_PER_MONTH)
                .monthToDateUsd(totalMtd)
                .cumulativeUsd(totalCum)
                .cluster(cluster)
                .namespaces(namespaceCosts)
                .cloudServices(cloudServices)
                .nodes(nodeDetails)
                .products(products)
                .idleHourlyUsd(0d)
                .idleMonthlyEstUsd(0d)
                .idleMonthToDateUsd(0d)
                .diagnostics(diagnostics)
                .inventory(inventory)
                .reconciliation(reconciliation)
                .build();
        // Cache the last fully-successful snapshot so fallbacks can serve it instead of zeros.
        if (!namespaceCosts.isEmpty() || !nodeDetails.isEmpty()) {
            lastGoodSnapshot.put(env, result);
            persistTimeseriesPoint(env, now, result);
        }
        return result;
    }

    /**
     * Append one time-series point per successful tick. Stores cluster totals
     * + a compact per-namespace cost line so historical comparison charts
     * (per-project, per-env, date/month/year ranges) can rebuild any past
     * tick without re-scraping Prometheus.
     */
    private void persistTimeseriesPoint(String env, Instant now, PrometheusLiveCostSnapshot snap) {
        try {
            List<ClusterCostTimeseriesPoint.NamespaceLine> nsLines = new ArrayList<>();
            if (snap.getNamespaces() != null) {
                for (NamespaceCost nc : snap.getNamespaces()) {
                    nsLines.add(ClusterCostTimeseriesPoint.NamespaceLine.builder()
                            .namespace(nc.getNamespace())
                            .matchedProjectName(nc.getMatchedProjectName())
                            .hourlyUsd(nc.getHourlyRateUsd())
                            .smoothedHourlyUsd(nc.getSmoothedHourlyUsd())
                            .cpuUsedCores(nc.getCpuCores())
                            .cpuRequestCores(nc.getCpuRequestCores())
                            .memoryUsedGb(nc.getMemoryGb())
                            .memoryRequestGb(nc.getMemoryRequestGb())
                            .podCount(nc.getPodCount())
                            .build());
                }
            }
            Map<String, Double> components = new LinkedHashMap<>();
            if (snap.getCluster() != null && snap.getCluster().getComponentBreakdown() != null) {
                for (ComponentLine cl : snap.getCluster().getComponentBreakdown()) {
                    if (cl.getCategory() == null) continue;
                    components.merge(cl.getCategory(), safe(cl.getHourlyUsd()), Double::sum);
                }
            }
            ClusterCostTimeseriesPoint pt = ClusterCostTimeseriesPoint.builder()
                    .env(env)
                    .capturedAt(now)
                    .totalHourlyUsd(snap.getTotalHourlyUsd())
                    .smoothedHourlyUsd(snap.getSmoothedHourlyUsd())
                    .monthToDateUsd(snap.getMonthToDateUsd())
                    .cumulativeUsd(snap.getCumulativeUsd())
                    .totalCpuCores(snap.getCluster() == null ? null : snap.getCluster().getTotalCpuCores())
                    .usedCpuCores(snap.getCluster() == null ? null : snap.getCluster().getUsedCpuCores())
                    .totalMemoryGb(snap.getCluster() == null ? null : snap.getCluster().getTotalMemoryGb())
                    .usedMemoryGb(snap.getCluster() == null ? null : snap.getCluster().getUsedMemoryGb())
                    .namespaces(nsLines)
                    .componentHourlyUsd(components)
                    .build();
            timeseriesRepo.save(pt);
        } catch (Exception e) {
            // Never let persistence errors break the live tick path.
            log.warn("Failed to persist cluster cost timeseries point for env={}: {}", env, e.getMessage());
        }
    }

    /** Time-series points for a range — used by historical comparison charts. */
    public List<ClusterCostTimeseriesPoint> queryTimeseries(String env, Instant from, Instant to) {
        return timeseriesRepo.findByEnvAndCapturedAtBetweenOrderByCapturedAtAsc(env, from, to);
    }

    /**
     * Returns the most-recent cached snapshot without triggering a new Prometheus
     * scrape. Called by the HTTP layer so the scheduler is the sole tick source.
     * Falls back to {@link #lastKnownGoodOrEmpty(String)} when no cached result exists.
     */
    public PrometheusLiveCostSnapshot getLatestSnapshot(String env) {
        PrometheusLiveCostSnapshot cached = lastGoodSnapshot.get(env);
        return cached != null ? cached : lastKnownGoodOrEmpty(env, Instant.now(), "no tick completed yet for env=" + env);
    }

    /**
     * Build the "Fixed cost" inventory view. Lists every billable Azure
     * resource grouped exactly the way an admin reads a sticker bill:
     * Kubernetes Cluster (Control plane / System pool / User pool / Spot
     * pool), Container Registry, Database, CICD, Network (Public IP + LB +
     * estimated egress), Key-Vault, Storage Account.
     */
    private InventoryView buildInventory(
            Topology t,
            Map<String, NodePrice> nodePrices,
            Map<String, Double> classToGb,
            Map<String, Double> classToHourly,
            Map<String, AzurePriceRecord> classToPrice,
            double lbHourlyPerUnit,
            List<CloudServiceCost> cloudServices
    ) {
        List<InventoryGroup> groups = new ArrayList<>();
        double grandHourly = 0d;

        // ============================================================
        // 1. Kubernetes Cluster (Control plane + every node pool)
        // ============================================================
        List<InventoryLine> k8sItems = new ArrayList<>();
        double k8sHourly = 0d;

        // Control plane (AKS uptime SLA tier)
        String tier = props.getAksControlPlaneTier();
        if ("standard".equalsIgnoreCase(tier)) {
            // AKS Uptime SLA — published list price ~$0.10/hour per cluster
            double cpHourly = 0.10;
            k8sItems.add(InventoryLine.builder()
                    .name("Control plane")
                    .sku("AKS Standard (Uptime SLA)")
                    .count(1).unit("cluster")
                    .unitDailyUsd(cpHourly * HOURS_PER_DAY)
                    .dailyUsd(cpHourly * HOURS_PER_DAY)
                    .monthlyUsd(cpHourly * HOURS_PER_MONTH)
                    .detail("$0.10/hr per AKS cluster on Standard tier")
                    .build());
            k8sHourly += cpHourly;
        } else {
            k8sItems.add(InventoryLine.builder()
                    .name("Control plane")
                    .sku("AKS Free")
                    .count(1).unit("cluster")
                    .unitDailyUsd(0d).dailyUsd(0d).monthlyUsd(0d)
                    .detail("AKS Free tier — control plane is free, no SLA")
                    .build());
        }

        // Group nodes by (poolLabel, sku, isSpot) so we mirror the user's table
        // (System_pool / User_pool / Spot_pool, each with their VM SKU rows).
        Map<String, List<Node>> poolBuckets = new LinkedHashMap<>();
        for (Node n : t.getNodes().values()) {
            String poolLabel = nodePoolLabel(n);
            String sku = (n.getVmSize() == null || n.getVmSize().isBlank()) ? "unknown" : n.getVmSize();
            String key = poolLabel + "|" + sku + "|" + n.isSpot();
            poolBuckets.computeIfAbsent(key, k -> new ArrayList<>()).add(n);
        }
        for (var e : poolBuckets.entrySet()) {
            List<Node> nodes = e.getValue();
            Node first = nodes.get(0);
            int count = nodes.size();
            double perNodeHourly = nodes.stream()
                    .map(n -> nodePrices.get(n.getName()))
                    .filter(Objects::nonNull)
                    .mapToDouble(NodePrice::getHourly)
                    .findFirst().orElse(0d);
            double rowHourly = perNodeHourly * count;
            k8sHourly += rowHourly;

            String poolLabel = nodePoolLabel(first);
            String sku = first.getVmSize() == null ? "unknown" : first.getVmSize();
            k8sItems.add(InventoryLine.builder()
                    .name(poolLabel + (first.isSpot() ? " (Spot)" : ""))
                    .sku(sku)
                    .count(count).unit("node")
                    .unitDailyUsd(perNodeHourly * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail(((long) first.getCpuCores()) + " cores · "
                            + ((long) (first.getMemoryBytes() / (1024d * 1024d * 1024d))) + " GB"
                            + (first.getRegion() == null ? "" : " · " + first.getRegion())
                            + (first.isSpot() ? " · Spot pricing" : ""))
                    .build());
        }
        // OS disks — one row per node (grouped by tier+type for brevity)
        Map<String, int[]> osDiskBuckets = new LinkedHashMap<>(); // key=tierSku, value={count, sizeGb}
        Map<String, Double> osDiskBucketHourly = new LinkedHashMap<>();
        for (Node n : t.getNodes().values()) {
            NodePrice np = nodePrices.get(n.getName());
            if (np == null || np.osDiskHourly <= 0) continue;
            String key = (np.osDiskTierSku == null ? "E10" : np.osDiskTierSku) + " LRS";
            osDiskBuckets.merge(key, new int[]{1, np.osDiskSizeGb > 0 ? np.osDiskSizeGb : 128}, (a, b) -> new int[]{a[0]+1, a[1]});
            osDiskBucketHourly.merge(key, np.osDiskHourly, Double::sum);
        }
        for (var e : osDiskBuckets.entrySet()) {
            int cnt = e.getValue()[0];
            int sz  = e.getValue()[1];
            double rowHourly = osDiskBucketHourly.getOrDefault(e.getKey(), 0d);
            k8sHourly += rowHourly;
            k8sItems.add(InventoryLine.builder()
                    .name("OS Disk · " + e.getKey())
                    .sku(e.getKey())
                    .count(cnt).unit("disk")
                    .unitDailyUsd((rowHourly / cnt) * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail(sz + " GB managed disk per node · Azure billed per tier")
                    .build());
        }

        groups.add(InventoryGroup.builder()
                .category("compute").label("Kubernetes Cluster")
                .items(k8sItems)
                .subtotalDailyUsd(k8sHourly * HOURS_PER_DAY)
                .subtotalMonthlyUsd(k8sHourly * HOURS_PER_MONTH)
                .build());
        grandHourly += k8sHourly;

        // ============================================================
        // 2. Container Registry
        // ============================================================
        List<InventoryLine> registryItems = new ArrayList<>();
        double registryHourly = 0d;
        for (CloudServiceCost cs : cloudServices) {
            if (!"registry".equals(cs.getCategory())) continue;
            double rowHourly = safe(cs.getHourlyRateUsd());
            registryHourly += rowHourly;
            registryItems.add(InventoryLine.builder()
                    .name("ACR")
                    .sku(cs.getAzureSkuName())
                    .count(1).unit("registry")
                    .unitDailyUsd(rowHourly * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail("Azure Container Registry · live retail price")
                    .build());
        }
        if (!registryItems.isEmpty()) {
            groups.add(InventoryGroup.builder()
                    .category("registry").label("Container Registry")
                    .items(registryItems)
                    .subtotalDailyUsd(registryHourly * HOURS_PER_DAY)
                    .subtotalMonthlyUsd(registryHourly * HOURS_PER_MONTH)
                    .build());
            grandHourly += registryHourly;
        }

        // ============================================================
        // 3. Persistent Storage (PVCs)
        // ============================================================
        List<InventoryLine> storageItems = new ArrayList<>();
        double storageHourly = 0d;
        for (var e : classToGb.entrySet()) {
            String sc = e.getKey();
            double gb = e.getValue();
            double rowHourly = classToHourly.getOrDefault(sc, 0d);
            storageHourly += rowHourly;
            AzurePriceRecord pr = classToPrice.get(sc);
            String azureSku = pr == null ? mapStorageClassToAzureSku(sc) : pr.getSkuName();
            double perGbMonth = pr == null ? defaultStoragePrice(sc) : safe(pr.getRetailPrice());
            storageItems.add(InventoryLine.builder()
                    .name("Persistent Volume · " + sc)
                    .sku(azureSku)
                    .count((int) Math.round(gb))
                    .unit("GB")
                    .unitDailyUsd((perGbMonth / HOURS_PER_MONTH) * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail("Azure " + azureSku + " · " + String.format("$%.4f/GB-month", perGbMonth))
                    .build());
        }
        if (!storageItems.isEmpty()) {
            groups.add(InventoryGroup.builder()
                    .category("storage").label("Persistent Storage")
                    .items(storageItems)
                    .subtotalDailyUsd(storageHourly * HOURS_PER_DAY)
                    .subtotalMonthlyUsd(storageHourly * HOURS_PER_MONTH)
                    .build());
            grandHourly += storageHourly;
        }

        // ============================================================
        // 4. Network (Public IP + Load Balancer + estimated egress)
        // ============================================================
        List<InventoryLine> networkItems = new ArrayList<>();
        double networkHourly = 0d;

        // Public IP — Standard SKU, ~$0.005/hr per address
        if (t.getPublicIpCount() > 0) {
            AzurePriceRecord pr = firstPrice(
                    "serviceName eq 'Virtual Network' and contains(productName, 'IP Address') and skuName eq 'Standard' and armRegionName eq '" + defaultRegion() + "' and type eq 'Consumption'");
            double perHour = pr == null ? 0.005 : safe(pr.getRetailPrice());
            String unit = pr == null ? "1 Hour" : pr.getUnitOfMeasure();
            double perUnitHr = unitToHourly(perHour, unit);
            double rowHourly = perUnitHr * t.getPublicIpCount();
            networkHourly += rowHourly;
            networkItems.add(InventoryLine.builder()
                    .name("Public IP")
                    .sku(pr == null ? "Standard" : pr.getSkuName())
                    .count(t.getPublicIpCount()).unit("address")
                    .unitDailyUsd(perUnitHr * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail("One Standard Public IP per LoadBalancer Service")
                    .build());
        }
        // Load Balancers
        if (t.getLoadBalancerCount() > 0 && lbHourlyPerUnit > 0) {
            double rowHourly = lbHourlyPerUnit * t.getLoadBalancerCount();
            networkHourly += rowHourly;
            networkItems.add(InventoryLine.builder()
                    .name("LB")
                    .sku("Standard")
                    .count(t.getLoadBalancerCount()).unit("LB")
                    .unitDailyUsd(lbHourlyPerUnit * HOURS_PER_DAY)
                    .dailyUsd(rowHourly * HOURS_PER_DAY)
                    .monthlyUsd(rowHourly * HOURS_PER_MONTH)
                    .detail("Azure Load Balancer Standard · per LB rule")
                    .build());
        }
        // Estimated egress bandwidth (outbound to internet) — Azure first 100 GB
        // free, then ~$0.087/GB. Calculated from Prom egress rate.
        if (t.getNetworkTransmitBytesPerSec() > 0) {
            double bytesPerMonth = t.getNetworkTransmitBytesPerSec() * 60d * 60d * HOURS_PER_MONTH;
            double gbPerMonth = bytesPerMonth / 1e9;
            double billableGb = Math.max(0d, gbPerMonth - 100d);
            double monthly = billableGb * 0.087;
            double hourly = monthly / HOURS_PER_MONTH;
            if (monthly > 0.01) {
                networkHourly += hourly;
                networkItems.add(InventoryLine.builder()
                        .name("Egress data transfer")
                        .sku("Outbound (Internet)")
                        .count((int) Math.round(gbPerMonth)).unit("GB/mo")
                        .unitDailyUsd((0.087 / HOURS_PER_MONTH) * HOURS_PER_DAY)
                        .dailyUsd(hourly * HOURS_PER_DAY)
                        .monthlyUsd(monthly)
                        .detail(String.format("~%.0f GB/month at current rate · first 100 GB free · $0.087/GB after", gbPerMonth))
                        .build());
            }
        }
        if (!networkItems.isEmpty()) {
            groups.add(InventoryGroup.builder()
                    .category("network").label("Network")
                    .items(networkItems)
                    .subtotalDailyUsd(networkHourly * HOURS_PER_DAY)
                    .subtotalMonthlyUsd(networkHourly * HOURS_PER_MONTH)
                    .build());
            grandHourly += networkHourly;
        }

        // ============================================================
        // 5. Configurable extras — Database, CICD, Key Vault, Storage
        //    Account, anything else the admin lists in YAML.
        // ============================================================
        Map<String, List<InventoryLine>> extraGroups = new LinkedHashMap<>();
        Map<String, Double> extraGroupHourly = new HashMap<>();
        for (PrometheusProperties.FixedExtra ex : props.getFixedCostExtras()) {
            double monthly = 0d;
            if (ex.getMonthlyUsd() != null) {
                monthly = ex.getMonthlyUsd();
            } else if (ex.isAutoPrice() && ex.getSku() != null && !ex.getSku().isBlank()) {
                monthly = autoPriceMonthly(ex);
            }
            double hourly = (monthly / HOURS_PER_MONTH) * ex.getCount();
            double monthlyTotal = monthly * ex.getCount();
            String cat = ex.getCategory() == null ? "other" : ex.getCategory();
            extraGroups.computeIfAbsent(cat, k -> new ArrayList<>()).add(InventoryLine.builder()
                    .name(ex.getName())
                    .sku(ex.getSku())
                    .count(ex.getCount()).unit("instance")
                    .unitDailyUsd((monthly / HOURS_PER_MONTH) * HOURS_PER_DAY)
                    .dailyUsd(hourly * HOURS_PER_DAY)
                    .monthlyUsd(monthlyTotal)
                    .detail(ex.getDetail())
                    .build());
            extraGroupHourly.merge(cat, hourly, Double::sum);
        }
        for (var e : extraGroups.entrySet()) {
            String cat = e.getKey();
            List<InventoryLine> items = e.getValue();
            double subHourly = extraGroupHourly.getOrDefault(cat, 0d);
            groups.add(InventoryGroup.builder()
                    .category(cat).label(prettyCategoryLabel(cat))
                    .items(items)
                    .subtotalDailyUsd(subHourly * HOURS_PER_DAY)
                    .subtotalMonthlyUsd(subHourly * HOURS_PER_MONTH)
                    .build());
            grandHourly += subHourly;
        }

        return InventoryView.builder()
                .groups(groups)
                .totalDailyUsd(grandHourly * HOURS_PER_DAY)
                .totalMonthlyUsd(grandHourly * HOURS_PER_MONTH)
                .build();
    }

    /** True if this node belongs to the AKS system / control pool. */
    private static boolean isSystemPool(Node n) {
        if ("System".equalsIgnoreCase(n.getRole())) return true;
        String pool = n.getAgentPool();
        return pool != null && pool.toLowerCase(Locale.ROOT).contains("system");
    }

    private static final java.util.Set<String> SYSTEM_NS_EXACT = java.util.Set.of(
            "kube-system", "kube-public", "kube-node-lease",
            "monitoring", "ingress-nginx", "cert-manager", "external-dns",
            "velero", "flux-system", "argocd", "linkerd", "istio-system",
            "gatekeeper-system", "reloader");

    private static final java.util.List<String> SYSTEM_NS_PREFIXES = java.util.List.of(
            "kube-", "calico-", "cilium", "azure-", "aks-");

    /** True if ns is a Kubernetes system / infra namespace (not a product workload). */
    private static boolean isSystemNs(String ns) {
        if (ns == null) return false;
        String l = ns.toLowerCase(Locale.ROOT);
        if (SYSTEM_NS_EXACT.contains(l)) return true;
        for (String prefix : SYSTEM_NS_PREFIXES) {
            if (l.startsWith(prefix)) return true;
        }
        return false;
    }

    /**
     * True when a pod is a real application microservice pod for UP/DOWN determination only.
     * Convention: all microservice pods have "service" in their name
     * (e.g. "communication-management-service-2392502a275f").
     * Pods without "service" in the name (cert-manager solvers, sidecars, infra pods)
     * are excluded from the UP/DOWN check but still counted in podCount for display.
     */
    private static boolean isApplicationPod(Pod p) {
        String podName = (p.getName() != null ? p.getName() : "").toLowerCase(Locale.ROOT);
        return podName.contains("service");
    }

    /** True if this node is a Spot VM (priced at spot rates, ~60-90% cheaper). */
    private static boolean isSpotPool(Node n) {
        if (n.isSpot()) return true;
        String pool = n.getAgentPool();
        return pool != null && pool.toLowerCase(Locale.ROOT).contains("spot");
    }

    /** Best-effort label for a node's pool: agentpool label, else role, else "Pool". */
    private static String nodePoolLabel(Node n) {
        if (n.getAgentPool() != null && !n.getAgentPool().isBlank()) {
            String p = n.getAgentPool();
            return Character.toUpperCase(p.charAt(0)) + p.substring(1) + "_pool";
        }
        if ("System".equalsIgnoreCase(n.getRole())) return "System_pool";
        if ("User".equalsIgnoreCase(n.getRole())) return "User_pool";
        return "Node_pool";
    }

    private static String prettyCategoryLabel(String cat) {
        return switch (cat == null ? "" : cat.toLowerCase(Locale.ROOT)) {
            case "database" -> "Database";
            case "cicd" -> "CICD-Server";
            case "keyvault" -> "Key-Vault";
            case "storageaccount" -> "Storage Account";
            case "network" -> "Network";
            default -> cat == null ? "Other" : (Character.toUpperCase(cat.charAt(0)) + cat.substring(1));
        };
    }

    /** Live Azure retail lookup for a config-driven extra. */
    private double autoPriceMonthly(PrometheusProperties.FixedExtra ex) {
        String region = (ex.getRegion() == null || ex.getRegion().isBlank()) ? defaultRegion() : ex.getRegion();
        String sku = ex.getSku();
        // Choose a sensible Azure service per category
        String filter = switch (ex.getCategory() == null ? "" : ex.getCategory().toLowerCase(Locale.ROOT)) {
            case "keyvault" -> "serviceName eq 'Key Vault' and skuName eq '" + escape(sku) + "' and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
            case "storageaccount" -> "serviceName eq 'Storage' and contains(productName, '" + escape(sku) + "') and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
            case "cicd", "database" -> // most likely a self-hosted VM SKU
                    "serviceName eq 'Virtual Machines' and armSkuName eq '" + escape(sku) + "' and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
            default -> "skuName eq '" + escape(sku) + "' and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
        };
        AzurePriceRecord pr = firstPrice(filter);
        if (pr == null || pr.getRetailPrice() == null) return 0d;
        // Convert to monthly
        double unit = pr.getRetailPrice();
        String uom = pr.getUnitOfMeasure() == null ? "" : pr.getUnitOfMeasure().toLowerCase();
        if (uom.contains("hour")) return unit * HOURS_PER_MONTH;
        if (uom.contains("day"))  return unit * 30d;
        if (uom.contains("month")) return unit;
        if (uom.contains("year")) return unit / 12d;
        // Per-op pricing (Key Vault) — return baseline of 1$/mo as a placeholder
        return unit;
    }

    private static String nz(String s) { return s == null ? "—" : s; }

    /**
     * If the cost engine has persisted figures from prior ticks, rebuild a
     * stable snapshot from those instead of returning $0. Only when there is
     * truly no prior data do we send back the all-zeros placeholder.
     */
    private PrometheusLiveCostSnapshot lastKnownGoodOrEmpty(String env, Instant now, String reason) {
        // Fast path: return the in-memory cached last-good snapshot so the UI keeps
        // full data (cluster, nodes, inventory, component breakdown) during transient failures.
        PrometheusLiveCostSnapshot cached = lastGoodSnapshot.get(env);
        if (cached != null) {
            log.debug("tick({}) — Prom unreachable, serving in-memory last-good snapshot ({})",
                    env, reason);
            List<String> staleWarnings = new ArrayList<>();
            staleWarnings.add("[STALE DATA — " + reason + "]");
            Diagnostics staleDiag;
            if (cached.getDiagnostics() != null) {
                Diagnostics d = cached.getDiagnostics();
                staleDiag = Diagnostics.builder()
                        .nodesTotal(d.getNodesTotal()).nodesWithVmSize(d.getNodesWithVmSize())
                        .nodesPriced(d.getNodesPriced()).vmSkusObserved(d.getVmSkusObserved())
                        .vmSkusUnmatched(d.getVmSkusUnmatched()).vmSkusFuzzyMatched(d.getVmSkusFuzzyMatched())
                        .podsTotal(d.getPodsTotal()).podsWithRequests(d.getPodsWithRequests())
                        .pvcsTotal(d.getPvcsTotal()).acrHostsObserved(d.getAcrHostsObserved())
                        .loadBalancersObserved(d.getLoadBalancersObserved())
                        .allocationModel(d.getAllocationModel())
                        .warnings(staleWarnings).build();
            } else {
                staleDiag = Diagnostics.builder().warnings(staleWarnings)
                        .allocationModel("last-known-good").build();
            }
            // Return cached snapshot with updated capturedAt, stale diagnostics, but
            // prometheusReachable = true so the panel keeps rendering the full breakdown.
            return PrometheusLiveCostSnapshot.builder()
                    .env(cached.getEnv()).capturedAt(now).prometheusReachable(true)
                    .totalHourlyUsd(cached.getTotalHourlyUsd())
                    .smoothedHourlyUsd(cached.getSmoothedHourlyUsd())
                    .dailyEstUsd(cached.getDailyEstUsd()).monthlyEstUsd(cached.getMonthlyEstUsd())
                    .monthToDateUsd(cached.getMonthToDateUsd()).cumulativeUsd(cached.getCumulativeUsd())
                    .cluster(cached.getCluster()).namespaces(cached.getNamespaces())
                    .cloudServices(cached.getCloudServices()).nodes(cached.getNodes())
                    .idleHourlyUsd(cached.getIdleHourlyUsd())
                    .idleMonthlyEstUsd(cached.getIdleMonthlyEstUsd())
                    .idleMonthToDateUsd(cached.getIdleMonthToDateUsd())
                    .diagnostics(staleDiag).inventory(cached.getInventory())
                    .build();
        }

        // Cold path (first tick after restart with no cached data): rebuild from MongoDB accumulators.
        List<PrometheusCostAccumulator> persisted = repo.findByEnv(env);
        Diagnostics diag = Diagnostics.builder()
                .nodesTotal(0).nodesWithVmSize(0).nodesPriced(0)
                .vmSkusObserved(List.of()).vmSkusUnmatched(List.of()).vmSkusFuzzyMatched(List.of())
                .podsTotal(0).podsWithRequests(0).pvcsTotal(0)
                .acrHostsObserved(0).loadBalancersObserved(0)
                .allocationModel("last-known-good (Prom unreachable)")
                .warnings(List.of(reason))
                .build();

        if (persisted.isEmpty()) {
            return PrometheusLiveCostSnapshot.builder()
                    .env(env).capturedAt(now).prometheusReachable(false)
                    .totalHourlyUsd(0d).smoothedHourlyUsd(0d).dailyEstUsd(0d).monthlyEstUsd(0d)
                    .monthToDateUsd(0d).cumulativeUsd(0d)
                    .idleHourlyUsd(0d).idleMonthlyEstUsd(0d).idleMonthToDateUsd(0d)
                    .namespaces(List.of()).cloudServices(List.of()).nodes(List.of())
                    .diagnostics(diag)
                    .build();
        }

        // Reconstruct namespaces from persisted "namespace" rows
        List<NamespaceCost> namespaces = new ArrayList<>();
        double total = 0d, totalSmoothed = 0d, totalMtd = 0d, totalCum = 0d;
        for (PrometheusCostAccumulator a : persisted) {
            if (!"namespace".equals(a.getScope())) continue;
            double smoothed = safe(a.getSmoothedRateUsd());
            namespaces.add(NamespaceCost.builder()
                    .namespace(a.getNamespace())
                    .cpuCores(a.getCpuCores())
                    .memoryGb(a.getMemoryGb())
                    .podCount(a.getReplicas())
                    .hourlyRateUsd(safe(a.getLastRateUsd()))
                    .smoothedHourlyUsd(smoothed)
                    .dailyEstUsd(smoothed * HOURS_PER_DAY)
                    .monthlyEstUsd(smoothed * HOURS_PER_MONTH)
                    .monthToDateUsd(safe(a.getMonthToDateUsd()))
                    .cumulativeUsd(safe(a.getCumulativeUsd()))
                    .uptimeSeconds(a.getUptimeSeconds())
                    .microservices(List.of())
                    .storage(List.of())
                    .serviceLines(List.of())
                    .build());
            total += safe(a.getLastRateUsd());
            totalSmoothed += smoothed;
            totalMtd += safe(a.getMonthToDateUsd());
            totalCum += safe(a.getCumulativeUsd());
        }
        // Plus idle row
        for (PrometheusCostAccumulator a : persisted) {
            if ("cluster".equals(a.getScope()) && "idle".equals(a.getScopeKey())) {
                totalSmoothed += safe(a.getSmoothedRateUsd());
                totalMtd += safe(a.getMonthToDateUsd());
                totalCum += safe(a.getCumulativeUsd());
            }
        }
        // Have MongoDB data — mark as reachable=true so the panel renders the
        // reconstructed namespace rows rather than showing a "not reachable" banner.
        return PrometheusLiveCostSnapshot.builder()
                .env(env).capturedAt(now).prometheusReachable(!namespaces.isEmpty())
                .totalHourlyUsd(total)
                .smoothedHourlyUsd(totalSmoothed)
                .dailyEstUsd(totalSmoothed * HOURS_PER_DAY)
                .monthlyEstUsd(totalSmoothed * HOURS_PER_MONTH)
                .monthToDateUsd(totalMtd)
                .cumulativeUsd(totalCum)
                .idleHourlyUsd(0d).idleMonthlyEstUsd(0d).idleMonthToDateUsd(0d)
                .namespaces(namespaces).cloudServices(List.of()).nodes(List.of())
                .diagnostics(diag)
                .build();
    }

    /** Auxiliary read of operational metrics — req/error/latency/restarts/top consumers. */
    public PrometheusExtraMetrics extraMetrics(String env, String namespace) {
        Instant now = Instant.now();
        if (!client.hasEnv(env)) {
            return PrometheusExtraMetrics.builder().env(env).namespace(namespace).capturedAt(now).build();
        }
        String nsFilter = (namespace == null || namespace.isBlank()) ? "" : ",namespace=\"" + namespace + "\"";

        double rps = sumValues(client.queryVector(env,
                "sum(rate(nginx_ingress_controller_requests[5m]))"));
        double errRps = sumValues(client.queryVector(env,
                "sum(rate(nginx_ingress_controller_requests{status=~\"5..\"}[5m]))"));
        double p50 = histogramQuantile(env, 0.5);
        double p95 = histogramQuantile(env, 0.95);
        double p99 = histogramQuantile(env, 0.99);

        double netRx = sumValues(client.queryVector(env,
                "sum(rate(container_network_receive_bytes_total{}[5m]))"));
        double netTx = sumValues(client.queryVector(env,
                "sum(rate(container_network_transmit_bytes_total{}[5m]))"));

        int restarts = (int) sumValues(client.queryVector(env,
                "sum(kube_pod_container_status_restarts_total{" + maybeNs(namespace) + "})"));
        int crashLoop = (int) sumValues(client.queryVector(env,
                "sum(kube_pod_container_status_waiting_reason{reason=\"CrashLoopBackOff\"" + nsFilter + "})"));
        int pending = (int) sumValues(client.queryVector(env,
                "sum(kube_pod_status_phase{phase=\"Pending\"" + nsFilter + "})"));
        int ready = (int) sumValues(client.queryVector(env,
                "sum(kube_pod_status_ready{condition=\"true\"" + nsFilter + "})"));

        List<PrometheusExtraMetrics.TopConsumer> topCpu = client.queryVector(env,
                "topk(5, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=\"\"" + nsFilter + "}[5m])))").stream()
                .map(s -> PrometheusExtraMetrics.TopConsumer.builder()
                        .name(s.label("pod"))
                        .namespace(s.label("namespace"))
                        .value(s.value())
                        .unit("cores")
                        .build()).toList();

        List<PrometheusExtraMetrics.TopConsumer> topMem = client.queryVector(env,
                "topk(5, sum by (namespace, pod) (container_memory_working_set_bytes{container!=\"\"" + nsFilter + "}))").stream()
                .map(s -> PrometheusExtraMetrics.TopConsumer.builder()
                        .name(s.label("pod"))
                        .namespace(s.label("namespace"))
                        .value(s.value() / (1024d * 1024d * 1024d))
                        .unit("GB")
                        .build()).toList();

        return PrometheusExtraMetrics.builder()
                .env(env)
                .namespace(namespace)
                .capturedAt(now)
                .requestsPerSec(rps)
                .errorsPerSec(errRps)
                .errorRatePct(rps > 0 ? (errRps / rps) * 100d : 0d)
                .p50LatencyMs(p50)
                .p95LatencyMs(p95)
                .p99LatencyMs(p99)
                .totalRestarts(restarts)
                .crashLoopingPods(crashLoop)
                .pendingPods(pending)
                .readyPods(ready)
                .networkRxBytesPerSec(netRx)
                .networkTxBytesPerSec(netTx)
                .topCpuConsumers(topCpu)
                .topMemoryConsumers(topMem)
                .build();
    }

    // -------------- helpers --------------

    private double histogramQuantile(String env, double q) {
        // Try common ingress histogram first
        var rows = client.queryVector(env,
                "histogram_quantile(" + q + ", sum(rate(nginx_ingress_controller_request_duration_seconds_bucket[5m])) by (le))");
        if (!rows.isEmpty()) return rows.get(0).value() * 1000d; // sec → ms
        return 0d;
    }

    private static String maybeNs(String ns) {
        return (ns == null || ns.isBlank()) ? "" : "namespace=\"" + ns + "\"";
    }

    private static double sumValues(List<PrometheusClient.Sample> rows) {
        return rows.stream().mapToDouble(PrometheusClient.Sample::value).sum();
    }

    /**
     * Live-price every node from Azure Retail. Tries (in order):
     * <ol>
     *   <li>Exact {@code armSkuName} match in the node's region (preserving case).</li>
     *   <li>Same SKU in the {@code defaultRegion} as a backstop.</li>
     *   <li>Fuzzy match by node CPU cores + RAM (cheapest Linux VM with matching specs).</li>
     * </ol>
     * Each step is recorded so the UI can show pricing provenance.
     */
    private SkuPricing priceNodes(Topology t, List<String> warnings) {
        SkuPricing out = new SkuPricing();
        // Cache lookups by (sku, region) so we don't query Azure once per node
        Map<String, NodePrice> cache = new HashMap<>();
        for (Node n : t.getNodes().values()) {
            String sku = n.getVmSize();
            String region = (n.getRegion() == null || n.getRegion().isBlank()) ? defaultRegion() : n.getRegion();
            if (sku == null || sku.isBlank()) {
                warnings.add("node " + n.getName() + " has no vmSize label — using fuzzy match by capacity");
            } else {
                out.observedSkus.add(sku);
            }

            String cacheKey = (sku == null ? "" : sku) + "|" + region + "|" + (long) n.getCpuCores() + "|" + (long) (n.getMemoryBytes() / (1024d * 1024d * 1024d)) + "|" + n.isSpot();
            NodePrice np = cache.get(cacheKey);
            if (np == null) {
                np = priceOneNode(n, sku, region, out, warnings);
                cache.put(cacheKey, np);
            }
            out.nodePrices.put(n.getName(), np);
        }
        return out;
    }

    /**
     * Determines OS disk tier flags for a node.
     * Priority: explicit label > effectiveVmSku (from pricing engine) > AKS default (Standard SSD).
     * AKS uses Standard SSD (E-series) by default for all OS disks regardless of VM family.
     * Only Premium_LRS label explicitly enables Premium tier.
     */
    private static boolean[] osDiskFlags(Node n, String effectiveVmSku) {
        String tier = n.getOsDiskStorageTier();
        if (tier != null && !tier.isBlank()) {
            String t = tier.toLowerCase(Locale.ROOT);
            boolean premium = t.contains("premium");
            boolean stdSsd  = !premium; // anything non-Premium is treated as Standard SSD for AKS
            return new boolean[]{premium, stdSsd};
        }
        // No tier label — check the effective VM SKU.
        // Premium SSD only when VM explicitly supports it (s-suffix) AND we know the SKU.
        if (effectiveVmSku != null && !effectiveVmSku.isBlank() && isPremiumCapableVm(effectiveVmSku)) {
            return new boolean[]{true, false}; // Premium SSD
        }
        // AKS default: Standard SSD (E-series managed disk)
        return new boolean[]{false, true};
    }

    private double[] priceOsDiskForNode(Node n, String nodeRegion) {
        return priceOsDiskForNode(n, nodeRegion, null);
    }

    private double[] priceOsDiskForNode(Node n, String nodeRegion, String effectiveVmSku) {
        if ("ephemeral".equalsIgnoreCase(n.getOsDiskStorageProfile())) return new double[]{0d, 0d};
        int sizeGb = n.getOsDiskSizeGb() > 0 ? n.getOsDiskSizeGb() : 128;
        boolean[] flags = osDiskFlags(n, effectiveVmSku != null ? effectiveVmSku : n.getVmSize());
        String region = (nodeRegion == null || nodeRegion.isBlank()) ? defaultRegion() : nodeRegion;
        double monthly = managedDiskTierMonthly(sizeGb, flags[0], flags[1], region);
        return new double[]{monthly / HOURS_PER_MONTH, sizeGb};
    }

    private String osDiskTierSkuForNode(Node n) {
        return osDiskTierSkuForNode(n, null);
    }

    private String osDiskTierSkuForNode(Node n, String effectiveVmSku) {
        if ("ephemeral".equalsIgnoreCase(n.getOsDiskStorageProfile())) return "Ephemeral";
        int sizeGb = n.getOsDiskSizeGb() > 0 ? n.getOsDiskSizeGb() : 128;
        boolean[] flags = osDiskFlags(n, effectiveVmSku != null ? effectiveVmSku : n.getVmSize());
        return managedDiskTierSku(sizeGb, flags[0], flags[1]);
    }

    private NodePrice priceOneNode(Node n, String sku, String region, SkuPricing out, List<String> warnings) {
        boolean spot = n.isSpot();
        // 1) Exact SKU match in node region (case-preserved), Spot tier if applicable
        if (sku != null && !sku.isBlank()) {
            AzurePriceRecord rec = exactSkuLookup(sku, region, spot);
            if (rec != null) {
                double[] osDisk = priceOsDiskForNode(n, region, sku);
                return new NodePrice(sku, region, rec, spot ? "exact-spot" : "exact",
                        osDisk[0], (int) osDisk[1], osDiskTierSkuForNode(n, sku));
            }
            // 2) Same SKU in default region
            if (!region.equalsIgnoreCase(defaultRegion())) {
                rec = exactSkuLookup(sku, defaultRegion(), spot);
                if (rec != null) {
                    warnings.add("priced " + sku + " using fallback region " + defaultRegion()
                            + " (no rows for " + region + ")");
                    double[] osDisk = priceOsDiskForNode(n, defaultRegion(), sku);
                    return new NodePrice(sku, defaultRegion(), rec, spot ? "exact-spot" : "exact",
                            osDisk[0], (int) osDisk[1], osDiskTierSkuForNode(n, sku));
                }
            }
            // 3) For spot nodes: if spot-tier exact lookup failed in both regions,
            //    fall back to on-demand exact pricing (spot is typically 60-90% cheaper,
            //    but showing on-demand is better than $0 until spot prices are available).
            if (spot) {
                rec = exactSkuLookup(sku, region, false);
                if (rec == null && !region.equalsIgnoreCase(defaultRegion()))
                    rec = exactSkuLookup(sku, defaultRegion(), false);
                if (rec != null) {
                    warnings.add("spot price not available for " + sku + " — showing on-demand price as proxy");
                    double[] osDisk = priceOsDiskForNode(n, region, sku);
                    return new NodePrice(sku, region, rec, "exact-spot-proxy",
                            osDisk[0], (int) osDisk[1], osDiskTierSkuForNode(n, sku));
                }
            }
            out.unmatchedSkus.add(sku);
            warnings.add("no exact Azure price for " + sku + " in " + region + " — falling back to fuzzy match");
        }
        // 4) Fuzzy by CPU cores + RAM.
        //    For spot nodes, try spot-tier pricing first; fall back to on-demand fuzzy.
        double memGb = n.getMemoryBytes() / (1024d * 1024d * 1024d);
        AzurePriceRecord fuzzy = null;
        String fuzzyMatchLabel = "fuzzy-cores-mem";
        if (spot) {
            fuzzy = fuzzyByCapacity(n.getCpuCores(), memGb, region, true);
            if (fuzzy == null && !region.equalsIgnoreCase(defaultRegion()))
                fuzzy = fuzzyByCapacity(n.getCpuCores(), memGb, defaultRegion(), true);
            if (fuzzy != null) fuzzyMatchLabel = "fuzzy-spot";
        }
        if (fuzzy == null) {
            fuzzy = fuzzyByCapacity(n.getCpuCores(), memGb, region, false);
            if (fuzzy == null && !region.equalsIgnoreCase(defaultRegion()))
                fuzzy = fuzzyByCapacity(n.getCpuCores(), memGb, defaultRegion(), false);
        }
        if (fuzzy != null) {
            String fuzzyRegion = fuzzy.getArmRegionName() == null ? region : fuzzy.getArmRegionName();
            String effectiveSku = (sku == null || sku.isBlank()) ? fuzzy.getArmSkuName() : sku;
            if (effectiveSku != null && !effectiveSku.isBlank()) out.fuzzyMatchedSkus.add(effectiveSku);
            double[] osDisk = priceOsDiskForNode(n, fuzzyRegion, effectiveSku);
            return new NodePrice(effectiveSku, fuzzyRegion, fuzzy, fuzzyMatchLabel,
                    osDisk[0], (int) osDisk[1], osDiskTierSkuForNode(n, effectiveSku));
        }
        warnings.add("no Azure match for " + (sku == null || sku.isBlank() ? "<no-sku>" : sku) + " in " + region
                + " — node priced at $0; allocation will not flow through");
        return new NodePrice(sku, region, null, "none");
    }

    private AzurePriceRecord exactSkuLookup(String sku, String region) {
        return exactSkuLookup(sku, region, false);
    }

    private AzurePriceRecord exactSkuLookup(String sku, String region, boolean spot) {
        String cacheKey = sku + "|" + region + "|" + spot;
        CachedPrice cached = vmPriceCache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.record();

        // Azure Retail Prices API: BOTH spot and on-demand rows have type="Consumption".
        // Spot rows are identified by "Spot" in skuName (e.g. "D8s v3 Spot").
        // Using type eq 'Spot' returns zero results — do NOT use it.
        String filter = "serviceName eq 'Virtual Machines' and armSkuName eq '" + escape(sku) + "' "
                + "and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
        List<AzurePriceRecord> rows = azure.search(filter, 20);
        AzurePriceRecord result = rows.stream()
                .filter(r -> r.getProductName() == null || !r.getProductName().toLowerCase().contains("windows"))
                .filter(r -> r.getSkuName() == null || !r.getSkuName().toLowerCase().contains("low priority"))
                .filter(r -> {
                    // Spot mode: require "Spot" in skuName. On-demand mode: exclude any "Spot" rows.
                    boolean hasSpot = r.getSkuName() != null && r.getSkuName().toLowerCase().contains("spot");
                    return spot == hasSpot;
                })
                .filter(r -> r.getRetailPrice() != null && r.getRetailPrice() > 0)
                .findFirst().orElse(null);

        if (result != null) {
            vmPriceCache.put(cacheKey, new CachedPrice(result, java.time.Instant.now().plus(VM_PRICE_TTL)));
            return result;
        }
        // Transient API failure — return stale cache entry rather than forcing $0 or on-demand proxy
        if (cached != null) {
            log.debug("Azure price API empty for {} {} ({}) — using stale cache", sku, region, spot ? "spot" : "on-demand");
            return cached.record();
        }
        return null;
    }

    /**
     * Match a node by approximate CPU+RAM when the SKU label is missing.
     *
     * <p>Instead of a single broad query (which returns results in an
     * unpredictable order and can miss the right family), this method issues
     * small targeted queries per VM family, ordered by expected likelihood for
     * the observed memory-per-core ratio:
     * <ul>
     *   <li>≥ 7 GB/core → E-series first (memory-optimised), then D</li>
     *   <li>3–7 GB/core → D-series first (general purpose), then E, B</li>
     *   <li>≤ 3 GB/core → F-series first (compute-optimised), then D, B</li>
     * </ul>
     * Each targeted fetch is only 100 rows so it is guaranteed to cover that
     * family, whereas a 300-row generic query may not even reach E-series.
     */
    private AzurePriceRecord fuzzyByCapacity(double cpuCores, double memGb, String region, boolean spot) {
        if (cpuCores <= 0 || memGb <= 0) return null;
        int cpuI = (int) Math.round(cpuCores);
        // Round mem to 1 decimal to tolerate minor Prometheus rounding
        long memKey = Math.round(memGb * 10);
        String cacheKey = "fuzzy|" + cpuI + "|" + memKey + "|" + region + "|" + spot;
        CachedPrice cached = vmPriceCache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.record();

        // Azure API: all rows (spot + on-demand) use type="Consumption".
        // Spot rows carry "Spot" in their skuName; on-demand rows do not.
        double gbPerCore = memGb / Math.max(cpuCores, 1);

        // Ordered list of family prefixes to try — highest-priority first
        List<String> families;
        if (gbPerCore >= 7.0) {
            families = List.of("Standard_E", "Standard_D", "Standard_B");
        } else if (gbPerCore >= 3.0) {
            families = List.of("Standard_D", "Standard_E", "Standard_B");
        } else {
            families = List.of("Standard_F", "Standard_D", "Standard_B");
        }

        AzurePriceRecord bestTight = null;   // ±15% RAM — preferred
        AzurePriceRecord bestWide  = null;   // ±30% RAM — fallback
        double bestTightPrice = Double.MAX_VALUE;
        double bestWidePrice  = Double.MAX_VALUE;

        for (String prefix : families) {
            String filter = "serviceName eq 'Virtual Machines' and armRegionName eq '" + escape(region)
                    + "' and type eq 'Consumption' and contains(armSkuName, '" + prefix + "')";
            List<AzurePriceRecord> rows = azure.search(filter, 100);
            for (AzurePriceRecord r : rows) {
                if (r.getRetailPrice() == null || r.getRetailPrice() <= 0) continue;
                String name = r.getArmSkuName();
                if (name == null || !isAksCompatibleFamily(name)) continue;
                String pn = r.getProductName() == null ? "" : r.getProductName().toLowerCase();
                String sn = r.getSkuName() == null ? "" : r.getSkuName().toLowerCase();
                if (pn.contains("windows")) continue;
                if (sn.contains("low priority")) continue;        // never use Batch/low-priority rows
                boolean rowIsSpot = sn.contains("spot");
                if (spot != rowIsSpot) continue;                  // must match requested tier
                int[] specs = parseVmCoresMem(name);
                if (specs[0] != cpuI) continue;
                double ratio = specs[1] / Math.max(memGb, 1);
                if (ratio >= 0.85 && ratio <= 1.15 && r.getRetailPrice() < bestTightPrice) {
                    bestTightPrice = r.getRetailPrice();
                    bestTight = r;
                } else if (ratio >= 0.70 && ratio <= 1.30 && r.getRetailPrice() < bestWidePrice) {
                    bestWidePrice = r.getRetailPrice();
                    bestWide = r;
                }
            }
            // Stop searching more families once a tight match exists
            if (bestTight != null) break;
        }
        AzurePriceRecord result = bestTight != null ? bestTight : bestWide;
        if (result != null) {
            vmPriceCache.put(cacheKey, new CachedPrice(result, java.time.Instant.now().plus(VM_PRICE_TTL)));
        } else if (cached != null) {
            // Transient failure — return stale entry
            log.debug("Azure fuzzy price API empty for {} core / {} GB {} {} — using stale cache", cpuI, memGb, region, spot ? "spot" : "on-demand");
            return cached.record();
        }
        return result;
    }

    /**
     * True when the VM family is routinely deployed in AKS node pools.
     * Blocks exotic families that happen to match on cores+RAM but would report
     * the wrong price and confuse admins:
     * <ul>
     *   <li>H/HB/HC — HPC cluster VMs (very different price model)</li>
     *   <li>DCxxx  — Confidential compute (DC4as_cc_v5 etc.)</li>
     *   <li>M       — Memory-extreme (M128ms, ~$13/hr)</li>
     *   <li>G       — Old-gen (GS5)</li>
     *   <li>NP      — FPGA (NP10s)</li>
     * </ul>
     */
    private static boolean isAksCompatibleFamily(String armSkuName) {
        if (armSkuName == null) return false;
        // Strip the "Standard_" prefix, work in upper-case
        String u = armSkuName.replaceFirst("(?i)^Standard_", "").toUpperCase(Locale.ROOT);
        if (u.isEmpty()) return false;
        // DC-series confidential compute: starts with DC + digit (e.g. DC4as, DC8ads)
        if (u.length() >= 3 && u.charAt(0) == 'D' && u.charAt(1) == 'C'
                && Character.isDigit(u.charAt(2))) return false;
        // Block the single-letter families that are NOT normal workload VMs
        char f = u.charAt(0);
        if (f == 'H') return false;   // HPC (H16, HB176rs, HC44rs…)
        if (f == 'M') return false;   // Memory-extreme
        if (f == 'G') return false;   // Old-gen
        // FPGA (NP-series): starts with NP
        if (u.startsWith("NP")) return false;
        // Allow: D (general), E (memory-opt), F (compute-opt), B (burstable),
        //        L (storage-opt), N (GPU: NC/NV/ND), A (newer A-series)
        return "DEFLBNA".indexOf(f) >= 0;
    }

    /** {cores, ramGb} guess from an armSkuName like {@code Standard_D4s_v3}. */
    private static int[] parseVmCoresMem(String armSkuName) {
        if (armSkuName == null) return new int[]{0, 0};
        String sku = armSkuName.replaceFirst("(?i)^Standard_", "");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([A-Za-z]+)(\\d+)").matcher(sku);
        if (!m.find()) return new int[]{0, 0};
        String fam = m.group(1).toUpperCase();
        int vcpu = Integer.parseInt(m.group(2));
        int ram;
        if (fam.startsWith("NC") || fam.startsWith("NV") || fam.startsWith("ND")) ram = vcpu * 6;
        else if (fam.startsWith("E")) ram = vcpu * 8;
        else if (fam.startsWith("F")) ram = vcpu * 2;
        else if (fam.startsWith("G")) ram = vcpu * 28;
        else if (fam.startsWith("H") || fam.startsWith("L")) ram = vcpu * 8;
        else if (fam.startsWith("M")) ram = vcpu * 14;
        else ram = vcpu * 4;
        return new int[]{vcpu, ram};
    }

    /** Per-node priced result. */
    @lombok.Getter
    private static class NodePrice {
        final String vmSize;
        final String region;
        final double hourly;       // VM compute only
        final double osDiskHourly; // OS managed disk (0 if ephemeral or unknown)
        final int osDiskSizeGb;
        final String osDiskTierSku;
        final String meterId;
        final String skuName;
        final String productName;
        /** {@code exact} | {@code fuzzy-cores-mem} | {@code none}. */
        final String match;

        NodePrice(String vmSize, String region, AzurePriceRecord rec, String match) {
            this(vmSize, region, rec, match, 0d, 0, null);
        }

        NodePrice(String vmSize, String region, AzurePriceRecord rec, String match,
                  double osDiskHourly, int osDiskSizeGb, String osDiskTierSku) {
            this.vmSize = vmSize;
            this.region = region;
            this.hourly = rec == null || rec.getRetailPrice() == null ? 0d : rec.getRetailPrice();
            this.osDiskHourly = osDiskHourly;
            this.osDiskSizeGb = osDiskSizeGb;
            this.osDiskTierSku = osDiskTierSku;
            this.meterId = rec == null ? null : rec.getMeterId();
            this.skuName = rec == null ? null : rec.getSkuName();
            this.productName = rec == null ? null : rec.getProductName();
            this.match = match;
        }
    }

    /**
     * Accumulates per-pod cost for a workload (one Deployment/StatefulSet/DaemonSet).
     * Pods may span multiple nodes (e.g. a Deployment with 3 replicas on different nodes).
     * Each pod's cost is computed from its actual node's price so spot and on-demand pods
     * are priced correctly.
     */
    private static class WorkloadAttrib {
        double cpuHourly;
        double memHourly;
        int podCount;
        boolean anySpot;
        final Map<String, Integer> vmSizeCounts = new LinkedHashMap<>();
        // nodeName → {podCount, isSpot(0/1)}
        final Map<String, int[]> nodeInfos = new LinkedHashMap<>();
        // running average allocation share (fraction of node capacity used)
        double allocShareSum;

        void addPod(double podCpu, double podMem, double allocShare,
                    String nodeName, String vmSize, boolean spot) {
            cpuHourly += podCpu;
            memHourly += podMem;
            allocShareSum += allocShare;
            podCount++;
            if (spot) anySpot = true;
            if (vmSize != null && !vmSize.isBlank())
                vmSizeCounts.merge(vmSize, 1, Integer::sum);
            if (nodeName != null && !nodeName.isBlank())
                nodeInfos.computeIfAbsent(nodeName, k -> new int[]{0, spot ? 1 : 0})[0]++;
        }

        double totalHourly() { return cpuHourly + memHourly; }
        double avgAllocShare() { return podCount > 0 ? allocShareSum / podCount : 0d; }

        /** "aks-userpool-xxx" if all pods on one node, otherwise "3 nodes". */
        String displayNodeName() {
            if (nodeInfos.isEmpty()) return null;
            if (nodeInfos.size() == 1) return nodeInfos.keySet().iterator().next();
            return nodeInfos.size() + " nodes";
        }

        /**
         * Most common VM size, shortened: "Standard_D8s_v3" → "D8s_v3".
         * Appends "·spot" tag when any replica is on spot.
         */
        String displayVmSize() {
            if (vmSizeCounts.isEmpty()) return null;
            String dominant = vmSizeCounts.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey).orElse(null);
            if (dominant == null) return null;
            // Strip "Standard_" prefix for compact display
            String short_ = dominant.replaceFirst("(?i)^Standard_", "");
            if (vmSizeCounts.size() > 1) short_ += " +" + (vmSizeCounts.size() - 1) + " more";
            return anySpot ? short_ + " ·spot" : short_;
        }
    }

    /** Aggregated pricing run output. */
    private static class SkuPricing {
        final Map<String, NodePrice> nodePrices = new LinkedHashMap<>();
        final Set<String> observedSkus = new LinkedHashSet<>();
        final Set<String> unmatchedSkus = new LinkedHashSet<>();
        final Set<String> fuzzyMatchedSkus = new LinkedHashSet<>();
    }

    private AzurePriceRecord firstPrice(String filter) {
        List<AzurePriceRecord> rows = azure.search(filter, 1);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * Upsert + tick. Adds {@code rate × Δt} (in hours) onto the cumulative
     * since {@code lastTickAt}. Rolls MTD over on month change. Returns the
     * persisted row so the caller can read freshly-computed totals.
     */
    private PrometheusCostAccumulator upsertAccumulator(
            String env, String scope, String scopeKey, String dimension,
            String namespace, String microservice, String cloudService,
            double rateUsd, Double cpuCores, Double memoryGb, Integer replicas,
            Instant now) {

        PrometheusCostAccumulator acc = repo.findByEnvAndScopeAndScopeKeyAndDimension(env, scope, scopeKey, dimension)
                .orElseGet(() -> PrometheusCostAccumulator.builder()
                        .env(env).scope(scope).scopeKey(scopeKey).dimension(dimension)
                        .namespace(namespace).microservice(microservice).cloudService(cloudService)
                        .cumulativeUsd(0d).monthToDateUsd(0d).uptimeSeconds(0L)
                        .createdAt(now).lastTickAt(now)
                        .monthKey(monthKey(now))
                        .build());

        // Roll over MTD on month change
        String thisMonth = monthKey(now);
        if (!thisMonth.equals(acc.getMonthKey())) {
            acc.setMonthKey(thisMonth);
            acc.setMonthToDateUsd(0d);
        }

        double dtSec = acc.getLastTickAt() == null ? 0d : Math.max(0d, (now.toEpochMilli() - acc.getLastTickAt().toEpochMilli()) / 1000d);
        // Cap per-tick delta to 1h so a long sleep doesn't double-count if someone restarts the engine after a downtime
        dtSec = Math.min(dtSec, 3600d);
        double prevRate = acc.getLastRateUsd() == null ? rateUsd : acc.getLastRateUsd();
        double dtHours = dtSec / 3600d;
        // Use trapezoidal integration between prev and current rate
        double increment = ((prevRate + rateUsd) / 2d) * dtHours;
        if (rateUsd > 0 && dtSec > 0) acc.setUptimeSeconds(safe(acc.getUptimeSeconds()) + (long) dtSec);

        acc.setLastRateUsd(rateUsd);
        // EMA smoothing — protected against transient zeros so the UI doesn't
        // flicker between 0 and the real value.
        //   • First observation EVER (no prevSmoothed): seed = rateUsd.
        //   • Previously zero, now non-zero: re-seed directly with rateUsd
        //     (no slow ramp from 0 to the real value).
        //   • Current rate is 0 but we had a positive smoothed value: keep
        //     the prior smoothed value (probable transient Prom hiccup).
        //   • Otherwise: standard EMA blend.
        Double prevSmoothed = acc.getSmoothedRateUsd();
        double smoothed;
        if (prevSmoothed == null) {
            smoothed = rateUsd; // first observation — seed directly
        } else if (prevSmoothed <= 0d && rateUsd > 0d) {
            smoothed = rateUsd; // first non-zero — seed directly, no slow ramp from 0
        } else if (rateUsd <= 0d && prevSmoothed > 0d) {
            smoothed = prevSmoothed; // hold last-known-good through transient Prom zero
        } else {
            // Re-seed immediately if the rate jumped >15% — avoids the
            // multi-tick gradual increase/decrease seen after formula changes or cluster scaling.
            double changePct = Math.abs(rateUsd - prevSmoothed) / Math.max(prevSmoothed, 1e-9);
            if (changePct > 0.15) {
                smoothed = rateUsd;
            } else {
                smoothed = (EMA_ALPHA * rateUsd) + ((1d - EMA_ALPHA) * prevSmoothed);
            }
        }
        acc.setSmoothedRateUsd(smoothed);
        acc.setCpuCores(cpuCores);
        acc.setMemoryGb(memoryGb);
        acc.setReplicas(replicas);
        acc.setCumulativeUsd(safe(acc.getCumulativeUsd()) + increment);
        acc.setMonthToDateUsd(safe(acc.getMonthToDateUsd()) + increment);
        acc.setLastTickAt(now);
        if (acc.getNamespace() == null) acc.setNamespace(namespace);
        if (acc.getMicroservice() == null) acc.setMicroservice(microservice);
        if (acc.getCloudService() == null) acc.setCloudService(cloudService);

        return repo.save(acc);
    }

    private static String monthKey(Instant t) {
        return YearMonth.from(t.atOffset(ZoneOffset.UTC)).toString();
    }


    private static double safe(Double d) { return d == null ? 0d : d; }

    private static long safe(Long l) { return l == null ? 0L : l; }

    private static String escape(String s) { return s == null ? "" : s.replace("'", "''"); }

    private static ComponentLine componentLine(String category, String label, double hourly, double total, String detail) {
        return ComponentLine.builder()
                .category(category)
                .label(label)
                .hourlyUsd(hourly)
                .dailyUsd(hourly * HOURS_PER_DAY)
                .monthlyUsd(hourly * HOURS_PER_MONTH)
                .percentOfTotal(total > 0 ? (hourly / total) * 100d : 0d)
                .detail(detail)
                .build();
    }

    /** Build one reconciliation check: pass when |actual - expected| < $0.001/hr. */
    private static PrometheusLiveCostSnapshot.ReconciliationCheck rcCheck(
            String name, String description, double expected, double actual) {
        double delta = actual - expected;
        boolean pass = Math.abs(delta) < 0.001d; // $0.001/hr ≈ $0.72/month tolerance
        return new PrometheusLiveCostSnapshot.ReconciliationCheck(name, description, expected, actual, delta, pass);
    }

    private static NamespaceServiceLine line(String category, String name, Double quantity, String unit,
                                             double hourly, String detail) {
        return NamespaceServiceLine.builder()
                .category(category)
                .name(name)
                .quantity(quantity)
                .unit(unit)
                .hourlyUsd(hourly)
                .dailyUsd(hourly * HOURS_PER_DAY)
                .monthlyUsd(hourly * HOURS_PER_MONTH)
                .detail(detail)
                .build();
    }

    /**
     * Build product cost view for an env.
     *
     * <p>Product namespaces = those whose normalised name (env-prefix stripped) are non-system
     * (e.g. "qa-frontend" → "FRONTEND"). Supportive namespaces (kube-system, monitoring, …)
     * have their costs redistributed to RUNNING products only — a product with 0 running pods
     * pays nothing extra so that sum(running product totals) still equals cluster total.
     *
     * <p>Guarantee: sum(product.totalHourlyUsd) == sum(all namespace hourlyRateUsd).
     */
    private List<PrometheusLiveCostSnapshot.ProductCost> buildProductView(
            String envKey, List<NamespaceCost> namespaceCosts,
            Map<String, List<Pod>> podsByNs) {

        String prefix = envKey.toLowerCase(Locale.ROOT);

        // Group non-system namespaces by their normalised product name
        // e.g. "qa-frontend", "qa-frontend-v2" → key "FRONTEND"
        Map<String, List<NamespaceCost>> productGroups = new LinkedHashMap<>();
        List<NamespaceCost> supportNs = new ArrayList<>();

        for (NamespaceCost nc : namespaceCosts) {
            String nsLower = nc.getNamespace().toLowerCase(Locale.ROOT);
            if (isSystemNs(nc.getNamespace())) {
                // System namespaces are always "support"
                supportNs.add(nc);
            } else if (nsLower.startsWith(prefix + "-") || nsLower.equals(prefix)) {
                // Strip the env prefix to get the product key
                String stripped = nsLower.equals(prefix) ? prefix
                        : nsLower.substring(prefix.length() + 1);
                // Further normalise: strip common env suffixes (v2, canary, etc.)
                String productKey = normaliseNs(stripped).toUpperCase(Locale.ROOT);
                if (productKey.isBlank()) productKey = nc.getNamespace().toUpperCase(Locale.ROOT);
                productGroups.computeIfAbsent(productKey, k -> new ArrayList<>()).add(nc);
            } else {
                // Namespace doesn't start with env prefix — treat as support
                supportNs.add(nc);
            }
        }

        if (productGroups.isEmpty()) return List.of();

        double totalSupportHourly = supportNs.stream().mapToDouble(nc -> safe(nc.getHourlyRateUsd())).sum();
        double totalSupportMtd    = supportNs.stream().mapToDouble(nc -> safe(nc.getMonthToDateUsd())).sum();

        // Determine UP/DOWN per product group
        // A product is UP when at least one of its namespaces has at least one running pod.
        record ProductState(double cpuH, double memH, double storH, double netH, double infraH,
                            double nsH, double mtd, int pods, int runningPods,
                            List<String> nsNames, String projectName) {}
        Map<String, ProductState> states = new LinkedHashMap<>();
        for (var entry : productGroups.entrySet()) {
            String key = entry.getKey();
            List<NamespaceCost> group = entry.getValue();
            double cpuH  = 0, memH  = 0, storH = 0, netH = 0, nsH = 0, mtd = 0;
            int pods = 0, runningPods = 0;
            List<String> nsNames = new ArrayList<>();
            String projectName = null;
            for (NamespaceCost nc : group) {
                double c = safe(nc.getComputeHourlyUsd());
                double m = safe(nc.getMemoryHourlyUsd());
                double s = safe(nc.getStorageHourlyUsd());
                double n = safe(nc.getNetworkHourlyUsd());
                double h = safe(nc.getHourlyRateUsd());
                cpuH  += c; memH  += m; storH += s; netH  += n; nsH   += h;
                mtd   += safe(nc.getMonthToDateUsd());
                nsNames.add(nc.getNamespace());
                if (projectName == null && nc.getMatchedProjectName() != null)
                    projectName = nc.getMatchedProjectName();
                List<Pod> nsPods = podsByNs.getOrDefault(nc.getNamespace(), List.of());
                pods       += nsPods.size();
                // Only persistent-workload pods (Deployment/StatefulSet/DaemonSet) count for UP/DOWN.
                // Excludes cert-manager ACME challenge solver pods (workloadKind=Job) and CronJob pods
                // which are ephemeral and do not indicate the product is serving traffic.
                runningPods += (int) nsPods.stream()
                        .filter(Pod::isRunning)
                        .filter(PrometheusCostService::isApplicationPod)
                        .count();
            }
            double infraH = Math.max(0d, nsH - cpuH - memH - storH - netH);
            if (projectName == null) projectName = key;
            states.put(key, new ProductState(cpuH, memH, storH, netH, infraH, nsH, mtd, pods, runningPods, nsNames, projectName));
        }

        // Only RUNNING products share the support overhead.
        // A DOWN product's base ns cost is still shown, but it gets 0 support share.
        List<String> runningKeys = states.entrySet().stream()
                .filter(e -> e.getValue().runningPods() > 0)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        // Distribute support by compute weight among RUNNING products; equal fallback.
        double runningComputeTotal = runningKeys.stream()
                .mapToDouble(k -> states.get(k).cpuH() + states.get(k).memH())
                .sum();
        int runningCount = runningKeys.size();

        double totalProductH = states.values().stream().mapToDouble(ProductState::nsH).sum()
                + totalSupportHourly;

        List<PrometheusLiveCostSnapshot.ProductCost> result = new ArrayList<>();
        for (var entry : states.entrySet()) {
            String key = entry.getKey();
            ProductState ps = entry.getValue();
            boolean isUp = ps.runningPods() > 0;

            double supportShare = 0d, supportMtdShare = 0d;
            if (isUp && totalSupportHourly > 0) {
                double weight = runningComputeTotal > 0
                        ? (ps.cpuH() + ps.memH()) / runningComputeTotal
                        : (runningCount > 0 ? 1d / runningCount : 1d);
                supportShare    = weight * totalSupportHourly;
                supportMtdShare = weight * totalSupportMtd;
            }

            double totalH = ps.nsH() + supportShare;
            double pct    = totalProductH > 0 ? (totalH / totalProductH) * 100d : 0d;

            List<PrometheusLiveCostSnapshot.ProductCostLine> lines = new ArrayList<>();
            if (ps.cpuH()  > 1e-9) lines.add(pcl("compute", "Compute — CPU",     ps.cpuH()));
            if (ps.memH()  > 1e-9) lines.add(pcl("memory",  "Compute — Memory",  ps.memH()));
            if (ps.storH() > 1e-9) lines.add(pcl("storage", "Storage (PVCs)",    ps.storH()));
            if (ps.netH()  > 1e-9) lines.add(pcl("network", "Network (LB)",      ps.netH()));
            if (ps.infraH()> 1e-9) lines.add(pcl("system",  "Infrastructure (system pool + registry + egress)", ps.infraH()));
            if (supportShare > 1e-9)
                lines.add(pcl("support",
                        String.format("Supportive ns overhead (%d ns, split to %d running product%s)",
                                supportNs.size(), runningCount, runningCount == 1 ? "" : "s"),
                        supportShare));
            if (!isUp)
                lines.add(pcl("info", "Product is DOWN — no overhead distributed (0 running pods)", 0d));

            result.add(PrometheusLiveCostSnapshot.ProductCost.builder()
                    .namespace(key)
                    .projectName(ps.projectName())
                    .namespaceNames(ps.nsNames())
                    .podCount(ps.pods())
                    .runningPodCount(ps.runningPods())
                    .running(isUp)
                    .status(isUp ? "UP" : "DOWN")
                    .percentOfTotal(pct)
                    .computeHourlyUsd(ps.cpuH() + ps.memH())
                    .storageHourlyUsd(ps.storH())
                    .networkHourlyUsd(ps.netH())
                    .infraShareHourlyUsd(ps.infraH())
                    .supportShareHourlyUsd(supportShare)
                    .totalHourlyUsd(totalH)
                    .dailyUsd(totalH * HOURS_PER_DAY)
                    .monthlyUsd(totalH * HOURS_PER_MONTH)
                    .monthToDateUsd(ps.mtd() + supportMtdShare)
                    .lines(lines)
                    .build());
        }
        return result;
    }

    private static PrometheusLiveCostSnapshot.ProductCostLine pcl(
            String category, String label, double hourly) {
        return PrometheusLiveCostSnapshot.ProductCostLine.builder()
                .category(category).label(label)
                .hourlyUsd(hourly)
                .dailyUsd(hourly * HOURS_PER_DAY)
                .monthlyUsd(hourly * HOURS_PER_MONTH)
                .build();
    }

    /** Map a k8s storageclass name to its Azure managed-disk SKU. */
    private static String mapStorageClassToAzureSku(String sc) {
        if (sc == null) return "Standard HDD";
        String lc = sc.toLowerCase(Locale.ROOT);
        if (lc.contains("premium-ssd-v2") || lc.contains("premiumv2")) return "Premium SSD v2";
        if (lc.contains("ultra")) return "Ultra Disk";
        if (lc.contains("premium")) return "Premium SSD";
        if (lc.contains("ssd")) return "Standard SSD";
        return "Standard HDD";
    }

    /** Conservative fallback when Azure Retail returns no row for a storage class. */
    private static double defaultStoragePrice(String sc) {
        String azureSkuName = mapStorageClassToAzureSku(sc);
        return switch (azureSkuName) {
            case "Premium SSD v2" -> 0.10;
            case "Premium SSD" -> 0.135;
            case "Ultra Disk" -> 0.20;
            case "Standard SSD" -> 0.075;
            default -> 0.045;
        };
    }

    /** Convert a unit (e.g. "1 Hour", "1 Day", "1 GB/Month") to an hourly rate. */
    private static double unitToHourly(double unitPrice, String uom) {
        if (uom == null) return unitPrice;
        String u = uom.toLowerCase(Locale.ROOT);
        if (u.contains("hour")) return unitPrice;
        if (u.contains("day")) return unitPrice / 24d;
        if (u.contains("month")) return unitPrice / HOURS_PER_MONTH;
        if (u.contains("year")) return unitPrice / (HOURS_PER_MONTH * 12d);
        return unitPrice;
    }

    /**
     * Returns the Azure managed disk tier SKU name for a given size and type.
     * Azure bills per-disk-instance at fixed tier boundaries, not per GB.
     * Rounds UP to the next tier so we never under-price.
     */
    private static String managedDiskTierSku(int sizeGb, boolean premium, boolean standardSsd) {
        // Tier boundaries: {maxGb, tierNumber}
        int[][] tiers = {{4,1},{8,2},{16,3},{32,4},{64,6},{128,10},{256,15},{512,20},{1024,30},
                         {2048,40},{4096,50},{8192,60},{16384,70},{32767,80}};
        String prefix = premium ? "P" : (standardSsd ? "E" : "S");
        for (int[] t : tiers) {
            if (sizeGb <= t[0]) return prefix + t[1];
        }
        return prefix + "80";
    }

    /** Human-readable OS disk description for the most common tier in a pool. */
    private static String dominantDiskTierDesc(Map<String, Integer> tierCounts) {
        if (tierCounts.isEmpty()) return "Standard SSD E10 LRS (128 GB) · live Azure pricing";
        String dominant = tierCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("E10");
        boolean premium = dominant.startsWith("P");
        boolean stdSsd  = dominant.startsWith("E");
        String type = premium ? "Premium SSD" : (stdSsd ? "Standard SSD" : "Standard HDD");
        double monthly = fallbackManagedDiskMonthly(dominant);
        return String.format("%s %s LRS (128 GB) · ~$%.2f/mo each · live Azure pricing", type, dominant, monthly);
    }

    /** Fallback monthly prices when Azure API returns nothing for a managed disk tier. */
    private static double fallbackManagedDiskMonthly(String tierSku) {
        if (tierSku == null) return 17.92d;
        return switch (tierSku) {
            case "P1"  -> 1.54d;  case "P2"  -> 2.15d;  case "P3"  -> 3.08d;
            case "P4"  -> 5.28d;  case "P6"  -> 10.53d; case "P10" -> 17.92d;
            case "P15" -> 30.69d; case "P20" -> 54.40d; case "P30" -> 102.40d;
            case "P40" -> 204.80d; case "P50" -> 409.60d;
            case "E4"  -> 2.40d;  case "E6"  -> 4.61d;  case "E10" -> 9.60d;
            case "E15" -> 17.01d; case "E20" -> 32.64d; case "E30" -> 56.64d;
            case "S4"  -> 1.54d;  case "S6"  -> 3.08d;  case "S10" -> 5.49d;
            case "S15" -> 10.21d; case "S20" -> 18.19d; case "S30" -> 30.69d;
            default -> 17.92d;
        };
    }

    /**
     * Look up the live Azure managed disk tier price and return monthly USD.
     * Uses Azure Retail Pricing API: skuName eq 'P10 LRS' and serviceName eq 'Storage'.
     */
    private double managedDiskTierMonthly(int sizeGb, boolean premium, boolean standardSsd, String region) {
        String tierSku = managedDiskTierSku(sizeGb, premium, standardSsd);
        String redundancy = "LRS"; // LRS is the default and cheapest
        String filter = "serviceName eq 'Storage' and skuName eq '" + tierSku + " " + redundancy + "'"
                + " and armRegionName eq '" + escape(region) + "' and type eq 'Consumption'";
        AzurePriceRecord pr = firstPrice(filter);
        if (pr == null && !region.equalsIgnoreCase(defaultRegion())) {
            // Try default region
            filter = "serviceName eq 'Storage' and skuName eq '" + tierSku + " " + redundancy + "'"
                    + " and armRegionName eq '" + escape(defaultRegion()) + "' and type eq 'Consumption'";
            pr = firstPrice(filter);
        }
        if (pr != null && pr.getRetailPrice() != null && pr.getRetailPrice() > 0) {
            String uom = pr.getUnitOfMeasure() == null ? "" : pr.getUnitOfMeasure().toLowerCase();
            if (uom.contains("month") || uom.contains("gb")) return safe(pr.getRetailPrice());
            if (uom.contains("hour")) return safe(pr.getRetailPrice()) * HOURS_PER_MONTH;
            return safe(pr.getRetailPrice());
        }
        return fallbackManagedDiskMonthly(tierSku);
    }

    /** True if this VM SKU supports Premium storage (D*s, E*s, F*s families). */
    private static boolean isPremiumCapableVm(String vmSize) {
        if (vmSize == null) return false;
        String s = vmSize.toLowerCase(java.util.Locale.ROOT);
        // Premium-capable VMs have an 's' suffix in the family (D2s_v3, E4s_v5, etc)
        return s.matches(".*_[a-z]*s[0-9]*_.*") || s.matches(".*_[a-z]*s[0-9]*$");
    }

    /**
     * Rough namespace ↔ project name normalisation. Most teams name namespaces
     * either {@code <project>} or {@code <project>-<env>}. Strip env suffixes
     * and lowercase to make matching forgiving.
     */
    /**
     * Strip known environment prefixes AND suffixes, then fold to alphanumeric.
     * Handles both styles:
     *   qa-frontend   → frontend   (prefix style)
     *   frontend-qa   → frontend   (suffix style)
     *   frontend-prod-v2 → frontendv2 (suffix stripped only at the end)
     */
    private static final java.util.regex.Pattern ENV_PREFIX =
        java.util.regex.Pattern.compile(
            "^(qa|dev|prod|production|stage|staging|uat|sit|pre|preprod|sandbox|test|perf|hotfix)-",
            java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern ENV_SUFFIX =
        java.util.regex.Pattern.compile(
            "-(qa|dev|prod|production|stage|staging|uat|sit|pre|preprod|sandbox|test|perf|hotfix)$",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    private static String normaliseNs(String ns) {
        if (ns == null) return "";
        String s = ns.toLowerCase(Locale.ROOT);
        // Strip environment prefix first (e.g. "qa-frontend" → "frontend")
        s = ENV_PREFIX.matcher(s).replaceFirst("");
        // Then strip any remaining environment suffix (e.g. "frontend-prod" → "frontend")
        s = ENV_SUFFIX.matcher(s).replaceFirst("");
        // Fold to alphanumeric only
        return s.replaceAll("[^a-z0-9]", "");
    }
}
