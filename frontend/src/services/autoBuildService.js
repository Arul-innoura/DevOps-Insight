/**
 * Admin-side auto-build configuration service.
 *
 * The backend stores Jenkins connection + per-environment auto-build config
 * inside the project's workflow settings. These helpers keep the frontend
 * unaware of that nesting.
 */

import { apiRequest } from "./apiClient";

const enc = encodeURIComponent;

/** GET full auto-build config (Jenkins conn + per-env map) for a project. Admin/DevOps only. */
export const getAutoBuildSettings = (projectId) =>
    apiRequest(`/projects/${enc(projectId)}/auto-build`);

/**
 * GET lightweight auto-build status — returns { [env]: boolean } map.
 * Accessible to all roles (no sensitive Jenkins credentials included).
 * Use this in the ticket view to check whether the Trigger Build button should show.
 */
export const getAutoBuildStatus = (projectId) =>
    apiRequest(`/projects/${enc(projectId)}/auto-build/status`);

/** PUT the project-level Jenkins connection block. */
export const saveJenkinsConnection = (projectId, connection) =>
    apiRequest(`/projects/${enc(projectId)}/auto-build/jenkins`, {
        method: "PUT",
        body: JSON.stringify(connection)
    });

/** Test connectivity to Jenkins for a specific environment (admin "Test Connection" button). */
export const testJenkinsConnection = (projectId, connection, environment) =>
    apiRequest(
        `/projects/${enc(projectId)}/auto-build/jenkins/test${environment ? `?environment=${enc(environment)}` : ""}`,
        { method: "POST", body: JSON.stringify(connection || {}) }
    );

/** PUT per-environment auto-build config (toggle + service plan). */
export const saveEnvAutoBuildConfig = (projectId, environment, body) =>
    apiRequest(
        `/projects/${enc(projectId)}/auto-build/environments/${enc(environment)}`,
        { method: "PUT", body: JSON.stringify(body) }
    );

/** DELETE per-environment auto-build config. */
export const deleteEnvAutoBuildConfig = (projectId, environment) =>
    apiRequest(
        `/projects/${enc(projectId)}/auto-build/environments/${enc(environment)}`,
        { method: "DELETE" }
    );

/**
 * Default shape used by the editor when an environment has no config yet.
 */
export const DEFAULT_ENV_AUTO_BUILD_CONFIG = {
    enabled: false,
    jenkinsConnection: { jenkinsUrl: "", jenkinsUser: "", jenkinsApiToken: "", crumbPath: "", verified: null },
    defaultBranch: "main",
    agentLabel: "any",
    defaultCommitId: "",
    clusters: 1,
    gitProtocol: "ssh",
    gitCredentialsId: "",
    jenkinsFolder: "",
    retryAttempts: 3,
    approvers: [],
    services: []
};
