package com.devops.backend.model.autobuild;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A single approver entry configured directly on an environment's auto-build config. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BuildApprover {
    private String name;
    private String email;
}
