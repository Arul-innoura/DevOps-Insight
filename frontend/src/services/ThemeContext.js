import React, { createContext, useContext, useState, useEffect } from "react";

const THEME_KEY = "shipit_theme";
/** Application appearance is fixed to light theme only. */
const LOCKED_THEME = "light";
const THEMES = [LOCKED_THEME];

const ThemeContext = createContext({
    theme: LOCKED_THEME,
    setTheme: () => {},
    themes: THEMES
});

export const ThemeProvider = ({ children }) => {
    const [theme] = useState(LOCKED_THEME);

    const setTheme = () => {
        /* Theme switching disabled — always light. */
    };

    useEffect(() => {
        try {
            localStorage.setItem(THEME_KEY, LOCKED_THEME);
        } catch {
            /* ignore */
        }
        document.documentElement.setAttribute("data-theme", LOCKED_THEME);
        return () => document.documentElement.setAttribute("data-theme", LOCKED_THEME);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
