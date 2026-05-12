package com.devops.backend.service.autobuild;

import com.devops.backend.dto.EmailMessage;
import com.devops.backend.model.autobuild.BuildExecution;
import com.devops.backend.model.autobuild.CodeCutRequest;
import com.devops.backend.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Email notifications for the auto-build / code-cut flow.
 *
 * <p>Uses the same HTML templates ({@code wrapAsApproverRequestEmail} and
 * {@code wrapAsSimpleEmail}) and KVP table structure already established in
 * {@link com.devops.backend.service.impl.EmailServiceImpl} so all emails
 * look identical in mail clients.
 *
 * <p>All emails for one execution share the same Message-ID so they land
 * in the same thread.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class BuildEmailService {

    private final EmailService emailService;

    @Value("${app.email.devops-to:devopsteam@encipherhealth.com}")
    private String devopsTo;

    @Value("${app.frontend.url:https://shipit.encipherhealth.com}")
    private String frontendUrl;

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("MMM dd, yyyy 'at' hh:mm a").withZone(ZoneId.systemDefault());

    // ─────────────────────────────────────────────────────────────────────────
    // Thread-ID generation
    // ─────────────────────────────────────────────────────────────────────────

    public String generateThreadId(String requestId) {
        return "<codecut-" + requestId + "-" + UUID.randomUUID() + "@encipherhealth.com>";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Approval request (sent to lead + manager — same look as ticket approvals)
    // ─────────────────────────────────────────────────────────────────────────

    public void sendApprovalRequestEmail(CodeCutRequest req) {
        Set<String> toSet = new LinkedHashSet<>();
        if (notBlank(req.getLeadApproverEmail()))    toSet.add(req.getLeadApproverEmail().trim().toLowerCase());
        if (notBlank(req.getManagerApproverEmail())) toSet.add(req.getManagerApproverEmail().trim().toLowerCase());
        if (toSet.isEmpty()) {
            log.warn("[AutoBuild] no approvers on request {} — skipping approval email", req.getId());
            return;
        }

        String portalLink = frontendUrl + "/?codeCutId=" + req.getId();
        String approverLine = approverActionLink(portalLink, "Open in DevOps Insight");

        StringBuilder inner = new StringBuilder();
        inner.append("<p style='margin:0 0 12px 0'>")
             .append("A Code Cut request needs approval from both Lead and Manager before the build can be triggered.")
             .append("</p>");
        inner.append(buildCcKvpTable(req));
        if (notBlank(req.getRequesterNote())) {
            inner.append("<p style='margin:14px 0 6px 0'><strong>Requester note</strong></p>");
            inner.append("<pre style='margin:0 0 14px 0;font-family:inherit;font-size:14px;white-space:pre-wrap;color:#334155'>")
                 .append(escHtml(req.getRequesterNote())).append("</pre>");
        }
        inner.append("<p style='margin:18px 0 0;color:#0f172a;line-height:1.6'>")
             .append("To review and approve or reject, ").append(approverLine)
             .append(". Both Lead and Manager must approve before the build trigger is unlocked.")
             .append("</p>");

        List<String> toList = new ArrayList<>(toSet);
        queue(req, toList, devopsCc(),
              subject(req, "Approval Required — Code Cut"),
              wrapAsApproverRequestEmail(inner.toString(), req.getId()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Approval response (uses same wrapAsSimpleEmail as ticket status updates)
    // ─────────────────────────────────────────────────────────────────────────

    public void sendApprovalResponseEmail(CodeCutRequest req, String role, boolean approved, String note) {
        String action = approved ? role + " approved ✓" : role + " rejected";
        String msg = approved
                ? "The " + role + " has approved this code cut. "
                  + (req.getStatus() == CodeCutRequest.CodeCutStatus.READY_TO_BUILD
                      ? "Both approvals are complete — the trigger button is now unlocked."
                      : "Waiting for the other approver.")
                : "The " + role + " has rejected this code cut."
                  + (notBlank(note) ? " Reason: " + note : "");

        StringBuilder inner = new StringBuilder();
        inner.append("<p>Dear ").append(escHtml(req.getRequestedByName())).append(",</p>");
        inner.append("<p>").append(escHtml(msg)).append("</p>");
        inner.append(buildCcKvpTable(req));
        inner.append(openPortalLine(req));

        List<String> to = threadRecipients(req, true);
        queue(req, to, devopsCc(),
              subject(req, action),
              wrapAsSimpleEmail(action, inner.toString(), req.getId()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Build started
    // ─────────────────────────────────────────────────────────────────────────

    public void sendBuildStartedEmail(CodeCutRequest req, BuildExecution exec) {
        String liveLink = frontendUrl + "/build/" + exec.getId();
        StringBuilder inner = new StringBuilder();
        inner.append("<p>Dear ").append(escHtml(req.getRequestedByName())).append(",</p>");
        inner.append("<p>The auto-build has started. You can watch live progress using the link below.</p>");
        inner.append(buildCcKvpTable(req));
        inner.append(buildExecKvpTable(exec));
        inner.append("<p style='margin:18px 0 0'>")
             .append(approverActionLink(liveLink, "Open Live Build View"))
             .append("</p>");

        List<String> to = threadRecipients(req, false);
        queue(req, to, devopsCc(),
              subject(req, "Build started"),
              wrapAsSimpleEmail("Build started", inner.toString(), req.getId()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Retry
    // ─────────────────────────────────────────────────────────────────────────

    public void sendRetryEmail(CodeCutRequest req, BuildExecution exec,
                               BuildExecution.ServiceTask task, int attempt, int maxAttempts) {
        String title = "Build retry " + attempt + "/" + maxAttempts + " — " + task.getServiceName();
        StringBuilder inner = new StringBuilder();
        inner.append("<p>Service <strong>").append(escHtml(task.getServiceName()))
             .append("</strong> failed and is being retried (attempt ")
             .append(attempt).append(" of ").append(maxAttempts).append(").</p>");
        inner.append(buildCcKvpTable(req));
        inner.append("<table role='presentation' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:10px 0 14px 0'>")
             .append(row("Service", task.getServiceName()))
             .append(row("Attempt", attempt + " / " + maxAttempts))
             .append(row("Failed stage", task.getCurrentStage()))
             .append(row("Jenkins job", task.getJenkinsJobName()))
             .append("</table>");
        if (notBlank(exec.getId())) {
            String liveLink = frontendUrl + "/build/" + exec.getId();
            inner.append("<p>").append(approverActionLink(liveLink, "Open Live Build View")).append("</p>");
        }

        List<String> to = new ArrayList<>();
        if (notBlank(req.getRequestedByEmail())) to.add(req.getRequestedByEmail().trim().toLowerCase());
        if (notBlank(devopsTo) && !to.contains(devopsTo.trim().toLowerCase()))
            to.add(devopsTo.trim().toLowerCase());

        queue(req, to, null,
              subject(req, title),
              wrapAsSimpleEmail(title, inner.toString(), req.getId()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Final (success / partial / failed / cancelled)
    // ─────────────────────────────────────────────────────────────────────────

    public void sendFinalEmail(CodeCutRequest req, BuildExecution exec) {
        String tag = switch (exec.getStatus()) {
            case SUCCEEDED  -> "Build succeeded ✓";
            case PARTIAL    -> "Build partially failed";
            case FAILED     -> "Build failed — retries exhausted";
            case CANCELLED  -> "Build cancelled";
            default         -> "Build update";
        };

        StringBuilder inner = new StringBuilder();
        inner.append("<p>Dear ").append(escHtml(req.getRequestedByName())).append(",</p>");
        inner.append("<p>").append(buildFinalMessage(exec)).append("</p>");
        inner.append(buildCcKvpTable(req));
        inner.append(buildExecKvpTable(exec));
        inner.append(buildServiceResultsTable(exec));

        if (exec.getStatus() == BuildExecution.ExecutionStatus.FAILED) {
            inner.append("<p style='color:#b91c1c;margin-top:14px'>")
                 .append("All retries exhausted. Please contact the DevOps team for further assistance.")
                 .append("</p>");
        }

        String liveLink = frontendUrl + "/build/" + exec.getId();
        inner.append("<p style='margin-top:16px'>")
             .append(approverActionLink(liveLink, "Open Build Report")).append("</p>");

        List<String> to = threadRecipients(req, false);
        queue(req, to, devopsCc(),
              subject(req, tag),
              wrapAsSimpleEmail(tag, inner.toString(), req.getId()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML helpers — identical style as EmailServiceImpl
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * KVP table for code-cut request fields — mirrors {@code buildSimpleTicketKvpTable}.
     */
    private String buildCcKvpTable(CodeCutRequest r) {
        return "<table role='presentation' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:10px 0 14px 0'>"
                + row("Request ID",   r.getId())
                + row("Project",      r.getProjectName())
                + row("Environment",  r.getEnvironment())
                + row("Branch",       r.getBranchName())
                + row("Commit",       notBlank(r.getCommitId()) ? r.getCommitId() : "(latest HEAD)")
                + row("Requested by", r.getRequestedByName() + (notBlank(r.getRequestedByEmail()) ? " <" + r.getRequestedByEmail() + ">" : ""))
                + row("Created",      r.getCreatedAt() != null ? DATE_FMT.format(r.getCreatedAt()) : "—")
                + row("Lead",         approvalLine(r.getLeadApproverName(), r.getLeadApprovalState()))
                + row("Manager",      approvalLine(r.getManagerApproverName(), r.getManagerApprovalState()))
                + "</table>";
    }

    private String buildExecKvpTable(BuildExecution e) {
        if (e == null) return "";
        return "<table role='presentation' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:10px 0 14px 0'>"
                + row("Execution ID",      e.getId())
                + row("Triggered by",      e.getTriggeredByName())
                + row("Total services",    String.valueOf(e.getTotalServices() == null ? 0 : e.getTotalServices()))
                + row("Succeeded",         String.valueOf(e.getSucceededServices() == null ? 0 : e.getSucceededServices()))
                + row("Failed",            String.valueOf(e.getFailedServices() == null ? 0 : e.getFailedServices()))
                + row("Started",           e.getStartedAt() != null ? DATE_FMT.format(e.getStartedAt()) : "—")
                + row("Finished",          e.getFinishedAt() != null ? DATE_FMT.format(e.getFinishedAt()) : "—")
                + "</table>";
    }

    private String buildServiceResultsTable(BuildExecution exec) {
        if (exec.getTasks() == null || exec.getTasks().isEmpty()) return "";
        StringBuilder t = new StringBuilder();
        t.append("<table role='presentation' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:14px 0;width:100%'>")
         .append("<tr style='background:#f2f2f2'>")
         .append(th("Service")).append(th("Status")).append(th("Attempts")).append(th("Failed stage"))
         .append("</tr>");
        for (BuildExecution.ServiceTask task : exec.getTasks()) {
            String failStage = "";
            if (task.getAttempts() != null && !task.getAttempts().isEmpty()) {
                BuildExecution.Attempt last = task.getAttempts().get(task.getAttempts().size() - 1);
                if (notBlank(last.getFailureStage())) failStage = last.getFailureStage();
            }
            t.append("<tr>")
             .append(td(task.getServiceName()))
             .append(td(task.getStatus() == null ? "—" : task.getStatus().name()))
             .append(td(String.valueOf(task.getAttempts() == null ? 0 : task.getAttempts().size())))
             .append(td(notBlank(failStage) ? failStage : "—"))
             .append("</tr>");
        }
        t.append("</table>");
        return t.toString();
    }

    /** Replicates {@code wrapAsApproverRequestEmail} from EmailServiceImpl exactly. */
    private static String wrapAsApproverRequestEmail(String innerHtml, String refId) {
        String safeRef = escHtml(refId != null ? refId : "");
        return "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                + "<title>Action required</title>"
                + emailStyles()
                + "</head><body style='background:#f8fafc'>"
                + "<div style='max-width:560px;margin:0 auto;padding:20px 16px 28px'>"
                + "<div style='background:#fff;border-radius:12px;padding:20px 20px 22px;"
                + "border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,0.06)'>"
                + "<p style='margin:0 0 16px 0;font-size:13px;font-weight:600;color:#64748b;letter-spacing:0.02em'>"
                + "DEVOPS PORTAL · CODE CUT APPROVAL</p>"
                + (safeRef.isEmpty() ? "" : "<p style='margin:0 0 16px 0;font-size:12px;color:#64748b'>Reference: <strong style='color:#0f172a'>"
                        + safeRef + "</strong></p>")
                + innerHtml
                + "</div>"
                + "<p style='margin:16px 0 0 0;font-size:11px;color:#94a3b8;line-height:1.45;text-align:center'>"
                + "Sent to designated approvers for this code cut. Please do not forward."
                + "</p></div></body></html>";
    }

    /** Replicates {@code wrapAsSimpleEmail} from EmailServiceImpl exactly. */
    private static String wrapAsSimpleEmail(String title, String innerHtml, String refId) {
        String safeTitle = escHtml(title != null ? title : "Notification");
        String safeRef   = escHtml(refId  != null ? refId  : "");
        return "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                + "<title>" + safeTitle + "</title>"
                + emailStyles()
                + "</head><body>"
                + "<div style='padding:16px'>"
                + "<p style='margin:0 0 10px 0'><strong>ShipIt</strong></p>"
                + (safeRef.isEmpty() ? "" : "<p style='margin:0 0 14px 0;color:#444'>Code Cut: <strong>" + safeRef + "</strong></p>")
                + "<hr style='border:none;border-top:1px solid #e0e0e0;margin:12px 0'/>"
                + innerHtml
                + "<hr style='border:none;border-top:1px solid #e0e0e0;margin:12px 0'/>"
                + "<p style='margin:0;color:#666;font-size:12px'>This is an automated email. Please do not reply.</p>"
                + "</div></body></html>";
    }

    /** Replicates the shared CSS block from EmailServiceImpl. */
    private static String emailStyles() {
        return "<style>"
                + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;"
                + "font-size:14px;line-height:1.45;color:#111;margin:0;padding:0;}"
                + "a{color:#0b57d0;text-decoration:underline;}"
                + "</style>";
    }

    /** Replicates {@code row()} from EmailServiceImpl. */
    private static String row(String label, String value) {
        String v = value == null || value.isBlank() ? "—" : value;
        return "<tr>"
                + "<td style='padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap'><strong>"
                + escHtml(label) + "</strong></td>"
                + "<td style='padding:4px 0;color:#111;vertical-align:top'>" + escHtml(v) + "</td>"
                + "</tr>";
    }

    private static String th(String text) {
        return "<th style='padding:6px 10px;text-align:left;font-size:13px;border-bottom:1px solid #d9d9d9'>"
                + escHtml(text) + "</th>";
    }

    private static String td(String text) {
        return "<td style='padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;vertical-align:top'>"
                + escHtml(text == null ? "—" : text) + "</td>";
    }

    /** Replicates the inline link style used in approval emails. */
    private static String approverActionLink(String href, String label) {
        return "<a href=\"" + href + "\" target=\"_blank\" rel=\"noopener noreferrer\" "
                + "style=\"color:#1d4ed8;font-weight:600;text-decoration:underline\">"
                + escHtml(label) + "</a>";
    }

    private String openPortalLine(CodeCutRequest req) {
        String url = frontendUrl + "/?codeCutId=" + req.getId();
        return "<p>" + approverActionLink(url, "Open in DevOps Insight") + "</p>";
    }

    private static String approvalLine(String name, CodeCutRequest.ApprovalState state) {
        String label = name == null || name.isBlank() ? "" : name + " — ";
        String st = state == null ? "PENDING" : state.name();
        return label + st;
    }

    private static String buildFinalMessage(BuildExecution exec) {
        return switch (exec.getStatus()) {
            case SUCCEEDED -> "All services built and deployed successfully.";
            case PARTIAL   -> "Some services failed after all retries. Check the build report for details.";
            case FAILED    -> "The build failed on all retries. Please contact the DevOps team.";
            case CANCELLED -> "The build was cancelled by a team member.";
            default        -> "Build update — see report for details.";
        };
    }

    /** Subject format mirrors EmailServiceImpl: [RefId] Action | Project — Env. */
    private static String subject(CodeCutRequest req, String action) {
        return String.format("[%s] %s | %s — %s",
                req.getId() == null ? "CCR" : req.getId().substring(0, Math.min(8, req.getId().length())),
                action,
                safe(req.getProjectName()),
                safe(req.getEnvironment()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Recipients helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Thread recipients = requester + lead approver + manager approver, deduped. */
    private List<String> threadRecipients(CodeCutRequest req, boolean includeApproversOnly) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        if (!includeApproversOnly && notBlank(req.getRequestedByEmail()))
            set.add(req.getRequestedByEmail().trim().toLowerCase());
        if (notBlank(req.getLeadApproverEmail()))
            set.add(req.getLeadApproverEmail().trim().toLowerCase());
        if (notBlank(req.getManagerApproverEmail()))
            set.add(req.getManagerApproverEmail().trim().toLowerCase());
        if (set.isEmpty() && notBlank(devopsTo))
            set.add(devopsTo.trim().toLowerCase());
        return new ArrayList<>(set);
    }

    /** CC list — always includes the DevOps team address if configured. */
    private List<String> devopsCc() {
        if (!notBlank(devopsTo)) return null;
        return List.of(devopsTo.trim().toLowerCase());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Queue
    // ─────────────────────────────────────────────────────────────────────────

    private void queue(CodeCutRequest req, List<String> to, List<String> cc,
                       String subject, String htmlBody) {
        if (to == null || to.isEmpty()) return;
        EmailMessage msg = EmailMessage.builder()
                .to(to.get(0))
                .toList(to.size() > 1 ? to : null)
                .cc(cc)
                .subject(subject)
                .body(htmlBody)
                .htmlBody(htmlBody)
                .messageId(req.getEmailThreadMessageId())
                .inReplyTo(req.getEmailThreadMessageId())
                .references(req.getEmailThreadMessageId())
                .build();
        try {
            emailService.queueEmail(msg);
        } catch (Exception e) {
            log.error("[AutoBuild] Failed to queue '{}': {}", subject, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Utility
    // ─────────────────────────────────────────────────────────────────────────

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }
    private static String safe(String s)       { return s == null ? "—" : s; }

    private static String escHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&#39;");
    }
}
