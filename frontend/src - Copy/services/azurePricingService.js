import { apiRequest } from "./apiClient";

const q = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : "";
};

/** Admin-only. Free-form Azure Retail Prices OData filter. */
export const searchAzurePrices = ({ filter, max = 25 }) =>
    apiRequest(`/azure-pricing/search${q({ q: filter, max })}`);

/** Admin-only. Structured lookup by serviceName/region/sku. */
export const lookupAzurePrice = ({
    serviceName,
    armRegionName,
    skuName,
    productName,
    type = "Consumption",
    max = 25,
}) =>
    apiRequest(`/azure-pricing/lookup${q({ serviceName, armRegionName, skuName, productName, type, max })}`);

export const refreshAzurePrice = ({ meterId }) =>
    apiRequest("/azure-pricing/refresh", {
        method: "POST",
        body: JSON.stringify({ meterId }),
    });

/** Admin & DevOps. VM size suggestions for a region — feeds the VM dropdowns. Pass spot=true for spot pricing. */
export const getAzureVmSkus = ({ armRegionName = "eastus", family, max = 60, spot } = {}) =>
    apiRequest(`/azure-pricing/vm-skus${q({ armRegionName, family, max, spot })}`);

/**
 * Admin & DevOps. Category-aware live auto-suggest powering the admin
 * "Cloud Services" tree.
 *
 * The backend maps an app-side category bucket (compute / aks / network /
 * security / storage / database / ai / other) onto the appropriate Azure
 * serviceName filter — the caller never has to know Azure's taxonomy.
 *
 * Each row already carries derived vCPU/RAM (where applicable) and a
 * pre-computed monthly estimate, so the dropdown can display "$X/mo"
 * without any client-side math.
 */
export const suggestAzureCatalog = ({
    category,
    query = "",
    armRegionName = "eastus",
    max = 30,
    spot,
} = {}) =>
    apiRequest(`/azure-pricing/catalog/suggest${q({ category, query, armRegionName, max, spot })}`);

/** Admin & DevOps. Canonical key → display label map for the category catalog. */
export const getAzureCatalogCategories = () =>
    apiRequest("/azure-pricing/catalog/categories");
