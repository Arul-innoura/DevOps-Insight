import React, { useId } from "react";

/** Small "Ba" element-box — kept for fallback/icon contexts */
export const BakaaatIcon = () => (
    <svg viewBox="0 0 34 34" width="22" height="22" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <text x="3.5" y="10.5" fontSize="6.5" fontWeight="700" fill="#3fcf8e"
              fontFamily="Georgia, serif" opacity="0.9">56</text>
        <text x="17" y="25.5" fontSize="20" fontWeight="900" fill="#3fcf8e"
              fontFamily="Georgia, serif" textAnchor="middle">B</text>
        <text x="3.5" y="31.5" fontSize="5.5" fill="#3fcf8e"
              fontFamily="Georgia, serif" opacity="0.72" letterSpacing="1">Ba</text>
    </svg>
);

/* ── shared smoke filter builder ────────────────────────────── */
const SmokeFilters = ({ id, seed1 = 7, seed2 = 3 }) => (
    <defs>
        {/* Layer 1 — coarse rolling clouds */}
        <filter id={`${id}-s1`} x="-15%" y="-40%" width="130%" height="180%"
                colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.022 0.009"
                numOctaves="4" seed={seed1} result="turb">
                <animate attributeName="seed"
                    values={`${seed1};${seed1+6};${seed1+2};${seed1+10};${seed1}`}
                    dur="11s" repeatCount="indefinite"/>
                <animate attributeName="baseFrequency"
                    values="0.022 0.009;0.018 0.013;0.026 0.007;0.022 0.009"
                    dur="9s" repeatCount="indefinite"/>
            </feTurbulence>
            {/* dark-green smoke: color tied to noise, alpha thresholded for wisps */}
            <feColorMatrix in="turb" type="matrix"
                values="0.08 0.04 0 0 0.02
                        0.55 0.20 0 0 0.14
                        0.10 0.04 0 0 0.04
                        11   5   2 0 -4.8"
                result="smoke1"/>
            <feGaussianBlur in="smoke1" stdDeviation="2"/>
        </filter>

        {/* Layer 2 — finer rising wisps */}
        <filter id={`${id}-s2`} x="-15%" y="-40%" width="130%" height="180%"
                colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.042 0.018"
                numOctaves="5" seed={seed2} result="turb2">
                <animate attributeName="seed"
                    values={`${seed2};${seed2+7};${seed2+14};${seed2+4};${seed2}`}
                    dur="8s" repeatCount="indefinite"/>
                <animate attributeName="baseFrequency"
                    values="0.042 0.018;0.036 0.024;0.048 0.014;0.042 0.018"
                    dur="6s" repeatCount="indefinite"/>
            </feTurbulence>
            {/* brighter-green highlights for detail wisps */}
            <feColorMatrix in="turb2" type="matrix"
                values="0.10 0.06 0 0 0.03
                        0.75 0.30 0 0 0.10
                        0.12 0.05 0 0 0.04
                        14   6   3 0 -6.2"
                result="smoke2"/>
            <feGaussianBlur in="smoke2" stdDeviation="1.2"/>
        </filter>
    </defs>
);

/* ─────────────────────────────────────────────────────────────
   BakaaatInline — sidebar horizontal wordmark with live smoke
   ───────────────────────────────────────────────────────────── */
export const BakaaatInline = () => {
    const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
    const id  = `bki-${raw}`;

    return (
        <svg viewBox="-22 -14 222 66" height="32"
             style={{ width: 'auto', display: 'block', overflow: 'visible' }}
             fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Bakaat">

            <SmokeFilters id={id} seed1={7} seed2={3}/>

            {/* Dark background */}
            <rect x="-22" y="-14" width="222" height="66" rx="8" fill="#0d0d09"/>

            {/* Smoke cloud layers — behind text */}
            <rect x="-22" y="-14" width="222" height="66" rx="8"
                  filter={`url(#${id}-s1)`} opacity="0.85"/>
            <rect x="-22" y="-14" width="222" height="66" rx="8"
                  filter={`url(#${id}-s2)`} opacity="0.65"/>

            {/* ── Wordmark text (z-order: above smoke) ── */}

            {/* B — Barium 56 */}
            <rect x="0.5" y="0.5" width="31" height="37" rx="2"
                  stroke="#3fcf8e" strokeWidth="1.4"/>
            <text x="3.5" y="9" fontSize="5.5" fontWeight="700" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.9">56</text>
            <text x="3.5" y="35.5" fontSize="4.5" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.72" letterSpacing="0.5">Ba</text>
            <text x="16" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif">B</text>

            {/* a — plain */}
            <text x="43" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif" opacity="0.52">a</text>

            {/* k — Potassium 19 */}
            <rect x="52.5" y="0.5" width="26" height="37" rx="2"
                  stroke="#3fcf8e" strokeWidth="1.4"/>
            <text x="55.5" y="9" fontSize="5.5" fontWeight="700" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.9">19</text>
            <text x="55.5" y="35.5" fontSize="4.5" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.72" letterSpacing="0.5">K</text>
            <text x="65.5" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif">k</text>

            {/* a — Actinium 89 */}
            <rect x="80.5" y="0.5" width="26" height="37" rx="2"
                  stroke="#3fcf8e" strokeWidth="1.4"/>
            <text x="83.5" y="9" fontSize="5.5" fontWeight="700" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.9">89</text>
            <text x="83.5" y="35.5" fontSize="4.5" fill="#3fcf8e"
                  fontFamily="Georgia, serif" opacity="0.72" letterSpacing="0.5">Ac</text>
            <text x="93.5" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif">a</text>

            {/* a — plain */}
            <text x="117" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif" opacity="0.52">a</text>

            {/* t — plain */}
            <text x="143" y="33" textAnchor="middle" fontSize="27" fontWeight="900"
                  fill="#3fcf8e" fontFamily="Georgia, serif" opacity="0.52">t</text>

        </svg>
    );
};

/* ─────────────────────────────────────────────────────────────
   BakaaatWordmark — full transparent wordmark for login page
   ───────────────────────────────────────────────────────────── */
export const BakaaatWordmark = ({ width = "100%", height = "auto" }) => (
    <svg viewBox="0 0 680 300" xmlns="http://www.w3.org/2000/svg" role="img"
         style={{ width, height, maxWidth: 680, display: 'block', overflow: 'visible' }}>
        <title>Bakaat</title>

        <defs>
            {/* Wordmark smoke — Layer 1: large rolling clouds */}
            <filter id="bbw-smoke1" x="-8%" y="-60%" width="116%" height="220%"
                    colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.016 0.007"
                    numOctaves="5" seed="11" result="turb">
                    <animate attributeName="seed" values="11;17;5;22;11"
                        dur="12s" repeatCount="indefinite"/>
                    <animate attributeName="baseFrequency"
                        values="0.016 0.007;0.013 0.010;0.019 0.006;0.016 0.007"
                        dur="10s" repeatCount="indefinite"/>
                </feTurbulence>
                <feColorMatrix in="turb" type="matrix"
                    values="0.06 0.03 0 0 0.02
                            0.50 0.18 0 0 0.15
                            0.08 0.03 0 0 0.04
                            10   4   2 0 -4.5"
                    result="sm1"/>
                <feGaussianBlur in="sm1" stdDeviation="4"/>
            </filter>

            {/* Wordmark smoke — Layer 2: finer detail wisps */}
            <filter id="bbw-smoke2" x="-8%" y="-60%" width="116%" height="220%"
                    colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.032 0.014"
                    numOctaves="6" seed="4" result="turb2">
                    <animate attributeName="seed" values="4;11;19;7;4"
                        dur="9s" repeatCount="indefinite"/>
                    <animate attributeName="baseFrequency"
                        values="0.032 0.014;0.027 0.018;0.038 0.010;0.032 0.014"
                        dur="7s" repeatCount="indefinite"/>
                </feTurbulence>
                <feColorMatrix in="turb2" type="matrix"
                    values="0.10 0.05 0 0 0.02
                            0.80 0.30 0 0 0.08
                            0.12 0.05 0 0 0.04
                            15   6   3 0 -7.0"
                    result="sm2"/>
                <feGaussianBlur in="sm2" stdDeviation="2.5"/>
            </filter>

            {/* Wordmark smoke — Layer 3: bright accent tendrils */}
            <filter id="bbw-smoke3" x="-8%" y="-60%" width="116%" height="220%"
                    colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.055 0.022"
                    numOctaves="4" seed="16" result="turb3">
                    <animate attributeName="seed" values="16;8;24;13;16"
                        dur="7s" repeatCount="indefinite"/>
                </feTurbulence>
                <feColorMatrix in="turb3" type="matrix"
                    values="0.15 0.08 0 0 0.03
                            1.0  0.40 0 0 0.05
                            0.20 0.08 0 0 0.06
                            18   8   4 0 -9.0"
                    result="sm3"/>
                <feGaussianBlur in="sm3" stdDeviation="1.5"/>
            </filter>

            <clipPath id="bbw-clip">
                <rect x="90" y="10" width="500" height="200"/>
            </clipPath>
        </defs>

        <style>{`
            .bbw-stamp {
                transform-origin: 340px 105px;
                animation: bbw-stamp 1s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
            }
            @keyframes bbw-stamp {
                0%   { transform: scale(0) rotate(-5deg); opacity: 0; }
                55%  { transform: scale(1.05) rotate(1deg); opacity: 1; }
                100% { transform: scale(1) rotate(0deg); }
            }
            .bbw-l  { opacity: 0; animation: bbw-drop 0.45s ease-out both; }
            .bbw-l1 { animation-delay: 0.8s; }
            .bbw-l2 { animation-delay: 0.95s; }
            .bbw-l3 { animation-delay: 1.1s; }
            .bbw-l4 { animation-delay: 1.25s; }
            .bbw-l5 { animation-delay: 1.4s; }
            .bbw-l6 { animation-delay: 1.55s; }
            @keyframes bbw-drop {
                0%   { opacity: 0; transform: translateY(-12px); }
                60%  { opacity: 1; transform: translateY(3px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            .bbw-box {
                stroke-dasharray: 500;
                stroke-dashoffset: 500;
                animation: bbw-draw 0.6s ease-out both;
            }
            .bbw-b1 { animation-delay: 0.6s; }
            .bbw-b2 { animation-delay: 0.75s; }
            .bbw-b3 { animation-delay: 0.9s; }
            @keyframes bbw-draw { to { stroke-dashoffset: 0; } }
            .bbw-glow { animation: bbw-glow 3s ease-in-out 3s infinite; }
            @keyframes bbw-glow { 0%,100%{opacity:1} 50%{opacity:0.65} }
            .bbw-tag { opacity: 0; animation: bbw-up 0.7s ease-out 2s both; }
            @keyframes bbw-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        `}</style>

        {/* Smoke behind the wordmark — 3 animated layers */}
        <rect x="90" y="10" width="500" height="185" rx="6"
              filter="url(#bbw-smoke1)" opacity="0.9" clipPath="url(#bbw-clip)"/>
        <rect x="90" y="10" width="500" height="185" rx="6"
              filter="url(#bbw-smoke2)" opacity="0.75" clipPath="url(#bbw-clip)"/>
        <rect x="90" y="10" width="500" height="185" rx="6"
              filter="url(#bbw-smoke3)" opacity="0.55" clipPath="url(#bbw-clip)"/>

        {/* Subtle divider lines */}
        <line stroke="#2a2a1e" strokeWidth="0.5" opacity="0.35" x1="90" y1="0"   x2="590" y2="0"/>
        <line stroke="#2a2a1e" strokeWidth="0.5" opacity="0.35" x1="90" y1="200" x2="590" y2="200"/>

        {/* ── Wordmark ── */}
        <g className="bbw-stamp">

            {/* B — Barium 56 */}
            <rect className="bbw-box bbw-b1" x="100" y="18" width="118" height="132" rx="3"
                  fill="none" stroke="#3fcf8e" strokeWidth="2"/>
            <text className="bbw-l bbw-l1" x="111" y="38"
                  fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#3fcf8e" opacity="0.9">56</text>
            <text className="bbw-l bbw-l1" x="111" y="141"
                  fontFamily="Georgia, serif" fontSize="9" fill="#3fcf8e" opacity="0.72" letterSpacing="1">Ba</text>
            <text className="bbw-l bbw-l1 bbw-glow" x="159" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#3fcf8e">B</text>

            {/* a — plain */}
            <text className="bbw-l bbw-l2" x="246" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#1a1a14">a</text>

            {/* k — Potassium 19 */}
            <rect className="bbw-box bbw-b2" x="278" y="18" width="88" height="132" rx="3"
                  fill="none" stroke="#3fcf8e" strokeWidth="2"/>
            <text className="bbw-l bbw-l3" x="288" y="38"
                  fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#3fcf8e" opacity="0.9">19</text>
            <text className="bbw-l bbw-l3" x="288" y="141"
                  fontFamily="Georgia, serif" fontSize="9" fill="#3fcf8e" opacity="0.72" letterSpacing="1">K</text>
            <text className="bbw-l bbw-l3 bbw-glow" x="322" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#3fcf8e">k</text>

            {/* a — Actinium 89 */}
            <rect className="bbw-box bbw-b3" x="368" y="18" width="88" height="132" rx="3"
                  fill="none" stroke="#3fcf8e" strokeWidth="2"/>
            <text className="bbw-l bbw-l4" x="378" y="38"
                  fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#3fcf8e" opacity="0.9">89</text>
            <text className="bbw-l bbw-l4" x="378" y="141"
                  fontFamily="Georgia, serif" fontSize="9" fill="#3fcf8e" opacity="0.72" letterSpacing="1">Ac</text>
            <text className="bbw-l bbw-l4 bbw-glow" x="412" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#3fcf8e">a</text>

            {/* a — plain */}
            <text className="bbw-l bbw-l5" x="488" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#1a1a14">a</text>

            {/* t — plain */}
            <text className="bbw-l bbw-l6" x="540" y="140" textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="110" fontWeight="900" fill="#1a1a14">t</text>

        </g>

        {/* Tagline */}
        <line className="bbw-tag" stroke="#d1d5db" strokeWidth="1" x1="100" y1="170" x2="580" y2="170"/>
        <text className="bbw-tag" x="340" y="192" textAnchor="middle"
              fontFamily="Georgia, serif" fontSize="11" letterSpacing="5" fill="#6b7280">
            SEE IT. FIX IT. AUTOMATE IT.
        </text>

    </svg>
);
