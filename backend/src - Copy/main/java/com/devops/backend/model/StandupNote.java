package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "standup_notes")
public class StandupNote {

    @Id
    private String id;

    @Indexed
    private String date;

    private String summary;

    @Builder.Default
    private List<StandupUpdate> updates = new ArrayList<>();

    private Instant createdAt;
    private String createdBy;
    private String createdByEmail;
}
