import React from "react";
import { Sun, Moon, Palette, Cpu, Lock } from "lucide-react";
import { useTheme, LOCKED_THEME_IDS } from "../services/ThemeContext";

const THEME_OPTIONS = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "retro", label: "Retro", Icon: Palette },
    { id: "devops", label: "DevOps", Icon: Cpu },
];

/**
 * Theme buttons for settings: Light/Dark selectable; Retro/DevOps shown locked.
 */
export function ThemePickerRow() {
    const { theme, setTheme, themes, lockedThemeIds } = useTheme();
    const locked = new Set(lockedThemeIds || LOCKED_THEME_IDS);

    return (
        <div className="theme-picker-row">
            {THEME_OPTIONS.filter((row) => themes.includes(row.id)).map((row) => {
                const isLocked = locked.has(row.id);
                const isActive = theme === row.id;
                const Icon = row.Icon;
                return (
                    <button
                        key={row.id}
                        type="button"
                        disabled={isLocked}
                        title={
                            isLocked
                                ? "This theme is not available to select"
                                : `Switch to ${row.label} theme`
                        }
                        onClick={() => {
                            if (!isLocked) setTheme(row.id);
                        }}
                        className={
                            "theme-picker-btn" +
                            (isActive ? " theme-picker-btn--active" : "") +
                            (isLocked ? " theme-picker-btn--locked" : "")
                        }
                    >
                        <span className="theme-picker-btn__inner">
                            <Icon size={16} strokeWidth={2} aria-hidden className="theme-picker-btn__icon" />
                            <span className="theme-picker-btn__label">{row.label}</span>
                            {isLocked && (
                                <Lock size={14} strokeWidth={2.5} aria-hidden className="theme-picker-btn__lock" />
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default ThemePickerRow;
