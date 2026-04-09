import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import CostEstimateForm from "./CostEstimateForm";
import { getTicketById, submitCostEstimation } from "../../services/ticketService";
import { useToast } from "../../services/ToastNotification";

/**
 * Standalone cost estimation page for window.open from DevOps dashboard / ticket actions.
 */
export default function CostEstimateWindowPage() {
    const [searchParams] = useSearchParams();
    const ticketId = String(searchParams.get("ticketId") || "").trim();
    const costApproverEmail = String(searchParams.get("costApprover") || "").trim() || undefined;

    const [ticket, setTicket] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const { addToast } = useToast();

    const load = useCallback(async () => {
        if (!ticketId) {
            setLoadError("Missing ticket id.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const t = await getTicketById(ticketId);
            setTicket(t);
        } catch (e) {
            setLoadError(e?.message || "Could not load ticket.");
            setTicket(null);
        } finally {
            setLoading(false);
        }
    }, [ticketId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSubmit = async (_tid, estimatedCost, currency, notes, ca) => {
        try {
            setSubmitting(true);
            await submitCostEstimation(ticketId, estimatedCost, currency, notes, ca || "");
            addToast("Cost approval email sent to approver", "success");
            window.setTimeout(() => {
                try {
                    window.close();
                } catch {
                    /* ignore */
                }
            }, 600);
        } catch (e) {
            alert(e?.message || "Failed to send cost approval");
        } finally {
            setSubmitting(false);
        }
    };

    if (!ticketId) {
        return (
            <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
                <p>Missing ticket id. Close this window and open cost estimate from the dashboard again.</p>
                <button type="button" className="btn-secondary" onClick={() => window.close()}>
                    Close
                </button>
            </div>
        );
    }

    return (
        <div
            className="cost-estimate-window-root"
            style={{
                minHeight: "100vh",
                padding: "1.25rem",
                background: "var(--page-bg, #f1f5f9)"
            }}
        >
            <div
                className="modal-content forward-modal"
                style={{
                    maxWidth: 720,
                    margin: "0 auto",
                    position: "relative",
                    boxShadow: "0 4px 24px rgba(15, 23, 42, 0.08)"
                }}
            >
                {loading && (
                    <div className="modal-body" style={{ padding: "2rem" }}>
                        <p>Loading ticket…</p>
                    </div>
                )}
                {!loading && loadError && (
                    <div className="modal-body" style={{ padding: "2rem" }}>
                        <p style={{ color: "#b91c1c", marginBottom: "1rem" }}>{loadError}</p>
                        <button type="button" className="btn-secondary" onClick={() => window.close()}>
                            Close
                        </button>
                        <button type="button" className="btn-primary" style={{ marginLeft: 8 }} onClick={() => load()}>
                            Retry
                        </button>
                    </div>
                )}
                {!loading && !loadError && ticket && (
                    <CostEstimateForm
                        ticket={ticket}
                        selectedCostApproverEmail={costApproverEmail}
                        onSubmit={handleSubmit}
                        onCancel={() => window.close()}
                        showHeader
                        headerTitle="Cost estimation"
                    />
                )}
                {submitting && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(255,255,255,0.65)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600
                        }}
                    >
                        Sending…
                    </div>
                )}
            </div>
        </div>
    );
}
