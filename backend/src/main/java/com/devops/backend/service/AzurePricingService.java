package com.devops.backend.service;

import com.devops.backend.dto.azure.AzureCatalogSuggestion;
import com.devops.backend.model.monitoring.AzurePriceRecord;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Integration with the public Azure Retail Prices API
 * (https://prices.azure.com/api/retail/prices). No auth required.
 *
 * <p>All prices returned by this service are the real, live Azure retail
 * prices — never static formulas. A background scheduler refreshes
 * cached records hourly.
 */
public interface AzurePricingService {

    /**
     * Search Azure Retail Prices by free-text filter. Filter is passed verbatim
     * to the Azure API's $filter parameter.
     *
     * <p>Example filters:
     * <ul>
     *   <li>{@code serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and skuName eq 'D4 v3'}</li>
     *   <li>{@code productName eq 'Container Registry' and type eq 'Consumption'}</li>
     * </ul>
     *
     * @param odataFilter  OData filter expression (no leading $filter=)
     * @param max          max rows to return (1..100)
     */
    List<AzurePriceRecord> search(String odataFilter, int max);

    /** Fetch the live retail price row for a specific meterId and cache it. */
    Optional<AzurePriceRecord> refreshMeter(String meterId);

    /** Look up a cached price. Prefer {@link #refreshMeter(String)} for live data. */
    Optional<AzurePriceRecord> getCached(String meterId);

    /** Refresh every meterId currently referenced by any CloudServiceItem. */
    int refreshAllInUseMeters();

    /**
     * Live auto-suggest powering the admin "Cloud Services" tree. Maps an
     * app-side category bucket (compute / aks / network / security / storage /
     * database / ai / other) onto the appropriate Azure {@code serviceName}
     * filter, optionally narrowed by a free-text query, and returns a slim
     * payload ready for autocomplete display + auto-fill on selection.
     *
     * <p>Hits the public Retail Prices API every call (no DB cache) so the
     * admin always sees the latest catalog and price.
     *
     * @param category       App category key. Required. Unknown keys fall back
     *                       to a free-text search on {@code productName}.
     * @param query          Free-text fragment matched against
     *                       {@code productName} / {@code skuName} /
     *                       {@code armSkuName}. May be empty.
     * @param armRegionName  Azure ARM region. Defaults to {@code eastus}.
     * @param max            Max rows to return (1..100, defaults 30).
     * @param spot           When true, returns Spot pricing rows
     *                       (compute / aks only, ignored elsewhere).
     */
    List<AzureCatalogSuggestion> suggestCatalog(
            String category, String query, String armRegionName, int max, boolean spot);

    /**
     * Canonical category catalog used by the admin UI's left rail and by
     * {@link #suggestCatalog}. Returns ordered key → display name pairs.
     */
    Map<String, String> catalogCategories();
}
