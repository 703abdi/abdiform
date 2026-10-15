// Local datastore (dev / no-Supabase fallback). Persists to .data/forms.json so
// leads survive dev-server restarts. On read-only hosts (e.g. Vercel without
// Supabase) writes fail silently and data lives in memory only, so production
// MUST set SUPABASE_SERVICE_ROLE_KEY and run supabase/forms_schema.sql.
// .data/ is gitignored because it contains lead PII.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Form, FormResponse, LeadStatus } from "@/forms/types";
import { withDefaults } from "@/forms/lib";
import type { NewFormInput, NewResponseInput, FormPatch, WebResponseInput } from "@/forms/repo-types";

interface Shape {
  forms: Form[];
  responses: FormResponse[];
  files?: { id: string; form_id: string; name: string; mime: string; size: number; data: string }[];
}

const G = "__tawakkul_forms_store__";
const FILE = path.join(process.cwd(), ".data", "forms.json");

function load(): Shape {
  const g = globalThis as unknown as Record<string, Shape | undefined>;
  if (g[G]) return g[G]!;
  let data: Shape = { forms: [], responses: [] };
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8")) as Shape;
  } catch {
    // first run or unreadable: start empty
  }
  g[G] = data;
  return data;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(load()));
  } catch {
    // read-only filesystem: keep in memory
  }
}

const now = () => new Date().toISOString();

export async function listForms(): Promise<Form[]> {
  return [...load().forms].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function getForm(id: string): Promise<Form | null> {
  return load().forms.find((f) => f.id === id) ?? null;
}
export async function getFormBySlug(slug: string): Promise<Form | null> {
  return load().forms.find((f) => f.slug === slug) ?? null;
}
export async function createForm(input: NewFormInput): Promise<Form> {
  const s = load();
  const form: Form = {
    id: randomUUID(),
    slug: input.slug,
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "draft",
    fields: input.fields,
    settings: withDefaults(input.settings),
    views: 0,
    starts: 0,
    created_at: now(),
    updated_at: now(),
  };
  s.forms.push(form);
  persist();
  return form;
}
export async function updateForm(id: string, patch: FormPatch): Promise<Form | null> {
  const f = load().forms.find((x) => x.id === id);
  if (!f) return null;
  Object.assign(f, patch, { updated_at: now() });
  if (patch.settings) f.settings = withDefaults(patch.settings);
  persist();
  return f;
}
export async function deleteForm(id: string): Promise<void> {
  const s = load();
  s.forms = s.forms.filter((f) => f.id !== id);
  s.responses = s.responses.filter((r) => r.form_id !== id);
  persist();
}
export async function bumpCounter(id: string, key: "views" | "starts"): Promise<void> {
  const f = load().forms.find((x) => x.id === id);
  if (!f) return;
  f[key] += 1;
  persist();
}

export async function listResponses(formId?: string): Promise<FormResponse[]> {
  return load()
    .responses.filter((r) => !formId || r.form_id === formId)
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}
export async function addResponses(
  formId: string,
  rows: NewResponseInput[],
): Promise<{ inserted: number; skipped: number }> {
  const s = load();
  const seen = new Set(
    s.responses
      .filter((r) => r.form_id === formId && r.external_id)
      .map((r) => r.external_id as string),
  );
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.external_id && seen.has(row.external_id)) {
      skipped++;
      continue;
    }
    if (row.external_id) seen.add(row.external_id);
    s.responses.push({
      id: randomUUID(),
      form_id: formId,
      answers: row.answers,
      submitted_at: row.submitted_at ?? now(),
      source: row.source,
      external_id: row.external_id ?? null,
      status: "new",
      notes: "",
      meta: row.meta ?? {},
    });
    inserted++;
  }
  persist();
  return { inserted, skipped };
}
export async function updateResponse(
  id: string,
  patch: { status?: LeadStatus; notes?: string },
): Promise<void> {
  const r = load().responses.find((x) => x.id === id);
  if (!r) return;
  if (patch.status) r.status = patch.status;
  if (patch.notes !== undefined) r.notes = patch.notes;
  persist();
}
export async function deleteResponse(id: string): Promise<void> {
  const s = load();
  s.responses = s.responses.filter((r) => r.id !== id);
  persist();
}

/** Create or update the in-progress/completed response for one applicant session. */
export async function saveWebResponse(formId: string, key: string, input: WebResponseInput): Promise<void> {
  const s = load();
  const ext = `web:${key}`;
  const r = s.responses.find((x) => x.form_id === formId && x.external_id === ext);
  if (r) {
    if (input.partial && !r.meta.partial) return; // never downgrade a finished response
    r.answers = input.answers;
    r.meta = { ...r.meta, ...input.meta, partial: input.partial };
    r.submitted_at = now();
  } else {
    s.responses.push({
      id: randomUUID(),
      form_id: formId,
      answers: input.answers,
      submitted_at: now(),
      source: "web",
      external_id: ext,
      status: "new",
      notes: "",
      meta: { ...input.meta, partial: input.partial },
    });
  }
  persist();
}

export async function countCompleted(formId: string): Promise<number> {
  return load().responses.filter((r) => r.form_id === formId && r.meta?.partial !== true).length;
}

export async function bulkUpdateStatus(ids: string[], status: LeadStatus): Promise<void> {
  const set = new Set(ids);
  for (const r of load().responses) if (set.has(r.id)) r.status = status;
  persist();
}
export async function bulkDelete(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const s = load();
  s.responses = s.responses.filter((r) => !set.has(r.id));
  persist();
}

export interface StoredFile {
  id: string;
  form_id: string;
  name: string;
  mime: string;
  size: number;
  data: Buffer;
}
export async function saveFile(f: Omit<StoredFile, "id">): Promise<string> {
  const s = load();
  const id = randomUUID();
  (s.files ??= []).push({ id, form_id: f.form_id, name: f.name, mime: f.mime, size: f.size, data: f.data.toString("base64") });
  persist();
  return id;
}
export async function getFile(id: string): Promise<StoredFile | null> {
  const r = load().files?.find((x) => x.id === id);
  return r ? { ...r, data: Buffer.from(r.data, "base64") } : null;
}
export async function filesExist(formId: string, ids: string[]): Promise<boolean> {
  const have = new Set((load().files ?? []).filter((f) => f.form_id === formId).map((f) => f.id));
  return ids.every((i) => have.has(i));
}

const rl = new Map<string, number>();
export async function rateLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const k = `${key}:${win}`;
  rl.set(k, (rl.get(k) ?? 0) + 1);
  if (rl.size > 5000) rl.clear();
  return (rl.get(k) ?? 0) > max;
}
