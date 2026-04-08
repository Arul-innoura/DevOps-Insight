import { useState, useEffect } from "react";

const PREFIX = "devops-sidebar-nav:";

/**
 * Load persisted sidebar group open/closed state (per portal).
 * @param {string} key e.g. "admin", "devops", "user"
 * @param {Record<string, boolean>} defaults
 */
export function loadSidebarNavGroups(key, defaults) {
    if (typeof window === "undefined") return { ...defaults };
    try {
        const raw = window.localStorage.getItem(PREFIX + key);
        if (!raw) return { ...defaults };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { ...defaults };
        return { ...defaults, ...parsed };
    } catch {
        return { ...defaults };
    }
}

export function saveSidebarNavGroups(key, state) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(state));
    } catch {
        /* quota / private mode */
    }
}

/**
 * Sidebar nav groups with localStorage persistence.
 */
export function usePersistedSidebarNav(key, defaults) {
    const [navGroups, setNavGroups] = useState(() => loadSidebarNavGroups(key, defaults));

    useEffect(() => {
        saveSidebarNavGroups(key, navGroups);
    }, [key, navGroups]);

    return [navGroups, setNavGroups];
}
