// Visit tracking for the Results > Performance tab: views, starts, per-question views and
// where people drop off. Each visitor session (rid) records each screen once.
// Responses imported from Typeform have no visit data, so their path is rebuilt from what they
// answered (a partial response dropped off at the question after its last answer).

import type { Answers, Field, Form } from "@/forms/types";
import { flattenFields, plainText } from "@/forms/lib";
import { resolvePath } from "@/forms/logic";
import { q } from "@/lib/db";

import type { Device, DeviceKey, RangeKey } from "@/forms/events-labels";
export { DEVICE_LABELS, RANGE_LABELS, type Device, type DeviceKey, type RangeKey } from "@/forms/events-labels";

const SCREEN = /^[A-Za-z0-9_:-]{1,64}$/;

export function deviceFromUA(ua: string): Device {
  return /ipad|tablet/i.test(ua) ? "tablet" : /mobi|iphone|android/i.test(ua) ? "mobile" : "desktop";
}

/** Records that a visitor saw a screen. Returns false if this visitor already saw it. */
export async function recordScreen(formId: string, rid: string, screen: string, device: Device): Promise<boolean> {
  if (!SCREEN.test(screen)) return false;
  const rows = await q(
    `insert into form_events (form_id, rid, screen, device) values ($1, $2, $3, $4) on conflict do nothing returning 1`,
    [formId, rid.slice(0, 64), screen, device],
  );
  return rows.length > 0;
}

export function since(range: RangeKey): Date | null {
  const day = 86_400_000;
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now - 7 * day);
    case "30d":
      return new Date(now - 30 * day);
    case "90d":
      return new Date(now - 90 * day);
    case "365d":
      return new Date(now - 365 * day);
    default:
      return null;
  }
}

interface History {
  views?: number;
  starts?: number;
  submissions?: number;
  avg_seconds?: number;
}

export interface Performance {
  views: number;
  starts: number;
  submissions: number;
  completion_rate: number | null; // submissions / starts
  avg_seconds: number | null;
  includes_history: boolean;
}

export async function performance(form: Form, range: RangeKey, device: DeviceKey): Promise<Performance> {
  const from = since(range);
  const dev = device === "all" ? null : device;
  const hist = ((form.settings as unknown as { history?: History }).history ?? {}) as History;
  const allTime = !from && !dev;

  const [ev] = await q(
    `select count(distinct rid) filter (where screen = '_view')::int as views,
            count(distinct rid) filter (where screen = '_start')::int as starts
     from form_events where form_id = $1 and ($2::timestamptz is null or created_at >= $2) and ($3::text is null or device = $3)`,
    [form.id, from, dev],
  );
  const [rs] = await q(
    `select count(*)::int as n,
            avg((meta->>'duration_s')::numeric) filter (where meta ? 'duration_s' and (meta->>'duration_s') ~ '^[0-9]+$')::float as avg_s,
            count(*) filter (where source = 'web')::int as web
     from form_responses
     where form_id = $1 and (meta->>'partial') is distinct from 'true'
       and ($2::timestamptz is null or submitted_at >= $2) and ($3::text is null or meta->>'device' = $3)`,
    [form.id, from, dev],
  );
  let views = Number(ev?.views ?? 0);
  let starts = Number(ev?.starts ?? 0);
  if (allTime) {
    // the counters on the form row predate per-visit tracking; Typeform history adds the rest
    views = Math.max(views, form.views) + Number(hist.views ?? 0);
    starts = Math.max(starts, form.starts) + Number(hist.starts ?? 0);
  }
  const submissions = Number(rs?.n ?? 0);
  starts = Math.max(starts, submissions);
  views = Math.max(views, starts);
  const avg = rs?.avg_s != null ? Number(rs.avg_s) : allTime && hist.avg_seconds ? hist.avg_seconds : null;
  return {
    views,
    starts,
    submissions,
    completion_rate: starts > 0 ? submissions / starts : null,
    avg_seconds: avg,
    includes_history: allTime && !!(hist.views || hist.starts),
  };
}

export interface DropOffRow {
  id: string;
  title: string;
  type: Field["type"];
  index: number;
  views: number;
  dropoffs: number;
  rate: number | null; // dropoffs / views
}

/** Per screen: how many people saw it and how many left the form there. */
export async function dropOff(form: Form, range: RangeKey, device: DeviceKey): Promise<{ rows: DropOffRow[]; sessions: number }> {
  const from = since(range);
  const dev = device === "all" ? null : device;
  const screens = form.fields;
  const views = new Map<string, number>();
  const drops = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  // 1) tracked visits: last screen of each session that never reached the end
  const seen = await q(
    `select screen, count(*)::int as n from form_events
     where form_id = $1 and screen not like '\\_%' and ($2::timestamptz is null or created_at >= $2) and ($3::text is null or device = $3)
     group by screen`,
    [form.id, from, dev],
  );
  for (const r of seen) views.set(r.screen as string, Number(r.n));
  const last = await q(
    `select e.screen, count(*)::int as n from (
       select distinct on (rid) rid, screen from form_events
       where form_id = $1 and screen not like '\\_%' and ($2::timestamptz is null or created_at >= $2) and ($3::text is null or device = $3)
       order by rid, created_at desc
     ) e
     where not exists (select 1 from form_events x where x.form_id = $1 and x.rid = e.rid and x.screen = '_end')
     group by e.screen`,
    [form.id, from, dev],
  );
  for (const r of last) drops.set(r.screen as string, Number(r.n));
  const [{ n: sessions }] = (await q(
    `select count(distinct rid)::int as n from form_events where form_id = $1 and screen = '_start'
       and ($2::timestamptz is null or created_at >= $2) and ($3::text is null or device = $3)`,
    [form.id, from, dev],
  )) as { n: number }[];

  // 2) imported responses (no visit data): rebuild the path from the answers
  {
    const imported = await q(
      `select answers, meta from form_responses r where form_id = $1
         and (source <> 'web' or not exists (
           select 1 from form_events e where e.form_id = r.form_id and e.rid = substring(r.external_id from 5)))
         and ($2::timestamptz is null or submitted_at >= $2) and ($3::text is null or meta->>'device' = $3)`,
      [form.id, from, dev],
    );
    const ids = new Map(screens.map((s) => [s.id, new Set(s.type === "group" ? flattenFields(s.fields ?? []).map((f) => f.id) : [s.id])]));
    const has = (answers: Record<string, unknown>, sid: string) =>
      [...(ids.get(sid) ?? [])].some((id) => answers[id] !== undefined && answers[id] !== "" && answers[id] !== null);
    for (const r of imported) {
      const answers = (r.answers ?? {}) as Answers;
      const partial = (r.meta as { partial?: boolean })?.partial === true;
      // the path this person's answers take through the form's logic
      const path = resolvePath(screens, answers).visited;
      if (!partial) {
        // a finished response passed through every screen on its path
        for (const f of path) inc(views, f.id);
        continue;
      }
      // unfinished: they saw each screen up to the first one they didn't answer, and left there
      for (const f of path) {
        inc(views, f.id);
        if (f.type !== "statement" && !has(answers, f.id)) {
          inc(drops, f.id);
          break;
        }
      }
    }
  }

  const rows = screens.map((f, index) => {
    const v = views.get(f.id) ?? 0;
    const d = Math.min(drops.get(f.id) ?? 0, v);
    return { id: f.id, title: plainText(f.title) || "Untitled", type: f.type, index, views: v, dropoffs: d, rate: v > 0 ? d / v : null };
  });
  return { rows, sessions: Number(sessions ?? 0) };
}
