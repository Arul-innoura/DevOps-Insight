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
public class EmailRoutingConfig {
    @Builder.Default
    private List<String> to = new ArrayList<>();
    @Builder.Default
    private List<String> cc = new ArrayList<>();
    @Builder.Default
    private List<String> bcc = new ArrayList<>();

    /** Subset of {@code to} that are mandatory — users cannot remove these from ticket routing. */
    @Builder.Default
    private List<String> toMandatory = new ArrayList<>();
    /** Subset of {@code cc} that are mandatory — users cannot remove these from ticket routing. */
    @Builder.Default
    private List<String> ccMandatory = new ArrayList<>();
    /** Subset of {@code bcc} that are mandatory — users cannot remove these from ticket routing. */
    @Builder.Default
    private List<String> bccMandatory = new ArrayList<>();
}
