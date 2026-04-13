import React, { useMemo, useState } from "react";
import { X, Lock } from "lucide-react";

const defaultNormalize = (email) => String(email || "").trim().toLowerCase();

const splitEmails = (raw) =>
  String(raw || "")
    .split(/[,;\s\n]+/)
    .map((e) => e.trim())
    .filter(Boolean);

const isEmailLike = (value) => {
  const v = String(value || "").trim();
  // Intentionally lightweight; backend/email sender will still validate.
  return v.includes("@") && !v.includes(" ");
};

/**
 * Gmail-like multi-email input:
 * - Type an email, press Enter/Tab/Comma/Space to add chip
 * - Paste a list of emails to add all
 * - Backspace on empty input removes last chip
 *
 * value:
 * - string: comma-separated emails ("a@b.com, c@d.com")
 * - array: ["a@b.com", "c@d.com"]
 */
export default function EmailChipsInput({
  value,
  onChange,
  savedEmails = [],
  /** Optional { email, name?, role? }[] from server workflow directory (other products) for richer suggestions. */
  contactHints = [],
  placeholder = "Type email and press Enter",
  mode = "string", // "string" | "array"
  className = "",
  lockedEmails = [], // emails shown as mandatory/locked — cannot be removed by user
  /** When true, the text box stays visible but users cannot type, paste, or add addresses (workflow-controlled To). */
  inputLocked = false,
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const emails = useMemo(() => {
    const arr = Array.isArray(value) ? value : splitEmails(value);
    const normalized = arr
      .map(defaultNormalize)
      .filter((e) => e && isEmailLike(e));
    // Preserve order but de-dupe
    return Array.from(new Set(normalized));
  }, [value]);

  const emit = (nextEmails) => {
    if (typeof onChange !== "function") return;
    if (mode === "array") {
      onChange(nextEmails);
      return;
    }
    onChange(nextEmails.join(", "));
  };

  const addEmail = (rawEmail) => {
    const trimmed = defaultNormalize(rawEmail);
    if (!trimmed || !isEmailLike(trimmed) || emails.includes(trimmed)) {
      setInputValue("");
      setShowSuggestions(false);
      return;
    }
    emit([...emails, trimmed]);
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeEmail = (index) => {
    const next = emails.filter((_, i) => i !== index);
    emit(next);
  };

  // Emails that are locked (mandatory) — normalized
  const lockedNormalized = useMemo(
    () => (lockedEmails || []).map(defaultNormalize).filter(Boolean),
    [lockedEmails]
  );

  const handleKeyDown = (e) => {
    if (inputLocked) {
      if (e.key === "Backspace" && !inputValue && emails.length > 0) {
        e.preventDefault();
        removeEmail(emails.length - 1);
      }
      return;
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === "," || e.key === ";" || e.key === " ") {
      if (!inputValue) return;
      e.preventDefault();
      addEmail(inputValue);
      return;
    }
    if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      e.preventDefault();
      removeEmail(emails.length - 1);
    }
  };

  const handlePaste = (e) => {
    if (inputLocked) {
      e.preventDefault();
      return;
    }
    const pasted = e.clipboardData?.getData("text") || "";
    const pastedEmails = splitEmails(pasted).filter(isEmailLike).map(defaultNormalize);
    if (!pastedEmails.length) return;
    e.preventDefault();
    const merged = Array.from(new Set([...emails, ...pastedEmails]));
    emit(merged);
    setInputValue("");
    setShowSuggestions(false);
  };

  const filteredSuggestions = useMemo(() => {
    const q = inputValue.toLowerCase().trim();
    if (!q) return [];
    const rows = [];
    const seen = new Set(emails);
    for (const h of contactHints || []) {
      const em = defaultNormalize(h?.email);
      if (!em || !isEmailLike(em) || seen.has(em)) continue;
      const nm = String(h?.name || "").toLowerCase();
      const rl = String(h?.role || "").toLowerCase();
      if (!em.includes(q) && !nm.includes(q) && !rl.includes(q)) continue;
      seen.add(em);
      rows.push({ email: em, label: h?.name ? `${h.name} · ${em}` : em });
    }
    for (const raw of savedEmails || []) {
      const em = defaultNormalize(raw);
      if (!em || !isEmailLike(em) || seen.has(em) || !em.includes(q)) continue;
      seen.add(em);
      rows.push({ email: em, label: em });
    }
    return rows.slice(0, 8);
  }, [savedEmails, contactHints, inputValue, emails]);

  const lockTitle =
    "Recipients are set by your workflow. You can’t add To addresses here — use CC to include others.";

  return (
    <div
      className={`cc-email-input-container ${inputLocked ? "cc-email-input-no-add" : ""} ${className}`.trim()}
      title={inputLocked ? lockTitle : undefined}
    >
      <div className={`cc-email-chips ${inputLocked ? "cc-email-chips-no-add" : ""}`}>
        {/* Locked / mandatory chips — shown first, cannot be removed */}
        {lockedNormalized.map((email) => (
          <span
            key={`locked-${email}`}
            className="cc-email-chip cc-email-chip-locked"
            title={email}
          >
            <Lock size={10} className="cc-email-chip-lock-icon" aria-hidden />
            <span className="cc-email-chip-label">{email}</span>
          </span>
        ))}
        {emails.map((email, index) => (
          <span key={email} className="cc-email-chip" title={email}>
            <span className="cc-email-chip-label">{email}</span>
            <button type="button" onClick={() => removeEmail(index)} className="chip-remove" aria-label={`Remove ${email}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputLocked ? "" : inputValue}
          readOnly={inputLocked}
          onChange={(e) => {
            if (inputLocked) return;
            setInputValue(e.target.value);
            setShowSuggestions(e.target.value.trim().length > 0);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {
            if (inputLocked) return;
            setShowSuggestions(inputValue.trim().length > 0);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={
            inputLocked
              ? lockedNormalized.length + emails.length === 0
                ? "Set by workflow — select product & request type"
                : ""
              : emails.length === 0
                ? placeholder
                : "Add more…"
          }
          className="cc-email-text-input"
          aria-readonly={inputLocked || undefined}
          tabIndex={inputLocked ? -1 : 0}
        />
        {inputLocked && (
          <span className="cc-email-field-lock-badge" aria-hidden title={lockTitle}>
            <Lock size={15} strokeWidth={2} />
          </span>
        )}
      </div>

      {showSuggestions && !inputLocked && filteredSuggestions.length > 0 && (
        <div className="cc-email-suggestions">
          {filteredSuggestions.map((row) => (
            <button
              key={row.email}
              type="button"
              className="cc-email-suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addEmail(row.email)}
            >
              {row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

