import React, { useId } from "react";

const VIEWBOX = "0 70 205 158";

/**
 * ShipIt brand eye (insights) — SVG only, no wordmark.
 * Optional subtle blink via CSS (see .shipit-eye-icon--blink).
 */
export function ShipItEyeIcon({ className = "", blink = true }) {
    const raw = useId();
    const id = raw.replace(/[^a-zA-Z0-9]/g, "") || "0";
    const lg = `se-lg-${id}`;
    const eyebg = `se-eyebg-${id}`;

    return (
        <span
            className={`shipit-eye-icon${blink ? " shipit-eye-icon--blink" : ""}${className ? ` ${className}` : ""}`.trim()}
            aria-hidden="true"
        >
            <svg
                className="shipit-eye-icon__svg"
                viewBox={VIEWBOX}
                xmlns="http://www.w3.org/2000/svg"
                focusable="false"
            >
                <defs>
                    <linearGradient id={lg} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366F1" />
                        <stop offset="100%" stopColor="#06D6A0" />
                    </linearGradient>
                    <linearGradient id={eyebg} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0D1F38" />
                        <stop offset="100%" stopColor="#0A1829" />
                    </linearGradient>
                </defs>
                <g className="shipit-eye-icon__blink-layer">
                    <ellipse cx="110" cy="150" rx="86" ry="66" fill="none" stroke="#6366F1" strokeWidth="1" opacity="0.15" />
                    <ellipse cx="110" cy="150" rx="98" ry="76" fill="none" stroke="#06D6A0" strokeWidth="0.8" opacity="0.1" />
                    <path
                        d="M22,150 Q66,82 110,78 Q154,82 198,150 Q154,218 110,222 Q66,218 22,150 Z"
                        fill={`url(#${eyebg})`}
                        stroke={`url(#${lg})`}
                        strokeWidth="3.5"
                    />
                    <circle cx="110" cy="150" r="44" fill="none" stroke="#6366F1" strokeWidth="3" opacity="0.9" />
                    <circle cx="110" cy="150" r="38" fill="none" stroke="#06D6A0" strokeWidth="1" strokeDasharray="6 4" opacity="0.6" />
                    <circle cx="110" cy="150" r="32" fill="#0A1525" />
                    <circle cx="110" cy="150" r="18" fill="#060D18" />
                    <rect x="102" y="155" width="5" height="10" rx="1.5" fill="#6366F1" />
                    <rect x="109" y="147" width="5" height="18" rx="1.5" fill={`url(#${lg})`} />
                    <rect x="116" y="151" width="5" height="14" rx="1.5" fill="#06D6A0" />
                    <ellipse cx="94" cy="133" rx="7" ry="4" fill="#FFFFFF" opacity="0.12" transform="rotate(-35 94 133)" />
                    <path d="M22,150 Q8,146 2,148" fill="none" stroke="#1E3A54" strokeWidth="3.5" strokeLinecap="round" />
                </g>
            </svg>
        </span>
    );
}

export default ShipItEyeIcon;
