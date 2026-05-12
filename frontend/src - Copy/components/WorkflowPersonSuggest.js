import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalDropdown from "./PortalDropdown";

const norm = (s) => String(s || "").trim().toLowerCase();

const filterContacts = (contacts, value, layout, max = 12) => {
    const { role = "", name = "", email = "" } = value || {};
    // Approval: match role / name / email. Routing & cost: name / email only.
    const needles = (layout === "approval" ? [role, name, email] : [name, email])
        .map(norm)
        .filter((n) => n.length >= 1);
    const list = Array.isArray(contacts) ? contacts : [];
    const withEmail = list.filter((c) => c && norm(c.email).includes("@"));
    if (needles.length === 0) {
        return withEmail.slice(0, max);
    }
    return withEmail
        .filter((c) => {
            const fields = [norm(c.email), norm(c.name), norm(c.role)];
            return needles.some((needle) => fields.some((f) => f.includes(needle)));
        })
        .slice(0, max);
};

/**
 * Role / name / email with directory suggestions (portal dropdown).
 * @param {"approval" | "cost" | "routing"} layout — routing: stacked add row for email To/CC/BCC
 */
export default function WorkflowPersonSuggest({
    contacts = [],
    value,
    onChange,
    showRole = true,
    layout = "approval"
}) {
    const { role = "", name = "", email = "" } = value || {};
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const portalRootRef = useRef(null);

    const matches = useMemo(
        () => filterContacts(contacts, value, layout),
        [contacts, value, layout]
    );

    useEffect(() => {
        const onDoc = (e) => {
            const t = e.target;
            if (!t || !(t instanceof Node)) return;
            if (wrapRef.current?.contains(t) || portalRootRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const setPortalRoot = useCallback((el) => {
        portalRootRef.current = el;
    }, []);

    const pick = (c) => {
        const nextEmail = norm(c.email) || email;
        const nextName =
            c.name != null && String(c.name).trim() ? String(c.name).trim() : name || "";
        const nextRole =
            layout === "approval"
                ? (c.role != null && String(c.role).trim() ? String(c.role).trim() : role || "")
                : "";
        onChange({
            role: nextRole,
            name: nextName,
            email: nextEmail
        });
        setOpen(false);
    };

    const emit = (patch) => {
        onChange({
            role: showRole ? (patch.role !== undefined ? patch.role : role) : "",
            name: patch.name !== undefined ? patch.name : name,
            email: patch.email !== undefined ? patch.email : email
        });
    };

    const onFieldFocus = () => setOpen(true);
    const onFieldChange = (patch) => {
        emit(patch);
        setOpen(true);
    };

    const showList = open && matches.length > 0;

    const suggestionRow = (c) => {
        if (layout === "approval") {
            return (
                <>
                    <span className="workflow-person-suggest-line1">
                        {c.role ? <strong>{c.role}</strong> : <span className="muted">—</span>}
                    </span>
                    <span className="workflow-person-suggest-line2">
                        {c.name ? `${c.name} · ${c.email}` : c.email}
                    </span>
                </>
            );
        }
        return (
            <>
                <span className="workflow-person-suggest-line1">
                    {c.name ? <strong>{c.name}</strong> : <span className="muted">{c.email}</span>}
                </span>
                <span className="workflow-person-suggest-line2">
                    {c.name ? c.email : ""}
                    {c.role ? ` · ${c.role}` : ""}
                </span>
            </>
        );
    };

    const dropdownInner = showList ? (
        <div className="workflow-person-suggest-dropdown-inner" role="listbox">
            {matches.map((c) => (
                <button
                    key={c.email}
                    type="button"
                    role="option"
                    className="workflow-person-suggest-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        pick(c);
                    }}
                >
                    {suggestionRow(c)}
                </button>
            ))}
        </div>
    ) : null;

    const portal = (
        <PortalDropdown open={showList} anchorRef={wrapRef} onMountRoot={setPortalRoot}>
            {dropdownInner}
        </PortalDropdown>
    );

    if (layout === "cost") {
        return (
            <div className="approver-inputs workflow-person-suggest" ref={wrapRef}>
                <input
                    placeholder="Name"
                    value={name}
                    onChange={(e) => onFieldChange({ name: e.target.value })}
                    onFocus={onFieldFocus}
                />
                <input
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => onFieldChange({ email: e.target.value })}
                    onFocus={onFieldFocus}
                />
                {portal}
            </div>
        );
    }

    if (layout === "routing") {
        return (
            <div className="workflow-routing-person-fields workflow-person-suggest" ref={wrapRef}>
                {showRole && (
                    <input
                        placeholder="Designation / Role"
                        value={role}
                        onChange={(e) => onFieldChange({ role: e.target.value })}
                        onFocus={onFieldFocus}
                    />
                )}
                <input
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => onFieldChange({ name: e.target.value })}
                    onFocus={onFieldFocus}
                />
                <input
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => onFieldChange({ email: e.target.value })}
                    onFocus={onFieldFocus}
                />
                {portal}
            </div>
        );
    }

    return (
        <div className="approval-level-fields workflow-person-suggest" ref={wrapRef}>
            {showRole && (
                <input
                    placeholder="Designation / Role (e.g. Lead, Manager)"
                    value={role}
                    onChange={(e) => onFieldChange({ role: e.target.value })}
                    onFocus={onFieldFocus}
                />
            )}
            <input
                placeholder="Full Name"
                value={name}
                onChange={(e) => onFieldChange({ name: e.target.value })}
                onFocus={onFieldFocus}
            />
            <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => onFieldChange({ email: e.target.value })}
                onFocus={onFieldFocus}
            />
            {portal}
        </div>
    );
}
