package com.devops.backend.controller;

import com.devops.backend.dto.azure.AzureCatalogSuggestion;
import com.devops.backend.model.monitoring.AzurePriceRecord;
import com.devops.backend.service.AzurePricingService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-facing Azure Retail Pricing lookup.
 * Used by {@code ProjectWorkflowEditor} → "Azure SKU picker" to force real
 * Azure prices on every cloud service configured for a project.
 */
@RestController
@RequestMapping("/api/azure-pricing")
@RequiredArgsConstructor
public class AzurePricingController {

    private final AzurePricingService service;

    /**
     * Free-form search of Azure Retail Prices.
     * Pass an OData filter via the {@code q} parameter, e.g.
     *   <pre>serviceName eq 'Virtual Machines' and armRegionName eq 'eastus'</pre>
     */
    @GetMapping("/search")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public List<AzurePriceRecord> search(
            @RequestParam(name = "q") String filter,
            @RequestParam(required = false, defaultValue = "25") int max
    ) {
        return service.search(filter, max);
    }

    /** Structured helper: search by serviceName + region + (optional) sku. */
    @GetMapping("/lookup")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public List<AzurePriceRecord> lookup(
            @RequestParam String serviceName,
            @RequestParam(required = false) String armRegionName,
            @RequestParam(required = false) String skuName,
            @RequestParam(required = false) String productName,
            @RequestParam(required = false, defaultValue = "Consumption") String type,
            @RequestParam(required = false, defaultValue = "25") int max
    ) {
        StringBuilder f = new StringBuilder();
        f.append("serviceName eq '").append(escape(serviceName)).append("'");
        if (armRegionName != null && !armRegionName.isBlank())
            f.append(" and armRegionName eq '").append(escape(armRegionName)).append("'");
        if (skuName != null && !skuName.isBlank())
            f.append(" and skuName eq '").append(escape(skuName)).append("'");
        if (productName != null && !productName.isBlank())
            f.append(" and productName eq '").append(escape(productName)).append("'");
        if (type != null && !type.isBlank())
            f.append(" and type eq '").append(escape(type)).append("'");
        return service.search(f.toString(), max);
    }

    /**
     * VM size suggestions for a region — compact dropdown payload.
     * Filters to {@code Virtual Machines} service and the chosen region.
     * Pass {@code spot=true} to get Spot pricing instead of on-demand.
     * Returns vCpuPerNode and memoryGbPerNode derived from armSkuName.
     */
    @GetMapping("/vm-skus")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<Map<String, Object>> vmSkus(
            @RequestParam(required = false, defaultValue = "eastus") String armRegionName,
            @RequestParam(required = false) String family,
            @RequestParam(required = false, defaultValue = "60") int max,
            @RequestParam(required = false, defaultValue = "false") boolean spot
    ) {
        StringBuilder f = new StringBuilder();
        f.append("serviceName eq 'Virtual Machines'");
        f.append(" and armRegionName eq '").append(escape(armRegionName)).append("'");
        f.append(" and type eq '").append(spot ? "Spot" : "Consumption").append("'");
        if (family != null && !family.isBlank()) {
            f.append(" and contains(armSkuName, '").append(escape(family)).append("')");
        }
        return service.search(f.toString(), max).stream()
                .filter(r -> r.getProductName() == null || !r.getProductName().toLowerCase().contains("windows"))
                .filter(r -> r.getSkuName() == null || !r.getSkuName().toLowerCase().contains("low priority"))
                .filter(r -> spot || r.getSkuName() == null || !r.getSkuName().toLowerCase().contains("spot"))
                .map(r -> {
                    int[] specs = parseVmSpecs(r.getArmSkuName());
                    Map<String, Object> out = new java.util.HashMap<>();
                    out.put("meterId", r.getMeterId());
                    out.put("skuName", r.getSkuName());
                    out.put("armSkuName", r.getArmSkuName());
                    out.put("productName", r.getProductName());
                    out.put("armRegionName", r.getArmRegionName());
                    out.put("retailPrice", r.getRetailPrice());
                    out.put("unitOfMeasure", r.getUnitOfMeasure());
                    out.put("vCpuPerNode", specs[0]);
                    out.put("memoryGbPerNode", specs[1]);
                    return out;
                })
                .toList();
    }

    /**
     * Parses vCPU count and estimated RAM (GB) from an Azure armSkuName like {@code Standard_D4s_v3}.
     * Returns int[]{vCpu, ramGb}. RAM is estimated from per-family ratios; returns {0,0} if unparseable.
     */
    private static int[] parseVmSpecs(String armSkuName) {
        if (armSkuName == null || armSkuName.isBlank()) return new int[]{0, 0};
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
        else ram = vcpu * 4; // D, B, A, and anything else
        return new int[]{vcpu, ram};
    }

    /**
     * Category-aware live auto-suggest used by the admin "Cloud Services"
     * tree. The {@code category} key maps server-side onto the right Azure
     * {@code serviceName} filter (e.g. {@code network} → Virtual Network +
     * Load Balancer + Application Gateway + …) so the admin never has to
     * know Azure's service taxonomy.
     *
     * <p>Each row in the response carries derived {@code vCpuPerNode} +
     * {@code memoryGbPerNode} (when applicable) and a normalised
     * {@code monthlyEstUsd} so the frontend can show "$X/mo" preview without
     * any extra math.
     *
     * @param category       compute | aks | network | security | storage | database | ai | other
     * @param query          optional free-text fragment (matches productName / skuName / armSkuName)
     * @param armRegionName  ARM region (defaults eastus)
     * @param max            max rows (1..100, default 30)
     * @param spot           when true and category is compute/aks, returns Spot pricing
     */
    @GetMapping("/catalog/suggest")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public List<AzureCatalogSuggestion> catalogSuggest(
            @RequestParam String category,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false, defaultValue = "eastus") String armRegionName,
            @RequestParam(required = false, defaultValue = "30") int max,
            @RequestParam(required = false, defaultValue = "false") boolean spot
    ) {
        return service.suggestCatalog(category, query, armRegionName, max, spot);
    }

    /**
     * Canonical category catalog (key → display label) used by the admin UI
     * to render the left-rail and the auto-suggest category filter.
     */
    @GetMapping("/catalog/categories")
    @PreAuthorize("hasAnyAuthority('APPROLE_Admin','APPROLE_DevOps')")
    public Map<String, String> catalogCategories() {
        return service.catalogCategories();
    }

    /** Force refresh a specific meterId from the Azure API. */
    @PostMapping("/refresh")
    @PreAuthorize("hasAuthority('APPROLE_Admin')")
    public Map<String, Object> refresh(@RequestBody Map<String, String> body) {
        String meterId = body.get("meterId");
        return service.refreshMeter(meterId)
                .<Map<String, Object>>map(r -> Map.of(
                        "ok", true,
                        "meterId", r.getMeterId(),
                        "retailPrice", r.getRetailPrice(),
                        "unitOfMeasure", r.getUnitOfMeasure(),
                        "currencyCode", r.getCurrencyCode()))
                .orElse(Map.of("ok", false));
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("'", "''");
    }
}
