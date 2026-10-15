// Postgres-backed datastore. Works with any Postgres via DATABASE_URL
// (Supabase, Neon, Railway...). Tables are created automatically on first use,
// so there is no separate SQL step.
//
// Uses node-postgres with Vercel's attachDatabasePool so idle connections are
// closed cleanly before a serverless function is suspended (a stale socket there
// otherwise makes the next request hang). Every query also has a hard timeout.

import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import type { Form, FormResponse, LeadStatus } from "@/forms/types";
import { withDefaults } from "@/forms/lib";
import type { NewFormInput, NewResponseInput, FormPatch } from "@/forms/repo-types";

const G = "__tawakkul_forms_pg__";

/**
 * Split DATABASE_URL by hand so passwords containing characters like ? # / @ %
 * work without URL-encoding (Supabase passwords often have them).
 */
function connectionOptions(url: string) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]*)/);
  if (!m) return { connectionString: url };
  const [, user, password, host, port, database] = m;
  return { host, port: port ? Number(port) : 5432, user, password, database: database || "postgres" };
}

function pool(): Pool {
  const g = globalThis as unknown as Record<string, Pool | undefined>;
  if (g[G]) return g[G]!;
  const url = process.env.DATABASE_URL!;
  const local = /localhost|127\.0\.0\.1/.test(url);
  const p = new Pool({
    ...connectionOptions(url),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
  p.on("error", () => {
    // an idle client died; the pool discards it and opens a new one on demand
  });
  if (process.env.VERCEL) attachDatabasePool(p);
  g[G] = p;
  return p;
}

let ready: Promise<void> | null = null;
async function q(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const p = pool();
  ready ??= (async () => {
    await p.query(`create table if not exists forms (
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
    )`);
    await p.query(`create table if not exists form_responses (
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
    )`);
    await p.query(
      `create index if not exists form_responses_form_idx on form_responses (form_id, submitted_at desc)`,
    );
  })().catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  return (await p.query(text, params)).rows;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const json = (v: unknown) => JSON.stringify(v);

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
  return (await q(`select * from forms order by created_at desc`)).map(toForm);
}
export async function getForm(id: string): Promise<Form | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await q(`select * from forms where id = $1`, [id]);
  return r ? toForm(r) : null;
}
export async function getFormBySlug(slug: string): Promise<Form | null> {
  const [r] = await q(`select * from forms where slug = $1`, [slug]);
  return r ? toForm(r) : null;
}
export async function createForm(input: NewFormInput): Promise<Form> {
  const [r] = await q(
    `insert into forms (slug, title, description, status, fields, settings)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb) returning *`,
    [
      input.slug,
      input.title,
      input.description ?? "",
      input.status ?? "draft",
      json(input.fields),
      json(withDefaults(input.settings)),
    ],
  );
  return toForm(r);
}
export async function updateForm(id: string, patch: FormPatch): Promise<Form | null> {
  const cur = await getForm(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, settings: patch.settings ? withDefaults(patch.settings) : cur.settings };
  const [r] = await q(
    `update forms set slug = $2, title = $3, description = $4, status = $5,
       fields = $6::jsonb, settings = $7::jsonb, updated_at = now()
     where id = $1 returning *`,
    [id, next.slug, next.title, next.description, next.status, json(next.fields), json(next.settings)],
  );
  return r ? toForm(r) : null;
}
export async function deleteForm(id: string): Promise<void> {
  await q(`delete from forms where id = $1`, [id]);
}
export async function bumpCounter(id: string, key: "views" | "starts"): Promise<void> {
  if (key === "views") await q(`update forms set views = views + 1 where id = $1`, [id]);
  else await q(`update forms set starts = starts + 1 where id = $1`, [id]);
}

export async function listResponses(formId?: string): Promise<FormResponse[]> {
  const rows = formId
    ? await q(`select * from form_responses where form_id = $1 order by submitted_at desc`, [formId])
    : await q(`select * from form_responses order by submitted_at desc`);
  return rows.map(toResponse);
}
export async function addResponses(
  formId: string,
  rows: NewResponseInput[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk.map((r, n) => {
      const b = n * 6;
      params.push(
        formId,
        json(r.answers),
        r.source,
        r.external_id ?? null,
        r.submitted_at ?? new Date().toISOString(),
        json(r.meta ?? {}),
      );
      return `($${b + 1}, $${b + 2}::jsonb, $${b + 3}, $${b + 4}, $${b + 5}::timestamptz, $${b + 6}::jsonb)`;
    });
    const res = await q(
      `insert into form_responses (form_id, answers, source, external_id, submitted_at, meta)
       values ${values.join(", ")}
       on conflict (form_id, external_id) do nothing returning id`,
      params,
    );
    inserted += res.length;
  }
  return { inserted, skipped: rows.length - inserted };
}
export async function updateResponse(
  id: string,
  patch: { status?: LeadStatus; notes?: string },
): Promise<void> {
  if (patch.status) await q(`update form_responses set status = $2 where id = $1`, [id, patch.status]);
  if (patch.notes !== undefined) await q(`update form_responses set notes = $2 where id = $1`, [id, patch.notes]);
}
export async function deleteResponse(id: string): Promise<void> {
  await q(`delete from form_responses where id = $1`, [id]);
}
