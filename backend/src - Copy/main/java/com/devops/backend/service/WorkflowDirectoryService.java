package com.devops.backend.service;

import com.devops.backend.dto.WorkflowDirectoryContactDto;
import com.devops.backend.model.ProjectWorkflowSettings;
import com.devops.backend.model.workflow.ApprovalLevelConfig;
import com.devops.backend.model.workflow.EmailRoutingConfig;
import com.devops.backend.model.workflow.RequestTypeWorkflowOverride;
import com.devops.backend.model.workflow.WorkflowApprover;
import com.devops.backend.model.workflow.WorkflowConfiguration;
import com.devops.backend.repository.ProjectWorkflowSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class WorkflowDirectoryService {

    private final ProjectWorkflowSettingsRepository projectWorkflowSettingsRepository;

    /**
     * Aggregates approvers, cost approvers, managers, and routing emails from all stored workflows.
     *
     * @param excludeProjectId when non-blank, skip that product's workflow documents (suggestions from other projects only)
     * @param query            optional case-insensitive filter on email, name, or role
     */
    public List<WorkflowDirectoryContactDto> listContacts(String excludeProjectId, String query) {
        String exclude = excludeProjectId != null ? excludeProjectId.trim() : "";
        String q = query != null ? query.trim().toLowerCase(Locale.ROOT) : "";

        Map<String, WorkflowDirectoryContactDto> byEmail = new LinkedHashMap<>();
        for (ProjectWorkflowSettings doc : projectWorkflowSettingsRepository.findAll()) {
            if (doc == null || doc.getProjectId() == null) {
                continue;
            }
            if (!exclude.isEmpty() && exclude.equals(doc.getProjectId())) {
                continue;
            }
            ingestConfiguration(doc.getDefaultConfiguration(), byEmail);
            if (doc.getEnvironmentConfigurations() != null) {
                for (WorkflowConfiguration envCfg : doc.getEnvironmentConfigurations().values()) {
                    ingestConfiguration(envCfg, byEmail);
                }
            }
            if (doc.getRequestTypeOverrides() != null) {
                for (RequestTypeWorkflowOverride o : doc.getRequestTypeOverrides()) {
                    if (o != null) {
                        ingestConfiguration(o.getConfiguration(), byEmail);
                    }
                }
            }
        }

        List<WorkflowDirectoryContactDto> list = new ArrayList<>(byEmail.values());
        list.sort(Comparator.comparing(WorkflowDirectoryContactDto::getEmail, Comparator.nullsLast(String::compareToIgnoreCase)));

        if (q.isEmpty()) {
            return list;
        }
        List<WorkflowDirectoryContactDto> filtered = new ArrayList<>();
        for (WorkflowDirectoryContactDto row : list) {
            if (matches(row, q)) {
                filtered.add(row);
            }
        }
        return filtered;
    }

    private static boolean matches(WorkflowDirectoryContactDto row, String qLower) {
        String em = safeLower(row.getEmail());
        String nm = safeLower(row.getName());
        String rl = safeLower(row.getRole());
        return em.contains(qLower) || nm.contains(qLower) || rl.contains(qLower);
    }

    private static String safeLower(String s) {
        return s != null ? s.toLowerCase(Locale.ROOT) : "";
    }

    private void ingestConfiguration(WorkflowConfiguration cfg, Map<String, WorkflowDirectoryContactDto> byEmail) {
        if (cfg == null) {
            return;
        }
        addApprovers(byEmail, cfg.getManagers());
        addApprovers(byEmail, cfg.getCostApprovers());
        if (cfg.getApprovalLevels() != null) {
            for (ApprovalLevelConfig lvl : cfg.getApprovalLevels()) {
                if (lvl != null) {
                    addApprovers(byEmail, lvl.getApprovers());
                }
            }
        }
        addRoutingEmails(byEmail, cfg.getEmailRouting());
    }

    private void addRoutingEmails(Map<String, WorkflowDirectoryContactDto> byEmail, EmailRoutingConfig routing) {
        if (routing == null) {
            return;
        }
        addApprovers(byEmail, routing.getTo());
        addApprovers(byEmail, routing.getCc());
        addApprovers(byEmail, routing.getBcc());
        addEmailStrings(byEmail, routing.getToMandatory());
        addEmailStrings(byEmail, routing.getCcMandatory());
        addEmailStrings(byEmail, routing.getBccMandatory());
    }

    private void addEmailStrings(Map<String, WorkflowDirectoryContactDto> byEmail, List<String> emails) {
        if (emails == null) {
            return;
        }
        for (String raw : emails) {
            mergeEmailOnly(byEmail, raw);
        }
    }

    private void addApprovers(Map<String, WorkflowDirectoryContactDto> byEmail, List<WorkflowApprover> approvers) {
        if (approvers == null) {
            return;
        }
        for (WorkflowApprover a : approvers) {
            if (a == null || a.getEmail() == null) {
                continue;
            }
            String email = normalizeEmailKey(a.getEmail());
            if (email.isEmpty()) {
                continue;
            }
            WorkflowDirectoryContactDto incoming = WorkflowDirectoryContactDto.builder()
                    .email(email)
                    .name(trimToNull(a.getName()))
                    .role(trimToNull(a.getRole()))
                    .build();
            byEmail.merge(email, incoming, WorkflowDirectoryService::mergeRows);
        }
    }

    private void mergeEmailOnly(Map<String, WorkflowDirectoryContactDto> byEmail, String raw) {
        String email = normalizeEmailKey(raw);
        if (email.isEmpty()) {
            return;
        }
        WorkflowDirectoryContactDto incoming = WorkflowDirectoryContactDto.builder()
                .email(email)
                .name(null)
                .role(null)
                .build();
        byEmail.merge(email, incoming, WorkflowDirectoryService::mergeRows);
    }

    private static WorkflowDirectoryContactDto mergeRows(WorkflowDirectoryContactDto existing, WorkflowDirectoryContactDto incoming) {
        return WorkflowDirectoryContactDto.builder()
                .email(firstNonBlank(existing.getEmail(), incoming.getEmail()))
                .name(firstNonBlank(incoming.getName(), existing.getName()))
                .role(firstNonBlank(incoming.getRole(), existing.getRole()))
                .build();
    }

    private static String firstNonBlank(String x, String y) {
        if (x != null && !x.isBlank()) {
            return x.trim();
        }
        if (y != null && !y.isBlank()) {
            return y.trim();
        }
        return x != null ? x : y;
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String normalizeEmailKey(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim().toLowerCase(Locale.ROOT);
        if (t.isEmpty() || !t.contains("@")) {
            return "";
        }
        return t;
    }
}
