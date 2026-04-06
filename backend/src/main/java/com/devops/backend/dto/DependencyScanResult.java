package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Per-dependency scan result.
 * Each dependency scanned (whether individually or from a file) returns one of these.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DependencyScanResult {

    private String dependencyName;
    private String groupId;
    private String artifactId;
    private String version;
    private String type;

    // Severity summary
    private String overallSeverity;
    private int totalVulnerabilities;
    private int criticalCount;
    private int highCount;
    private int mediumCount;
    private int lowCount;

    // Vulnerability details for this dependency
    private List<VulnerabilityScanResponse.VulnerabilityDetail> vulnerabilities;

    // Local Nexus repository status
    private boolean availableInNexus;
    private String nexusVersion; // version in local DB, null if not found

    // Action eligibility (only meaningful after scan)
    private boolean canAddRequest;    // true if: not in DB + no CRITICAL/HIGH
    private boolean canUpdateVersion; // true if: in DB + version differs

    // Auto-request info (if one was auto-created)
    private String autoRequestId;
    private String autoRequestType;
    private String autoRequestMessage;
}
