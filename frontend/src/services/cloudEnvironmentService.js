import { apiRequest } from "./apiClient";

/**
 * CRUD for managed Azure environments (top level of the Environment →
 * Project → Microservice hierarchy). Admin mutates, DevOps reads.
 */

export const getCloudEnvironments = () =>
    apiRequest("/environments");

export const getCloudEnvironment = (id) =>
    apiRequest(`/environments/${id}`);

export const createCloudEnvironment = (body) =>
    apiRequest("/environments", {
        method: "POST",
        body: JSON.stringify(body),
    });

export const updateCloudEnvironment = (id, body) =>
    apiRequest(`/environments/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });

export const deleteCloudEnvironment = (id) =>
    apiRequest(`/environments/${id}`, { method: "DELETE" });

export const refreshCloudEnvironmentPrices = () =>
    apiRequest("/environments/refresh-prices", { method: "POST" });

/**
 * Cloud Services tree: provider → environments[] (Azure / AWS / GCP).
 * Drives the redesigned Cloud Services admin view.
 */
export const getCloudServicesTree = () =>
    apiRequest("/environments/tree");

/** Canonical category template (compute, ai, storage, security, aks, network, …). */
export const getCloudCategoryTemplate = () =>
    apiRequest("/environments/category-template");

/**
 * Azure live catalog auto-suggest. Powers the "Add service" autocomplete in
 * the Cloud Services admin view — no manual SKU typing.
 *
 * @param {Object} opts
 * @param {string} opts.category   compute | aks | network | security | storage | database | ai | other
 * @param {string} [opts.query]    Free-text fragment.
 * @param {string} [opts.region]   ARM region (defaults eastus on backend).
 * @param {number} [opts.max]      Max rows.
 * @param {boolean} [opts.spot]    Spot pricing for compute/aks.
 */
export const azureCatalogSuggest = ({ category, query = "", region, max = 30, spot = false }) => {
    const params = new URLSearchParams();
    params.set("category", category);
    if (query) params.set("query", query);
    if (region) params.set("armRegionName", region);
    if (max) params.set("max", String(max));
    if (spot) params.set("spot", "true");
    return apiRequest(`/azure-pricing/catalog/suggest?${params.toString()}`);
};

/**
 * Legacy Azure price lookup used by EnvironmentsManager's inline service search.
 * Calls /api/azure-pricing/lookup — structured search by serviceName + region.
 */
export const lookupAzurePrice = ({ serviceName, armRegionName, skuName, productName, type, max = 25 }) => {
    const params = new URLSearchParams();
    params.set("serviceName", serviceName);
    if (armRegionName) params.set("armRegionName", armRegionName);
    if (skuName) params.set("skuName", skuName);
    if (productName) params.set("productName", productName);
    if (type) params.set("type", type);
    params.set("max", String(max));
    return apiRequest(`/azure-pricing/lookup?${params.toString()}`);
};

/**
 * Free-text OData filter search against Azure Retail Prices.
 * Used by EnvironmentsManager's inline AzureServiceSearch component.
 */
export const searchAzurePrices = ({ filter, max = 25 }) => {
    const params = new URLSearchParams();
    params.set("q", filter);
    params.set("max", String(max));
    return apiRequest(`/azure-pricing/search?${params.toString()}`);
};

export const emptyNodePool = (kind = "user", poolName = "") => ({
    kind,
    poolName,
    vmSize: "",
    vCpuPerNode: null,
    memoryGbPerNode: null,
    nodeCount: kind === "system" ? 2 : 1,
    azureMeterId: "",
    azureSkuName: "",
    hourlyRateUsd: null,
});

export const emptyInfra = () => ({
    name: "",
    sku: "",
    azureMeterId: "",
    hourlyRateUsd: null,
    scope: "env",
    count: 1,
});

export const emptyEnvironment = () => ({
    name: "",
    displayName: "",
    azureRegion: "eastus",
    description: "",
    systemNodePool: emptyNodePool("system"),
    userNodePool: emptyNodePool("user"),
    additionalNodePools: [],
    ingress: emptyInfra(),
    loadBalancer: emptyInfra(),
    containerRegistry: { ...emptyInfra(), scope: "env" },
    domain: emptyInfra(),
    keyVault: emptyInfra(),
    storage: emptyInfra(),
    sharedServices: [],
});
