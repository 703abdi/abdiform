// Typeform import: Responses API (token + form id) and CSV export.
// The personal access token is used for the duration of one request and is
// never stored or logged.

import Papa from "papaparse";
import type { AnswerValue, Answers, Field, FieldType, ResponseMeta } from "@/forms/types";
import type { NewResponseInput } from "@/forms/repo-types";
import { flattenFields, newId } from "@/forms/lib";

/* ----------------------------- API import ----------------------------- */

interface TfField {
  id: string;
  ref?: string;
  title?: string;
  type: string;
  properties?: {
    description?: string;
    choices?: { label?: string }[];
    allow_multiple_selection?: boolean;
    allow_other_choice?: boolean;
    steps?: number;
    fields?: TfField[];
  };
  validations?: { required?: boolean };
}

interface TfDefinition {
  id: string;
  title: string;
  fields?: TfField[];
}

interface TfAnswer {
  field: { id: string; ref?: string; type?: string };
  type: string;
  text?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  url?: string;
  date?: string;
  file_url?: string;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[]; other?: string };
}

interface TfItem {
  token: string;
  landing_id?: string;
  landed_at?: string;
  submitted_at?: string;
  answers?: TfAnswer[] | null;
  metadata?: { user_agent?: string; referer?: string };
  hidden?: Record<string, string>;
  calculated?: { score?: number };
}

const TYPE_MAP: Record<string, FieldType> = {
  short_text: "short_text",
  long_text: "long_text",
  email: "email",
  phone_number: "phone",
  number: "number",
  website: "url",
  multiple_choice: "multiple_choice",
  picture_choice: "multiple_choice",
  dropdown: "dropdown",
  yes_no: "yes_no",
  legal: "yes_no",
  rating: "rating",
  opinion_scale: "scale",
  nps: "scale",
  date: "date",
  statement: "statement",
};

// Container types whose children are the real questions (contact info, address, groups).
const CONTAINERS = new Set(["group", "contact_info", "address"]);
// Embeds/widgets with no answer to collect; the new form can't render them.
const SKIPPED = new Set(["calendly", "payment", "ranking", "matrix", "file_upload", "multi_format"]);

function leaves(fields: TfField[]): TfField[] {
  return fields.flatMap((f) =>
    CONTAINERS.has(f.type) && f.properties?.fields ? leaves(f.properties.fields) : [f],
  );
}

export function mapDefinition(def: TfDefinition): Field[] {
  // Typeform titles recall earlier answers by ref ({{field:REF}}); we key by field id.
  const refToId = new Map(leaves(def.fields ?? []).filter((f) => f.ref).map((f) => [f.ref as string, f.id]));
  const recall = (t: string) =>
    t.replace(/\{\{field:([^}]+)\}\}/g, (_, ref: string) => (refToId.has(ref) ? `{{field:${refToId.get(ref)}}}` : ""));
  const clean = (t: string) => recall(t).replace(/[ \t]+/g, " ").trim(); // keep *bold*, _italic_ and [links](url)

  const mapOne = (f: TfField): Field | null => {
    if (SKIPPED.has(f.type)) return null;
    if (CONTAINERS.has(f.type)) {
      const kids = (f.properties?.fields ?? []).map(mapOne).filter((x): x is Field => !!x);
      if (kids.length === 0) return null;
      return {
        id: f.id,
        type: "group",
        title: clean(f.title ?? "") || "Your details",
        description: f.properties?.description || undefined,
        required: false,
        fields: kids,
      };
    }
    let type: FieldType = TYPE_MAP[f.type] ?? "short_text";
    if ((f.type === "multiple_choice" || f.type === "picture_choice") && f.properties?.allow_multiple_selection)
      type = "checkboxes";
    const choices = (f.properties?.choices ?? []).map((c) => c.label ?? "").filter(Boolean);
    const field: Field = {
      id: f.id,
      type,
      title: clean(f.title ?? "") || "Untitled question",
      description: f.properties?.description || undefined,
      required: !!f.validations?.required,
    };
    if (choices.length && ["multiple_choice", "checkboxes", "dropdown"].includes(type)) {
      field.choices = choices;
      field.allow_other = !!f.properties?.allow_other_choice;
    }
    if (type === "rating") field.steps = Math.min(10, Math.max(3, f.properties?.steps ?? 5));
    return field;
  };

  return (def.fields ?? []).map(mapOne).filter((x): x is Field => !!x);
}

function mapAnswer(a: TfAnswer, field: Field | undefined): AnswerValue {
  switch (a.type) {
    case "text":
      return a.text ?? null;
    case "email":
      return a.email ?? null;
    case "phone_number":
      return a.phone_number ?? null;
    case "number":
      return a.number ?? null;
    case "boolean":
      return a.boolean ?? null;
    case "url":
      return a.url ?? null;
    case "date":
      return a.date ? a.date.slice(0, 10) : null;
    case "file_url":
      return a.file_url ?? null;
    case "choice": {
      const v = a.choice?.label ?? a.choice?.other ?? null;
      return field?.type === "checkboxes" && v ? [v] : v;
    }
    case "choices": {
      const arr = [...(a.choices?.labels ?? [])];
      if (a.choices?.other) arr.push(a.choices.other);
      return arr;
    }
    default:
      return a.text ?? null;
  }
}

export function mapItem(item: TfItem, fields: Field[], partial = false): NewResponseInput | null {
  const byId = new Map(flattenFields(fields).map((f) => [f.id, f]));
  const answers: Answers = {};
  for (const a of item.answers ?? []) {
    const f = byId.get(a.field.id);
    if (!f) continue;
    const v = mapAnswer(a, f);
    if (v !== null) answers[f.id] = v;
  }
  const meta: ResponseMeta = {};
  if (item.metadata?.user_agent) meta.user_agent = item.metadata.user_agent;
  if (item.metadata?.referer) meta.referrer = item.metadata.referer;
  if (item.hidden && Object.keys(item.hidden).length) meta.utm = item.hidden;
  if (typeof item.calculated?.score === "number") meta.score = item.calculated.score;
  if (partial) {
    meta.partial = true;
    if (Object.keys(answers).length === 0) return null; // nothing worth keeping
  }
  return {
    answers,
    source: "typeform",
    external_id: item.token,
    submitted_at: item.submitted_at ?? item.landed_at,
    meta,
  };
}

export class TypeformError extends Error {}

async function tfGet<T>(base: string, token: string, path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403)
    throw new TypeformError(
      "Typeform rejected the token. Create a personal access token with the forms:read and responses:read scopes.",
    );
  if (res.status === 404)
    throw new TypeformError(
      "Form not found. Check the form ID, and that the token's account owns it (and pick the EU region if your account is EU).",
    );
  if (!res.ok) throw new TypeformError(`Typeform returned ${res.status}.`);
  return (await res.json()) as T;
}

export function parseFormId(input: string): string {
  const s = input.trim();
  const m = s.match(/typeform\.com\/(?:to|forms)\/([A-Za-z0-9]+)/i);
  return m ? m[1] : s.replace(/[^A-Za-z0-9]/g, "");
}

export async function fetchTypeform(opts: {
  token: string;
  formId: string;
  eu: boolean;
}): Promise<{ title: string; fields: Field[]; items: NewResponseInput[] }> {
  const base = opts.eu ? "https://api.eu.typeform.com" : "https://api.typeform.com";
  const def = await tfGet<TfDefinition>(base, opts.token, `/forms/${opts.formId}`);
  const fields = mapDefinition(def);

  const items: NewResponseInput[] = [];
  for (const completed of [true, false]) {
    let before: string | undefined;
    for (let page = 0; page < 200; page++) {
      const qs = new URLSearchParams({ page_size: "1000", completed: String(completed) });
      if (before) qs.set("before", before);
      const res = await tfGet<{ items: TfItem[] }>(base, opts.token, `/forms/${opts.formId}/responses?${qs}`);
      for (const it of res.items) {
        const m = mapItem(it, fields, !completed);
        if (m) items.push(m);
      }
      if (res.items.length < 1000) break;
      before = res.items[res.items.length - 1].token;
    }
  }
  return { title: def.title, fields, items };
}

/* ----------------------------- CSV import ----------------------------- */

const META_COLS = new Set(
  [
    "#",
    "token",
    "start date (utc)",
    "stage date (utc)",
    "submit date (utc)",
    "network id",
    "tags",
    "landing date",
    "submitted at",
    "submitted_at",
    "date submitted",
    "timestamp",
    "id",
  ].map((s) => s.toLowerCase()),
);
const DATE_COLS = [
  "submit date (utc)",
  "submitted at",
  "submitted_at",
  "date submitted",
  "timestamp",
];

function inferType(title: string, values: string[]): FieldType {
  const vals = values.filter(Boolean);
  if (/e-?mail/i.test(title) || (vals.length && vals.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))))
    return "email";
  if (/phone|mobile|whatsapp|cell/i.test(title)) return "phone";
  if (vals.some((v) => v.length > 120 || v.includes("\n"))) return "long_text";
  return "short_text";
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { headers: (parsed.meta.fields ?? []).filter(Boolean), rows: parsed.data };
}

export function fieldsFromCsv(headers: string[], rows: Record<string, string>[]): Field[] {
  return headers
    .filter((h) => !META_COLS.has(h.toLowerCase()))
    .map((h) => ({
      id: newId("q"),
      type: inferType(h, rows.slice(0, 50).map((r) => (r[h] ?? "").trim())),
      title: h,
      required: false,
    }));
}

export function rowsToResponses(
  rows: Record<string, string>[],
  fields: Field[],
): NewResponseInput[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byTitle = new Map(fields.map((f) => [norm(f.title), f]));
  return rows.map((row, i) => {
    const answers: Answers = {};
    let submitted: string | undefined;
    let token: string | undefined;
    for (const [k, raw] of Object.entries(row)) {
      const key = norm(k);
      const val = (raw ?? "").trim();
      if (key === "token" && val) token = val;
      if (DATE_COLS.includes(key) && val && !submitted) {
        const d = new Date(val.includes("T") ? val : val.replace(" ", "T") + "Z");
        if (!Number.isNaN(d.getTime())) submitted = d.toISOString();
      }
      const f = byTitle.get(key);
      if (!f || !val) continue;
      if (f.type === "checkboxes") answers[f.id] = val.split(/\s*,\s*/);
      else if (f.type === "number") answers[f.id] = Number(val);
      else if (f.type === "yes_no") answers[f.id] = /^(yes|true|1|y)$/i.test(val);
      else if (f.type === "rating" || f.type === "scale") answers[f.id] = Number(val);
      else answers[f.id] = val;
    }
    return {
      answers,
      source: "csv" as const,
      external_id: token ?? `csv:${submitted ?? ""}:${i}:${JSON.stringify(answers).length}`,
      submitted_at: submitted,
    };
  });
}
