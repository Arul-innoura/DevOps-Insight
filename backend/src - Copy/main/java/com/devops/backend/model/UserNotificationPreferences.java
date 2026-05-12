package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "user_notification_preferences")
public class UserNotificationPreferences {

    @Id
    private String id;

    @Indexed(unique = true)
    private String userEmail;

    @Builder.Default
    private boolean ticketStatusChanges = true;
    @Builder.Default
    private boolean approvalRequests = true;
    @Builder.Default
    private boolean approvalCompleted = true;
    @Builder.Default
    private boolean costApprovalUpdates = true;
    @Builder.Default
    private boolean commentsAndUpdates = true;

    private Instant updatedAt;
}
