// Server-side validation of a public submission against the form's fields.
// Never trust the client: unknown ids are dropped, types are coerced/checked.

import type { AnswerValue, Answers, Field } from "@/forms/types";
import { isAnswerable, isEmptyAnswer } from "@/forms/lib";
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
  const fields = opts.partial ? allFields : visited;

  for (const f of fields) {
    if (!isAnswerable(f)) continue;
    const v = input[f.id] as AnswerValue | undefined;

    if (isEmptyAnswer(v) && !(f.type === "yes_no" && typeof v === "boolean")) {
      if (f.required && !opts.partial) errors[f.id] = "This question is required.";
      continue;
    }

    switch (f.type) {
      case "short_text":
      case "long_text": {
        if (typeof v !== "string") break;
        answers[f.id] = v.trim().slice(0, MAX_TEXT);
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
        const ok = (f.choices ?? []).includes(s) || (f.allow_other && s.length > 0);
        if (!ok) errors[f.id] = "Pick one of the options.";
        else answers[f.id] = s.slice(0, 200);
        break;
      }
      case "checkboxes": {
        const arr = Array.isArray(v) ? v.map((x) => String(x).trim()) : [];
        const ok =
          arr.length > 0 &&
          arr.every((x) => (f.choices ?? []).includes(x) || (f.allow_other && x));
        if (!ok) errors[f.id] = "Pick at least one option.";
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
        if (!Number.isInteger(n) || n < 0 || n > 10)
          errors[f.id] = "Pick a number from 0 to 10.";
        else answers[f.id] = n;
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
