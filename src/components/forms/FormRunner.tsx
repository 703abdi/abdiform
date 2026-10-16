"use client";

// Typeform-style runner: one question per screen, keyboard first
// (Enter = next, A/B/C = pick a choice, Y/N for yes/no), themeable, mobile friendly.
// Used on the public /apply page and, in `embedded` mode, as the live preview in the builder.

import { isValidPhone } from "@/forms/phone";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AnswerValue, Answers, Ending, Field, FormSettings } from "@/forms/types";
import { DEFAULT_ENDING, NONE_LABEL } from "@/forms/types";
import { FONTS, flattenFields, isEmptyAnswer, leadIdentity, plainText, resolveDesign, scaleRange } from "@/forms/lib";
import { endingId, isEnd, nextTarget, pipe, resolvePath } from "@/forms/logic";
import { RichText } from "@/components/forms/RichText";
import { COUNTRIES, flag, splitPhone } from "@/forms/countries";
import { Combobox, DateInput, MatrixInput, seededShuffle } from "@/components/forms/inputs";
import { ACCEPT_ATTR, MAX_FILE_BYTES, parseFileAnswer } from "@/forms/files";

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

interface Saved {
  rid: string;
  answers: Answers;
  hist: number[];
  step: number;
  vtok?: Record<string, string>; // verified email -> server token
}

interface Verifying {
  email: string;
  code: string;
  busy: boolean;
  msg: string | null;
  sentAt: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function localCheck(f: Field, v: AnswerValue | undefined): string | null {
  if (f.type === "statement") return null;
  if (f.type === "legal") return v === true || !f.required ? null : "You need to accept to continue";
  if (isEmptyAnswer(v) && !(f.type === "yes_no" && typeof v === "boolean")) {
    return f.required ? "Please fill this in" : null;
  }
  if (f.type === "email" && !EMAIL_RE.test(String(v).trim())) return "Hmm, that email doesn't look right";
  if (f.type === "phone") {
    if (!isValidPhone(String(v))) return "Hmm, that phone number doesn't look right. Check the country and the number";
  }
  if (f.type === "number") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "Enter a number";
    if (f.min !== undefined && n < f.min) return `Enter a number of at least ${f.min}`;
    if (f.max !== undefined && n > f.max) return `Enter a number no higher than ${f.max}`;
  }
  if ((f.type === "short_text" || f.type === "long_text") && f.max_chars && String(v).length > f.max_chars)
    return `Keep it under ${f.max_chars} characters`;
  if (f.type === "checkboxes" && Array.isArray(v)) {
    const min = f.min_selections ?? 1;
    if (v.length < min) return `Pick at least ${min}`;
    if (f.max_selections && v.length > f.max_selections) return `Pick no more than ${f.max_selections}`;
  }
  if (f.type === "file_upload" && !String(v ?? "").startsWith("file:")) return f.required ? "Please upload a file" : null;
  if (f.type === "matrix") {
    const done = new Set((Array.isArray(v) ? v : []).map((x) => String(x).split("::")[0]));
    if ((f.rows ?? []).some((r) => !done.has(r))) return "Answer every row";
  }
  if (f.type === "date" && typeof v === "string" && v === "") return f.required ? "Please fill this in" : null;
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

const DEFAULT_HIDDEN = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];

/** URL parameters configured as hidden fields (plus ref), e.g. ?utm_source=instagram. */
function hiddenValues(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return out;
  new URLSearchParams(window.location.search).forEach((v, k) => {
    if ((names.includes(k) || k === "ref") && v) out[k] = v.slice(0, 200);
  });
  return out;
}

function utmMeta(names: string[]) {
  return { referrer: document.referrer, utm: hiddenValues(names) };
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


/** Adds a picture to a screen in one of Typeform's layouts. */
function ScreenFrame({
  image,
  layout = "stack",
  children,
}: {
  image?: string;
  layout?: "stack" | "split-right" | "split-left" | "wallpaper";
  children: React.ReactNode;
}) {
  const url = image && /^https:\/\//i.test(image) ? image : null;
  if (!url || layout === "wallpaper") return <>{children}</>;
  const img = (
    <div className="tfr-media">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
    </div>
  );
  if (layout === "stack")
    return (
      <>
        {img}
        {children}
      </>
    );
  return (
    <div className={`tfr-split${layout === "split-left" ? " left" : ""}`}>
      <div>{children}</div>
      {img}
    </div>
  );
}

const wallpaperOf = (image?: string, layout?: string) => (layout === "wallpaper" && image && /^https:\/\//i.test(image) ? image : null);

/** Example text Typeform shows inside empty inputs. */
function placeholderFor(f: Field): string {
  if (f.type === "email") return "name@example.com";
  if (f.type === "url") return "https://";
  if (f.type === "phone") return "(201) 555-0123";
  const t = f.title.toLowerCase();
  if (/first.?name/.test(t)) return "Jane";
  if (/last.?name|surname/.test(t)) return "Smith";
  if (/company|business/.test(t)) return "Acme Inc.";
  if (/city/.test(t)) return "New York";
  return "Type your answer here...";
}

/** Phone number with a country picker (flag + dial code). Stores "+<dial><digits>". */
function PhoneInput({
  value,
  onChange,
  inputProps,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  label: string;
}) {
  const parsed = value ? splitPhone(value) : null;
  const [iso, setIso] = useState(parsed?.iso ?? "US");
  const country = COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];
  const national = parsed && parsed.iso === iso ? parsed.national : value && !value.startsWith("+") ? value : "";
  const emit = (isoNow: string, nat: string) => {
    const c = COUNTRIES.find((x) => x.iso === isoNow) ?? COUNTRIES[0];
    const digits = nat.replace(/\D/g, "");
    onChange(digits ? `+${c.dial}${digits}` : "");
  };
  return (
    <div className="tfr-phone">
      <label className="tfr-cc">
        <span aria-hidden style={{ fontSize: "1.15em", lineHeight: 1 }}>
          {flag(country.iso)}
        </span>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
        </svg>
        <select
          aria-label={`${label}: country`}
          value={iso}
          onChange={(e) => {
            setIso(e.target.value);
            emit(e.target.value, national);
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>{`${flag(c.iso)} ${c.name} (+${c.dial})`}</option>
          ))}
        </select>
      </label>
      <input
        {...inputProps}
        className="tfr-input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={label}
        placeholder={iso === "US" ? "(201) 555-0123" : "Phone number"}
        value={national}
        onChange={(e) => {
          const raw = e.target.value;
          // pasted full international number: pick the matching country
          if (raw.trim().startsWith("+")) {
            const hit = splitPhone(raw.replace(/[^\d+]/g, ""));
            if (hit) {
              setIso(hit.iso);
              emit(hit.iso, hit.national);
              return;
            }
          }
          emit(iso, raw);
        }}
      />
    </div>
  );
}

/** File picker: uploads immediately and keeps the returned reference as the answer. */
function FileInput({
  slug,
  value,
  onChange,
  label,
  fake,
  onError,
}: {
  slug: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  fake: boolean; // preview / builder: don't upload
  onError: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const current = parseFileAnswer(value);
  async function pickFile(file: File | undefined) {
    if (!file) return;
    onError(null);
    if (file.size > MAX_FILE_BYTES) return onError("That file is over 4 MB");
    if (fake) return onChange(`file:00000000-0000-0000-0000-000000000000:${file.name.slice(0, 100)}`);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/apply/${slug}/upload`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) onError(data.error ?? "Upload failed. Try again.");
      else onChange(data.answer);
    } catch {
      onError("Couldn't reach the server. Check your connection.");
    }
    setBusy(false);
  }
  return (
    <div>
      {current ? (
        <div className="tfr-ch" style={{ cursor: "default" }}>
          <span style={{ flex: 1, overflowWrap: "anywhere" }}>{current.name}</span>
          <button type="button" className="tfr-file-x" onClick={() => onChange("")}>Remove</button>
        </div>
      ) : (
        <label className="tfr-file">
          <input
            type="file"
            accept={ACCEPT_ATTR}
            aria-label={label}
            disabled={busy}
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span>{busy ? "Uploading..." : "Choose file"}</span>
          <small>Images, PDF, Office documents or CSV, up to 4 MB</small>
        </label>
      )}
    </div>
  );
}

const RADIUS = { none: "0px", small: "4px", large: "12px" } as const;
const FS = { small: 22, medium: 26, large: 32 } as const;

const STYLE = `
.tfr{--fs:var(--fsb);position:relative;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--q);font-family:var(--font);-webkit-font-smoothing:antialiased}
.tfr.emb{height:100%;min-height:560px;border-radius:10px}
.tfr *{box-sizing:border-box}
.tfr-bgimg{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none}
.tfr-scroll{position:relative;flex:1;overflow-y:auto;display:flex;flex-direction:column}
.tfr-col{margin:auto;width:100%;max-width:936px;padding:72px 32px 130px}
.tfr-inner{max-width:780px}
.tfr-center .tfr-inner{margin:0 auto}
.tfr-col.wide{max-width:1000px}.tfr-col.wide .tfr-inner{max-width:none}
.tfr-center{text-align:center}
.tfr-row{display:flex;gap:10px;align-items:flex-start}
.tfr-numwrap{display:flex;align-items:center;height:calc(var(--fs)*1.35);flex-shrink:0;width:22px}
.tfr-num{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:calc(var(--r)*.75);background:var(--btn);color:var(--bg);font-size:11px;font-weight:500;line-height:1}
.tfr-title{font-size:var(--fs);line-height:1.35;font-weight:400;color:var(--q);overflow-wrap:anywhere}
.tfr-title i{font-style:normal;color:var(--a);margin-left:4px}
.tfr-desc{font-size:calc(var(--fs)*.69);line-height:1.5;opacity:.8;margin-top:8px}
.tfr-body{margin-top:26px;padding-left:32px}
.tfr-body.nonum{padding-left:0}
.tfr-input{width:100%;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--a) 30%,transparent);color:var(--a);font:inherit;font-size:var(--fs);padding:6px 0 10px;outline:none;border-radius:0;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none}
.tfr-input::placeholder{color:color-mix(in srgb,var(--a) 40%,transparent)}
.tfr-input:focus{border-bottom-color:var(--a);box-shadow:0 1px 0 var(--a)}
textarea.tfr-input{resize:none;line-height:1.35}
.tfr-ch{display:flex;align-items:center;gap:12px;width:fit-content;min-width:min(100%,280px);max-width:100%;text-align:left;padding:7px 12px 7px 8px;margin:0 0 8px;border-radius:var(--r);color:var(--a);cursor:pointer;font:inherit;font-size:calc(var(--fs)*.77);line-height:1.3;min-height:40px;background:color-mix(in srgb,var(--a) 10%,transparent);border:1px solid color-mix(in srgb,var(--a) 75%,transparent);transition:background .15s,box-shadow .15s}
.tfr-ch:hover{background:color-mix(in srgb,var(--a) 20%,transparent)}
.tfr-ch[aria-checked=true],.tfr-ch[aria-pressed=true]{background:color-mix(in srgb,var(--a) 28%,transparent);border-color:var(--a);box-shadow:inset 0 0 0 1px var(--a)}
.tfr-key{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border:1px solid var(--a);border-radius:calc(var(--r)*.75);font-size:12px;font-weight:600;line-height:1;color:var(--a)}
.tfr-ch[aria-checked=true] .tfr-key,.tfr-ch[aria-pressed=true] .tfr-key{background:var(--a);color:var(--bg)}
.tfr-hintline{font-size:12px;color:var(--a);opacity:.7;margin:0 0 10px}
.tfr-btn{display:inline-flex;align-items:center;gap:8px;background:var(--btn);color:var(--bt);border:2px solid var(--btn);border-radius:var(--r);padding:7px 16px;font:inherit;font-size:calc(var(--fs)*.69);font-weight:500;line-height:1.3;cursor:pointer;text-decoration:none;transition:opacity .15s,transform .05s}
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
.tfr-brand{position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:8px;background:none;border:0;padding:6px 10px;border-radius:8px;cursor:pointer;color:var(--q);font:inherit;font-weight:700;font-size:15px;letter-spacing:.02em;white-space:nowrap}
.tfr-brand:hover{background:color-mix(in srgb,var(--q) 8%,transparent)}
.tfr-brand img{height:26px;width:auto;display:block}
.tfr.emb .tfr-brand{top:10px}
.tfr-again{margin-top:28px}
.tfr-code{max-width:260px;letter-spacing:.35em;font-size:calc(var(--fs)*1.1)}
.tfr-again button{background:none;border:0;padding:0;font:inherit;font-size:15px;color:var(--q);opacity:.75;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.tfr-again button:hover{opacity:1}
.tfr-top{position:absolute;top:0;left:0;right:0;height:4px;background:color-mix(in srgb,var(--q) 10%,transparent);z-index:3}
.tfr-top i{display:block;height:100%;background:var(--a);transition:width .45s ease}
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
.tfr-sublabel{display:block;font-size:calc(var(--fs)*.77);margin-bottom:2px;color:var(--q)}
.tfr-sublabel i{font-style:normal;color:var(--a);margin-left:3px}
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
.tfr-date{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.tfr-datesep{padding-bottom:10px;color:color-mix(in srgb,var(--a) 50%,transparent);font-size:var(--fs)}
.tfr-date .tfr-input{width:auto}
.tfr-combo{position:relative}
.tfr-list{position:absolute;z-index:5;left:0;right:0;margin:4px 0 0;padding:4px;max-height:240px;overflow-y:auto;list-style:none;border-radius:var(--r);background:var(--bg);border:1px solid color-mix(in srgb,var(--a) 40%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.tfr-list li{padding:8px 10px;border-radius:calc(var(--r)*.75);cursor:pointer;color:var(--a);font-size:calc(var(--fs)*.77)}
.tfr-list li.on{background:color-mix(in srgb,var(--a) 15%,transparent)}
.tfr-matrix{overflow-x:auto}
.tfr-matrix table{border-collapse:separate;border-spacing:0 6px;color:var(--a);font-size:calc(var(--fs)*.69)}
.tfr-matrix th{font-weight:400;padding:4px 14px;text-align:center}
.tfr-matrix th[scope=row]{text-align:left;padding-left:0;color:var(--q);min-width:140px}
.tfr-matrix td{text-align:center;padding:2px 14px}
.tfr-matrix td button{width:22px;height:22px;border-radius:50%;cursor:pointer;background:color-mix(in srgb,var(--a) 10%,transparent);border:1.5px solid var(--a)}
.tfr-matrix td button[aria-checked=true]{background:var(--a);box-shadow:inset 0 0 0 4px var(--bg)}
.tfr-counter{font-size:12px;color:var(--a);opacity:.7;margin-top:6px;text-align:right}
.tfr-media img{display:block;max-width:100%;max-height:260px;border-radius:var(--r);object-fit:cover;margin-bottom:22px}
.tfr-split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;max-width:1100px}
.tfr-split.left .tfr-media{order:-1}
.tfr-split .tfr-media img{max-height:420px;width:100%;margin:0}
@media (max-width:760px){.tfr-split{grid-template-columns:1fr}}
.tfr-wall{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
.tfr-wall::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--bg) 55%,transparent)}
.tfr-col{position:relative;z-index:1}
.tfr-file{display:flex;flex-direction:column;gap:4px;align-items:flex-start;padding:18px 22px;border-radius:var(--r);border:1.5px dashed color-mix(in srgb,var(--a) 60%,transparent);background:color-mix(in srgb,var(--a) 6%,transparent);color:var(--a);cursor:pointer;max-width:420px}
.tfr-file input{position:absolute;opacity:0;width:1px;height:1px}
.tfr-file span{font-size:calc(var(--fs)*.77);font-weight:500}
.tfr-file small{font-size:13px;opacity:.75}
.tfr-file:focus-within,.tfr-file:hover{background:color-mix(in srgb,var(--a) 12%,transparent)}
.tfr-file-x{border:0;background:transparent;color:var(--a);text-decoration:underline;cursor:pointer;font:inherit;font-size:14px}
.tfr-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
@media (max-width:640px){.tfr{--fs:calc(var(--fsb)*.85)}.tfr-col{padding:48px 20px 120px}.tfr-body{padding-left:0}.tfr-numwrap{width:20px}}
.tfr-phone{display:flex;align-items:flex-end;gap:10px}
.tfr-cc{position:relative;flex-shrink:0;display:flex;align-items:center;gap:4px;border-bottom:1px solid color-mix(in srgb,var(--a) 30%,transparent);padding:6px 4px 10px 0;font-size:calc(var(--fs)*.9);color:var(--a)}
.tfr-cc select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.tfr-cc:focus-within{border-bottom-color:var(--a);box-shadow:0 1px 0 var(--a)}
.tfr-phone .tfr-input{flex:1;min-width:0}
`;

function RunnerInner({ slug, title, description, fields, settings, endings, preview, embedded, initialId, initial, onRestart }: Props & { initial: Saved | null; onRestart: () => void }) {
  const d = resolveDesign(settings);
  const hasWelcome = settings.welcome_enabled;
  const n = fields.length;
  const showProgress = settings.show_progress_bar !== false;
  const showNumbers = settings.show_question_numbers !== false;
  const showHints = settings.show_key_hints !== false;
  const showNav = settings.show_navigation !== false;
  const showTime = settings.show_time_to_complete !== false;

  const [step, setStep] = useState(() => {
    if (initial) return initial.step;
    const i = initialId ? fields.findIndex((f) => f.id === initialId) : -1;
    return i >= 0 ? i : hasWelcome ? -1 : 0; // -1 = welcome
  });
  const [endId, setEndId] = useState<string | null>(null); // set once finished
  const [booked, setBooked] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null); // which input the error belongs to
  const [submitting, setSubmitting] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [hp, setHp] = useState("");
  const [hist, setHist] = useState<number[]>(initial?.hist ?? []); // questions already visited (for Back)
  const [rid] = useState(() => initial?.rid ?? newRid());
  const [vtok, setVtok] = useState<Record<string, string>>(initial?.vtok ?? {});
  const [verifying, setVerifying] = useState<Verifying | null>(null);
  const pendingAnswers = useRef<Answers | null>(null);
  const latest = useRef<Answers>(initial?.answers ?? {});
  const started = useRef(!!initial);
  const startedAt = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const done = endId !== null;
  const field = !done && step >= 0 && step < n ? fields[step] : null;
  const estimate = Math.max(resolvePath(fields, answers).visited.length, 1);
  const progress = done ? 1 : step < 0 ? 0 : Math.min(hist.length / estimate, 0.99);
  const flat = flattenFields(fields);
  const hiddenNames = settings.hidden_fields ?? DEFAULT_HIDDEN;
  const T = (text: string) => pipe(text, flat, answers, hiddenValues(hiddenNames));
  const ending = endings.find((e) => e.id === endId) ?? endings[0];
  const minutes = Math.max(1, Math.ceil((fields.filter((f) => f.type !== "statement").length * 15) / 60));

  const post = useCallback(
    (qs: string) => {
      if (preview || embedded) return;
      fetch(`/api/apply/${slug}${qs}&rid=${rid}`, { method: "POST", keepalive: true }).catch(() => {});
    },
    [slug, preview, embedded, rid],
  );
  useEffect(() => {
    startedAt.current = Date.now();
    post("?event=view");
  }, [post]);

  // Which screen this visitor is on (powers "where people drop off").
  const screenId = done ? "_end" : field ? field.id : "_welcome";
  useEffect(() => {
    if (screenId !== "_welcome") post(`?event=screen&s=${encodeURIComponent(screenId)}`);
  }, [post, screenId]);

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
      const body = JSON.stringify({ rid: rid, answers: a, hp, meta: utmMeta(hiddenNames) });
      const url = `/api/apply/${slug}?event=progress`;
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      else fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    },
    [preview, embedded, slug, hp, rid, hiddenNames],
  );

  // Remember progress in this browser so a refresh or a return visit resumes here.
  const storageKey = `tf:${slug}`;
  const autosave = !preview && !embedded && settings.autosave !== false;
  useEffect(() => {
    if (!autosave) return;
    // Nothing answered yet: leave any stored progress alone (it may be about to be restored).
    if (!done && Object.keys(answers).length === 0 && hist.length === 0) return;
    try {
      if (done || step < 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify({ rid, answers, hist, step, vtok, t: Date.now() }));
    } catch {
      // storage unavailable (private mode): resuming just won't work
    }
  }, [autosave, storageKey, done, step, rid, answers, hist, vtok]);

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
          verification: (() => {
            const vf = flattenFields(fields).find((f) => f.type === "email" && f.verify);
            const t = vf ? vtok[String(final[vf.id] ?? "").trim().toLowerCase()] : undefined;
            return t && t !== "skip" ? t : undefined;
          })(),
          meta: { ...utmMeta(hiddenNames), duration_s: Math.round((Date.now() - startedAt.current) / 1000) },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.verify) setVtok({}); // the server wants a fresh code: OK on the email screen sends one
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
    // email verification: confirm the address with a code before moving on
    const vf = !preview && !embedded ? flattenFields([field]).find((f) => f.type === "email" && f.verify) : undefined;
    if (vf) {
      const em = String(current[vf.id] ?? "").trim().toLowerCase();
      if (em && !vtok[em]) {
        startVerify(em, current);
        return;
      }
    }
    advance(current);
  }

  function advance(current: Answers) {
    if (!field) return;
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

  async function startVerify(email: string, current: Answers) {
    pendingAnswers.current = current;
    setVerifying({ email, code: "", busy: true, msg: null, sentAt: Date.now() });
    try {
      const res = await fetch(`/api/apply/${slug}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.skipped) {
        // this server can't send email: carry on without the code step
        setVtok((v) => ({ ...v, [email]: "skip" }));
        setVerifying(null);
        advance(current);
        return;
      }
      setVerifying((v) => v && { ...v, busy: false, msg: data.ok ? null : (data.error ?? "We couldn't send the code. Try again.") });
    } catch {
      setVerifying((v) => v && { ...v, busy: false, msg: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  async function checkVerify() {
    if (!verifying || verifying.busy) return;
    const code = verifying.code.replace(/\D/g, "");
    if (code.length !== 6) {
      setVerifying({ ...verifying, msg: "Enter the 6-digit code from the email" });
      return;
    }
    setVerifying({ ...verifying, busy: true, msg: null });
    try {
      const res = await fetch(`/api/apply/${slug}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "check", email: verifying.email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && (data.token || data.skipped)) {
        const email = verifying.email;
        setVtok((v) => ({ ...v, [email]: data.token ?? "skip" }));
        setVerifying(null);
        setDir("up");
        advance(pendingAnswers.current ?? answers);
        return;
      }
      setVerifying((v) => v && { ...v, busy: false, msg: data.error ?? "That code isn't right." });
    } catch {
      setVerifying((v) => v && { ...v, busy: false, msg: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  function back() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setError(null);
    setOtherOpen(false);
    setDir("down");
    if (verifying) {
      setVerifying(null); // back from the code screen = edit the email
      return;
    }
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

  /** Choices in the order this respondent sees them (randomized per session, plus "None of the above"). */
  function choiceList(f: Field): string[] {
    const base = f.randomize ? seededShuffle(f.choices ?? [], rid + f.id) : (f.choices ?? []);
    return f.none_of_the_above && (f.type === "multiple_choice" || f.type === "checkboxes") ? [...base, NONE_LABEL] : base;
  }

  function toggle(f: Field, choice: string) {
    const cur = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
    if (choice === NONE_LABEL) {
      setAnswer(f, cur.includes(NONE_LABEL) ? [] : [NONE_LABEL]); // exclusive
      return;
    }
    let next = cur.filter((c) => c !== NONE_LABEL);
    if (next.includes(choice)) next = next.filter((c) => c !== choice);
    else {
      if (f.max_selections && next.length >= f.max_selections) return;
      next = [...next, choice];
    }
    setAnswer(f, next);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || submitting || verifying) return; // the code screen handles its own keys
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
        const list = choiceList(field);
        const i = LETTERS.indexOf(k);
        if (k.length === 1 && i >= 0 && i < list.length) pick(field, list[i], true);
      } else if (field.type === "checkboxes" && field.choices) {
        const list = choiceList(field);
        const i = LETTERS.indexOf(k);
        if (k.length === 1 && i >= 0 && i < list.length) toggle(field, list[i]);
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
      case "phone":
        return (
          <PhoneInput
            label={plainText(T(f.title))}
            value={typeof v === "string" ? v : ""}
            onChange={(val) => setAnswer(f, val)}
            inputProps={gprops as React.InputHTMLAttributes<HTMLInputElement>}
          />
        );
      case "short_text":
      case "email":
      case "url":
      case "number":
        return (
          <input
            {...gprops}
            className="tfr-input"
            aria-label={plainText(T(f.title))}
            type={f.type === "email" ? "email" : f.type === "number" ? "number" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            autoComplete={f.type === "email" ? "email" : "off"}
            placeholder={placeholderFor(f)}
            min={f.type === "number" ? f.min : undefined}
            max={f.type === "number" ? f.max : undefined}
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
              aria-label={plainText(T(f.title))}
              rows={3}
              placeholder="Type your answer here..."
              value={(v as string | undefined) ?? ""}
              onChange={(e) => setAnswer(f, e.target.value)}
            />
            {f.max_chars ? (
              <p className="tfr-counter">
                {String(v ?? "").length} / {f.max_chars}
              </p>
            ) : null}
            <p className="tfr-hint" style={{ marginTop: 8 }}>
              <b>Shift ⇧ + Enter ↵</b> to make a line break
            </p>
          </>
        );
      case "date":
        return (
          <DateInput
            label={plainText(T(f.title))}
            value={typeof v === "string" ? v : ""}
            format={f.date_format}
            onChange={(val) => setAnswer(f, val)}
            autoFocus={grp ? grp.first && !embedded : !embedded}
            gprops={grp ? (gprops as Record<string, unknown>) : undefined}
          />
        );
      case "dropdown":
        return (
          <Combobox
            label={plainText(T(f.title))}
            choices={f.choices ?? []}
            value={typeof v === "string" ? v : ""}
            onChange={(val) => setAnswer(f, val)}
            autoFocus={grp ? grp.first && !embedded : !embedded}
            gprops={grp ? (gprops as Record<string, unknown>) : undefined}
          />
        );
      case "multiple_choice":
        return (
          <div role="radiogroup" aria-label={plainText(T(f.title))}>
            {choiceList(f).map((c, i) => (
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
                  {showHints && <span className="tfr-key">{LETTERS[choiceList(f).length] ?? "+"}</span>}
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
          <div role="group" aria-label={plainText(T(f.title))}>
            <p className="tfr-hintline">
              {f.max_selections ? `Choose up to ${f.max_selections}` : f.min_selections && f.min_selections > 1 ? `Choose at least ${f.min_selections}` : "Choose as many as you like"}
            </p>
            {choiceList(f).map((c, i) => (
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
          <div role="radiogroup" aria-label={plainText(T(f.title))}>
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
          <div className="tfr-stars" role="radiogroup" aria-label={plainText(T(f.title))}>
            {Array.from({ length: steps }, (_, i) => i + 1).map((i) => (
              <button key={i} type="button" role="radio" aria-checked={v === i} aria-label={`${i} of ${steps}`} onClick={() => pick(f, i, true)}>
                <Star filled={i <= cur} />
              </button>
            ))}
          </div>
        );
      }
      case "scale": {
        const { lo, hi } = scaleRange(f);
        const nums = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
        const dflt = !f.labels && hi - lo === 10 && lo === 0;
        const L = f.labels ?? {};
        return (
          <div>
            <div className="tfr-scale" role="radiogroup" aria-label={plainText(T(f.title))}>
              {nums.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={v === i} onClick={() => pick(f, i, true)}>
                  {i}
                </button>
              ))}
            </div>
            {(dflt || L.left || L.center || L.right) && (
              <div className="tfr-scalelab" style={{ maxWidth: `calc(46px*${nums.length} + 8px*${nums.length - 1})` }}>
                <span style={{ flex: 1, textAlign: "left" }}>{dflt ? "Not at all likely" : L.left}</span>
                <span style={{ flex: 1, textAlign: "center" }}>{L.center}</span>
                <span style={{ flex: 1, textAlign: "right" }}>{dflt ? "Extremely likely" : L.right}</span>
              </div>
            )}
          </div>
        );
      }
      case "legal":
        return (
          <div role="radiogroup" aria-label={plainText(T(f.title))}>
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
          <div className="tfr-pics" role="radiogroup" aria-label={plainText(T(f.title))}>
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
          <div aria-label={plainText(T(f.title))}>
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
      case "file_upload":
        return (
          <FileInput
            slug={slug}
            label={plainText(T(f.title))}
            value={typeof v === "string" ? v : ""}
            fake={!!preview || !!embedded}
            onChange={(val) => setAnswer(f, val)}
            onError={(m) => {
              setError(m);
              setErrorId(m ? f.id : null);
            }}
          />
        );
      case "matrix":
        return (
          <MatrixInput
            label={plainText(T(f.title))}
            rows={f.rows ?? []}
            cols={f.choices ?? []}
            value={Array.isArray(v) ? (v as string[]) : []}
            onChange={(val) => setAnswer(f, val)}
          />
        );
      case "group":
        return (
          <div className="tfr-group">
            {(f.fields ?? []).map((child, i, arr) => (
              <div key={child.id} className="tfr-sub">
                <label className="tfr-sublabel">
                  <RichText text={T(child.title)} />
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
    "--fsb": `${FS[d.font_size]}px`,
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
  const frame =
    step === -1 && !done
      ? { image: settings.welcome_image, layout: settings.welcome_image_layout }
      : done
        ? { image: ending?.image, layout: ending?.image_layout }
        : { image: field?.image, layout: field?.image_layout };
  const wall = wallpaperOf(frame.image, frame.layout);
  const bookedTitle = booked && ending?.booked_title;
  const bookedMsg = booked && ending?.booked_message;

  return (
    <div ref={root} className={`tfr${embedded ? " emb" : ""}`} style={cssVars} data-dark={isDark ? "1" : "0"}>
      <style>{STYLE}</style>
      {googleFont && (
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${googleFont}&display=swap`} />
      )}
      {d.glow && /^#[0-9a-f]{6}$/i.test(d.glow) && (
        <div
          className="tfr-bgimg"
          aria-hidden
          style={{ background: `radial-gradient(1100px 560px at 0% 100%, ${d.glow}, transparent 60%), radial-gradient(800px 460px at 100% 0%, ${d.glow}99, transparent 60%)` }}
        />
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
        {wall && <div className="tfr-wall" style={{ backgroundImage: `url("${wall.replace(/["\\]/g, "")}")` }} />}
        <div key={`${step}-${endId ?? ""}`} className={`tfr-col ${calSrc ? "wide" : ""} ${dir === "up" ? "fq-in-up" : "fq-in-down"} ${step === -1 || done ? align : ""}`}>
          <ScreenFrame image={frame.image} layout={frame.layout}>
          {step === -1 && !done && (
            <div className="tfr-inner">
              <h1 className="tfr-title" style={{ fontSize: "calc(var(--fs)*1.3)", fontWeight: 400 }}>
                <RichText text={settings.welcome_title || title} />
              </h1>
              {(settings.welcome_description || description) && (
                <p className="tfr-desc">
                  <RichText text={settings.welcome_description || description} />
                </p>
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

          {field && verifying && (
            <div className="tfr-inner">
              <h2 className="tfr-title">Check your email</h2>
              <p className="tfr-desc">
                We sent a 6-digit code to <b>{verifying.email}</b>. Enter it below to continue.
              </p>
              <input
                className="tfr-input tfr-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Verification code"
                placeholder="123456"
                maxLength={7}
                autoFocus
                value={verifying.code}
                onChange={(e) => setVerifying({ ...verifying, code: e.target.value.replace(/[^\d]/g, "").slice(0, 6), msg: null })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    checkVerify();
                  }
                }}
              />
              {verifying.msg && (
                <p role="alert" className="tfr-err">{verifying.msg}</p>
              )}
              <div className="tfr-actions">
                <button type="button" className={btnClass} disabled={verifying.busy} onClick={checkVerify}>
                  {verifying.busy ? "Checking..." : "Verify"}
                </button>
              </div>
              <div className="tfr-again" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <button type="button" disabled={verifying.busy} onClick={() => startVerify(verifying.email, pendingAnswers.current ?? answers)}>
                  Resend code
                </button>
                <button type="button" onClick={() => setVerifying(null)}>Use a different email</button>
              </div>
            </div>
          )}

          {field && !verifying && (
            <div className="tfr-inner">
              <div className="tfr-row">
                {showNumbers && field.type !== "statement" && (
                  <span className="tfr-numwrap">
                    <span className="tfr-num">{hist.length + 1}</span>
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="tfr-title">
                    <RichText text={T(field.title)} />
                    {field.required && field.type !== "statement" && <i aria-label="required">*</i>}
                  </h2>
                  {field.description && (
                    <p className="tfr-desc">
                      <RichText text={T(field.description)} />
                    </p>
                  )}
                </div>
              </div>
              <div className={`tfr-body${showNumbers && field.type !== "statement" ? "" : " nonum"}`}>
                {renderInput(field)}
                {error && field.type !== "group" && (
                  <p role="alert" className="tfr-err">
                    {Icon.warn} {error}
                  </p>
                )}
                <div className="tfr-actions" style={{ justifyContent: "flex-start" }}>
                  <button type="button" className={btnClass} disabled={submitting} onClick={() => next()}>
                    {submitting ? "Sending..." : field.button_text || (lastStep ? "Submit" : field.type === "statement" ? "Continue" : "OK")}
                  </button>
                  {field.type !== "group" && (
                    <span className="tfr-hint">
                      press <b>Enter ↵</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {done && ending && (
            <div className="tfr-inner">
              <h2 className="tfr-title" style={{ fontSize: "calc(var(--fs)*1.3)" }}>
                <RichText text={T(bookedTitle ? ending.booked_title! : ending.title) || "Thanks!"} />
              </h2>
              {(bookedMsg || ending.message) && (
                <p className="tfr-desc">
                  <RichText text={T(bookedMsg ? ending.booked_message! : ending.message)} />
                </p>
              )}
              {ending.button_url && /^https?:\/\//i.test(ending.button_url) && (
                <div className="tfr-actions">
                  <a href={ending.button_url} className={btnClass}>
                    {ending.button_label || "Continue"}
                  </a>
                </div>
              )}
              {!booked && calSrc && <iframe className="tfr-calendly" src={calSrc} title="Book your call" />}
              {settings.allow_another !== false && (
                <div className="tfr-again">
                  <button type="button" onClick={onRestart}>Submit another response</button>
                </div>
              )}
            </div>
          )}
          </ScreenFrame>
        </div>
      </div>

      {(settings.brand_name || settings.brand_logo) && (
        <button type="button" className="tfr-brand" onClick={onRestart} title="Start over">
          {settings.brand_logo && /^https:\/\//i.test(settings.brand_logo) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.brand_logo} alt="" />
          )}
          {settings.brand_name && <span>{settings.brand_name}</span>}
        </button>
      )}

      {showProgress && step >= 0 && (
        <div className="tfr-top" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {!done && showNav && step >= 0 && (
        <div className="tfr-foot">
          <div />
          <div className="tfr-nav">
            <button type="button" aria-label="Previous question" onClick={back} disabled={hist.length === 0 && !hasWelcome}>
              {Icon.up}
            </button>
            <button type="button" aria-label="Next question" onClick={() => next()}>
              {Icon.down}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const snapshotCache = new Map<string, string | null>();
const subscribeNone = () => () => {};

function readSaved(key: string): string | null {
  if (!snapshotCache.has(key)) {
    try {
      const raw = window.localStorage.getItem(key);
      let fresh = raw;
      if (raw) {
        const t = (JSON.parse(raw) as { t?: number }).t ?? 0;
        if (Date.now() - t > 7 * 86_400_000) {
          window.localStorage.removeItem(key); // saved progress expires after a week
          fresh = null;
        }
      }
      snapshotCache.set(key, fresh);
    } catch {
      snapshotCache.set(key, null);
    }
  }
  return snapshotCache.get(key) ?? null;
}

export default function FormRunner(props: Props) {
  const key = `tf:${props.slug}`;
  const off = !!props.preview || !!props.embedded || props.settings.autosave === false;
  // The first client read is cached, so later saves never remount the form mid-answer.
  const raw = useSyncExternalStore(subscribeNone, () => (off ? null : readSaved(key)), () => null);
  const initial = useMemo<Saved | null>(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Saved & { t?: number };
      const ok =
        typeof v.rid === "string" &&
        v.answers && typeof v.answers === "object" &&
        Array.isArray(v.hist) && v.hist.every((n) => Number.isInteger(n) && n >= 0 && n < props.fields.length) &&
        Number.isInteger(v.step) && v.step >= 0 && v.step < props.fields.length;
      const vtok = v.vtok && typeof v.vtok === "object" ? v.vtok : undefined;
      return ok ? { rid: v.rid, answers: v.answers, hist: v.hist, step: v.step, vtok } : null;
    } catch {
      return null;
    }
  }, [raw, props.fields.length]);
  // "Start over" (brand click / Submit another response) remounts the form with a new session id
  const [round, setRound] = useState(0);
  const restart = useCallback(() => {
    if (!off) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // storage unavailable
      }
      snapshotCache.set(key, null);
    }
    setRound((r) => r + 1);
  }, [key, off]);
  const start = round > 0 ? null : initial;
  return <RunnerInner key={`${start ? "resumed" : "fresh"}-${round}`} {...props} initial={start} onRestart={restart} />;
}
