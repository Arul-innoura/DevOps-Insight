import React, { createContext, useContext, useState, useLayoutEffect, useCallback, useMemo } from "react";

const THEME_KEY = "shipit_theme";

/** All built-in appearance modes (shown in UI; some may be locked). */
export const THEMES = ["light", "dark", "retro", "devops"];

/** Themes visible in the picker but not selectable. */
export const LOCKED_THEME_IDS = ["retro", "devops"];

function readStoredTheme() {
    try {
        const raw = localStorage.getItem(THEME_KEY);
        if (raw && THEMES.includes(raw)) return raw;
    } catch {
        /* ignore */
    }
    return null;
}

/** Drop invalid or locked themes from persisted value so UI never stays on a locked theme. */
function normalizeInitialTheme(stored) {
    if (!stored || !THEMES.includes(stored)) return null;
    if (LOCKED_THEME_IDS.includes(stored)) return null;
    return stored;
}

function systemDefaultTheme() {
    if (typeof window === "undefined") return "light";
    try {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch {
        /* ignore */
    }
    return "light";
}

const ThemeContext = createContext({
    theme: "light",
    setTheme: () => {},
    themes: THEMES,
    lockedThemeIds: LOCKED_THEME_IDS,
});

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(
        () => normalizeInitialTheme(readStoredTheme()) || systemDefaultTheme()
    );

    const setTheme = useCallback((next) => {
        if (!THEMES.includes(next)) return;
        if (LOCKED_THEME_IDS.includes(next)) return;
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            /* ignore */
        }
        document.documentElement.setAttribute("data-theme", next);
        setThemeState(next);
    }, []);

    /** Keep <html data-theme> and localStorage in sync (including first paint after reload). */
    useLayoutEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            /* ignore */
        }
    }, [theme]);

    const value = useMemo(
        () => ({
            theme,
            setTheme,
            themes: THEMES,
            lockedThemeIds: LOCKED_THEME_IDS,
        }),
        [theme, setTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
