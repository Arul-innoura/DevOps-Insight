import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2, Ticket } from "lucide-react";
import { searchTicketsApi, searchMyTicketsApi } from "../services/ticketService";

/**
 * Debounced server-side ticket search with suggestions dropdown.
 * @param {'global'|'mine'} scope — global (DevOps/Admin) vs my tickets (requester scope).
 */
export function TicketSearchBar({
    scope = "global",
    ticketDataVersion = 0,
    onPickTicket,
    onSearchStateChange,
    placeholder,
    className = "",
    inputId = "ticket-global-search",
    disabled = false
}) {
    const [value, setValue] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);
    const rootRef = useRef(null);
    const lastRequestId = useRef(0);

    const ph =
        placeholder ||
        (scope === "mine"
            ? "Search your tickets — id, product, description…"
            : "Search — ticket id (e.g. 0002), product, assignee…");

    const fetchResults = useCallback(
        async (q) => {
            const trimmed = String(q || "").trim();
            if (!trimmed) {
                setSuggestions([]);
                setOpen(false);
                onSearchStateChange?.({ query: "", remote: null, loading: false });
                return;
            }
            const reqId = ++lastRequestId.current;
            setLoading(true);
            onSearchStateChange?.({ query: trimmed, remote: null, loading: true });
            try {
                const list =
                    scope === "mine"
                        ? await searchMyTicketsApi(trimmed)
                        : await searchTicketsApi(trimmed);
                if (reqId !== lastRequestId.current) return;
                setSuggestions(list.slice(0, 10));
                setOpen(true);
                onSearchStateChange?.({ query: trimmed, remote: list, loading: false });
            } catch (e) {
                console.error(e);
                if (reqId !== lastRequestId.current) return;
                setSuggestions([]);
                onSearchStateChange?.({ query: trimmed, remote: [], loading: false });
            } finally {
                if (reqId === lastRequestId.current) setLoading(false);
            }
        },
        [scope, onSearchStateChange]
    );

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = value;
        if (!q.trim()) {
            setSuggestions([]);
            setOpen(false);
            onSearchStateChange?.({ query: "", remote: null, loading: false });
            return;
        }
        debounceRef.current = setTimeout(() => {
            void fetchResults(q);
        }, 280);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [value, fetchResults, onSearchStateChange]);

    useEffect(() => {
        if (!value.trim()) return;
        void fetchResults(value);
    }, [ticketDataVersion, fetchResults, value]);

    useEffect(() => {
        const onDoc = (e) => {
            if (!rootRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const clear = () => {
        setValue("");
        setSuggestions([]);
        setOpen(false);
        onSearchStateChange?.({ query: "", remote: null, loading: false });
    };

    const pick = (ticket) => {
        onPickTicket?.(ticket);
        setOpen(false);
    };

    return (
        <div className={`ticket-search-bar ${className}`.trim()} ref={rootRef}>
            <div className={`ticket-search-inner ${loading ? "is-loading" : ""}`.trim()}>
                <Search size={18} className="ticket-search-icon" aria-hidden />
                <input
                    id={inputId}
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    className="ticket-search-input"
                    placeholder={ph}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onFocus={() => {
                        if (suggestions.length > 0) setOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            clear();
                        }
                    }}
                />
                {loading && <Loader2 size={16} className="ticket-search-spinner spin-icon" aria-label="Searching" />}
                {value && !loading && (
                    <button type="button" className="ticket-search-clear" onClick={clear} title="Clear search">
                        <X size={16} />
                    </button>
                )}
            </div>
            {open && suggestions.length > 0 && (
                <ul className="ticket-search-suggestions" role="listbox">
                    {suggestions.map((t) => (
                        <li key={t.id} role="option">
                            <button type="button" className="ticket-search-suggest-row" onClick={() => pick(t)}>
                                <span className="ticket-search-suggest-id mono">{t.id}</span>
                                <span className="ticket-search-suggest-title">{t.productName || "—"}</span>
                                <span className="ticket-search-suggest-meta">
                                    {t.status || ""}
                                    {t.environment ? ` · ${t.environment}` : ""}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {open && value.trim() && !loading && suggestions.length === 0 && (
                <div className="ticket-search-empty">
                    <Ticket size={18} />
                    <span>No matches</span>
                </div>
            )}
        </div>
    );
}

export default TicketSearchBar;
