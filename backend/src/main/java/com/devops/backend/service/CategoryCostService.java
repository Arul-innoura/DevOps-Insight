package com.devops.backend.service;

import com.devops.backend.dto.monitoring.ProjectBill;

import java.time.Instant;
import java.util.List;

/**
 * Cost engine v2 — computes project bills from the redesigned Cloud Services
 * catalog ({@code CategoryServiceItem} on {@code CloudEnvironment}) and the
 * project's {@code ProjectServiceUsage} + {@code ExternalServiceItem} lists.
 *
 * <p>Allocation rules applied per catalog item:
 * <ul>
 *   <li>{@code SYSTEM_NODE}, {@code NETWORK}, {@code SECURITY}, {@code GENERAL} —
 *       split equally across all projects toggling the service in its environment.</li>
 *   <li>{@code USER_NODE}, {@code SPOT_NODE} — split by replicas × (CPU+memory)
 *       across projects' microservices in that environment.</li>
 *   <li>{@code AI_SHARED} — split equally across every project toggling the service
 *       across every environment of the same provider.</li>
 *   <li>{@code EXTERNAL} — 100% to the owning project.</li>
 * </ul>
 *
 * <p>Per-namespace attribution comes from {@code ProjectServiceItem.namespace}
 * (falling back to {@code environment} when blank). Monthly bills run month-to-date;
 * previous-month bills are computed from the same hourly rate × elapsed hours.
 */
public interface CategoryCostService {

    /** Bill for a single project, current month-to-date. */
    ProjectBill currentMonthBill(String projectId);

    /** Bill for a single project, previous calendar month. */
    ProjectBill previousMonthBill(String projectId);

    /** Bill for a single project across an arbitrary [from, to) window. */
    ProjectBill billForRange(String projectId, Instant from, Instant to, String windowLabel);

    /** Live month-to-date bills for every project. */
    List<ProjectBill> liveBillsAllProjects();
}
