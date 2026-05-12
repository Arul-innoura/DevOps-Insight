package com.devops.backend.service.impl;

import com.devops.backend.dto.azure.AzureCatalogSuggestion;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.monitoring.AzurePriceRecord;
import com.devops.backend.model.workflow.CloudServiceItem;
import com.devops.backend.model.workflow.ClusterInfrastructure;
import com.devops.backend.repository.AzurePriceRecordRepository;
import com.devops.backend.repository.CloudEnvironmentRepository;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import com.devops.backend.service.AzurePricingService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AzurePricingServiceImpl implements AzurePricingService {

    private static final String BASE_URL = "https://prices.azure.com/api/retail/prices";
    private static final String CURRENCY = "USD";

    private final AzurePriceRecordRepository repo;
    private final ProjectWorkflowSettingsRepository projectSettingsRepo;
    private final CloudEnvironmentRepository cloudEnvironmentRepo;
    private final ObjectMapper mapper = new ObjectMapper();

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public List<AzurePriceRecord> search(String odataFilter, int max) {
        int limit = Math.max(1, Math.min(100, max));
        String url = BASE_URL + "?currencyCode=" + CURRENCY
                + "&$filter=" + URLEncoder.encode(odataFilter == null ? "" : odataFilter, StandardCharsets.UTF_8);

        List<AzurePriceRecord> out = new ArrayList<>();
        try {
            JsonNode node = doGet(url);
            JsonNode items = node.path("Items");
            if (items.isArray()) {
                for (JsonNode row : items) {
                    out.add(toRecord(row));
                    if (out.size() >= limit) break;
                }
            }
        } catch (Exception e) {
            log.warn("Azure pricing search failed for filter '{}': {}", odataFilter, e.getMessage());
        }
        return out;
    }

    @Override
    public Optional<AzurePriceRecord> refreshMeter(String meterId) {
        if (meterId == null || meterId.isBlank()) return Optional.empty();
        String filter = "meterId eq '" + meterId.replace("'", "''") + "'";
        List<AzurePriceRecord> rows = search(filter, 1);
        if (rows.isEmpty()) {
            return repo.findByMeterId(meterId);
        }
        AzurePriceRecord fresh = rows.get(0);
        // Preserve Mongo id when upserting by meterId
        repo.findByMeterId(meterId).ifPresent(existing -> fresh.setId(existing.getId()));
        return Optional.of(repo.save(fresh));
    }

    @Override
    public Optional<AzurePriceRecord> getCached(String meterId) {
        if (meterId == null) return Optional.empty();
        return repo.findByMeterId(meterId);
    }

    @Override
    public int refreshAllInUseMeters() {
        Set<String> meterIds = new HashSet<>();
        for (ProjectWorkflowSettings s : projectSettingsRepo.findAll()) {
            if (s.getCloudServices() != null) {
                for (CloudServiceItem c : s.getCloudServices()) {
                    if (isAzure(c) && c.getAzureMeterId() != null && !c.getAzureMeterId().isBlank()) {
                        meterIds.add(c.getAzureMeterId());
                    }
                }
            }
            if (s.getClusterInfrastructure() != null) {
                for (ClusterInfrastructure ci : s.getClusterInfrastructure().values()) {
                    if (ci != null && ci.getNodePools() != null) {
                        for (ClusterInfrastructure.NodePool np : ci.getNodePools()) {
                            if (np != null && np.getAzureMeterId() != null && !np.getAzureMeterId().isBlank()) {
                                meterIds.add(np.getAzureMeterId());
                            }
                        }
                    }
                }
            }
        }
        // Include every meterId referenced by a managed CloudEnvironment
        for (CloudEnvironment env : cloudEnvironmentRepo.findAll()) {
            addIfPresent(meterIds, env.getSystemNodePool() != null ? env.getSystemNodePool().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getUserNodePool() != null ? env.getUserNodePool().getAzureMeterId() : null);
            if (env.getAdditionalNodePools() != null) {
                for (CloudEnvironment.NodePoolConfig pool : env.getAdditionalNodePools()) {
                    if (pool != null) addIfPresent(meterIds, pool.getAzureMeterId());
                }
            }
            addIfPresent(meterIds, env.getIngress() != null ? env.getIngress().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getLoadBalancer() != null ? env.getLoadBalancer().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getContainerRegistry() != null ? env.getContainerRegistry().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getDomain() != null ? env.getDomain().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getKeyVault() != null ? env.getKeyVault().getAzureMeterId() : null);
            addIfPresent(meterIds, env.getStorage() != null ? env.getStorage().getAzureMeterId() : null);
            if (env.getSharedServices() != null) {
                for (CloudEnvironment.SharedEnvService s : env.getSharedServices()) {
                    if (s != null) addIfPresent(meterIds, s.getAzureMeterId());
                }
            }
            if (env.getCategoryGroups() != null) {
                for (CloudEnvironment.CategoryGroup g : env.getCategoryGroups()) {
                    if (g == null || g.getServices() == null) continue;
                    for (CloudEnvironment.CategoryServiceItem s : g.getServices()) {
                        if (s == null) continue;
                        addIfPresent(meterIds, s.getAzureMeterId());
                        if (s.getAksNodes() != null) {
                            for (CloudEnvironment.AksNodeSpec node : s.getAksNodes()) {
                                if (node != null) addIfPresent(meterIds, node.getAzureMeterId());
                            }
                        }
                    }
                }
            }
        }

        int refreshed = 0;
        for (String meterId : meterIds) {
            try {
                if (refreshMeter(meterId).isPresent()) refreshed++;
            } catch (Exception e) {
                log.warn("Azure price refresh failed for meterId {}: {}", meterId, e.getMessage());
            }
        }
        log.info("Azure pricing refresh complete: {} of {} meters refreshed", refreshed, meterIds.size());
        return refreshed;
    }

    // ==================================================================
    // Catalog auto-suggest (admin "Cloud Services" autocomplete)
    // ==================================================================

    /**
     * Ordered category key → display label, exposed verbatim by the
     * {@code /catalog/categories} endpoint.
     */
    private static final LinkedHashMap<String, String> CATEGORY_LABELS = new LinkedHashMap<>();
    static {
        CATEGORY_LABELS.put("compute",  "Compute");
        CATEGORY_LABELS.put("aks",      "AKS / Kubernetes");
        CATEGORY_LABELS.put("network",  "Network");
        CATEGORY_LABELS.put("security", "Security");
        CATEGORY_LABELS.put("storage",  "Storage");
        CATEGORY_LABELS.put("database", "Database");
        CATEGORY_LABELS.put("ai",       "AI / ML");
        CATEGORY_LABELS.put("other",    "Other");
    }

    /**
     * Category → list of Azure {@code serviceName} values that should be
     * searched when the admin picks that bucket. Combined with {@code or}
     * inside the OData filter so a single query crosses multiple Azure
     * services (e.g. "network" spans Load Balancer, Virtual Network, etc.).
     */
    private static final Map<String, List<String>> CATEGORY_SERVICE_NAMES = Map.ofEntries(
            Map.entry("compute",  List.of("Virtual Machines")),
            Map.entry("aks",      List.of("Azure Kubernetes Service", "Virtual Machines")),
            Map.entry("network",  List.of(
                    "Virtual Network", "Load Balancer", "Application Gateway",
                    "Azure DNS", "VPN Gateway", "Azure Bastion",
                    "ExpressRoute", "NAT Gateway", "Azure Firewall", "Azure Front Door")),
            Map.entry("security", List.of(
                    "Key Vault", "Container Registry", "Microsoft Defender for Cloud",
                    "Azure DDoS Protection", "Azure Active Directory Domain Services",
                    "Azure Active Directory B2C", "Web Application Firewall")),
            Map.entry("storage",  List.of(
                    "Storage", "Azure Files", "Azure NetApp Files", "Backup",
                    "Azure Data Lake Storage")),
            Map.entry("database", List.of(
                    "Azure Cosmos DB", "SQL Database", "Azure Database for MySQL",
                    "Azure Database for PostgreSQL", "Azure Database for MariaDB",
                    "Azure Cache for Redis")),
            Map.entry("ai",       List.of(
                    "Cognitive Services", "Azure OpenAI", "Azure Machine Learning",
                    "Bot Services", "Cognitive Search")),
            Map.entry("other",    List.of())
    );

    /** Single regex used everywhere we need to parse an armSkuName. */
    private static final Pattern VM_SKU_PATTERN = Pattern.compile("^([A-Za-z]+)(\\d+)");

    @Override
    public Map<String, String> catalogCategories() {
        return Collections.unmodifiableMap(CATEGORY_LABELS);
    }

    @Override
    public List<AzureCatalogSuggestion> suggestCatalog(
            String category, String query, String armRegionName, int max, boolean spot) {

        String catKey = category == null ? "other" : category.trim().toLowerCase(Locale.ROOT);
        if (!CATEGORY_LABELS.containsKey(catKey)) catKey = "other";

        String region = (armRegionName == null || armRegionName.isBlank()) ? "eastus" : armRegionName.trim();
        int limit = Math.max(1, Math.min(100, max <= 0 ? 30 : max));
        String q = query == null ? "" : query.trim();
        // Sanitise OData single-quote escaping
        String qSafe = q.replace("'", "''");
        String regionSafe = region.replace("'", "''");

        // Azure Retail Prices API: spot and on-demand rows both use type="Consumption".
        // Spot rows are identified by "Spot" in skuName (e.g. "D8s v3 Spot").
        // Using type eq 'Spot' returns zero results — always query Consumption and filter by skuName.
        boolean spotApplicable = "compute".equals(catKey) || "aks".equals(catKey);

        StringBuilder f = new StringBuilder();
        List<String> svcNames = CATEGORY_SERVICE_NAMES.getOrDefault(catKey, List.of());
        if (!svcNames.isEmpty()) {
            f.append("(");
            for (int i = 0; i < svcNames.size(); i++) {
                if (i > 0) f.append(" or ");
                f.append("serviceName eq '").append(svcNames.get(i).replace("'", "''")).append("'");
            }
            f.append(")");
            f.append(" and ");
        }
        f.append("armRegionName eq '").append(regionSafe).append("'");
        f.append(" and type eq 'Consumption'");

        if (!qSafe.isEmpty()) {
            // Match across product / sku / armSku to maximise hits on partial typing
            f.append(" and (")
              .append("contains(productName, '").append(qSafe).append("')")
              .append(" or contains(skuName, '").append(qSafe).append("')")
              .append(" or contains(armSkuName, '").append(qSafe).append("')")
              .append(")");
        }

        // Pull a wider window so client-side filters (windows / low-priority / spot tier) can prune
        // without starving the dropdown.
        int fetchSize = Math.min(100, Math.max(limit * 2, limit + 20));
        List<AzurePriceRecord> rows = search(f.toString(), fetchSize);

        boolean isComputeLike = "compute".equals(catKey) || "aks".equals(catKey);
        List<AzureCatalogSuggestion> out = new ArrayList<>();
        for (AzurePriceRecord r : rows) {
            if (isComputeLike) {
                String prod = r.getProductName() == null ? "" : r.getProductName().toLowerCase(Locale.ROOT);
                String sku  = r.getSkuName() == null ? "" : r.getSkuName().toLowerCase(Locale.ROOT);
                if (prod.contains("windows")) continue;
                if (sku.contains("low priority")) continue;
                boolean rowIsSpot = sku.contains("spot");
                // For compute/aks: filter to requested spot tier; for other categories: allow all
                if (spotApplicable && (spot != rowIsSpot)) continue;
            }
            out.add(toSuggestion(r, catKey));
            if (out.size() >= limit) break;
        }
        return out;
    }

    private static AzureCatalogSuggestion toSuggestion(AzurePriceRecord r, String category) {
        int[] specs = parseVmSpecs(r.getArmSkuName());
        Double hourly = priceToHourly(r.getRetailPrice(), r.getUnitOfMeasure());
        Double monthly = priceToMonthly(r.getRetailPrice(), r.getUnitOfMeasure());
        return AzureCatalogSuggestion.builder()
                .meterId(r.getMeterId())
                .skuName(r.getSkuName())
                .armSkuName(r.getArmSkuName())
                .productName(r.getProductName())
                .serviceName(r.getServiceName())
                .serviceFamily(r.getServiceFamily())
                .armRegionName(r.getArmRegionName())
                .retailPrice(r.getRetailPrice())
                .unitOfMeasure(r.getUnitOfMeasure())
                .currencyCode(r.getCurrencyCode())
                .type(r.getType())
                .vCpuPerNode(specs[0])
                .memoryGbPerNode(specs[1])
                .hourlyRateUsd(hourly)
                .monthlyEstUsd(monthly)
                .category(category)
                .build();
    }

    /**
     * Parses vCPU count and estimated RAM (GB) from an armSkuName like
     * {@code Standard_D4s_v3}. Returns {@code int[]{vCpu, ramGb}} or
     * {@code {0,0}} when the SKU is not a VM (e.g. a Storage row).
     */
    private static int[] parseVmSpecs(String armSkuName) {
        if (armSkuName == null || armSkuName.isBlank()) return new int[]{0, 0};
        String sku = armSkuName.replaceFirst("(?i)^Standard_", "");
        Matcher m = VM_SKU_PATTERN.matcher(sku);
        if (!m.find()) return new int[]{0, 0};
        String fam = m.group(1).toUpperCase(Locale.ROOT);
        int vcpu = Integer.parseInt(m.group(2));
        int ram;
        if (fam.startsWith("NC") || fam.startsWith("NV") || fam.startsWith("ND")) ram = vcpu * 6;
        else if (fam.startsWith("E")) ram = vcpu * 8;
        else if (fam.startsWith("F")) ram = vcpu * 2;
        else if (fam.startsWith("G")) ram = vcpu * 28;
        else if (fam.startsWith("H") || fam.startsWith("L")) ram = vcpu * 8;
        else if (fam.startsWith("M")) ram = vcpu * 14;
        else ram = vcpu * 4; // D, B, A, and anything else
        return new int[]{vcpu, ram};
    }

    /** Best-effort hourly normalisation of a retail price + Azure unit string. */
    private static Double priceToHourly(Double retail, String unit) {
        if (retail == null) return null;
        String u = unit == null ? "" : unit.toLowerCase(Locale.ROOT);
        if (u.contains("hour")) return retail;
        if (u.contains("month")) return retail / 730.0;
        if (u.contains("day")) return retail / 24.0;
        if (u.contains("year")) return retail / (730.0 * 12.0);
        return retail;
    }

    /** Best-effort monthly estimate (USD) for the given retail row. */
    private static Double priceToMonthly(Double retail, String unit) {
        if (retail == null) return null;
        String u = unit == null ? "" : unit.toLowerCase(Locale.ROOT);
        if (u.contains("month")) return retail;
        if (u.contains("day")) return retail * (730.0 / 24.0);
        if (u.contains("year")) return retail / 12.0;
        if (u.contains("hour")) return retail * 730.0;
        return retail;
    }

    // ------------------------------------------------------------------

    private boolean isAzure(CloudServiceItem c) {
        return c != null && c.getCloudPlatform() != null
                && c.getCloudPlatform().equalsIgnoreCase("Azure");
    }

    private static void addIfPresent(Set<String> out, String meterId) {
        if (meterId != null && !meterId.isBlank()) out.add(meterId);
    }

    private JsonNode doGet(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            throw new RuntimeException("Azure pricing HTTP " + resp.statusCode() + ": " + resp.body());
        }
        return mapper.readTree(resp.body());
    }

    private AzurePriceRecord toRecord(JsonNode r) {
        return AzurePriceRecord.builder()
                .meterId(txt(r, "meterId"))
                .skuId(txt(r, "skuId"))
                .skuName(txt(r, "skuName"))
                .productId(txt(r, "productId"))
                .productName(txt(r, "productName"))
                .serviceName(txt(r, "serviceName"))
                .serviceFamily(txt(r, "serviceFamily"))
                .armRegionName(txt(r, "armRegionName"))
                .armSkuName(txt(r, "armSkuName"))
                .currencyCode(txt(r, "currencyCode"))
                .retailPrice(dbl(r, "retailPrice"))
                .unitPrice(dbl(r, "unitPrice"))
                .unitOfMeasure(txt(r, "unitOfMeasure"))
                .type(txt(r, "type"))
                .tierMinimumUnits(dbl(r, "tierMinimumUnits"))
                .isPrimaryMeterRegion(r.path("isPrimaryMeterRegion").asBoolean(false))
                .effectiveStartDate(parseInstant(txt(r, "effectiveStartDate")))
                .fetchedAt(Instant.now())
                .build();
    }

    private static String txt(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Double dbl(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.isNumber() ? v.asDouble() : null;
    }

    private static Instant parseInstant(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Instant.parse(s); } catch (Exception ignored) { return null; }
    }
}
