import React, { useEffect, useMemo, useRef, useState } from "react";

const norm = (s) => String(s || "").trim().toLowerCase();

const filterContacts = (contacts, qRaw, max = 12) => {
    const q = norm(qRaw);
    const list = Array.isArray(contacts) ? contacts : [];
    const withEmail = list.filter((c) => c && norm(c.email).includes("@"));
    if (!q) return withEmail.slice(0, max);
    return withEmail
        .filter((c) => {
            const em = norm(c.email);
            const nm = norm(c.name);
            const rl = norm(c.role);
            return em.includes(q) || nm.includes(q) || rl.includes(q);
        })
        .slice(0, max);
};

/**
 * Role / name / email row with dropdown picks from workflow directory (other projects).
 * @param {"approval" | "cost"} layout
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
    const [focusKey, setFocusKey] = useState("email");
    const wrapRef = useRef(null);

    const filterSource = focusKey === "role" ? role : focusKey === "name" ? name : email;
    const matches = useMemo(
        () => filterContacts(contacts, filterSource),
        [contacts, filterSource]
    );

    useEffect(() => {
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const pick = (c) => {
        onChange({
            role: showRole ? (c.role || role || "") : "",
            name: c.name || name || "",
            email: norm(c.email) || email
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

    const showList = open && matches.length > 0;

    const dropdown = showList ? (
        <div className="workflow-person-suggest-dropdown" role="listbox">
            {matches.map((c) => (
                <button
                    key={c.email}
                    type="button"
                    role="option"
                    className="workflow-person-suggest-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                >
                    <span className="workflow-person-suggest-line1">
                        {c.name ? <strong>{c.name}</strong> : <span className="muted">{c.email}</span>}
                    </span>
                    <span className="workflow-person-suggest-line2">
                        {c.name ? c.email : ""}
                        {c.role ? ` · ${c.role}` : ""}
                    </span>
                </button>
            ))}
        </div>
    ) : null;

    if (layout === "cost") {
        return (
            <div className="approver-inputs workflow-person-suggest" ref={wrapRef}>
                <input
                    placeholder="Name"
                    value={name}
                    onChange={(e) => emit({ name: e.target.value })}
                    onFocus={() => {
                        setFocusKey("name");
                        setOpen(true);
                    }}
                />
                <div className="workflow-person-suggest-email-wrap">
                    <input
                        placeholder="Email"
                        type="email"
                        value={email}
                        onChange={(e) => emit({ email: e.target.value })}
                        onFocus={() => {
                            setFocusKey("email");
                            setOpen(true);
                        }}
                    />
                    {dropdown}
                </div>
            </div>
        );
    }

    return (
        <div className="approval-level-fields workflow-person-suggest" ref={wrapRef}>
            {showRole && (
                <input
                    placeholder="Designation / Role (e.g. Lead, Manager)"
                    value={role}
                    onChange={(e) => emit({ role: e.target.value })}
                    onFocus={() => {
                        setFocusKey("role");
                        setOpen(true);
                    }}
                />
            )}
            <input
                placeholder="Full Name"
                value={name}
                onChange={(e) => emit({ name: e.target.value })}
                onFocus={() => {
                    setFocusKey("name");
                    setOpen(true);
                }}
            />
            <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => emit({ email: e.target.value })}
                onFocus={() => {
                    setFocusKey("email");
                    setOpen(true);
                }}
            />
            {showList ? (
                <div className="workflow-person-suggest-dropdown-slot">{dropdown}</div>
            ) : null}
        </div>
    );
}
