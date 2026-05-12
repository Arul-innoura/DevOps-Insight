package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Project-level Jenkins connection used for auto-build / code-cut.
 * Stored inside {@link com.devops.backend.model.ProjectWorkflowSettings}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JenkinsConnection {

    /** Base URL, e.g. "https://jenkins.encipherhealth.com". */
    private String jenkinsUrl;

    /** Jenkins user that owns the API token. */
    private String jenkinsUser;

    /** Jenkins API token (stored as-is; transmit only over TLS, redact on read). */
    private String jenkinsApiToken;

    /** Optional CSRF crumb URL override; defaults to "/crumbIssuer/api/json". */
    private String crumbPath;

    /** True if this connection has been verified (admin "Test Connection"). */
    private Boolean verified;
}
