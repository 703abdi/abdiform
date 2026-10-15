// Server-side validation of a public submission against the form's fields.
// Never trust the client: unknown ids are dropped, types are coerced/checked.

import type { AnswerValue, Answers, Field } from "@/forms/types";
import { flattenFields, isAnswerable, isEmptyAnswer, scaleRange } from "@/forms/lib";
import { NONE_LABEL } from "@/forms/types";
import { FILE_ANSWER } from "@/forms/files";
import { resolvePath } from "@/forms/logic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TEXT = 5000;

export function validateSubmission(
  allFields: Field[],
  raw: unknown,
  opts: { partial?: boolean } = {},
):
  | { ok: true; answers: Answers; ending: string }
  | { ok: false; errors: Record<string, string> } {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  // Only questions the applicant would actually have seen (logic may skip some).
  const { visited, ending } = resolvePath(allFields, input as Answers);
  const fields = flattenFields(opts.partial ? allFields : visited);

  for (const f of fields) {
    if (!isAnswerable(f)) continue;
    const v = input[f.id] as AnswerValue | undefined;

    if (isEmptyAnswer(v) && !((f.type === "yes_no" || f.type === "legal") && typeof v === "boolean")) {
      if (f.required && !opts.partial) errors[f.id] = "This question is required.";
      continue;
    }

    switch (f.type) {
      case "short_text":
      case "long_text": {
        if (typeof v !== "string") break;
        const t = v.trim();
        if (f.max_chars && t.length > f.max_chars) errors[f.id] = `Keep it under ${f.max_chars} characters.`;
        else answers[f.id] = t.slice(0, MAX_TEXT);
        break;
      }
      case "email": {
        const s = typeof v === "string" ? v.trim() : "";
        if (!EMAIL_RE.test(s)) errors[f.id] = "Enter a valid email address.";
        else answers[f.id] = s.slice(0, 254);
        break;
      }
      case "phone": {
        const s = typeof v === "string" ? v.trim() : "";
        const digits = s.replace(/\D/g, "");
        if (digits.length < 7 || digits.length > 15 || !/^[+\d\s().-]+$/.test(s))
          errors[f.id] = "Enter a valid phone number.";
        else answers[f.id] = s.slice(0, 32);
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) errors[f.id] = "Enter a number.";
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
          errors[f.id] = f.min !== undefined && f.max !== undefined ? `Enter a number between ${f.min} and ${f.max}.` : f.min !== undefined ? `Enter a number of at least ${f.min}.` : `Enter a number no higher than ${f.max}.`;
        else answers[f.id] = n;
        break;
      }
      case "url": {
        const s = typeof v === "string" ? v.trim() : "";
        try {
          const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
          if (!u.hostname.includes(".")) throw new Error("bad");
          answers[f.id] = s.slice(0, 500);
        } catch {
          errors[f.id] = "Enter a valid web address.";
        }
        break;
      }
      case "multiple_choice":
      case "dropdown": {
        const s = typeof v === "string" ? v.trim() : "";
        const ok = (f.choices ?? []).includes(s) || (f.allow_other && s.length > 0) || (f.none_of_the_above && s === NONE_LABEL);
        if (!ok) errors[f.id] = "Pick one of the options.";
        else answers[f.id] = s.slice(0, 200);
        break;
      }
      case "checkboxes": {
        const arr = Array.isArray(v) ? v.map((x) => String(x).trim()) : [];
        const known = (x: string) => (f.choices ?? []).includes(x) || (f.allow_other && x) || (f.none_of_the_above && x === NONE_LABEL);
        const ok = arr.length > 0 && arr.every(known);
        const min = f.min_selections ?? 1;
        if (!ok) errors[f.id] = "Pick at least one option.";
        else if (arr.length < min) errors[f.id] = `Pick at least ${min} options.`;
        else if (f.max_selections && arr.length > f.max_selections) errors[f.id] = `Pick no more than ${f.max_selections} options.`;
        else answers[f.id] = arr.slice(0, 30).map((x) => x.slice(0, 200));
        break;
      }
      case "yes_no": {
        if (typeof v !== "boolean") errors[f.id] = "Choose yes or no.";
        else answers[f.id] = v;
        break;
      }
      case "rating": {
        const n = Number(v);
        const max = f.steps ?? 5;
        if (!Number.isInteger(n) || n < 1 || n > max)
          errors[f.id] = `Pick a rating from 1 to ${max}.`;
        else answers[f.id] = n;
        break;
      }
      case "scale": {
        const n = Number(v);
        const { lo, hi } = scaleRange(f);
        if (!Number.isInteger(n) || n < lo || n > hi) errors[f.id] = `Pick a number from ${lo} to ${hi}.`;
        else answers[f.id] = n;
        break;
      }
      case "file_upload": {
        if (typeof v !== "string" || !FILE_ANSWER.test(v)) errors[f.id] = "Upload a file.";
        else answers[f.id] = v;
        break;
      }
      case "matrix": {
        const arr = Array.isArray(v) ? v.map(String) : [];
        const rows = f.rows ?? [];
        const cols = f.choices ?? [];
        const picked = new Map<string, string>();
        for (const x of arr) {
          const [r, c] = x.split("::");
          if (rows.includes(r) && cols.includes(c)) picked.set(r, c);
        }
        if (rows.some((r) => !picked.has(r))) errors[f.id] = "Answer every row.";
        else answers[f.id] = rows.map((r) => `${r}::${picked.get(r)}`);
        break;
      }
      case "legal": {
        if (v !== true && v !== "true") {
          if (f.required) errors[f.id] = "You need to accept to continue.";
        } else answers[f.id] = true;
        break;
      }
      case "picture_choice": {
        const s = typeof v === "string" ? v.trim() : "";
        if (!(f.choices ?? []).includes(s)) errors[f.id] = "Pick one of the options.";
        else answers[f.id] = s;
        break;
      }
      case "ranking": {
        const arr = Array.isArray(v) ? v.map(String) : [];
        const want = f.choices ?? [];
        if (arr.length !== want.length || !want.every((c) => arr.includes(c))) errors[f.id] = "Put every option in order.";
        else answers[f.id] = arr;
        break;
      }
      case "date": {
        const s = typeof v === "string" ? v : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
          errors[f.id] = "Pick a valid date.";
        else answers[f.id] = s;
        break;
      }
    }
  }

  // Partial saves keep whatever is valid and ignore the rest.
  if (opts.partial) return { ok: true, answers, ending };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers, ending };
}
