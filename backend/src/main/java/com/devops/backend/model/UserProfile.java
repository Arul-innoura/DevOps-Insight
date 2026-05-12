package com.devops.backend.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "user_profiles")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserProfile {

    @Id
    private String id;

    @Indexed(unique = true)
    private String email;

    private String bio;

    /** Full birth date as ISO string "yyyy-MM-dd", e.g. "1992-03-15" */
    private String dateOfBirth;

    /**
     * "MM-dd" portion only (e.g. "03-15") — indexed for efficient daily birthday queries
     * without scanning full date strings.
     */
    @Indexed
    private String birthMonthDay;

    /** Azure Blob URL for profile picture; null means show initials fallback. */
    private String profilePicUrl;

    private Instant updatedAt;
}
