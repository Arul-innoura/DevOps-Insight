package com.devops.backend.model.workflow;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-configuration notification toggles. When {@code mandatory} is true for a channel,
 * emails are always sent regardless of user preferences.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationPreferenceConfig {
    @Builder.Default
    private boolean ticketStatusChanges = true;
    @Builder.Default
    private boolean ticketStatusChangesMandatory = false;

    @Builder.Default
    private boolean approvalRequests = true;
    @Builder.Default
    private boolean approvalRequestsMandatory = true;

    @Builder.Default
    private boolean approvalCompleted = true;
    @Builder.Default
    private boolean approvalCompletedMandatory = false;

    @Builder.Default
    private boolean costApprovalUpdates = true;
    @Builder.Default
    private boolean costApprovalUpdatesMandatory = true;

    @Builder.Default
    private boolean commentsAndUpdates = true;
    @Builder.Default
    private boolean commentsAndUpdatesMandatory = false;
}
