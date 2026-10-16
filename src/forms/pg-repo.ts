// Forms + responses storage (Postgres). Connection handling and migrations live in @/lib/db.

import type { Form, FormResponse, LeadStatus } from "@/forms/types";
import { withDefaults } from "@/forms/lib";
import type { NewFormInput, NewResponseInput, FormPatch, WebResponseInput } from "@/forms/repo-types";
import { iso, isUuid, json, q, type Row } from "@/lib/db";

/** Counts a hit for `key` in the current time window; true once `max` is exceeded. Works across all server instances. */
export async function rateLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  const win = Math.floor(Date.now() / (windowSec * 1000)) * windowSec;
  const [r] = await q(
    `insert into rate_limits (key, window_start, n) values ($1, to_timestamp($2), 1)
     on conflict (key, window_start) do update set n = rate_limits.n + 1 returning n`,
    [key, win],
  );
  if (Math.random() < 0.02) await q(`delete from rate_limits where window_start < now() - interval '2 hours'`);
  return Number(r?.n ?? 0) > max;
}

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
    workspace_id: (r.workspace_id as string | null) ?? null,
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
    contact_id: (r.contact_id as string | null) ?? null,
  };
}

export async function listForms(): Promise<Form[]> {
  return (await q(`select * from forms order by created_at desc`)).map(toForm);
}
export async function getForm(id: string): Promise<Form | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select * from forms where id = $1`, [id]);
  return r ? toForm(r) : null;
}
export async function getFormBySlug(slug: string): Promise<Form | null> {
  const [r] = await q(`select * from forms where slug = $1`, [slug]);
  return r ? toForm(r) : null;
}
export async function createForm(input: NewFormInput): Promise<Form> {
  const [r] = await q(
    `insert into forms (slug, title, description, status, fields, settings, workspace_id)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb,
       coalesce($7::uuid, (select id from workspaces order by created_at limit 1))) returning *`,
    [
      input.slug,
      input.title,
      input.description ?? "",
      input.status ?? "draft",
      json(input.fields),
      json(withDefaults(input.settings)),
      input.workspace_id ?? null,
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
       fields = $6::jsonb, settings = $7::jsonb, workspace_id = coalesce($8::uuid, workspace_id), updated_at = now()
     where id = $1 returning *`,
    [id, next.slug, next.title, next.description, next.status, json(next.fields), json(next.settings), patch.workspace_id ?? null],
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

/** Create or update the in-progress/completed response for one applicant session. */
export async function saveWebResponse(formId: string, key: string, input: WebResponseInput): Promise<string | null> {
  const rows = await q(
    `insert into form_responses (form_id, answers, source, external_id, meta)
     values ($1, $2::jsonb, 'web', $3, $4::jsonb)
     on conflict (form_id, external_id) do update
       set answers = excluded.answers, meta = excluded.meta, submitted_at = now()
       where $5::boolean = false or (form_responses.meta->>'partial') = 'true'
     returning id`,
    [formId, json(input.answers), `web:${key}`, json({ ...input.meta, partial: input.partial }), input.partial],
  );
  return (rows[0]?.id as string) ?? null;
}

export async function getResponse(id: string): Promise<FormResponse | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select * from form_responses where id = $1`, [id]);
  return r ? toResponse(r) : null;
}

export async function setResponseContact(responseId: string, contactId: string): Promise<void> {
  await q(`update form_responses set contact_id = $2 where id = $1`, [responseId, contactId]);
}

export async function countCompleted(formId: string): Promise<number> {
  const [r] = await q(
    `select count(*)::int as n from form_responses where form_id = $1 and (meta->>'partial') is distinct from 'true'`,
    [formId],
  );
  return Number(r?.n ?? 0);
}

const uuids = (ids: string[]) => ids.filter(isUuid);
export async function bulkUpdateStatus(ids: string[], status: LeadStatus): Promise<void> {
  const ok = uuids(ids);
  if (ok.length) await q(`update form_responses set status = $2 where id = any($1::uuid[])`, [ok, status]);
}
export async function bulkDelete(ids: string[]): Promise<void> {
  const ok = uuids(ids);
  if (ok.length) await q(`delete from form_responses where id = any($1::uuid[])`, [ok]);
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
  const [r] = await q(
    `insert into form_files (form_id, name, mime, size, data) values ($1, $2, $3, $4, $5) returning id`,
    [f.form_id, f.name, f.mime, f.size, f.data],
  );
  return r.id as string;
}
export async function getFile(id: string): Promise<StoredFile | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select * from form_files where id = $1`, [id]);
  return r ? ({ id: r.id, form_id: r.form_id, name: r.name, mime: r.mime, size: Number(r.size), data: r.data as Buffer } as StoredFile) : null;
}
export async function filesExist(formId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  if (!ids.every(isUuid)) return false;
  const [r] = await q(`select count(*)::int as n from form_files where form_id = $1 and id = any($2::uuid[])`, [formId, ids]);
  return Number(r?.n ?? 0) === new Set(ids).size;
}
