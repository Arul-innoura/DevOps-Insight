package com.devops.backend.model;

/**
 * Enum representing the different environments available.
 */
public enum Environment {
    DEV("Dev"),
    QA("QA"),
    STAGE("Stage"),
    PRODUCTION("Production");

    private final String displayName;

    Environment(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
