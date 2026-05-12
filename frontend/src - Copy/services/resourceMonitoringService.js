import { apiRequest } from "./apiClient";

const q = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : "";
};

/** Environment → Cluster → Project → Microservice tree. */
export const getResourceHierarchy = (environment) =>
    apiRequest(`/resource-monitoring/hierarchy${q({ environment })}`);

export const getClusterFluctuation = ({ environment, clusterName, from, to }) =>
    apiRequest(`/resource-monitoring/fluctuation/cluster${q({ environment, clusterName, from, to })}`);

export const getProjectFluctuation = ({ projectId, environment, from, to }) =>
    apiRequest(`/resource-monitoring/fluctuation/project${q({ projectId, environment, from, to })}`);

export const getMicroserviceFluctuation = ({ microserviceId, from, to }) =>
    apiRequest(`/resource-monitoring/fluctuation/microservice${q({ microserviceId, from, to })}`);

/** DevOps/Admin only — snapshot current config for a project/environment. */
export const snapshotProject = ({ projectId, environment }) =>
    apiRequest("/resource-monitoring/snapshot", {
        method: "POST",
        body: JSON.stringify({ projectId, environment }),
    });
