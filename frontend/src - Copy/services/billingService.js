// Billing API client — wraps /api/billing endpoints from BillingController.java.
// Bills come back grouped by env / category / namespace with per-line shares
// already applied by the cost engine.

import { apiRequest } from "./apiClient";

/** Live month-to-date bills for every project (admin / devops). */
export const getLiveBills = () => apiRequest("/billing/live");

/** Current month bill for one project. */
export const getCurrentMonthBill = (projectId) =>
    apiRequest(`/billing/projects/${encodeURIComponent(projectId)}/current`);

/** Previous calendar month's bill for one project. */
export const getPreviousMonthBill = (projectId) =>
    apiRequest(`/billing/projects/${encodeURIComponent(projectId)}/previous`);

/** Arbitrary [from, to) bill for one project. */
export const getBillRange = (projectId, fromIso, toIso, label = "Custom") => {
    const p = new URLSearchParams({ from: fromIso, to: toIso, label });
    return apiRequest(`/billing/projects/${encodeURIComponent(projectId)}/range?${p.toString()}`);
};

/* --------------------------------------------------------------------------
 * Prometheus-driven live cost — auto-discovered cloud services + per-namespace
 * cost. Backed by /api/billing/prometheus/* on the server, which combines
 * Prometheus topology metrics with live Azure Retail Pricing.
 * ------------------------------------------------------------------------ */

/** Environments with a configured Prometheus endpoint. */
export const getPrometheusEnvs = () =>
    apiRequest("/billing/prometheus/envs");

/** Full live snapshot for one env (also ticks the cost engine). */
export const getPrometheusLive = (env) =>
    apiRequest(`/billing/prometheus/${encodeURIComponent(env)}/live`);

/** Operational metrics for one env (and optionally one namespace). */
export const getPrometheusMetrics = (env, namespace) => {
    const qs = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
    return apiRequest(`/billing/prometheus/${encodeURIComponent(env)}/metrics${qs}`);
};

/**
 * Historical cost time-series for one env, aggregated into fixed buckets.
 *
 * @param {string} env
 * @param {string} fromIso  ISO-8601 start timestamp (inclusive)
 * @param {string} toIso    ISO-8601 end timestamp (exclusive)
 * @param {"minute"|"hour"|"day"|"month"} granularity
 */
export const getPrometheusTimeseries = (env, fromIso, toIso, granularity = "hour") => {
    const qs = new URLSearchParams({ from: fromIso, to: toIso, granularity });
    return apiRequest(`/billing/prometheus/${encodeURIComponent(env)}/timeseries?${qs.toString()}`);
};
