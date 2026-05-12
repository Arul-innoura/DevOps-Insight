package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Manager entity for CC email recipients in ticket creation.
 * Users can select a manager to auto-populate CC field.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "managers")
public class Manager {

    @Id
    private String id;

    private String name;

    @Indexed(unique = true)
    private String email;

    @Builder.Default
    private boolean active = true;

    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
