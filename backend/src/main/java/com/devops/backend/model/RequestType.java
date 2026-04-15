package com.devops.backend.model;

/**
 * Enum representing the different types of requests that can be made in the ticket system.
 */
public enum RequestType {
    NEW_ENVIRONMENT("New Environment"),
    ENVIRONMENT_UP("Environment Up"),
    ENVIRONMENT_DOWN("Environment Down"),
    RELEASE_DEPLOYMENT("Release Deployment"),
    ISSUE_FIX("Issue Fix"),
    BUILD_REQUEST("General Request"),
    OTHER_QUERIES("Other Queries"),
    CODE_CUT("Code Cut");

    private final String displayName;

    RequestType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * Short token for ticket ids, e.g. {@code EH-ENVUP-MYPRODUCT-000001}.
     */
    public String getShortCode() {
        return switch (this) {
            case NEW_ENVIRONMENT -> "NEWENV";
            case ENVIRONMENT_UP -> "ENVUP";
            case ENVIRONMENT_DOWN -> "ENVDN";
            case RELEASE_DEPLOYMENT -> "RELDEP";
            case ISSUE_FIX -> "ISSFIX";
            case BUILD_REQUEST -> "GENREQ";
            case OTHER_QUERIES -> "OTHER";
            case CODE_CUT -> "CODECT";
        };
    }
}
