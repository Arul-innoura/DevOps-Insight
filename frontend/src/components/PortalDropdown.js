import React, { useLayoutEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * Fixed-position dropdown anchored to a ref — escapes overflow:hidden ancestors (e.g. workflow modal).
 * @param {(el: HTMLElement | null) => void} [onMountRoot] — ref to portal root for outside-click checks.
 */
export default function PortalDropdown({ open, anchorRef, children, className = "", onMountRoot }) {
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
        if (!open) {
            setStyle(null);
            if (typeof onMountRoot === "function") {
                onMountRoot(null);
            }
            return;
        }
        const el = anchorRef?.current;
        if (!el) {
            setStyle(null);
            return;
        }

        const place = () => {
            const r = el.getBoundingClientRect();
            const margin = 6;
            const maxH = Math.min(320, Math.max(120, window.innerHeight - 24));
            let top = r.bottom + margin;
            let left = r.left;
            const w = Math.max(r.width, 260);
            if (left + w > window.innerWidth - 8) {
                left = Math.max(8, window.innerWidth - w - 8);
            }
            if (top + maxH > window.innerHeight - 8) {
                top = Math.max(8, r.top - margin - maxH);
            }
            setStyle({
                position: "fixed",
                top,
                left,
                width: w,
                maxHeight: maxH,
                zIndex: 200000,
                overflowY: "auto"
            });
        };

        place();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open, anchorRef, onMountRoot]);

    const setRoot = useCallback(
        (node) => {
            if (typeof onMountRoot === "function") {
                onMountRoot(node);
            }
        },
        [onMountRoot]
    );

    if (!open || !style) return null;

    return createPortal(
        <div ref={setRoot} className={`wf-suggest-portal ${className}`.trim()} style={style}>
            {children}
        </div>,
        document.body
    );
}
