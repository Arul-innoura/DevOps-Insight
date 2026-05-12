package com.devops.backend.config;

import com.devops.backend.model.Environment;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.environment.CloudEnvironment.AksNodeSpec;
import com.devops.backend.model.environment.CloudEnvironment.CategoryGroup;
import com.devops.backend.model.environment.CloudEnvironment.CategoryServiceItem;
import com.devops.backend.model.environment.CloudEnvironment.InfraResource;
import com.devops.backend.model.environment.CloudEnvironment.NodePoolConfig;
import com.devops.backend.model.environment.CloudEnvironment.SharedEnvService;
import com.devops.backend.repository.CloudEnvironmentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Seeds default {@link CloudEnvironment} records on first boot:
 * <ul>
 *   <li>One Azure-provider environment per legacy {@link Environment} enum value.</li>
 *   <li>A single cross-environment "Shared" record (sharedScope = true) for AI services
 *       that are common to every Azure environment.</li>
 * </ul>
 *
 * <p>Existing records are also <em>upgraded</em> in place: missing {@code provider}
 * defaults to {@code AZURE}, and empty {@code categoryGroups} are populated from the
 * legacy node-pool / infra / shared-service fields so the new admin tree renders
 * the same data without losing cost-history continuity.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CloudEnvironmentSeeder {

    public static final String PROVIDER_AZURE = "AZURE";
    public static final String SHARED_AZURE_NAME = "Shared-Azure";

    /** Default category order for the admin UI tree. */
    public static final List<String[]> DEFAULT_CATEGORIES = Arrays.asList(
            new String[]{"compute",  "Compute"},
            new String[]{"aks",      "AKS / Kubernetes"},
            new String[]{"network",  "Network"},
            new String[]{"security", "Security"},
            new String[]{"storage",  "Storage"},
            new String[]{"database", "Database"},
            new String[]{"ai",       "AI / ML"},
            new String[]{"other",    "Other"}
    );

    private final CloudEnvironmentRepository repository;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        // 1) Per-enum environment seed (skip if name already exists)
        for (Environment env : Environment.values()) {
            String name = env.name();
            if (repository.existsByNameIgnoreCase(name)) continue;
            CloudEnvironment seeded = CloudEnvironment.builder()
                    .name(name)
                    .displayName(env.getDisplayName())
                    .provider(PROVIDER_AZURE)
                    .sharedScope(false)
                    .azureRegion("eastus")
                    .description("Auto-seeded from legacy environment " + env.getDisplayName()
                            + ". Configure node pools and shared services to enable cost tracking.")
                    .categoryGroups(emptyCategoryTemplate())
                    .createdAt(Instant.now())
                    .createdBy("system-seed")
                    .updatedAt(Instant.now())
                    .updatedBy("system-seed")
                    .build();
            repository.save(seeded);
            log.info("Seeded CloudEnvironment '{}' for legacy enum {}", name, env.name());
        }

        // 2) Shared (cross-environment) Azure scope — for AI / common services
        if (!repository.existsByNameIgnoreCase(SHARED_AZURE_NAME)) {
            CloudEnvironment shared = CloudEnvironment.builder()
                    .name(SHARED_AZURE_NAME)
                    .displayName("Shared Services (Azure)")
                    .provider(PROVIDER_AZURE)
                    .sharedScope(true)
                    .azureRegion("eastus")
                    .description("Cross-environment shared services (typically AI). "
                            + "Costs split across every project in every Azure environment.")
                    .categoryGroups(emptyCategoryTemplate())
                    .createdAt(Instant.now())
                    .createdBy("system-seed")
                    .updatedAt(Instant.now())
                    .updatedBy("system-seed")
                    .build();
            repository.save(shared);
            log.info("Seeded shared Azure scope CloudEnvironment '{}'", SHARED_AZURE_NAME);
        }

        // 3) In-place upgrade of pre-existing rows that predate the new fields
        for (CloudEnvironment env : repository.findAll()) {
            boolean changed = false;
            if (env.getProvider() == null || env.getProvider().isBlank()) {
                env.setProvider(PROVIDER_AZURE);
                changed = true;
            }
            if (env.getSharedScope() == null) {
                env.setSharedScope(SHARED_AZURE_NAME.equalsIgnoreCase(env.getName()));
                changed = true;
            }
            if (env.getCategoryGroups() == null || env.getCategoryGroups().isEmpty()) {
                env.setCategoryGroups(buildCategoriesFromLegacy(env));
                changed = true;
            }
            if (changed) {
                env.setUpdatedAt(Instant.now());
                env.setUpdatedBy("system-upgrade");
                repository.save(env);
                log.info("Upgraded CloudEnvironment '{}' with provider/sharedScope/categoryGroups", env.getName());
            }
        }
    }

    /** A fresh category template — empty service lists, in canonical order. */
    public static List<CategoryGroup> emptyCategoryTemplate() {
        List<CategoryGroup> out = new ArrayList<>();
        for (int i = 0; i < DEFAULT_CATEGORIES.size(); i++) {
            String[] kv = DEFAULT_CATEGORIES.get(i);
            out.add(CategoryGroup.builder()
                    .key(kv[0])
                    .displayName(kv[1])
                    .order(i)
                    .services(new ArrayList<>())
                    .build());
        }
        return out;
    }

    /**
     * Migrate legacy node-pool / infra / shared-service fields into the new
     * structured catalog so existing environments continue to render in the
     * redesigned admin UI.
     */
    private static List<CategoryGroup> buildCategoriesFromLegacy(CloudEnvironment env) {
        Map<String, CategoryGroup> byKey = new LinkedHashMap<>();
        for (CategoryGroup g : emptyCategoryTemplate()) {
            byKey.put(g.getKey(), g);
        }

        // AKS composite: bundle system/user/additional node pools + control-plane line
        List<AksNodeSpec> aksNodes = new ArrayList<>();
        addAksNode(aksNodes, "system", env.getSystemNodePool());
        addAksNode(aksNodes, "user", env.getUserNodePool());
        if (env.getAdditionalNodePools() != null) {
            for (NodePoolConfig np : env.getAdditionalNodePools()) {
                if (np == null) continue;
                String role = np.getKind() != null && !np.getKind().isBlank() ? np.getKind() : "user";
                addAksNode(aksNodes, role, np);
            }
        }
        if (!aksNodes.isEmpty()) {
            CategoryServiceItem aks = CategoryServiceItem.builder()
                    .id(UUID.randomUUID().toString())
                    .name("AKS Cluster")
                    .displayName(env.getDisplayName() != null ? env.getDisplayName() + " AKS" : "AKS Cluster")
                    .azureServiceName("Azure Kubernetes Service")
                    .azureArmRegionName(env.getAzureRegion())
                    .count(1)
                    .allocation("USER_NODE")
                    .aksNodes(aksNodes)
                    .build();
            byKey.get("aks").getServices().add(aks);
        }

        // Network: ingress + load balancer + domain
        addInfraToCategory(byKey.get("network"), "Ingress", env.getIngress(), "NETWORK");
        addInfraToCategory(byKey.get("network"), "Load Balancer", env.getLoadBalancer(), "NETWORK");
        addInfraToCategory(byKey.get("network"), "DNS Zone", env.getDomain(), "NETWORK");

        // Security: container registry + key vault
        addInfraToCategory(byKey.get("security"), "Container Registry", env.getContainerRegistry(), "SECURITY");
        addInfraToCategory(byKey.get("security"), "Key Vault", env.getKeyVault(), "SECURITY");

        // Storage
        addInfraToCategory(byKey.get("storage"), "Storage Account", env.getStorage(), "GENERAL");

        // Shared services — bucket by SharedEnvService.category, default to "ai"
        if (env.getSharedServices() != null) {
            for (SharedEnvService s : env.getSharedServices()) {
                if (s == null) continue;
                String catKey = mapSharedCategory(s.getCategory());
                CategoryGroup target = byKey.getOrDefault(catKey, byKey.get("other"));
                target.getServices().add(CategoryServiceItem.builder()
                        .id(s.getId() != null ? s.getId() : UUID.randomUUID().toString())
                        .name(s.getName())
                        .displayName(s.getName())
                        .azureMeterId(s.getAzureMeterId())
                        .azureSkuName(s.getAzureSkuName())
                        .hourlyRateUsd(s.getHourlyRateUsd())
                        .monthlyRateUsd(s.getMonthlyRateUsd())
                        .count(1)
                        .notes(s.getNotes())
                        .allocation("ai".equals(catKey) ? "AI_SHARED" : "GENERAL")
                        .build());
            }
        }

        return new ArrayList<>(byKey.values());
    }

    private static void addAksNode(List<AksNodeSpec> out, String role, NodePoolConfig np) {
        if (np == null || np.getVmSize() == null || np.getVmSize().isBlank()) return;
        out.add(AksNodeSpec.builder()
                .role(role)
                .poolName(np.getPoolName())
                .azureMeterId(np.getAzureMeterId())
                .azureSkuName(np.getAzureSkuName() != null ? np.getAzureSkuName() : np.getVmSize())
                .hourlyRateUsd(np.getHourlyRateUsd())
                .monthlyRateUsd(np.getHourlyRateUsd() != null ? np.getHourlyRateUsd() * 730.0 : null)
                .vCpuPerNode(np.getVCpuPerNode())
                .memoryGbPerNode(np.getMemoryGbPerNode())
                .nodeCount(np.getNodeCount() != null ? np.getNodeCount() : 1)
                .build());
    }

    private static void addInfraToCategory(CategoryGroup group, String catalogName,
                                           InfraResource res, String allocation) {
        if (res == null) return;
        if ((res.getName() == null || res.getName().isBlank())
                && (res.getSku() == null || res.getSku().isBlank())
                && (res.getAzureMeterId() == null || res.getAzureMeterId().isBlank())) {
            return;
        }
        group.getServices().add(CategoryServiceItem.builder()
                .id(UUID.randomUUID().toString())
                .name(catalogName)
                .displayName(res.getName() != null ? res.getName() : catalogName)
                .azureMeterId(res.getAzureMeterId())
                .azureSkuName(res.getSku())
                .hourlyRateUsd(res.getHourlyRateUsd())
                .monthlyRateUsd(res.getHourlyRateUsd() != null ? res.getHourlyRateUsd() * 730.0 : null)
                .count(res.getCount() != null && res.getCount() > 0 ? res.getCount() : 1)
                .allocation(allocation)
                .build());
    }

    private static String mapSharedCategory(String legacyCategory) {
        if (legacyCategory == null) return "other";
        String c = legacyCategory.toLowerCase();
        if (c.contains("ai") || c.contains("ml") || c.contains("openai") || c.contains("cognitive")) return "ai";
        if (c.contains("db") || c.contains("sql") || c.contains("cosmos") || c.contains("mongo") || c.contains("redis")) return "database";
        if (c.contains("queue") || c.contains("bus") || c.contains("event") || c.contains("rabbit")) return "other";
        if (c.contains("storage") || c.contains("blob")) return "storage";
        if (c.contains("net") || c.contains("gateway") || c.contains("api management")) return "network";
        if (c.contains("vault") || c.contains("identity") || c.contains("auth")) return "security";
        return "other";
    }
}
