"use client";

// Typeform-style runner: one question per screen, keyboard first
// (Enter = next, A/B/C = pick a choice, Y/N for yes/no), progress bar,
// auto-advance on single-choice answers, mobile friendly.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerValue, Answers, Field, FormSettings } from "@/forms/types";
import { isEmptyAnswer } from "@/forms/lib";

interface Props {
  slug: string;
  title: string;
  description: string;
  fields: Field[];
  settings: FormSettings;
  preview?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function localCheck(f: Field, v: AnswerValue | undefined): string | null {
  if (f.type === "statement") return null;
  if (isEmptyAnswer(v) && !(f.type === "yes_no" && typeof v === "boolean")) {
    return f.required ? "Please fill this in" : null;
  }
  if (f.type === "email" && !EMAIL_RE.test(String(v).trim())) return "Hmm, that email doesn't look right";
  if (f.type === "phone") {
    const d = String(v).replace(/\D/g, "");
    if (d.length < 7 || d.length > 15) return "Hmm, that phone number doesn't look right";
  }
  if (f.type === "number" && !Number.isFinite(Number(v))) return "Enter a number";
  if (f.type === "url") {
    try {
      const s = String(v).trim();
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      if (!u.hostname.includes(".")) return "Enter a valid web address";
    } catch {
      return "Enter a valid web address";
    }
  }
  return null;
}

export default function FormRunner({ slug, title, description, fields, settings, preview }: Props) {
  const hasWelcome = settings.welcome_enabled;
  const n = fields.length;
  const [step, setStep] = useState(hasWelcome ? -1 : 0); // -1 welcome, n = done
  const [dir, setDir] = useState<"up" | "down">("up");
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [hp, setHp] = useState("");
  const started = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dark = settings.theme === "dark";
  const bg = dark ? "#0b1220" : "#ffffff";
  const fg = dark ? "#f1f5f9" : "#0f172a";
  const muted = dark ? "#94a3b8" : "#64748b";
  const line = dark ? "#334155" : "#cbd5e1";
  const accent = settings.accent || "#2563eb";

  const field = step >= 0 && step < n ? fields[step] : null;
  const answerable = fields.filter((f) => f.type !== "statement").length;
  const answeredCount = fields.slice(0, Math.max(step, 0)).filter((f) => f.type !== "statement").length;
  const progress = step >= n ? 1 : step < 0 ? 0 : answeredCount / Math.max(answerable, 1);

  const post = useCallback(
    (qs: string) => {
      if (preview) return;
      fetch(`/api/apply/${slug}${qs}`, { method: "POST", keepalive: true }).catch(() => {});
    },
    [slug, preview],
  );

  useEffect(() => {
    post("?event=view");
  }, [post]);

  function markStarted() {
    if (!started.current) {
      started.current = true;
      post("?event=start");
    }
  }

  function setAnswer(f: Field, v: AnswerValue) {
    markStarted();
    setError(null);
    setAnswers((a) => ({ ...a, [f.id]: v }));
  }

  async function submit(final: Answers) {
    setSubmitting(true);
    setError(null);
    if (preview) {
      setSubmitting(false);
      setDir("up");
      setStep(n);
      return;
    }
    const utm: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((v, k) => {
      if (k.startsWith("utm_") || k === "ref") utm[k] = v;
    });
    try {
      const res = await fetch(`/api/apply/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: final, hp, meta: { referrer: document.referrer, utm } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.errors) {
          const firstId = Object.keys(data.errors)[0];
          const idx = fields.findIndex((f) => f.id === firstId);
          if (idx >= 0) {
            setDir("down");
            setStep(idx);
          }
          setError(data.errors[firstId] ?? "Please check your answers.");
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setDir("up");
      setStep(n);
      if (data.redirect) setTimeout(() => (window.location.href = data.redirect), 1800);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  function next(override?: Answers) {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    const current = override ?? answers;
    if (step === -1) {
      setDir("up");
      setStep(0);
      return;
    }
    if (!field) return;
    const msg = localCheck(field, current[field.id]);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setOtherOpen(false);
    if (step === n - 1) {
      submit(current);
    } else {
      setDir("up");
      setStep(step + 1);
    }
  }

  function back() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setError(null);
    setOtherOpen(false);
    setDir("down");
    setStep(Math.max(hasWelcome ? -1 : 0, step - 1));
  }

  function pick(f: Field, v: AnswerValue, auto: boolean) {
    setAnswer(f, v);
    if (auto) {
      const merged = { ...answers, [f.id]: v };
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => next(merged), 380);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (step >= n || submitting) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
      if (e.key === "Enter") {
        if (el.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
        if (el.tagName === "BUTTON" && step >= 0) return;
        e.preventDefault();
        next();
        return;
      }
      if (typing || !field || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (field.type === "yes_no" && (k === "Y" || k === "N")) {
        pick(field, k === "Y", true);
      } else if (field.type === "multiple_choice" && field.choices) {
        const i = LETTERS.indexOf(k);
        if (k.length === 1 && i >= 0 && i < field.choices.length) pick(field, field.choices[i], true);
      } else if (field.type === "checkboxes" && field.choices) {
        const i = LETTERS.indexOf(k);
        if (k.length === 1 && i >= 0 && i < field.choices.length) toggle(field, field.choices[i]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle(f: Field, choice: string) {
    const cur = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
    setAnswer(f, cur.includes(choice) ? cur.filter((c) => c !== choice) : [...cur, choice]);
  }

  const inputBase: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    color: fg,
    border: "none",
    borderBottom: `2px solid ${line}`,
    fontSize: "clamp(1.25rem, 3.5vw, 1.75rem)",
    padding: "0.4rem 0",
    outline: "none",
  };

  const choiceBtn = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    textAlign: "left",
    padding: "0.65rem 0.9rem",
    borderRadius: 8,
    fontSize: "1.05rem",
    color: fg,
    cursor: "pointer",
    background: selected ? `${accent}26` : dark ? "#ffffff0d" : `${accent}0f`,
    border: `1.5px solid ${selected ? accent : `${accent}66`}`,
  });
  const key = (i: number, selected: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${accent}`,
    background: selected ? accent : "transparent",
    color: selected ? "#fff" : accent,
  });
  void LETTERS;

  function renderInput(f: Field) {
    const v = answers[f.id];
    const common = { "aria-label": f.title, autoFocus: true } as const;
    switch (f.type) {
      case "short_text":
      case "email":
      case "phone":
      case "url":
      case "number":
        return (
          <input
            {...common}
            type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "off"}
            placeholder={
              f.type === "email" ? "name@example.com" : f.type === "url" ? "example.com" : "Type your answer here..."
            }
            value={(v as string | number | undefined) ?? ""}
            onChange={(e) => setAnswer(f, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
            style={inputBase}
          />
        );
      case "long_text":
        return (
          <textarea
            {...common}
            rows={3}
            placeholder="Type your answer here..."
            value={(v as string | undefined) ?? ""}
            onChange={(e) => setAnswer(f, e.target.value)}
            style={{ ...inputBase, resize: "none" }}
          />
        );
      case "date":
        return (
          <input
            {...common}
            type="date"
            value={(v as string | undefined) ?? ""}
            onChange={(e) => setAnswer(f, e.target.value)}
            style={{ ...inputBase, colorScheme: dark ? "dark" : "light" }}
          />
        );
      case "dropdown":
        return (
          <select
            {...common}
            value={(v as string | undefined) ?? ""}
            onChange={(e) => setAnswer(f, e.target.value)}
            style={{ ...inputBase, colorScheme: dark ? "dark" : "light" }}
          >
            <option value="">Select an option...</option>
            {(f.choices ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        );
      case "multiple_choice":
        return (
          <div className="space-y-2" role="radiogroup" aria-label={f.title}>
            {(f.choices ?? []).map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={v === c}
                style={choiceBtn(v === c)}
                onClick={() => {
                  setOtherOpen(false);
                  pick(f, c, true);
                }}
              >
                <span style={key(i, v === c)}>{LETTERS[i]}</span>
                {c}
              </button>
            ))}
            {f.allow_other && (
              <div>
                <button
                  type="button"
                  style={choiceBtn(otherOpen)}
                  onClick={() => {
                    setOtherOpen(true);
                    setAnswer(f, "");
                  }}
                >
                  <span style={key(0, otherOpen)}>+</span>Other
                </button>
                {otherOpen && (
                  <input
                    autoFocus
                    placeholder="Type your answer"
                    value={(v as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f, e.target.value)}
                    style={{ ...inputBase, marginTop: 8, fontSize: "1.1rem" }}
                  />
                )}
              </div>
            )}
          </div>
        );
      case "checkboxes": {
        const cur = Array.isArray(v) ? v : [];
        return (
          <div className="space-y-2" role="group" aria-label={f.title}>
            <p style={{ color: muted, fontSize: 13 }}>Choose as many as you like</p>
            {(f.choices ?? []).map((c, i) => (
              <button key={c} type="button" aria-pressed={cur.includes(c)} style={choiceBtn(cur.includes(c))} onClick={() => toggle(f, c)}>
                <span style={key(i, cur.includes(c))}>{LETTERS[i]}</span>
                {c}
              </button>
            ))}
          </div>
        );
      }
      case "yes_no":
        return (
          <div className="flex max-w-sm flex-col gap-2">
            {[
              [true, "Yes", "Y"],
              [false, "No", "N"],
            ].map(([val, label, k]) => (
              <button key={String(label)} type="button" style={choiceBtn(v === val)} onClick={() => pick(f, val as boolean, true)}>
                <span style={key(0, v === val)}>{k as string}</span>
                {label as string}
              </button>
            ))}
          </div>
        );
      case "rating": {
        const steps = f.steps ?? 5;
        return (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={f.title}>
            {Array.from({ length: steps }, (_, i) => i + 1).map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={v === i}
                aria-label={`${i} of ${steps}`}
                onClick={() => pick(f, i, true)}
                style={{ fontSize: 38, lineHeight: 1, color: typeof v === "number" && i <= v ? accent : line, background: "none", border: "none", cursor: "pointer" }}
              >
                ★
              </button>
            ))}
          </div>
        );
      }
      case "scale":
        return (
          <div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={f.title}>
              {Array.from({ length: 11 }, (_, i) => i).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={v === i}
                  onClick={() => pick(f, i, true)}
                  style={{ ...choiceBtn(v === i), width: 46, height: 46, justifyContent: "center", padding: 0 }}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs" style={{ color: muted, maxWidth: 46 * 11 }}>
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>
          </div>
        );
      case "statement":
        return null;
    }
  }

  const btn: React.CSSProperties = {
    background: accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "0.7rem 1.3rem",
    fontSize: "1.05rem",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div style={{ background: bg, color: fg, minHeight: "100dvh", position: "relative", overflow: "hidden" }}>
      {preview && (
        <div style={{ background: "#f59e0b", color: "#111", fontSize: 13, textAlign: "center", padding: 6 }}>
          Preview mode. Nothing you submit here is saved.
        </div>
      )}
      <div style={{ height: 4, background: dark ? "#1e293b" : "#e2e8f0" }} aria-hidden>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: accent, transition: "width .4s ease" }} />
      </div>

      {/* honeypot: invisible to humans, bots fill it */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        style={{ position: "absolute", left: -9999, opacity: 0, height: 0, width: 0 }}
        name="website_url"
      />

      <div
        key={step}
        className={dir === "up" ? "fq-in-up" : "fq-in-down"}
        style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(2rem, 12vh, 7rem) 1.5rem 8rem" }}
      >
        {step === -1 && (
          <div>
            <h1 style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", fontWeight: 700, lineHeight: 1.15 }}>
              {settings.welcome_title || title}
            </h1>
            {(settings.welcome_description || description) && (
              <p style={{ color: muted, fontSize: "1.2rem", marginTop: 16, whiteSpace: "pre-line" }}>
                {settings.welcome_description || description}
              </p>
            )}
            <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" style={btn} onClick={() => next()}>
                {settings.start_label || "Start"}
              </button>
              <span style={{ color: muted, fontSize: 13 }}>press <b>Enter</b></span>
            </div>
          </div>
        )}

        {field && (
          <div>
            <p style={{ color: accent, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {step + 1}
              <span aria-hidden> &rarr;</span>
            </p>
            <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.1rem)", fontWeight: 600, lineHeight: 1.25 }}>
              {field.title}
              {field.required && field.type !== "statement" && (
                <span style={{ color: accent }} aria-label="required"> *</span>
              )}
            </h2>
            {field.description && (
              <p style={{ color: muted, fontSize: "1.1rem", marginTop: 8, whiteSpace: "pre-line" }}>{field.description}</p>
            )}
            <div style={{ marginTop: 28 }}>{renderInput(field)}</div>
            {error && (
              <p role="alert" style={{ marginTop: 14, color: "#ef4444", fontSize: 15 }}>
                {error}
              </p>
            )}
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" style={{ ...btn, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => next()}>
                {submitting ? "Sending..." : step === n - 1 ? "Submit" : field.type === "statement" ? "Continue" : "OK"}
              </button>
              <span className="hidden sm:inline" style={{ color: muted, fontSize: 13 }}>
                press <b>Enter</b>
              </span>
            </div>
          </div>
        )}

        {step >= n && n >= 0 && (
          <div>
            <h2 style={{ fontSize: "clamp(1.9rem, 5vw, 2.8rem)", fontWeight: 700, lineHeight: 1.15 }}>
              {settings.thank_you_title || "Thanks!"}
            </h2>
            {settings.thank_you_message && (
              <p style={{ color: muted, fontSize: "1.2rem", marginTop: 14, whiteSpace: "pre-line" }}>
                {settings.thank_you_message}
              </p>
            )}
          </div>
        )}
      </div>

      {step >= 0 && step < n && (
        <div style={{ position: "fixed", right: 20, bottom: 20, display: "flex", gap: 6 }}>
          <button
            type="button"
            aria-label="Previous question"
            onClick={back}
            disabled={step === 0 && !hasWelcome}
            style={{ ...btn, padding: "0.5rem 0.8rem", opacity: step === 0 && !hasWelcome ? 0.35 : 1 }}
          >
            &uarr;
          </button>
          <button type="button" aria-label="Next question" onClick={() => next()} style={{ ...btn, padding: "0.5rem 0.8rem" }}>
            &darr;
          </button>
        </div>
      )}
    </div>
  );
}
