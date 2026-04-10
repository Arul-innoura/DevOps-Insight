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
  placeholder = "Type email and press Enter",
  mode = "string", // "string" | "array"
  className = "",
  lockedEmails = [], // emails shown as mandatory/locked — cannot be removed by user
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
    return (savedEmails || [])
      .map(defaultNormalize)
      .filter((email) => email && email.includes(q) && !emails.includes(email))
      .slice(0, 6);
  }, [savedEmails, inputValue, emails]);

  return (
    <div className={`cc-email-input-container ${className}`.trim()}>
      <div className="cc-email-chips">
        {/* Locked / mandatory chips — shown first, cannot be removed */}
        {lockedNormalized.map((email) => (
          <span key={`locked-${email}`} className="cc-email-chip cc-email-chip-locked" title="Mandatory — set by admin, cannot be removed">
            <Lock size={10} />
            {email}
          </span>
        ))}
        {emails.map((email, index) => (
          <span key={email} className="cc-email-chip">
            {email}
            <button type="button" onClick={() => removeEmail(index)} className="chip-remove" aria-label={`Remove ${email}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(e.target.value.trim().length > 0);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setShowSuggestions(inputValue.trim().length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={emails.length === 0 ? placeholder : "Add more…"}
          className="cc-email-text-input"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="cc-email-suggestions">
          {filteredSuggestions.map((email) => (
            <button
              key={email}
              type="button"
              className="cc-email-suggestion"
              onClick={() => addEmail(email)}
            >
              {email}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

