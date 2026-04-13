package com.devops.backend.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "rota_state")
public class RotaState {

    @Id
    private String id;

    @Builder.Default
    private List<String> orderEmails = new ArrayList<>();

    @Builder.Default
    private Map<String, List<String>> leaveByDate = new HashMap<>();

    @Builder.Default
    private Map<String, List<String>> manualAssignments = new HashMap<>();

    /**
     * DAILY = rotate primary each day (classic). WEEKLY = same primary Mon–Sun unless leave/manual adds coverage.
     */
    private String rotationMode;

    private String startDate;
    private Instant updatedAt;
    private String updatedBy;
}
