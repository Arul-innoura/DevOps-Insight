/**
 * Opens the cost estimation tool in a new browser window (auto-fill / edit / send).
 * @param {string} ticketId
 * @param {string} [costApproverEmail]
 */
export function openCostEstimateWindow(ticketId, costApproverEmail) {
    const id = String(ticketId || "").trim();
    if (!id) return;
    const p = new URLSearchParams({ ticketId: id });
    const ca = String(costApproverEmail || "").trim();
    if (ca) p.set("costApprover", ca);
    const url = `${window.location.origin}/devops/cost-estimate?${p.toString()}`;
    const features = ["width=680", "height=820", "scrollbars=yes", "resizable=yes"].join(",");
    window.open(url, "_blank", features);
}
