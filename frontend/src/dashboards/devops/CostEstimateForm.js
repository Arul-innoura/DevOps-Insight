import React, { useState, useEffect } from "react";
import { Database, Calendar, Send, X } from "lucide-react";
import {
    REQUEST_TYPES,
    COST_CURRENCIES,
    convertCurrency,
    parseMonthlyCostEstimate,
    prorateMonthlyToPeriod,
    PRORATION_DAYS_PER_MONTH,
    inferRunDaysFromTicketDates,
    formatTicketDateForDisplay
} from "../../services/ticketService";

/**
 * Cost estimation body: auto-fills from workflow monthly estimate + Environment Up duration; editable fields.
 * Used inside the DevOps cost popup window (and can be wrapped in a modal if needed).
 */
export default function CostEstimateForm({
    ticket,
    selectedCostApproverEmail,
    onSubmit,
    onCancel,
    showHeader = false,
    headerTitle = "Cost estimation"
}) {
    const [estimatedCost, setEstimatedCost] = useState(
        ticket?.estimatedCost != null && ticket.estimatedCost !== "" ? String(ticket.estimatedCost) : ""
    );
    const [currency, setCurrency] = useState(ticket?.costCurrency || "USD");
    const [notes, setNotes] = useState("");
    const [costPerDay, setCostPerDay] = useState("");
    const [days, setDays] = useState("");
    const [autoMode, setAutoMode] = useState(true);
    const [convertToCurrency, setConvertToCurrency] = useState("USD");
    const [convertedPreview, setConvertedPreview] = useState("");
    const [converting, setConverting] = useState(false);

    const infraInfo = ticket?.workflowConfiguration?.infrastructure;
    const monthlyRaw = infraInfo?.monthlyCostEstimate || "";
    const { amount: monthlyParsed } = parseMonthlyCostEstimate(monthlyRaw);
    const isEnvironmentUp = ticket?.requestType === REQUEST_TYPES.ENVIRONMENT_UP;
    /** Prefers ticket.duration; else inclusive UTC calendar days activationDate → shutdownDate. */
    const durationDays = inferRunDaysFromTicketDates(ticket);
    const daysFromDateSpan = inferRunDaysFromTicketDates(ticket, { ignoreDuration: true });
    const explicitDurationPositive = (() => {
        const d = ticket?.duration;
        if (d == null || d === "") return false;
        const n = typeof d === "number" ? d : parseInt(String(d).replace(/[^\d]/g, "") || "0", 10);
        return Number.isFinite(n) && n > 0;
    })();
    const daysSourceIsDateSpan = !explicitDurationPositive && daysFromDateSpan > 0;
    const activationLabel = formatTicketDateForDisplay(ticket?.activationDate);
    const shutdownLabel = formatTicketDateForDisplay(ticket?.shutdownDate);

    useEffect(() => {
        if (!ticket?.id) return;
        const hasExisting =
            ticket.estimatedCost != null &&
            ticket.estimatedCost !== "" &&
            Number(ticket.estimatedCost) > 0;
        if (hasExisting) {
            setEstimatedCost(String(ticket.estimatedCost));
            if (ticket.costCurrency) setCurrency(ticket.costCurrency);
            return;
        }

        const { amount: monthlyAmt, currency: parsedCur } = parseMonthlyCostEstimate(
            ticket?.workflowConfiguration?.infrastructure?.monthlyCostEstimate
        );
        if (parsedCur && parsedCur !== "USD") setCurrency(parsedCur);

        if (monthlyAmt && monthlyAmt > 0) {
            const daily = monthlyAmt / PRORATION_DAYS_PER_MONTH;
            setCostPerDay(daily.toFixed(2));
            if (isEnvironmentUp && durationDays > 0) {
                setDays(String(durationDays));
                setAutoMode(true);
                const pr = prorateMonthlyToPeriod(monthlyAmt, durationDays);
                if (pr != null) setEstimatedCost(pr.toFixed(2));
            } else {
                setDays("");
                setEstimatedCost("");
                setAutoMode(true);
            }
        }
    }, [
        ticket?.id,
        ticket?.estimatedCost,
        ticket?.costCurrency,
        isEnvironmentUp,
        durationDays,
        ticket?.workflowConfiguration?.infrastructure?.monthlyCostEstimate
    ]);

    useEffect(() => {
        if (!autoMode) return;
        if (!costPerDay || !days) return;
        const cpd = parseFloat(costPerDay);
        const d = parseFloat(days);
        if (!Number.isNaN(cpd) && !Number.isNaN(d) && cpd > 0 && d > 0) {
            setEstimatedCost((cpd * d).toFixed(2));
        }
    }, [costPerDay, days, autoMode]);

    const handleSubmit = () => {
        if (!estimatedCost || Number(estimatedCost) <= 0) {
            alert("Please enter a valid estimated cost");
            return;
        }
        const ca = String(selectedCostApproverEmail || "").trim();
        onSubmit(ticket.id, Number(estimatedCost), currency, notes, ca || undefined);
    };

    const handleConvert = async () => {
        const amount = Number(estimatedCost);
        if (!amount || amount <= 0) return;
        if (!convertToCurrency || convertToCurrency === currency) {
            setConvertedPreview(`${currency} ${amount.toFixed(2)}`);
            return;
        }
        try {
            setConverting(true);
            const r = await convertCurrency(amount, currency, convertToCurrency);
            setConvertedPreview(`${r.toCurrency} ${Number(r.convertedAmount || 0).toFixed(2)} (rate: ${Number(r.exchangeRate || 0).toFixed(6)})`);
        } catch {
            setConvertedPreview("Conversion failed");
        } finally {
            setConverting(false);
        }
    };

    const costNotifyLabel = (() => {
        const em = String(selectedCostApproverEmail || "").trim().toLowerCase();
        if (!em) return null;
        const list = ticket?.workflowConfiguration?.costApprovers || [];
        const p = list.find((a) => String(a?.email || "").trim().toLowerCase() === em);
        if (!p) return selectedCostApproverEmail;
        const role = (p.role || "Cost approver").trim();
        const name = (p.name || "").trim() || p.email;
        return `${role} — ${name} · ${p.email}`;
    })();

    const autoNoteLine =
        isEnvironmentUp && monthlyParsed && durationDays > 0
            ? daysSourceIsDateSpan && activationLabel && shutdownLabel
                ? `Formula: (monthly ${currency} ${monthlyParsed.toFixed(2)} ÷ ${PRORATION_DAYS_PER_MONTH} days) × ${durationDays} days — run length from ticket dates ${activationLabel} → ${shutdownLabel} (inclusive)`
                : `Formula: (monthly ${currency} ${monthlyParsed.toFixed(2)} ÷ ${PRORATION_DAYS_PER_MONTH} days) × ${durationDays} days (from ticket run length)`
            : monthlyParsed
              ? `Daily rate from product monthly estimate: ${currency} ${monthlyParsed.toFixed(2)} ÷ ${PRORATION_DAYS_PER_MONTH} ≈ ${costPerDay || "—"} / day`
              : null;

    const recalculateFromTicket = () => {
        setAutoMode(true);
        const { amount: monthlyAmt, currency: parsedCur } = parseMonthlyCostEstimate(
            ticket?.workflowConfiguration?.infrastructure?.monthlyCostEstimate
        );
        if (parsedCur && parsedCur !== "USD") setCurrency(parsedCur);
        if (monthlyAmt && monthlyAmt > 0) {
            const daily = monthlyAmt / PRORATION_DAYS_PER_MONTH;
            setCostPerDay(daily.toFixed(2));
            const d = inferRunDaysFromTicketDates(ticket);
            if (isEnvironmentUp && d > 0) {
                setDays(String(d));
                const pr = prorateMonthlyToPeriod(monthlyAmt, d);
                if (pr != null) setEstimatedCost(pr.toFixed(2));
            } else {
                setDays("");
                setEstimatedCost("");
            }
        }
    };

    return (
        <>
            {showHeader && (
                <div className="modal-header">
                    <h2>
                        <Database size={20} /> {headerTitle}
                    </h2>
                    {onCancel && (
                        <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
                            <X size={20} />
                        </button>
                    )}
                </div>
            )}
            <div className="modal-body">
                <div className="forward-ticket-info">
                    <p>
                        <strong>Ticket:</strong> {ticket.id}
                    </p>
                    <p>
                        <strong>Product:</strong> {ticket.productName}
                    </p>
                    <p>
                        <strong>Request type:</strong> {ticket.requestType}
                    </p>
                    {ticket.environment && (
                        <p>
                            <strong>Environment:</strong> {ticket.environment}
                        </p>
                    )}
                    {costNotifyLabel && (
                        <p>
                            <strong>Notify (cost approver):</strong> {costNotifyLabel}
                        </p>
                    )}
                    {isEnvironmentUp && (
                        <>
                            {activationLabel && (
                                <p>
                                    <strong>
                                        <Calendar size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                                        Start date:
                                    </strong>{" "}
                                    {activationLabel}
                                </p>
                            )}
                            {shutdownLabel && (
                                <p>
                                    <strong>
                                        <Calendar size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                                        End / shutdown date:
                                    </strong>{" "}
                                    {shutdownLabel}
                                </p>
                            )}
                            {durationDays > 0 && (
                                <p>
                                    <strong>Run length (total days):</strong> {durationDays}{" "}
                                    {daysSourceIsDateSpan
                                        ? "(from start → end dates on ticket, inclusive)"
                                        : explicitDurationPositive
                                          ? "(from duration on request)"
                                          : ""}
                                </p>
                            )}
                        </>
                    )}
                    {monthlyRaw && (
                        <p>
                            <strong>Product monthly estimate (workflow):</strong> {monthlyRaw}
                        </p>
                    )}
                    {monthlyParsed != null && monthlyParsed > 0 && (
                        <p style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                            Parsed for calculation: <strong>
                                {currency} {monthlyParsed.toFixed(2)}
                            </strong>{" "}
                            / month → daily ≈{" "}
                            <strong>{(monthlyParsed / PRORATION_DAYS_PER_MONTH).toFixed(2)}</strong> {currency}
                        </p>
                    )}
                    {!monthlyRaw && (
                        <p style={{ fontSize: "0.85rem", color: "#b45309" }}>
                            No monthly estimate in product workflow — enter cost manually or set monthly estimate in Admin →
                            Configure Workflow.
                        </p>
                    )}
                    {infraInfo?.cloudProvider && (
                        <p>
                            <strong>Cloud:</strong> {infraInfo.cloudProvider}{" "}
                            {infraInfo.region ? `(${infraInfo.region})` : ""}
                        </p>
                    )}
                    {infraInfo?.cpu && (
                        <p>
                            <strong>CPU:</strong> {infraInfo.cpu}
                        </p>
                    )}
                    {infraInfo?.memory && (
                        <p>
                            <strong>Memory:</strong> {infraInfo.memory}
                        </p>
                    )}
                    {infraInfo?.databaseType && (
                        <p>
                            <strong>Database:</strong> {infraInfo.databaseType}{" "}
                            {infraInfo.databaseAllocation ? `- ${infraInfo.databaseAllocation}` : ""}
                        </p>
                    )}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: "1rem"
                    }}
                >
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
                        Auto-calculate total (daily rate × days)
                    </label>
                    <button type="button" className="btn-secondary" onClick={recalculateFromTicket}>
                        Refill from ticket and workflow
                    </button>
                </div>
                {autoNoteLine && (
                    <p style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.75rem", lineHeight: 1.45 }}>
                        {autoNoteLine}
                    </p>
                )}
                {autoMode && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                        <div className="form-field">
                            <label>Daily rate ({currency})</label>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={costPerDay}
                                onChange={(e) => setCostPerDay(e.target.value)}
                                placeholder={`From monthly ÷ ${PRORATION_DAYS_PER_MONTH}`}
                            />
                        </div>
                        <div className="form-field">
                            <label>Duration (days)</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={days}
                                onChange={(e) => setDays(e.target.value)}
                                placeholder={isEnvironmentUp ? "From Environment Up request" : "Number of days"}
                            />
                        </div>
                    </div>
                )}
                <div className="form-field">
                    <label>
                        Total estimated cost *{autoMode && costPerDay && days ? " (auto-filled, editable)" : ""}
                    </label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={estimatedCost}
                        onChange={(e) => {
                            setEstimatedCost(e.target.value);
                            if (autoMode) setAutoMode(false);
                        }}
                        placeholder="Enter estimated cost"
                    />
                </div>
                <div className="form-field">
                    <label>Currency *</label>
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        {COST_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                    </select>
                </div>
                <div className="form-field">
                    <label>Convert amount (real-time)</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select value={convertToCurrency} onChange={(e) => setConvertToCurrency(e.target.value)}>
                            {COST_CURRENCIES.map((c) => (
                                <option key={`to-${c.code}`} value={c.code}>{c.code}</option>
                            ))}
                        </select>
                        <button type="button" className="btn-secondary" onClick={handleConvert} disabled={converting || !estimatedCost}>
                            {converting ? "Converting..." : "Convert"}
                        </button>
                        {convertedPreview && <span style={{ fontSize: "0.85rem", color: "#374151" }}>{convertedPreview}</span>}
                    </div>
                </div>
                <div className="form-field">
                    <label>Notes (Optional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Cost breakdown or notes..."
                        rows={3}
                    />
                </div>
                <div className="modal-actions">
                    {onCancel && (
                        <button type="button" className="btn-secondary" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button type="button" className="btn-primary" onClick={handleSubmit}>
                        <Send size={16} /> Send cost approval
                    </button>
                </div>
            </div>
        </>
    );
}
