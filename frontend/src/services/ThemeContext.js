import React, { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = 'shipit_theme';
const THEMES = ['light', 'dark', 'retro', 'devops'];

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, themes: THEMES });

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(() => {
        try {
            const saved = localStorage.getItem(THEME_KEY);
            return THEMES.includes(saved) ? saved : 'light';
        } catch { return 'light'; }
    });

    const setTheme = (t) => {
        if (!THEMES.includes(t)) return;
        setThemeState(t);
        try { localStorage.setItem(THEME_KEY, t); } catch {}
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        return () => document.documentElement.removeAttribute('data-theme');
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
