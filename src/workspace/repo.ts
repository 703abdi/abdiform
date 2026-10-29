// Workspaces (folders of forms) and the per-form stats shown on the Forms home page.

import { iso, isUuid, q } from "@/lib/db";

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  form_count: number;
}

export interface FormListItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  responses: number; // every response, finished or not
  completed: number; // finished responses
  starts: number; // starts recorded here plus imported history
  views: number;
  last_response_at: string | null;
  integrations: string[]; // "webhook" | "email" | "calendly"
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await q(
    `select w.*, (select count(*)::int from forms f where f.workspace_id = w.id) as form_count
     from workspaces w order by w.created_at`,
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, created_at: iso(r.created_at), form_count: Number(r.form_count) }));
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const [r] = await q(`insert into workspaces (name) values ($1) returning *`, [name.trim().slice(0, 80) || "Untitled workspace"]);
  return { id: r.id as string, name: r.name as string, created_at: iso(r.created_at), form_count: 0 };
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  if (!isUuid(id)) return;
  await q(`update workspaces set name = $2 where id = $1`, [id, name.trim().slice(0, 80) || "Untitled workspace"]);
}

/** Deleting a workspace moves its forms to the first remaining workspace (forms are never deleted this way). */
export async function deleteWorkspace(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const [{ n }] = (await q(`select count(*)::int as n from workspaces`)) as { n: number }[];
  if (n <= 1) throw new Error("You need at least one workspace.");
  await q(
    `update forms set workspace_id = (select id from workspaces where id <> $1 order by created_at limit 1) where workspace_id = $1`,
    [id],
  );
  await q(`delete from workspaces where id = $1`, [id]);
}

export async function moveForm(formId: string, workspaceId: string): Promise<void> {
  if (!isUuid(formId) || !isUuid(workspaceId)) return;
  await q(`update forms set workspace_id = $2, updated_at = now() where id = $1`, [formId, workspaceId]);
}

export async function renameForm(formId: string, title: string, newSlug?: string): Promise<string | null> {
  if (!isUuid(formId)) return null;
  await q(`update forms set title = $2, updated_at = now() where id = $1`, [formId, title.trim().slice(0, 200) || "Untitled form"]);
  if (!newSlug) return null;
  const [cur] = await q(`select slug, settings from forms where id = $1`, [formId]);
  if (!cur || cur.slug === newSlug) return (cur?.slug as string) ?? null;
  const [taken] = await q(`select id from forms where slug = $1 and id <> $2`, [newSlug, formId]);
  if (taken) throw new Error(`The link "${newSlug}" is already used by another form.`);
  const olds = new Set<string>(((cur.settings as { old_slugs?: string[] })?.old_slugs ?? []));
  olds.add(cur.slug as string);
  olds.delete(newSlug);
  await q(`update forms set slug = $2, settings = jsonb_set(settings, '{old_slugs}', $3::jsonb), updated_at = now() where id = $1`, [
    formId,
    newSlug,
    JSON.stringify([...olds].slice(-20)),
  ]);
  return newSlug;
}

export async function listFormsWithStats(): Promise<FormListItem[]> {
  const rows = await q(
    `select f.id, f.slug, f.title, f.status, f.workspace_id, f.created_at, f.updated_at, f.views, f.starts, f.settings,
       coalesce(s.responses, 0) as responses, coalesce(s.completed, 0) as completed, s.last_at
     from forms f
     left join (
       select form_id, count(*)::int as responses,
         count(*) filter (where (meta->>'partial') is distinct from 'true')::int as completed,
         max(submitted_at) as last_at
       from form_responses group by form_id
     ) s on s.form_id = f.id
     order by f.created_at desc`,
  );
  return rows.map((r) => {
    const st = (r.settings ?? {}) as Record<string, unknown> & { history?: { views?: number; starts?: number } };
    const integrations: string[] = [];
    if (st.webhook_url) integrations.push("webhook");
    if (st.notify_email) integrations.push("email");
    if (st.thank_you_calendly_url || (Array.isArray(st.endings) && (st.endings as { calendly_url?: string }[]).some((e) => e.calendly_url)))
      integrations.push("calendly");
    return {
      id: r.id as string,
      slug: r.slug as string,
      title: r.title as string,
      status: r.status as string,
      workspace_id: (r.workspace_id as string | null) ?? null,
      created_at: iso(r.created_at),
      updated_at: iso(r.updated_at),
      responses: Number(r.responses),
      completed: Number(r.completed),
      views: Number(r.views) + Number(st.history?.views ?? 0),
      starts: Number(r.starts) + Number(st.history?.starts ?? 0),
      last_response_at: r.last_at ? iso(r.last_at) : null,
      integrations,
    };
  });
}
