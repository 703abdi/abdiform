// Pure helpers shared by server + client (no I/O).

import type {
  AnswerValue,
  Field,
  Form,
  FormResponse,
  FormSettings,
} from "@/forms/types";
import { DEFAULT_SETTINGS } from "@/forms/types";

export function newId(prefix = "q"): string {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${r}`;
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "form";
}

export function withDefaults(s: Partial<FormSettings> | undefined): FormSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export function isAnswerable(f: Field): boolean {
  return f.type !== "statement";
}

export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Human-readable single-line rendering of an answer. */
export function formatAnswer(f: Field | undefined, v: AnswerValue | undefined): string {
  if (isEmptyAnswer(v)) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (f?.type === "rating" && typeof v === "number") return `${v} / ${f.steps ?? 5}`;
  if (f?.type === "scale" && typeof v === "number") return `${v} / 10`;
  return String(v);
}

/** Pull the lead's identity out of whatever questions the form asks. */
export function leadIdentity(form: Pick<Form, "fields">, r: Pick<FormResponse, "answers">) {
  const get = (f?: Field) => (f ? formatAnswer(f, r.answers[f.id]) : "");
  const emailField = form.fields.find((f) => f.type === "email");
  const phoneField = form.fields.find((f) => f.type === "phone");
  const nameField =
    form.fields.find(
      (f) => f.type === "short_text" && /name/i.test(f.title),
    ) ?? form.fields.find((f) => f.type === "short_text");
  return {
    name: get(nameField),
    email: get(emailField),
    phone: get(phoneField),
  };
}

export const STATUS_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "red"> = {
  new: "blue",
  contacted: "amber",
  qualified: "purple",
  won: "green",
  lost: "red",
};
