package com.devops.backend.util;

import com.devops.backend.model.Environment;
import com.devops.backend.model.Ticket;

/**
 * Single place for ticket fields as shown in emails and public approval pages.
 */
public final class TicketDisplayFormat {

    private TicketDisplayFormat() {
    }

    /**
     * Environment line: project/admin-configured label when present, otherwise enum display name.
     * Matches {@code EmailServiceImpl#displayEnvironment} behaviour.
     */
    public static String environmentLine(Ticket ticket) {
        if (ticket == null) {
            return "—";
        }
        String label = ticket.getEnvironmentLabel();
        if (label != null && !label.isBlank()) {
            return label.trim();
        }
        Environment environment = ticket.getEnvironment();
        if (environment == null) {
            return "—";
        }
        String displayName = environment.getDisplayName();
        if (displayName != null && !displayName.isBlank()) {
            return displayName.trim();
        }
        return environment.name();
    }
}
