package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowConfiguration {

    @Builder.Default
    private EmailRoutingConfig emailRouting = EmailRoutingConfig.builder().build();

    @Builder.Default
    private List<ApprovalLevelConfig> approvalLevels = new ArrayList<>();

    /** Optional project/request-type managers used for auto-fill in ticket creation. */
    @Builder.Default
    private List<WorkflowApprover> managers = new ArrayList<>();

    @Builder.Default
    private boolean costApprovalRequired = false;

    @Builder.Default
    private List<WorkflowApprover> costApprovers = new ArrayList<>();

    @Builder.Default
    private NotificationPreferenceConfig notificationPreferences = NotificationPreferenceConfig.builder().build();

    public static WorkflowConfiguration emptyDefaults() {
        return WorkflowConfiguration.builder()
                .emailRouting(EmailRoutingConfig.builder().build())
                .approvalLevels(new ArrayList<>())
                .managers(new ArrayList<>())
                .costApprovalRequired(false)
                .costApprovers(new ArrayList<>())
                .notificationPreferences(NotificationPreferenceConfig.builder().build())
                .build();
    }
}
