// Automations storage (Postgres).

import type { Automation, AutomationRun, AutomationStatus, RunLogEntry, Step, Trigger } from "@/automations/types";
import { iso, isUuid, json, q, type Row } from "@/lib/db";

function toAutomation(r: Row): Automation {
  return {
    id: r.id as string,
    name: r.name as string,
    status: (r.status as AutomationStatus) ?? "draft",
    trigger: (r.trigger as Trigger)?.type ? (r.trigger as Trigger) : { type: "form_submitted" },
    steps: Array.isArray(r.steps) ? (r.steps as Step[]) : [],
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    stats:
      r.total !== undefined
        ? { total: Number(r.total), waiting: Number(r.waiting), done: Number(r.done), failed: Number(r.failed) }
        : undefined,
  };
}

const STATS = `
  (select count(*)::int from automation_runs x where x.automation_id = a.id) as total,
  (select count(*)::int from automation_runs x where x.automation_id = a.id and x.status = 'waiting') as waiting,
  (select count(*)::int from automation_runs x where x.automation_id = a.id and x.status = 'done') as done,
  (select count(*)::int from automation_runs x where x.automation_id = a.id and x.status = 'failed') as failed`;

export async function listAutomations(): Promise<Automation[]> {
  return (await q(`select a.*, ${STATS} from automations a order by a.created_at desc`)).map(toAutomation);
}

export async function liveAutomations(): Promise<Automation[]> {
  return (await q(`select * from automations where status = 'live'`)).map(toAutomation);
}

export async function getAutomation(id: string): Promise<Automation | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select a.*, ${STATS} from automations a where a.id = $1`, [id]);
  return r ? toAutomation(r) : null;
}

export async function createAutomation(input: { name: string; trigger: Trigger; steps: Step[] }): Promise<Automation> {
  const [r] = await q(`insert into automations (name, trigger, steps) values ($1, $2::jsonb, $3::jsonb) returning *`, [
    input.name.trim().slice(0, 120) || "Untitled automation",
    json(input.trigger),
    json(input.steps),
  ]);
  return toAutomation(r);
}

export async function updateAutomation(
  id: string,
  patch: Partial<Pick<Automation, "name" | "status" | "trigger" | "steps">>,
): Promise<void> {
  const cur = await getAutomation(id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  await q(
    `update automations set name = $2, status = $3, trigger = $4::jsonb, steps = $5::jsonb, updated_at = now() where id = $1`,
    [id, n.name.trim().slice(0, 120) || "Untitled automation", n.status, json(n.trigger), json(n.steps)],
  );
}

export async function deleteAutomation(id: string): Promise<void> {
  if (isUuid(id)) await q(`delete from automations where id = $1`, [id]);
}

/* ----------------------------------- runs ----------------------------------- */

function toRun(r: Row): AutomationRun {
  return {
    id: r.id as string,
    automation_id: r.automation_id as string,
    contact_id: (r.contact_id as string | null) ?? null,
    contact_email: (r.email as string | null) ?? null,
    trigger_key: r.trigger_key as string,
    step: Number(r.step),
    status: r.status as AutomationRun["status"],
    next_run_at: iso(r.next_run_at),
    log: (r.log as RunLogEntry[]) ?? [],
    created_at: iso(r.created_at),
  };
}

/** Starts a run unless this contact already ran this automation for the same trigger event. */
export async function enqueueRun(automationId: string, contactId: string, triggerKey: string): Promise<string | null> {
  const rows = await q(
    `insert into automation_runs (automation_id, contact_id, trigger_key) values ($1, $2, $3)
     on conflict (automation_id, contact_id, trigger_key) do nothing returning id`,
    [automationId, contactId, triggerKey.slice(0, 200)],
  );
  return (rows[0]?.id as string) ?? null;
}

/** Claims due runs (moves their next_run_at forward so a parallel worker skips them). */
export async function claimDueRuns(limit = 25, only?: string[]): Promise<AutomationRun[]> {
  const rows = await q(
    `update automation_runs set next_run_at = now() + interval '5 minutes', updated_at = now()
     where id in (
       select id from automation_runs
       where status = 'waiting' and next_run_at <= now() ${only ? "and id = any($2::uuid[])" : ""}
       order by next_run_at limit $1 for update skip locked
     ) returning *`,
    only ? [limit, only.filter(isUuid)] : [limit],
  );
  return rows.map(toRun);
}

export async function saveRun(id: string, patch: { step: number; status: AutomationRun["status"]; next_run_at: string; log: RunLogEntry[] }) {
  await q(
    `update automation_runs set step = $2, status = $3, next_run_at = $4::timestamptz, log = $5::jsonb, updated_at = now() where id = $1`,
    [id, patch.step, patch.status, patch.next_run_at, json(patch.log.slice(-50))],
  );
}

export async function listRuns(automationId: string, limit = 100): Promise<AutomationRun[]> {
  if (!isUuid(automationId)) return [];
  const rows = await q(
    `select r.*, c.email from automation_runs r left join contacts c on c.id = r.contact_id
     where r.automation_id = $1 order by r.created_at desc limit $2`,
    [automationId, limit],
  );
  return rows.map(toRun);
}

export async function contactRuns(contactId: string): Promise<(AutomationRun & { automation_name: string })[]> {
  if (!isUuid(contactId)) return [];
  const rows = await q(
    `select r.*, a.name as automation_name from automation_runs r join automations a on a.id = r.automation_id
     where r.contact_id = $1 order by r.created_at desc limit 50`,
    [contactId],
  );
  return rows.map((r) => ({ ...toRun(r), automation_name: r.automation_name as string }));
}
