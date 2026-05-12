package com.devops.backend.dto.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Bill-style cost summary for one project across a billing window
 * (month-to-date, previous month, or arbitrary range).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectBill {

    private String projectId;
    private String projectName;

    /** Start of billing window (inclusive). */
    private Instant windowStart;
    /** End of billing window (exclusive — typically "now" for month-to-date). */
    private Instant windowEnd;
    /** Human label for the window — e.g. "May 2026", "Apr 2026", "custom". */
    private String windowLabel;

    private List<BillLineItem> lines;

    /** Total effective hourly across all lines. */
    private Double totalHourlyUsd;
    /** Total effective monthly (730h × hourly + external fixed). */
    private Double totalMonthlyUsd;
    /** Sum of {@code BillLineItem.monthToDateUsd}. */
    private Double totalMonthToDateUsd;

    /** Per-environment subtotal (envId → monthly USD). */
    private Map<String, Double> byEnvironment;

    /** Per-category subtotal (category key → monthly USD). */
    private Map<String, Double> byCategory;

    /** Per-namespace subtotal (namespace → monthly USD). */
    private Map<String, Double> byNamespace;

    private Instant capturedAt;
}
