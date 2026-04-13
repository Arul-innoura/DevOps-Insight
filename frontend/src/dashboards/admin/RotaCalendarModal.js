import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Pencil, Eye } from "lucide-react";
import {
    getRotaSchedule,
    setRotaManualAssignment,
    setRotaLeaveForDate,
    setRotaRotationMode,
} from "../../services/ticketService";

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function padDateKey(y, m0, d) {
    return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Monday-first grid: date of top-left cell for this calendar month */
export function monthGridStart(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    first.setHours(12, 0, 0, 0);
    const dow = (first.getDay() + 6) % 7;
    const start = new Date(year, monthIndex, 1 - dow);
    start.setHours(12, 0, 0, 0);
    return start;
}

function buildCells(year, monthIndex, scheduleByDate) {
    const start = monthGridStart(year, monthIndex);
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const inMonth = d.getMonth() === monthIndex;
        const key = padDateKey(d.getFullYear(), d.getMonth(), d.getDate());
        cells.push({ d, key, inMonth, row: scheduleByDate.get(key) });
    }
    return cells;
}

/**
 * Full-month on-call calendar: view who is on duty; admin can edit per-day assignments (up to 4) and leave,
 * and switch Daily vs Weekly rotation.
 */
export default function RotaCalendarModal({
    open,
    onClose,
    isAdmin,
    initialEdit = false,
    calMonth,
    onCalMonthChange,
    devOpsMembers,
    rotationMode,
    leaveByDate = {},
    onUpdated,
}) {
    const [editMode, setEditMode] = useState(false);
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState(null);
    const [pickEmails, setPickEmails] = useState([]);
    const [saving, setSaving] = useState(false);
    const [localMode, setLocalMode] = useState("DAILY");

    useEffect(() => {
        if (open) {
            setEditMode(!!initialEdit && isAdmin);
            setSelectedKey(null);
        }
    }, [open, initialEdit, isAdmin]);

    useEffect(() => {
        setLocalMode(String(rotationMode || "DAILY").toUpperCase());
    }, [rotationMode, open]);

    const load = useCallback(async () => {
        const y = calMonth.getFullYear();
        const m = calMonth.getMonth();
        const start = monthGridStart(y, m);
        setLoading(true);
        try {
            const data = await getRotaSchedule(42, start);
            setSchedule(Array.isArray(data) ? data : []);
        } catch {
            setSchedule([]);
        } finally {
            setLoading(false);
        }
    }, [calMonth]);

    useEffect(() => {
        if (!open) return undefined;
        load();
        return undefined;
    }, [open, load]);

    const scheduleByDate = useMemo(() => {
        const map = new Map();
        (schedule || []).forEach((day) => {
            if (day?.date) map.set(day.date, day);
        });
        return map;
    }, [schedule]);

    const cells = useMemo(
        () => buildCells(calMonth.getFullYear(), calMonth.getMonth(), scheduleByDate),
        [calMonth, scheduleByDate]
    );

    const selectedDay = selectedKey ? scheduleByDate.get(selectedKey) : null;

    useEffect(() => {
        if (!selectedKey || !selectedDay) {
            setPickEmails([]);
            return;
        }
        setPickEmails((selectedDay.members || []).map((mem) => mem.email).filter(Boolean));
    }, [selectedKey, selectedDay]);

    const savePicks = async () => {
        if (!selectedKey) return;
        setSaving(true);
        try {
            await setRotaManualAssignment(selectedKey, pickEmails);
            await load();
            if (onUpdated) await onUpdated();
        } catch (e) {
            window.alert(e?.message || "Failed to save assignment");
        } finally {
            setSaving(false);
        }
    };

    const clearManual = async () => {
        if (!selectedKey) return;
        setSaving(true);
        try {
            await setRotaManualAssignment(selectedKey, []);
            setPickEmails([]);
            await load();
            if (onUpdated) await onUpdated();
        } catch (e) {
            window.alert(e?.message || "Failed to clear");
        } finally {
            setSaving(false);
        }
    };

    const toggleLeave = async (email, leave) => {
        if (!selectedKey) return;
        setSaving(true);
        try {
            await setRotaLeaveForDate(selectedKey, email, leave);
            await load();
            if (onUpdated) await onUpdated();
        } catch (e) {
            window.alert(e?.message || "Failed to update leave");
        } finally {
            setSaving(false);
        }
    };

    const applyMode = async (mode) => {
        const m = String(mode || "DAILY").toUpperCase();
        setSaving(true);
        try {
            await setRotaRotationMode(m);
            setLocalMode(m);
            await load();
            if (onUpdated) await onUpdated();
        } catch (e) {
            window.alert(e?.message || "Failed to update rotation mode");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const leavesForDay = (leaveByDate[selectedKey] || []).map((e) => String(e || "").toLowerCase());

    return (
        <div className="rota-modal-overlay" role="presentation" onClick={onClose}>
            <div
                className="rota-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rota-cal-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="rota-modal-head">
                    <h2 id="rota-cal-title">On-call calendar</h2>
                    <button type="button" className="rota-modal-close" onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="rota-modal-toolbar">
                    {isAdmin && (
                        <div className="rota-mode-seg">
                            <button type="button" className={!editMode ? "active" : ""} onClick={() => setEditMode(false)}>
                                <Eye size={16} aria-hidden /> View
                            </button>
                            <button type="button" className={editMode ? "active" : ""} onClick={() => setEditMode(true)}>
                                <Pencil size={16} aria-hidden /> Edit
                            </button>
                        </div>
                    )}
                    {isAdmin && (
                        <div className="rota-shift-seg">
                            <span className="rota-shift-label">Shift</span>
                            <button
                                type="button"
                                className={localMode === "DAILY" ? "active" : ""}
                                onClick={() => applyMode("DAILY")}
                                disabled={saving || localMode === "DAILY"}
                            >
                                Daily
                            </button>
                            <button
                                type="button"
                                className={localMode === "WEEKLY" ? "active" : ""}
                                onClick={() => applyMode("WEEKLY")}
                                disabled={saving || localMode === "WEEKLY"}
                            >
                                Weekly
                            </button>
                        </div>
                    )}
                    <div className="rota-cal-nav">
                        <button
                            type="button"
                            onClick={() => onCalMonthChange(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                            aria-label="Previous month"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="rota-cal-month-label">
                            {calMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
                        </span>
                        <button
                            type="button"
                            onClick={() => onCalMonthChange(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                            aria-label="Next month"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {localMode === "WEEKLY" && (
                    <p className="rota-modal-hint">
                        Weekly: one primary per Mon–Sun week. Use <strong>Edit</strong> on a date to attach extra on-call people (coverage) for that night only.
                    </p>
                )}
                {loading && <p className="rota-modal-loading">Loading…</p>}

                <div className="rota-cal-weekdays">
                    {WEEK_LABELS.map((d) => (
                        <span key={d}>{d}</span>
                    ))}
                </div>
                <div className="rota-cal-cells">
                    {cells.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            className={`rota-cal-cell${c.inMonth ? " in-month" : " out-month"}${c.row?.manual ? " manual" : ""}${selectedKey === c.key ? " selected" : ""}`}
                            disabled={!c.inMonth}
                            onClick={() => {
                                if (!c.inMonth) return;
                                setSelectedKey(c.key);
                            }}
                        >
                            <span className="rota-cal-cell-d">{c.d.getDate()}</span>
                            <span className="rota-cal-cell-names">
                                {(c.row?.members || []).length
                                    ? (c.row.members || []).map((mem) => mem.name).join(", ")
                                    : "—"}
                            </span>
                        </button>
                    ))}
                </div>

                {selectedKey && (!isAdmin || !editMode) && (
                    <div className="rota-day-summary">
                        <h4>{selectedKey}</h4>
                        <p>
                            <strong>On duty:</strong>{" "}
                            {selectedDay?.members?.length
                                ? selectedDay.members.map((mem) => mem.name).join(", ")
                                : "Unassigned"}
                        </p>
                        {selectedDay?.manual && <span className="rota-manual-pill">Manual override</span>}
                    </div>
                )}

                {isAdmin && editMode && selectedKey && (
                    <div className="rota-day-editor">
                        <h4>{selectedKey}</h4>
                        <label className="rota-field-label" htmlFor="rota-cal-pick">
                            On-call for this date (up to 4 — primary + coverage)
                        </label>
                        <select
                            id="rota-cal-pick"
                            className="rota-multiselect"
                            multiple
                            size={5}
                            value={pickEmails}
                            onChange={(e) =>
                                setPickEmails(Array.from(e.target.selectedOptions).map((o) => o.value).slice(0, 4))
                            }
                        >
                            {devOpsMembers.map((mem) => (
                                <option key={mem.email} value={mem.email}>
                                    {mem.name}
                                </option>
                            ))}
                        </select>
                        <div className="rota-day-editor-actions">
                            <button type="button" className="btn-primary" disabled={saving} onClick={savePicks}>
                                Save day
                            </button>
                            <button type="button" className="btn-secondary" disabled={saving} onClick={clearManual}>
                                Clear override
                            </button>
                        </div>
                        <label className="rota-field-label">Leave on this date</label>
                        <div className="rota-leave-mini">
                            {devOpsMembers.map((mem) => {
                                const em = (mem.email || "").toLowerCase();
                                const onLeave = leavesForDay.includes(em);
                                return (
                                    <label key={mem.email} className="rota-leave-mini-row">
                                        <input
                                            type="checkbox"
                                            checked={onLeave}
                                            onChange={(e) => toggleLeave(mem.email, e.target.checked)}
                                            disabled={saving}
                                        />
                                        <span>{mem.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
