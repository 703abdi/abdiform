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
import type { NewFormInput, NewResponseInput, FormPatch } from "@/forms/repo-types";

interface Shape {
  forms: Form[];
  responses: FormResponse[];
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
