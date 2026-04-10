package com.devops.backend.model;

import java.util.Locale;

/**
 * Deployment environments. API JSON uses enum names (DEV, QA, …).
 * {@link #getDisplayName()} is the full human-readable label for UI and monitoring.
 */
public enum Environment {
    DEV("Development"),
    QA("Quality Assurance"),
    STAGE("Staging"),
    UAT("User Acceptance Testing"),
    PRODUCTION("Production");

    private final String displayName;

    Environment(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * Resolve a workflow / config map key (legacy short names or new full names) to an enum.
     */
    public static Environment fromFlexibleKey(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String k = key.trim();
        try {
            return Environment.valueOf(k.toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_"));
        } catch (IllegalArgumentException ignored) {
            // fall through — not an enum constant name
        }
        String lower = k.toLowerCase(Locale.ROOT);
        for (Environment e : values()) {
            if (e.displayName.equalsIgnoreCase(k)) {
                return e;
            }
        }
        // Legacy short labels stored in older workflow documents
        return switch (lower) {
            case "dev" -> DEV;
            case "qa" -> QA;
            case "stage", "staging" -> STAGE;
            case "uat", "user acceptance testing", "user_acceptance_testing" -> UAT;
            case "production", "prod" -> PRODUCTION;
            default -> null;
        };
    }

    /**
     * Whether a stored config key refers to this environment (supports legacy + full names).
     */
    public boolean matchesWorkflowKey(String key) {
        Environment resolved = fromFlexibleKey(key);
        return resolved == this;
    }
}
