// Postgres-backed datastore. Works with any Postgres via DATABASE_URL
// (Supabase, Neon, Railway...). Tables are created automatically on first use,
// so there is no separate SQL step.

import postgres from "postgres";
import type { Form, FormResponse, LeadStatus } from "@/forms/types";
import { withDefaults } from "@/forms/lib";
import type { NewFormInput, NewResponseInput, FormPatch } from "@/forms/repo-types";

type Sql = ReturnType<typeof postgres>;
const G = "__tawakkul_forms_pg__";

/**
 * Split DATABASE_URL by hand so passwords containing characters like ? # / @ %
 * work without URL-encoding (Supabase passwords often have them).
 */
function connectionOptions(url: string) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]*)/);
  if (!m) return null;
  const [, user, password, host, port, database] = m;
  return { host, port: port ? Number(port) : 5432, user, password, database: database || "postgres" };
}

function client(): Sql {
  const g = globalThis as unknown as Record<string, Sql | undefined>;
  if (g[G]) return g[G]!;
  const url = process.env.DATABASE_URL!;
  const local = /localhost|127\.0\.0\.1/.test(url);
  const opts = {
    ssl: local ? (false as const) : ("require" as const),
    prepare: false, // required for Supabase's transaction pooler
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    onnotice: () => {},
  };
  const parts = connectionOptions(url);
  g[G] = parts ? postgres({ ...parts, ...opts }) : postgres(url, opts);
  return g[G]!;
}

let ready: Promise<void> | null = null;
function db(): Promise<Sql> {
  const sql = client();
  ready ??= (async () => {
    await sql`create table if not exists forms (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      title text not null,
      description text not null default '',
      status text not null default 'draft',
      fields jsonb not null default '[]'::jsonb,
      settings jsonb not null default '{}'::jsonb,
      views integer not null default 0,
      starts integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists form_responses (
      id uuid primary key default gen_random_uuid(),
      form_id uuid not null references forms(id) on delete cascade,
      answers jsonb not null default '{}'::jsonb,
      submitted_at timestamptz not null default now(),
      source text not null default 'web',
      external_id text,
      status text not null default 'new',
      notes text not null default '',
      meta jsonb not null default '{}'::jsonb,
      unique (form_id, external_id)
    )`;
    await sql`create index if not exists form_responses_form_idx on form_responses (form_id, submitted_at desc)`;
    // Lock the tables from Supabase's public REST API; this app talks to Postgres directly.
    try {
      await sql`alter table forms enable row level security`;
      await sql`alter table form_responses enable row level security`;
    } catch {
      // not Supabase / no permission: fine
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready.then(() => sql);
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

function toForm(r: Row): Form {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    status: r.status as Form["status"],
    fields: (r.fields as Form["fields"]) ?? [],
    settings: withDefaults(r.settings as Form["settings"]),
    views: Number(r.views ?? 0),
    starts: Number(r.starts ?? 0),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}
function toResponse(r: Row): FormResponse {
  return {
    id: r.id as string,
    form_id: r.form_id as string,
    answers: (r.answers as FormResponse["answers"]) ?? {},
    submitted_at: iso(r.submitted_at),
    source: r.source as FormResponse["source"],
    external_id: (r.external_id as string | null) ?? null,
    status: r.status as LeadStatus,
    notes: (r.notes as string) ?? "",
    meta: (r.meta as FormResponse["meta"]) ?? {},
  };
}

export async function listForms(): Promise<Form[]> {
  const sql = await db();
  return (await sql`select * from forms order by created_at desc`).map(toForm);
}
export async function getForm(id: string): Promise<Form | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = await db();
  const [r] = await sql`select * from forms where id = ${id}`;
  return r ? toForm(r) : null;
}
export async function getFormBySlug(slug: string): Promise<Form | null> {
  const sql = await db();
  const [r] = await sql`select * from forms where slug = ${slug}`;
  return r ? toForm(r) : null;
}
export async function createForm(input: NewFormInput): Promise<Form> {
  const sql = await db();
  const [r] = await sql`insert into forms (slug, title, description, status, fields, settings)
    values (${input.slug}, ${input.title}, ${input.description ?? ""}, ${input.status ?? "draft"},
      ${sql.json(input.fields as never)}, ${sql.json(withDefaults(input.settings) as never)})
    returning *`;
  return toForm(r);
}
export async function updateForm(id: string, patch: FormPatch): Promise<Form | null> {
  const sql = await db();
  const cur = await getForm(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, settings: patch.settings ? withDefaults(patch.settings) : cur.settings };
  const [r] = await sql`update forms set slug = ${next.slug}, title = ${next.title},
    description = ${next.description}, status = ${next.status},
    fields = ${sql.json(next.fields as never)}, settings = ${sql.json(next.settings as never)},
    updated_at = now() where id = ${id} returning *`;
  return r ? toForm(r) : null;
}
export async function deleteForm(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from forms where id = ${id}`;
}
export async function bumpCounter(id: string, key: "views" | "starts"): Promise<void> {
  const sql = await db();
  if (key === "views") await sql`update forms set views = views + 1 where id = ${id}`;
  else await sql`update forms set starts = starts + 1 where id = ${id}`;
}

export async function listResponses(formId?: string): Promise<FormResponse[]> {
  const sql = await db();
  const rows = formId
    ? await sql`select * from form_responses where form_id = ${formId} order by submitted_at desc`
    : await sql`select * from form_responses order by submitted_at desc`;
  return rows.map(toResponse);
}
export async function addResponses(
  formId: string,
  rows: NewResponseInput[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const sql = await db();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({
      form_id: formId,
      answers: sql.json(r.answers as never),
      source: r.source,
      external_id: r.external_id ?? null,
      submitted_at: r.submitted_at ?? new Date().toISOString(),
      meta: sql.json((r.meta ?? {}) as never),
    }));
    const res = await sql`insert into form_responses ${sql(chunk as never)}
      on conflict (form_id, external_id) do nothing returning id`;
    inserted += res.length;
  }
  return { inserted, skipped: rows.length - inserted };
}
export async function updateResponse(
  id: string,
  patch: { status?: LeadStatus; notes?: string },
): Promise<void> {
  const sql = await db();
  if (patch.status) await sql`update form_responses set status = ${patch.status} where id = ${id}`;
  if (patch.notes !== undefined) await sql`update form_responses set notes = ${patch.notes} where id = ${id}`;
}
export async function deleteResponse(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from form_responses where id = ${id}`;
}
