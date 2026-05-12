import { apiRequest } from "./apiClient";

export const getProjectWorkflow = (projectId) =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/workflow`);

export const saveProjectWorkflow = (projectId, body) =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/workflow`, {
        method: "PUT",
        body: JSON.stringify(body)
    });

export const getEffectiveWorkflow = (projectId, requestTypeEnum, environment = "") => {
    const params = new URLSearchParams({
        requestType: String(requestTypeEnum || "").trim()
    });
    const env = String(environment || "").trim();
    if (env) {
        params.set("environment", env);
    }
    return apiRequest(`/projects/${encodeURIComponent(projectId)}/workflow/effective?${params.toString()}`);
};
