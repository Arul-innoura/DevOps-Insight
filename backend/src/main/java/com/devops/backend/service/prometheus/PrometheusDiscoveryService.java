package com.devops.backend.service.prometheus;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pulls live cluster topology and per-pod resource usage from Prometheus.
 * Returns a {@link Topology} snapshot — pure data, no side effects, no
 * persistence. The cost engine consumes this and combines with Azure
 * pricing to compute USD figures.
 *
 * <p>Queries are written to be portable across kube-state-metrics +
 * cAdvisor + node-exporter installations. Where a metric is missing,
 * the relevant field is left null/zero rather than throwing.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PrometheusDiscoveryService {

    /** Namespaces we never want to attribute cost to (handled via "platform-overhead" if needed). */
    private static final Set<String> SYSTEM_NAMESPACES = Set.of(
            "kube-system", "kube-public", "kube-node-lease", "gatekeeper-system",
            "calico-system", "tigera-operator", "default", "ingress-nginx",
            "cert-manager", "monitoring", "prometheus", "grafana", "loki",
            "azure-arc", "azure-extensions-usage-system", "kubernetes-dashboard"
    );

    private final PrometheusClient client;

    public Topology discover(String env) {
        Topology t = new Topology();
        t.env = env;
        if (!client.hasEnv(env)) {
            log.debug("Prometheus discovery skipped — env {} not configured", env);
            return t;
        }

        // ----- Nodes -----
        for (var s : client.queryVector(env, "kube_node_info")) {
            Node n = new Node();
            n.name = s.label("node");
            n.providerId = s.label("provider_id");
            n.kernel = s.label("kernel_version");
            n.osImage = s.label("os_image");
            n.kubeletVersion = s.label("kubelet_version");
            t.nodes.put(n.name, n);
        }
        // Node CPU capacity (cores)
        for (var s : client.queryVector(env, "kube_node_status_capacity{resource=\"cpu\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n != null) n.cpuCores = s.value();
        }
        // Node memory capacity (bytes)
        for (var s : client.queryVector(env, "kube_node_status_capacity{resource=\"memory\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n != null) n.memoryBytes = s.value();
        }
        // ── Pass 1: general kube_node_labels — reads all labels kube-state-metrics
        //           exposes by default (agentpool, mode, storagetier, disk size, etc.)
        for (var s : client.queryVector(env, "kube_node_labels")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            // VM SKU — try every label name Azure / KSM may use
            String sku = firstNonBlank(
                    s.label("label_kubernetes_azure_com_sku"),
                    s.label("label_node_kubernetes_io_instance_type"),
                    s.label("label_beta_kubernetes_io_instance_type"),
                    s.label("label_node_kubernetes_azure_com_sku"));
            if (!sku.isBlank()) n.vmSize = sku;
            String region = firstNonBlank(
                    s.label("label_topology_kubernetes_io_region"),
                    s.label("label_failure_domain_beta_kubernetes_io_region"));
            if (!region.isBlank()) n.region = region;
            String pool = firstNonBlank(
                    s.label("label_kubernetes_azure_com_agentpool"),
                    s.label("label_agentpool"));
            if (!pool.isBlank()) n.agentPool = pool;
            String role = firstNonBlank(
                    s.label("label_kubernetes_azure_com_mode"),
                    s.label("label_node_role_kubernetes_io"),
                    s.label("label_kubernetes_io_role"));
            if (!role.isBlank()) n.role = role;
            String zone = firstNonBlank(
                    s.label("label_topology_kubernetes_io_zone"),
                    s.label("label_failure_domain_beta_kubernetes_io_zone"));
            if (!zone.isBlank()) n.zone = zone;
            String priority = firstNonBlank(
                    s.label("label_kubernetes_azure_com_scalesetpriority"),
                    s.label("label_node_kubernetes_io_lifecycle"));
            if ("spot".equalsIgnoreCase(priority)) n.spot = true;
            String diskSizeStr = s.label("label_kubernetes_azure_com_os_disk_size_gb");
            if (!diskSizeStr.isBlank()) {
                try { n.osDiskSizeGb = Integer.parseInt(diskSizeStr); } catch (NumberFormatException ignored) {}
            }
            String storageProfile = s.label("label_kubernetes_azure_com_storageprofile");
            if (!storageProfile.isBlank()) n.osDiskStorageProfile = storageProfile;
            String storageTier = s.label("label_kubernetes_azure_com_storagetier");
            if (!storageTier.isBlank()) n.osDiskStorageTier = storageTier;
        }

        // ── Pass 2: targeted label-selector queries — Prometheus only returns nodes
        //           where the requested label is actually set, guaranteeing we get
        //           the value for every node that has it even when the general query
        //           above returns a time series without that label included.

        // VM SKU — the most important label: node.kubernetes.io/instance-type
        // IMPORTANT: preserves original casing (Standard_D8s_v3, not standard_d8s_v3)
        for (var s : client.queryVector(env,
                "kube_node_labels{label_node_kubernetes_io_instance_type!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            String sku = s.label("label_node_kubernetes_io_instance_type");
            if (!sku.isBlank()) n.vmSize = sku;   // always overwrite — this is the authoritative source
        }
        // beta label (older clusters / nodes)
        for (var s : client.queryVector(env,
                "kube_node_labels{label_beta_kubernetes_io_instance_type!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null || (n.vmSize != null && !n.vmSize.isBlank())) continue;
            String sku = s.label("label_beta_kubernetes_io_instance_type");
            if (!sku.isBlank()) n.vmSize = sku;
        }
        // Azure-specific SKU label (kubernetes.azure.com/sku)
        for (var s : client.queryVector(env,
                "kube_node_labels{label_kubernetes_azure_com_sku!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null || (n.vmSize != null && !n.vmSize.isBlank())) continue;
            String sku = s.label("label_kubernetes_azure_com_sku");
            if (!sku.isBlank()) n.vmSize = sku;
        }
        // Region — topology.kubernetes.io/region
        for (var s : client.queryVector(env,
                "kube_node_labels{label_topology_kubernetes_io_region!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            String region = s.label("label_topology_kubernetes_io_region");
            if (!region.isBlank()) n.region = region;
        }
        // Agent pool — kubernetes.azure.com/agentpool
        for (var s : client.queryVector(env,
                "kube_node_labels{label_kubernetes_azure_com_agentpool!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            String pool = s.label("label_kubernetes_azure_com_agentpool");
            if (!pool.isBlank()) n.agentPool = pool;
        }
        // Pool mode (System / User) — kubernetes.azure.com/mode
        for (var s : client.queryVector(env,
                "kube_node_labels{label_kubernetes_azure_com_mode!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            String mode = s.label("label_kubernetes_azure_com_mode");
            if (!mode.isBlank()) n.role = mode;
        }
        // Spot flag — kubernetes.azure.com/scalesetpriority
        for (var s : client.queryVector(env,
                "kube_node_labels{label_kubernetes_azure_com_scalesetpriority!=\"\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n == null) continue;
            if ("spot".equalsIgnoreCase(s.label("label_kubernetes_azure_com_scalesetpriority")))
                n.spot = true;
        }

        // ── Pass 3: node_metadata from azure-cloud-controller-manager
        for (var s : client.queryVector(env, "node_metadata{type=\"vm_size\"}")) {
            Node n = t.nodes.get(s.label("node"));
            if (n != null && (n.vmSize == null || n.vmSize.isBlank())) {
                String v = firstNonBlank(s.label("vm_size"), s.label("instance_type"), s.label("value"));
                if (!v.isBlank()) n.vmSize = v;
            }
        }
        // Post-process: if kube_node_labels did not expose the agentPool / spot labels,
        // derive them from the AKS VMSS node naming convention:
        //   aks-{agentpoolname}-{7char-hash}-vmss{6char-instanceid}
        // This is the reliable fallback for clusters where the Azure-specific labels
        // are not scraped (e.g. kube-state-metrics deployed without --metric-labels-allowlist).
        for (Node n : t.nodes.values()) {
            if (n.agentPool == null || n.agentPool.isBlank()) {
                String poolFromName = parseAgentPoolFromNodeName(n.name);
                if (poolFromName != null && !poolFromName.isBlank()) {
                    n.agentPool = poolFromName;
                }
            }
            // Set spot flag from agentPool name when the scalesetpriority label was absent.
            if (!n.spot && n.agentPool != null
                    && n.agentPool.toLowerCase(java.util.Locale.ROOT).contains("spot")) {
                n.spot = true;
            }
        }

        // ----- Pods (one row per running pod) -----
        for (var s : client.queryVector(env, "kube_pod_info")) {
            String ns = s.label("namespace");
            if (ns.isBlank() || isSystemNs(ns)) continue;
            Pod p = new Pod();
            p.namespace = ns;
            p.name = s.label("pod");
            p.node = s.label("node");
            p.hostIp = s.label("host_ip");
            p.podIp = s.label("pod_ip");
            t.pods.put(ns + "/" + p.name, p);
        }
        // Phase — drop non-Running unless we explicitly want Pending counters
        for (var s : client.queryVector(env, "kube_pod_status_phase{phase=\"Running\"}")) {
            if (s.value() < 0.5) continue;
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.running = true;
        }
        // Workload owner ref → microservice name
        for (var s : client.queryVector(env, "kube_pod_owner")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p == null) continue;
            String kind = s.label("owner_kind");
            String name = s.label("owner_name");
            if ("ReplicaSet".equalsIgnoreCase(kind)) {
                // strip the trailing -<hash> from RS name to get the deployment
                p.workload = name.replaceFirst("-[a-z0-9]{8,12}$", "");
                p.workloadKind = "Deployment";
            } else if (!kind.isBlank()) {
                p.workload = name;
                p.workloadKind = kind;
            }
        }
        // Image — used to detect ACR usage
        for (var s : client.queryVector(env, "kube_pod_container_info")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p == null) continue;
            String image = s.label("image");
            if (!image.isBlank()) {
                p.images.add(image);
                Matcher m = ACR_HOST.matcher(image);
                if (m.find()) t.acrHosts.add(m.group(1));
            }
        }
        // Container restarts
        for (var s : client.queryVector(env, "sum by (namespace, pod) (kube_pod_container_status_restarts_total)")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.restarts = (int) s.value();
        }
        // CPU usage in cores (5m rate). Try cAdvisor; fall back to instance label.
        for (var s : client.queryVector(env,
                "sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=\"\",container!=\"POD\"}[5m]))")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.cpuCores = s.value();
        }
        // Memory in bytes (working set). Skip the per-pod root cgroup which has empty `container`.
        for (var s : client.queryVector(env,
                "sum by (namespace, pod) (container_memory_working_set_bytes{container!=\"\",container!=\"POD\"})")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.memoryBytes = s.value();
        }
        // CPU resource.requests in cores — what k8s reserves on the node when scheduling.
        // This is what we charge against, even if a pod is currently idle.
        for (var s : client.queryVector(env,
                "sum by (namespace, pod) (kube_pod_container_resource_requests{resource=\"cpu\",unit=\"core\"})")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.cpuRequestCores = s.value();
        }
        for (var s : client.queryVector(env,
                "sum by (namespace, pod) (kube_pod_container_resource_requests{resource=\"memory\",unit=\"byte\"})")) {
            Pod p = t.pods.get(s.label("namespace") + "/" + s.label("pod"));
            if (p != null) p.memoryRequestBytes = s.value();
        }


        // ----- Persistent volumes (storage cost) -----
        for (var s : client.queryVector(env, "kube_persistentvolumeclaim_info")) {
            String ns = s.label("namespace");
            if (ns.isBlank() || isSystemNs(ns)) continue;
            Pvc pvc = new Pvc();
            pvc.namespace = ns;
            pvc.name = s.label("persistentvolumeclaim");
            pvc.storageClass = s.label("storageclass");
            t.pvcs.put(ns + "/" + pvc.name, pvc);
        }
        for (var s : client.queryVector(env,
                "kube_persistentvolumeclaim_resource_requests_storage_bytes")) {
            Pvc pvc = t.pvcs.get(s.label("namespace") + "/" + s.label("persistentvolumeclaim"));
            if (pvc != null) pvc.requestBytes = s.value();
        }

        // ----- Services exposing LoadBalancers (per namespace) -----
        for (var s : client.queryVector(env, "kube_service_info{type=\"LoadBalancer\"}")) {
            String ns = s.label("namespace");
            if (ns.isBlank() || isSystemNs(ns)) continue;
            t.loadBalancerCount++;
            t.loadBalancerByNamespace.merge(ns, 1, Integer::sum);
        }
        // ----- Public IPs (Azure attaches one Standard Public IP per LB rule) -----
        // We approximate as 1 Public IP per LoadBalancer Service. AGIC / explicit
        // ingress public IPs would need a metric exporter; this is the floor.
        t.publicIpCount = t.loadBalancerCount;

        // ----- Ingresses (per namespace) -----
        for (var s : client.queryVector(env, "count(kube_ingress_info) by (namespace)")) {
            String ns = s.label("namespace");
            if (ns.isBlank() || isSystemNs(ns)) continue;
            t.ingressCountByNamespace.merge(ns, (int) s.value(), Integer::sum);
        }

        // ----- HPA (Horizontal Pod Autoscaler) info, used to show scaling
        // range alongside cost so admins see "current vs max scale-out cost". -----
        for (var s : client.queryVector(env, "kube_horizontalpodautoscaler_info")) {
            String ns = s.label("namespace");
            if (ns.isBlank() || isSystemNs(ns)) continue;
            HorizontalAutoscaler h = new HorizontalAutoscaler();
            h.namespace = ns;
            h.name = s.label("horizontalpodautoscaler");
            h.targetKind = s.label("scaletargetref_kind");
            h.targetName = s.label("scaletargetref_name");
            t.hpas.put(ns + "/" + h.name, h);
        }
        for (var s : client.queryVector(env, "kube_horizontalpodautoscaler_spec_min_replicas")) {
            HorizontalAutoscaler h = t.hpas.get(s.label("namespace") + "/" + s.label("horizontalpodautoscaler"));
            if (h != null) h.minReplicas = (int) s.value();
        }
        for (var s : client.queryVector(env, "kube_horizontalpodautoscaler_spec_max_replicas")) {
            HorizontalAutoscaler h = t.hpas.get(s.label("namespace") + "/" + s.label("horizontalpodautoscaler"));
            if (h != null) h.maxReplicas = (int) s.value();
        }
        for (var s : client.queryVector(env, "kube_horizontalpodautoscaler_status_current_replicas")) {
            HorizontalAutoscaler h = t.hpas.get(s.label("namespace") + "/" + s.label("horizontalpodautoscaler"));
            if (h != null) h.currentReplicas = (int) s.value();
        }

        // ----- Cluster-wide outbound bandwidth (physical node NIC only) -----
        // Using node_network_transmit_bytes_total filtered to real NICs (eth0, ens*) avoids
        // double-counting all container overlay traffic (veth pairs, calico/flannel tunnels)
        // which inflated the estimate 20-50× when container_network_transmit_bytes_total was used.
        // The cost engine then applies an egressInternetFraction to estimate what fraction
        // of physical NIC traffic actually leaves the VNet (and is therefore billable).
        var tx = client.queryVector(env,
                "sum(rate(node_network_transmit_bytes_total{device!~\"lo|veth.*|cali.*|tunl.*|docker.*|flannel.*|cilium.*|azure.*\"}[5m]))");
        if (!tx.isEmpty()) t.networkTransmitBytesPerSec = tx.get(0).value();

        log.debug("Prometheus discovery {} -> nodes={} pods={} pvcs={} acrHosts={}",
                env, t.nodes.size(), t.pods.size(), t.pvcs.size(), t.acrHosts);
        return t;
    }

    private static boolean isSystemNs(String ns) {
        return SYSTEM_NAMESPACES.contains(ns);
    }

    /**
     * Extract the agentPool name from an AKS VMSS node name.
     * AKS node names follow: {@code aks-{agentpoolname}-{7chars}-vmss{6chars}}
     * Returns null when the name doesn't match this pattern.
     */
    private static String parseAgentPoolFromNodeName(String nodeName) {
        if (nodeName == null || !nodeName.startsWith("aks-")) return null;
        String[] parts = nodeName.split("-");
        // parts[0]="aks", parts[1]=pool, parts[2]=hash, parts[3]="vmss..."
        return parts.length >= 2 ? parts[1] : null;
    }

    private static final Pattern ACR_HOST = Pattern.compile("([a-z0-9]+\\.azurecr\\.io)", Pattern.CASE_INSENSITIVE);

    private static String firstNonBlank(String... vs) {
        for (String v : vs) if (v != null && !v.isBlank()) return v;
        return "";
    }

    // --------- snapshot data classes ---------

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Topology {
        @lombok.Builder.Default private String env = "";
        @lombok.Builder.Default private Map<String, Node> nodes = new HashMap<>();
        @lombok.Builder.Default private Map<String, Pod> pods = new HashMap<>();
        @lombok.Builder.Default private Map<String, Pvc> pvcs = new HashMap<>();
        @lombok.Builder.Default private Set<String> acrHosts = new HashSet<>();
        @lombok.Builder.Default private int loadBalancerCount = 0;
        @lombok.Builder.Default private int publicIpCount = 0;
        @lombok.Builder.Default private Map<String, Integer> loadBalancerByNamespace = new HashMap<>();
        @lombok.Builder.Default private Map<String, Integer> ingressCountByNamespace = new HashMap<>();
        @lombok.Builder.Default private Map<String, HorizontalAutoscaler> hpas = new HashMap<>();
        @lombok.Builder.Default private double networkTransmitBytesPerSec = 0d;

        public Set<String> namespaces() {
            Set<String> out = new TreeSet<>();
            for (Pod p : pods.values()) out.add(p.namespace);
            return out;
        }

        public boolean reachable() {
            return !nodes.isEmpty() || !pods.isEmpty();
        }
    }

    @Data @NoArgsConstructor
    public static class Node {
        private String name;
        private String providerId;
        private String region;
        private String zone;
        private String agentPool;
        private String role; // "System" / "User" / "Spot" if exposed
        private String vmSize;
        private boolean spot;
        private String osImage;
        private String kernel;
        private String kubeletVersion;
        private double cpuCores;
        private double memoryBytes;
        /** OS disk size in GB from AKS node label (0 = unknown, default 128 will be used). */
        private int osDiskSizeGb;
        /** "managed" or "ephemeral" from kubernetes.azure.com/storageprofile label. Ephemeral = no disk charge. */
        private String osDiskStorageProfile;
        /** Storage tier from kubernetes.azure.com/storagetier label e.g. "Premium_LRS", "StandardSSD_LRS". */
        private String osDiskStorageTier;
    }

    @Data @NoArgsConstructor
    public static class HorizontalAutoscaler {
        private String namespace;
        private String name;
        private String targetKind;
        private String targetName;
        private int minReplicas;
        private int maxReplicas;
        private int currentReplicas;
    }

    @Data @NoArgsConstructor
    public static class Pod {
        private String namespace;
        private String name;
        private String node;
        private String hostIp;
        private String podIp;
        private String workload;
        private String workloadKind;
        private boolean running;
        /** Live CPU usage in cores (5-minute rate). */
        private double cpuCores;
        /** Live working-set memory in bytes. */
        private double memoryBytes;
        /** Sum of container CPU resource.requests in cores — what k8s actually reserves on the node. */
        private double cpuRequestCores;
        /** Sum of container memory resource.requests in bytes. */
        private double memoryRequestBytes;

        private int restarts;
        private final List<String> images = new ArrayList<>();
    }

    @Data @NoArgsConstructor
    public static class Pvc {
        private String namespace;
        private String name;
        private String storageClass;
        private double requestBytes;
    }
}
