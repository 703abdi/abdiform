"use client";

// Typeform-style runner: one question per screen, keyboard first
// (Enter = next, A/B/C = pick a choice, Y/N for yes/no), themeable, mobile friendly.
// Used on the public /apply page and, in `embedded` mode, as the live preview in the builder.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerValue, Answers, Ending, Field, FormSettings } from "@/forms/types";
import { DEFAULT_ENDING } from "@/forms/types";
import { FONTS, flattenFields, isEmptyAnswer, leadIdentity, resolveDesign } from "@/forms/lib";
import { endingId, isEnd, nextTarget, pipe, resolvePath } from "@/forms/logic";

interface Props {
  slug: string;
  title: string;
  description: string;
  fields: Field[];
  settings: FormSettings;
  endings: Ending[];
  preview?: boolean;
  embedded?: boolean; // live preview inside the builder
  initialId?: string; // builder preview: start at this question
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

function utmMeta() {
  const utm: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((v, k) => {
    if (k.startsWith("utm_") || k === "ref") utm[k] = v;
  });
  return { referrer: document.referrer, utm };
}

function newRid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Calendly inline embed URL with the applicant's name/email prefilled. Only https://calendly.com is allowed. */
function calendlySrc(url: string | undefined, fields: Field[], answers: Answers): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/(^|\.)calendly\.com$/i.test(u.hostname)) return null;
    const id = leadIdentity({ fields }, { answers });
    u.searchParams.set("embed_type", "Inline");
    u.searchParams.set("hide_gdpr_banner", "1");
    u.searchParams.set("embed_domain", window.location.hostname);
    if (id.name) u.searchParams.set("name", id.name);
    if (id.email) u.searchParams.set("email", id.email);
    return u.toString();
  } catch {
    return null;
  }
}

/* ------------------------------ icons ------------------------------ */
const Icon = {
  check: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  up: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  down: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  warn: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5l6 10.5H1L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5.5v3M7 10v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.8l2.8 5.9 6.4.9-4.6 4.5 1.1 6.4L12 17.5 6.3 20.5l1.1-6.4L2.8 9.6l6.4-.9L12 2.8z"
        fill={filled ? "var(--a)" : "none"}
        stroke="var(--a)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const RADIUS = { none: "0px", small: "4px", large: "12px" } as const;
const FS = { small: 20, medium: 24, large: 28 } as const;

const STYLE = `
.tfr{position:relative;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--q);font-family:var(--font);-webkit-font-smoothing:antialiased}
.tfr.emb{height:100%;min-height:560px;border-radius:10px}
.tfr *{box-sizing:border-box}
.tfr-bgimg{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none}
.tfr-scroll{position:relative;flex:1;overflow-y:auto;display:flex;flex-direction:column}
.tfr-col{margin:auto;width:100%;max-width:780px;padding:64px 32px 130px}
.tfr-col.wide{max-width:960px}
.tfr-center{text-align:center}
.tfr-row{display:flex;gap:14px;align-items:flex-start}
.tfr-num{display:flex;align-items:center;gap:4px;color:var(--a);font-size:calc(var(--fs)*.75);line-height:calc(var(--fs)*1.35);min-width:34px;padding-top:0;flex-shrink:0;white-space:nowrap}
.tfr-title{font-size:var(--fs);line-height:1.35;font-weight:400;color:var(--q);overflow-wrap:anywhere}
.tfr-title i{font-style:normal;color:var(--a);margin-left:4px}
.tfr-desc{font-size:calc(var(--fs)*.75);line-height:1.5;opacity:.7;margin-top:8px;white-space:pre-line}
.tfr-body{margin-top:28px}
.tfr-input{width:100%;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--a) 30%,transparent);color:var(--a);font:inherit;font-size:calc(var(--fs)*1.25);padding:6px 0 10px;outline:none;border-radius:0;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none}
.tfr-input::placeholder{color:color-mix(in srgb,var(--a) 30%,transparent)}
.tfr-input:focus{border-bottom-color:var(--a);box-shadow:0 1px 0 var(--a)}
textarea.tfr-input{resize:none;line-height:1.35}
.tfr-ch{display:flex;align-items:center;gap:12px;width:fit-content;min-width:min(100%,280px);max-width:100%;text-align:left;padding:7px 12px 7px 8px;margin:0 0 8px;border-radius:var(--r);color:var(--a);cursor:pointer;font:inherit;font-size:calc(var(--fs)*.75);line-height:1.3;min-height:40px;background:color-mix(in srgb,var(--a) 10%,transparent);border:1px solid color-mix(in srgb,var(--a) 75%,transparent);transition:background .15s,box-shadow .15s}
.tfr-ch:hover{background:color-mix(in srgb,var(--a) 20%,transparent)}
.tfr-ch[aria-checked=true],.tfr-ch[aria-pressed=true]{background:color-mix(in srgb,var(--a) 28%,transparent);border-color:var(--a);box-shadow:inset 0 0 0 1px var(--a)}
.tfr-key{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border:1px solid var(--a);border-radius:calc(var(--r)*.75);font-size:12px;font-weight:600;line-height:1;color:var(--a)}
.tfr-ch[aria-checked=true] .tfr-key,.tfr-ch[aria-pressed=true] .tfr-key{background:var(--a);color:var(--bg)}
.tfr-hintline{font-size:12px;color:var(--a);opacity:.7;margin:0 0 10px}
.tfr-btn{display:inline-flex;align-items:center;gap:8px;background:var(--btn);color:var(--bt);border:2px solid var(--btn);border-radius:var(--r);padding:7px 16px;font:inherit;font-size:calc(var(--fs)*.75);font-weight:500;line-height:1.3;cursor:pointer;text-decoration:none;transition:opacity .15s,transform .05s}
.tfr-btn:hover{opacity:.88}
.tfr-btn:active{transform:translateY(1px)}
.tfr-btn.ghost{background:transparent;color:var(--btn)}
.tfr-btn:disabled{opacity:.55;cursor:default}
.tfr-hint{font-size:12px;color:var(--a);opacity:.75}
.tfr-actions{margin-top:24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tfr-center .tfr-actions{justify-content:center}
.tfr-err{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:4px 10px;border-radius:var(--r);background:color-mix(in srgb,#e11d48 14%,transparent);color:#be123c;font-size:14px}
.tfr[data-dark="1"] .tfr-err{color:#fda4af}
.tfr-foot{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;padding:14px 20px;pointer-events:none}
.tfr-foot>*{pointer-events:auto}
.tfr-prog{font-size:12px;color:var(--q);opacity:.85;min-width:150px}
.tfr-bar{height:4px;width:150px;margin-top:5px;border-radius:2px;background:color-mix(in srgb,var(--q) 15%,transparent);overflow:hidden}
.tfr-bar i{display:block;height:100%;background:var(--a);transition:width .4s ease}
.tfr-nav{display:flex}
.tfr-nav button{width:36px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:var(--btn);color:var(--bt);border:0;cursor:pointer}
.tfr-nav button:first-child{border-radius:var(--r) 0 0 var(--r);border-right:1px solid color-mix(in srgb,var(--bt) 25%,transparent)}
.tfr-nav button:last-child{border-radius:0 var(--r) var(--r) 0}
.tfr-nav button:disabled{opacity:.4;cursor:default}
.tfr-scale{display:flex;flex-wrap:wrap;gap:8px}
.tfr-scale button{width:46px;height:46px;border-radius:var(--r);font:inherit;font-size:18px;color:var(--a);cursor:pointer;background:color-mix(in srgb,var(--a) 10%,transparent);border:1px solid color-mix(in srgb,var(--a) 75%,transparent)}
.tfr-scale button:hover{background:color-mix(in srgb,var(--a) 20%,transparent)}
.tfr-scale button[aria-checked=true]{background:var(--a);color:var(--bg)}
.tfr-scalelab{display:flex;justify-content:space-between;margin-top:8px;font-size:13px;opacity:.7;max-width:calc(46px*11 + 8px*10)}
.tfr-stars{display:flex;gap:6px;flex-wrap:wrap}
.tfr-stars button{background:none;border:0;padding:2px;cursor:pointer;line-height:0;border-radius:4px}
.tfr-calendly{width:100%;height:700px;border:0;margin-top:24px;border-radius:var(--r);background:#fff}
.tfr-sub{margin-bottom:22px}
.tfr-sublabel{display:block;font-size:calc(var(--fs)*.7);opacity:.85;margin-bottom:2px;color:var(--q)}
.tfr-sublabel i{font-style:normal;color:var(--a);margin-left:3px}
.tfr-sub .tfr-input{font-size:calc(var(--fs)*1.05)}
.tfr-pics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.tfr-pic{display:flex;flex-direction:column;padding:0;border-radius:var(--r);overflow:hidden;cursor:pointer;color:var(--a);font:inherit;font-size:calc(var(--fs)*.7);text-align:left;background:color-mix(in srgb,var(--a) 10%,transparent);border:1px solid color-mix(in srgb,var(--a) 60%,transparent)}
.tfr-pic:hover{background:color-mix(in srgb,var(--a) 20%,transparent)}
.tfr-pic[aria-checked=true]{border-color:var(--a);box-shadow:inset 0 0 0 2px var(--a)}
.tfr-pic img,.tfr-picph{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:color-mix(in srgb,var(--a) 12%,transparent)}
.tfr-piclab{display:flex;gap:8px;align-items:center;padding:8px}
.tfr-pic[aria-checked=true] .tfr-key{background:var(--a);color:var(--bg)}
.tfr-rank{display:flex;align-items:center;gap:12px;width:min(100%,420px);margin-bottom:8px;padding:7px 8px;border-radius:var(--r);color:var(--a);font-size:calc(var(--fs)*.75);background:color-mix(in srgb,var(--a) 10%,transparent);border:1px solid color-mix(in srgb,var(--a) 60%,transparent)}
.tfr-rank button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:var(--r);background:transparent;color:var(--a);cursor:pointer}
.tfr-rank button:hover:not(:disabled){background:color-mix(in srgb,var(--a) 20%,transparent)}
.tfr-rank button:disabled{opacity:.3;cursor:default}
.tfr-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
@media (max-width:640px){.tfr-col{padding:40px 20px 120px}.tfr-num{min-width:28px}.tfr-prog{display:none}}
`;

export default function FormRunner({ slug, title, description, fields, settings, endings, preview, embedded, initialId }: Props) {
  const d = resolveDesign(settings);
  const hasWelcome = settings.welcome_enabled;
  const n = fields.length;
  const showProgress = settings.show_progress_bar !== false;
  const showNumbers = settings.show_question_numbers !== false;
  const showHints = settings.show_key_hints !== false;
  const showNav = settings.show_navigation !== false;
  const showTime = settings.show_time_to_complete !== false;

  const [step, setStep] = useState(() => {
    const i = initialId ? fields.findIndex((f) => f.id === initialId) : -1;
    return i >= 0 ? i : hasWelcome ? -1 : 0; // -1 = welcome
  });
  const [endId, setEndId] = useState<string | null>(null); // set once finished
  const [booked, setBooked] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null); // which input the error belongs to
  const [submitting, setSubmitting] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [hp, setHp] = useState("");
  const [hist, setHist] = useState<number[]>([]); // questions already visited (for Back)
  const [rid] = useState(newRid);
  const latest = useRef<Answers>({});
  const started = useRef(false);
  const startedAt = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const done = endId !== null;
  const field = !done && step >= 0 && step < n ? fields[step] : null;
  const estimate = Math.max(resolvePath(fields, answers).visited.length, 1);
  const progress = done ? 1 : step < 0 ? 0 : Math.min(hist.length / estimate, 0.99);
  const flat = flattenFields(fields);
  const T = (text: string) => pipe(text, flat, answers);
  const ending = endings.find((e) => e.id === endId) ?? endings[0];
  const minutes = Math.max(1, Math.ceil((fields.filter((f) => f.type !== "statement").length * 15) / 60));

  const post = useCallback(
    (qs: string) => {
      if (preview || embedded) return;
      fetch(`/api/apply/${slug}${qs}`, { method: "POST", keepalive: true }).catch(() => {});
    },
    [slug, preview, embedded],
  );
  useEffect(() => {
    startedAt.current = Date.now();
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
    setErrorId(null);
    setAnswers((a) => {
      const next = { ...a, [f.id]: v };
      latest.current = next;
      return next;
    });
  }

  // Save what we have so far, so a lead who quits halfway isn't lost.
  const saveProgress = useCallback(
    (a: Answers, beacon = false) => {
      if (preview || embedded || Object.keys(a).length === 0) return;
      const body = JSON.stringify({ rid: rid, answers: a, hp, meta: utmMeta() });
      const url = `/api/apply/${slug}?event=progress`;
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      else fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    },
    [preview, embedded, slug, hp, rid],
  );

  const finished = useRef(false);
  useEffect(() => {
    finished.current = done;
  }, [done]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && !finished.current) saveProgress(latest.current, true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [saveProgress]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.origin === "string" && e.origin.endsWith("calendly.com") && e.data?.event === "calendly.event_scheduled")
        setBooked(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  async function submit(final: Answers, fallbackEnding: string) {
    setSubmitting(true);
    setError(null);
    if (preview || embedded) {
      setSubmitting(false);
      setDir("up");
      setEndId(fallbackEnding);
      return;
    }
    try {
      const res = await fetch(`/api/apply/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: final,
          rid: rid,
          hp,
          meta: { ...utmMeta(), duration_s: Math.round((Date.now() - startedAt.current) / 1000) },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.errors) {
          const firstId = Object.keys(data.errors)[0];
          const idx = fields.findIndex((f) => flattenFields([f]).some((l) => l.id === firstId));
          setErrorId(firstId);
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
      setEndId(data.ending ?? fallbackEnding);
      const target = endings.find((e) => e.id === (data.ending ?? fallbackEnding));
      if (data.redirect && !target?.calendly_url) setTimeout(() => (window.location.href = data.redirect), 1800);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  function next(override?: Answers) {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    let current = override ?? answers;
    if (step === -1) {
      setDir("up");
      setStep(0);
      return;
    }
    if (!field) return;
    if (field.type === "ranking" && !Array.isArray(current[field.id])) {
      current = { ...current, [field.id]: field.choices ?? [] }; // untouched = the order shown
      setAnswers(current);
    }
    for (const leaf of flattenFields([field])) {
      const msg = localCheck(leaf, current[leaf.id]);
      if (msg) {
        setError(msg);
        setErrorId(leaf.id);
        return;
      }
    }
    setError(null);
    setErrorId(null);
    setOtherOpen(false);
    latest.current = current;
    saveProgress(current);
    const target = nextTarget(field, fields, current);
    if (isEnd(target)) {
      submit(current, endingId(target));
      return;
    }
    const idx = fields.findIndex((f) => f.id === target);
    if (idx < 0) {
      submit(current, DEFAULT_ENDING);
      return;
    }
    setHist((h) => [...h, step]);
    setDir("up");
    setStep(idx);
  }

  function back() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setError(null);
    setOtherOpen(false);
    setDir("down");
    const prev = hist[hist.length - 1];
    if (prev !== undefined) {
      setHist((h) => h.slice(0, -1));
      setStep(prev);
    } else if (hasWelcome) setStep(-1);
  }

  function pick(f: Field, v: AnswerValue, auto: boolean) {
    setAnswer(f, v);
    if (auto) {
      const merged = { ...answers, [f.id]: v };
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => next(merged), 400);
    }
  }

  function toggle(f: Field, choice: string) {
    const cur = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
    setAnswer(f, cur.includes(choice) ? cur.filter((c) => c !== choice) : [...cur, choice]);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || submitting) return;
      const el = e.target as HTMLElement;
      if (embedded && !root.current?.contains(el)) return;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
      if (e.key === "Enter") {
        if (el.dataset?.gi) return; // group inputs handle Enter themselves
        if (el.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
        if (el.tagName === "BUTTON" && step >= 0) return;
        e.preventDefault();
        next();
        return;
      }
      if (typing || !field || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if ((field.type === "yes_no" || field.type === "legal") && (k === "Y" || k === "N")) {
        pick(field, k === "Y", field.type === "yes_no" || k === "Y");
      } else if ((field.type === "multiple_choice" || field.type === "picture_choice") && field.choices) {
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

  const focusProps = embedded ? {} : { autoFocus: true };

  function renderInput(f: Field, grp?: { first: boolean; last: boolean }) {
    const v = answers[f.id];
    const gprops = grp
      ? {
          "data-gi": "1",
          autoFocus: grp.first && !embedded,
          onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
            if (e.key !== "Enter" || (f.type === "long_text" && !(e.metaKey || e.ctrlKey))) return;
            e.preventDefault();
            if (grp.last) next();
            else {
              const all = Array.from(
                (e.currentTarget.closest(".tfr-group") as HTMLElement).querySelectorAll<HTMLElement>("[data-gi]"),
              );
              all[all.indexOf(e.currentTarget) + 1]?.focus();
            }
          },
        }
      : focusProps;
    switch (f.type) {
      case "short_text":
      case "email":
      case "phone":
      case "url":
      case "number":
        return (
          <input
            {...gprops}
            className="tfr-input"
            aria-label={T(f.title)}
            type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "off"}
            placeholder={f.type === "email" ? "name@example.com" : f.type === "url" ? "example.com" : "Type your answer here..."}
            value={(v as string | number | undefined) ?? ""}
            onChange={(e) => setAnswer(f, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
          />
        );
      case "long_text":
        return (
          <>
            <textarea
              {...gprops}
              className="tfr-input"
              aria-label={T(f.title)}
              rows={3}
              placeholder="Type your answer here..."
              value={(v as string | undefined) ?? ""}
              onChange={(e) => setAnswer(f, e.target.value)}
            />
            <p className="tfr-hint" style={{ marginTop: 8 }}>
              <b>Shift ⇧ + Enter ↵</b> to make a line break
            </p>
          </>
        );
      case "date":
        return (
          <input
            {...gprops}
            className="tfr-input"
            type="date"
            aria-label={T(f.title)}
            value={(v as string | undefined) ?? ""}
            onChange={(e) => setAnswer(f, e.target.value)}
            style={{ colorScheme: "light dark" }}
          />
        );
      case "dropdown":
        return (
          <select
            {...gprops}
            className="tfr-input"
            aria-label={T(f.title)}
            value={(v as string | undefined) ?? ""}
            onChange={(e) => setAnswer(f, e.target.value)}
          >
            <option value="">Type or select an option</option>
            {(f.choices ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        );
      case "multiple_choice":
        return (
          <div role="radiogroup" aria-label={T(f.title)}>
            {(f.choices ?? []).map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={v === c}
                className="tfr-ch"
                onClick={() => {
                  setOtherOpen(false);
                  pick(f, c, true);
                }}
              >
                {showHints && <span className="tfr-key">{LETTERS[i]}</span>}
                {c}
              </button>
            ))}
            {f.allow_other && (
              <div>
                <button
                  type="button"
                  className="tfr-ch"
                  aria-checked={otherOpen}
                  role="radio"
                  onClick={() => {
                    setOtherOpen(true);
                    setAnswer(f, "");
                  }}
                >
                  {showHints && <span className="tfr-key">{LETTERS[(f.choices ?? []).length] ?? "+"}</span>}
                  Other
                </button>
                {otherOpen && (
                  <input
                    autoFocus
                    className="tfr-input"
                    style={{ marginTop: 6, fontSize: "calc(var(--fs)*.9)" }}
                    placeholder="Type your answer"
                    value={(v as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f, e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
        );
      case "checkboxes": {
        const cur = Array.isArray(v) ? v : [];
        return (
          <div role="group" aria-label={T(f.title)}>
            <p className="tfr-hintline">Choose as many as you like</p>
            {(f.choices ?? []).map((c, i) => (
              <button key={c} type="button" aria-pressed={cur.includes(c)} className="tfr-ch" onClick={() => toggle(f, c)}>
                {showHints && <span className="tfr-key">{cur.includes(c) ? Icon.check : LETTERS[i]}</span>}
                {c}
              </button>
            ))}
          </div>
        );
      }
      case "yes_no":
        return (
          <div role="radiogroup" aria-label={T(f.title)}>
            {(
              [
                [true, "Yes", "Y"],
                [false, "No", "N"],
              ] as const
            ).map(([val, label, key]) => (
              <button key={label} type="button" role="radio" aria-checked={v === val} className="tfr-ch" onClick={() => pick(f, val, true)}>
                {showHints && <span className="tfr-key">{key}</span>}
                {label}
              </button>
            ))}
          </div>
        );
      case "rating": {
        const steps = f.steps ?? 5;
        const cur = typeof v === "number" ? v : 0;
        return (
          <div className="tfr-stars" role="radiogroup" aria-label={T(f.title)}>
            {Array.from({ length: steps }, (_, i) => i + 1).map((i) => (
              <button key={i} type="button" role="radio" aria-checked={v === i} aria-label={`${i} of ${steps}`} onClick={() => pick(f, i, true)}>
                <Star filled={i <= cur} />
              </button>
            ))}
          </div>
        );
      }
      case "scale":
        return (
          <div>
            <div className="tfr-scale" role="radiogroup" aria-label={T(f.title)}>
              {Array.from({ length: 11 }, (_, i) => i).map((i) => (
                <button key={i} type="button" role="radio" aria-checked={v === i} onClick={() => pick(f, i, true)}>
                  {i}
                </button>
              ))}
            </div>
            <div className="tfr-scalelab">
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>
          </div>
        );
      case "legal":
        return (
          <div role="radiogroup" aria-label={T(f.title)}>
            {(
              [
                [true, "I accept", "Y"],
                [false, "I don't accept", "N"],
              ] as const
            ).map(([val, label, key]) => (
              <button key={label} type="button" role="radio" aria-checked={v === val} className="tfr-ch" onClick={() => pick(f, val, val === true)}>
                {showHints && <span className="tfr-key">{key}</span>}
                {label}
              </button>
            ))}
          </div>
        );
      case "picture_choice":
        return (
          <div className="tfr-pics" role="radiogroup" aria-label={T(f.title)}>
            {(f.choices ?? []).map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={v === c} className="tfr-pic" onClick={() => pick(f, c, true)}>
                {f.images?.[c] && /^https:\/\//i.test(f.images[c]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.images[c]} alt="" />
                ) : (
                  <span className="tfr-picph" />
                )}
                <span className="tfr-piclab">
                  {showHints && <span className="tfr-key">{LETTERS[i]}</span>}
                  {c}
                </span>
              </button>
            ))}
          </div>
        );
      case "ranking": {
        const order = Array.isArray(v) ? (v as string[]) : (f.choices ?? []);
        const move = (i: number, dlt: -1 | 1) => {
          const j = i + dlt;
          if (j < 0 || j >= order.length) return;
          const c = [...order];
          [c[i], c[j]] = [c[j], c[i]];
          setAnswer(f, c);
        };
        return (
          <div aria-label={T(f.title)}>
            <p className="tfr-hintline">Use the arrows to put these in your order of preference</p>
            {order.map((c, i) => (
              <div key={c} className="tfr-rank">
                <span className="tfr-key">{i + 1}</span>
                <span style={{ flex: 1 }}>{c}</span>
                <button type="button" aria-label={`Move ${c} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  {Icon.up}
                </button>
                <button type="button" aria-label={`Move ${c} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                  {Icon.down}
                </button>
              </div>
            ))}
          </div>
        );
      }
      case "group":
        return (
          <div className="tfr-group">
            {(f.fields ?? []).map((child, i, arr) => (
              <div key={child.id} className="tfr-sub">
                <label className="tfr-sublabel">
                  {T(child.title)}
                  {child.required && <i>*</i>}
                </label>
                {renderInput(child, { first: i === 0, last: i === arr.length - 1 })}
                {error && errorId === child.id && (
                  <p role="alert" className="tfr-err">
                    {Icon.warn} {error}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      case "statement":
        return null;
    }
  }

  const cssVars = {
    "--q": d.question,
    "--a": d.answer,
    "--btn": d.button,
    "--bt": d.button_text,
    "--bg": d.background,
    "--r": RADIUS[d.rounded],
    "--fs": `${FS[d.font_size]}px`,
    "--font": FONTS[d.font].css,
  } as React.CSSProperties;
  const googleFont = FONTS[d.font].google;
  const isDark = (() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(d.background);
    if (!m) return false;
    const v = parseInt(m[1], 16);
    return ((v >> 16) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000 < 128;
  })();
  const align = d.screen_align === "center" ? "tfr-center" : "";
  const btnClass = d.transparent_button ? "tfr-btn ghost" : "tfr-btn";
  const lastStep = field ? isEnd(nextTarget(field, fields, answers)) : false;
  const calSrc = done && ending ? calendlySrc(ending.calendly_url, fields, answers) : null;
  const bookedTitle = booked && ending?.booked_title;
  const bookedMsg = booked && ending?.booked_message;

  return (
    <div ref={root} className={`tfr${embedded ? " emb" : ""}`} style={cssVars} data-dark={isDark ? "1" : "0"}>
      <style>{STYLE}</style>
      {googleFont && (
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${googleFont}&display=swap`} />
      )}
      {d.background_image && /^https:\/\//i.test(d.background_image) && (
        <div className="tfr-bgimg" style={{ backgroundImage: `url("${d.background_image.replace(/"/g, "")}")` }} />
      )}
      {preview && !embedded && (
        <div style={{ background: "#f59e0b", color: "#111", fontSize: 13, textAlign: "center", padding: 6, position: "relative", zIndex: 2 }}>
          Preview mode. Nothing you submit here is saved.
        </div>
      )}

      {/* honeypot: invisible to humans, bots fill it */}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="tfr-hp" value={hp} onChange={(e) => setHp(e.target.value)} name="website_url" />

      <div className="tfr-scroll">
        <div key={`${step}-${endId ?? ""}`} className={`tfr-col ${calSrc ? "wide" : ""} ${dir === "up" ? "fq-in-up" : "fq-in-down"} ${step === -1 || done ? align : ""}`}>
          {step === -1 && !done && (
            <div>
              <h1 className="tfr-title" style={{ fontSize: "calc(var(--fs)*1.3)", fontWeight: 400 }}>
                {settings.welcome_title || title}
              </h1>
              {(settings.welcome_description || description) && (
                <p className="tfr-desc">{settings.welcome_description || description}</p>
              )}
              <div className="tfr-actions">
                <button type="button" className={btnClass} onClick={() => next()}>
                  {settings.start_label || "Start"}
                </button>
                <span className="tfr-hint">
                  press <b>Enter ↵</b>
                </span>
              </div>
              {showTime && (
                <p className="tfr-hint" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {Icon.clock} Takes {minutes} minute{minutes === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}

          {field && (
            <div>
              <div className="tfr-row">
                {showNumbers && field.type !== "statement" && (
                  <span className="tfr-num">
                    {hist.length + 1}
                    {Icon.arrow}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="tfr-title">
                    {T(field.title)}
                    {field.required && field.type !== "statement" && <i aria-label="required">*</i>}
                  </h2>
                  {field.description && <p className="tfr-desc">{T(field.description)}</p>}
                </div>
              </div>
              <div className="tfr-body" style={{ paddingLeft: showNumbers && field.type !== "statement" ? 48 : 0 }}>
                {renderInput(field)}
                {error && field.type !== "group" && (
                  <p role="alert" className="tfr-err">
                    {Icon.warn} {error}
                  </p>
                )}
                <div className="tfr-actions" style={{ justifyContent: "flex-start" }}>
                  <button type="button" className={btnClass} disabled={submitting} onClick={() => next()}>
                    {submitting ? "Sending..." : lastStep ? "Submit" : field.type === "statement" ? "Continue" : "OK"}
                    {!submitting && Icon.check}
                  </button>
                  <span className="tfr-hint">
                    press <b>Enter ↵</b>
                  </span>
                </div>
              </div>
            </div>
          )}

          {done && ending && (
            <div>
              <h2 className="tfr-title" style={{ fontSize: "calc(var(--fs)*1.3)" }}>
                {T(bookedTitle ? ending.booked_title! : ending.title) || "Thanks!"}
              </h2>
              {(bookedMsg || ending.message) && <p className="tfr-desc">{T(bookedMsg ? ending.booked_message! : ending.message)}</p>}
              {ending.button_url && /^https?:\/\//i.test(ending.button_url) && (
                <div className="tfr-actions">
                  <a href={ending.button_url} className={btnClass}>
                    {ending.button_label || "Continue"}
                  </a>
                </div>
              )}
              {!booked && calSrc && <iframe className="tfr-calendly" src={calSrc} title="Book your call" />}
            </div>
          )}
        </div>
      </div>

      {!done && (step >= 0 || showProgress) && (
        <div className="tfr-foot">
          <div>
            {showProgress && step >= 0 && (
              <div className="tfr-prog" aria-label="Progress">
                {Math.round(progress * 100)}% completed
                <div className="tfr-bar">
                  <i style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            )}
          </div>
          {showNav && step >= 0 && (
            <div className="tfr-nav">
              <button type="button" aria-label="Previous question" onClick={back} disabled={hist.length === 0 && !hasWelcome}>
                {Icon.up}
              </button>
              <button type="button" aria-label="Next question" onClick={() => next()}>
                {Icon.down}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
