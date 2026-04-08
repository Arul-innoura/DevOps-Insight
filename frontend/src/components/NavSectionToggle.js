import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Collapsible sidebar section header (Jira-style dark sidebar).
 */
export function NavSectionToggle({ open, onToggle, label }) {
    return (
        <button
            type="button"
            className={`nav-section-toggle${open ? " is-open" : ""}`}
            onClick={onToggle}
            aria-expanded={open}
        >
            <span className="nav-section-toggle-label">{label}</span>
            <span className="nav-section-toggle-chevron" aria-hidden>
                {open ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
            </span>
        </button>
    );
}
