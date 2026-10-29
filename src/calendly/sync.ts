// Calendly sync: pulls scheduled calls (booked, canceled, no-show) into the app and keeps
// contact tags in step. Needs CALENDLY_TOKEN (Calendly > Integrations > API & Webhooks >
// Personal access token). Runs from the daily job, the Contacts page, and the "Sync" button.

import { iso, isUuid, json, q } from "@/lib/db";
import { addTags, removeTags, upsertContact } from "@/contacts/repo";
import { emit } from "@/automations/engine";

const API = process.env.CALENDLY_API_BASE || "https://api.calendly.com"; // overridable for tests
const TAG = { upcoming: "Booked", done: "Call done", no_show: "No-show", canceled: "Canceled" } as const;

export type BookingState = "upcoming" | "done" | "no_show" | "canceled";

export const calendlyConfigured = () => !!process.env.CALENDLY_TOKEN;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: { authorization: `Bearer ${process.env.CALENDLY_TOKEN}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Calendly rejected the token. Create a new personal access token in Calendly.");
  if (!res.ok) throw new Error(`Calendly answered ${res.status}.`);
  return (await res.json()) as T;
}

export interface CEvent { uri: string; name: string; start_time: string; end_time: string; status: string }
export interface CInvitee {
  uri: string;
  email: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  status: string;
  no_show: unknown;
  cancellation?: { reason?: string } | null;
  reschedule_url?: string;
  cancel_url?: string;
  text_reminder_number?: string | null;
  questions_and_answers?: { question: string; answer: string }[];
}
interface Page<T> { collection: T[]; pagination: { next_page: string | null } }

export function bookingState(b: { status: string; no_show: boolean; start_time: string }, now = Date.now()): BookingState {
  if (b.status === "canceled") return "canceled";
  if (b.no_show) return "no_show";
  return Date.parse(b.start_time) > now ? "upcoming" : "done";
}

async function lastSync(): Promise<string | null> {
  const [r] = await q(`select value from app_meta where key = 'calendly_last_sync'`);
  return (r?.value as string) ?? null;
}

/** Sync if it hasn't run in the last `minutes` (cheap enough to call on page loads). */
export async function syncCalendlyIfStale(minutes = 15) {
  if (!calendlyConfigured()) return null;
  const last = await lastSync();
  if (last && Date.now() - Date.parse(last) < minutes * 60_000) return null;
  return syncCalendly();
}

export async function syncCalendly(opts: { days?: number } = {}): Promise<{ events: number; invitees: number; newTags: number }> {
  if (!calendlyConfigured()) throw new Error("Calendly isn't connected (CALENDLY_TOKEN).");
  const previous = await lastSync();
  // claim the run so overlapping triggers don't double-sync
  await q(
    `insert into app_meta (key, value) values ('calendly_last_sync', $1) on conflict (key) do update set value = excluded.value`,
    [new Date().toISOString()],
  );
  const me = await get<{ resource: { uri: string } }>("/users/me");
  // first sync looks back 6 months; later ones 45 days (no-shows get marked after the call)
  const since = new Date(Date.now() - (opts.days ?? (previous ? 45 : 180)) * 86_400_000).toISOString();
  let url: string | null = `/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&min_start_time=${encodeURIComponent(since)}&count=100&sort=start_time:asc`;
  let events = 0;
  let invitees = 0;
  const touched = new Set<string>();
  const fresh: SavedInvitee[] = [];

  for (let pages = 0; url && pages < 10; pages++) {
    const page: Page<CEvent> = await get<Page<CEvent>>(url);
    for (const ev of page.collection) {
      events++;
      const uuid = ev.uri.split("/").pop();
      const inv = await get<Page<CInvitee>>(`/scheduled_events/${uuid}/invitees?count=100`);
      for (const i of inv.collection) {
        if (!i.email) continue;
        invitees++;
        const r = await saveInvitee(ev, i);
        touched.add(r.contactId);
        if (r.isNew && previous) fresh.push(r); // first sync: don't announce months of old calls
      }
    }
    url = page.pagination.next_page;
  }

  let newTags = 0;
  for (const id of touched) newTags += await retagContact(id);
  await announce(fresh);
  if (!(await metaGet("calendly_webhook_uri")) && Date.now() - Date.parse((await metaGet("calendly_webhook_tried")) ?? "0") > 86_400_000) {
    await connectInstantUpdates(me.resource.uri).catch(() => undefined); // paid Calendly plans only; polling covers the rest
  }
  return { events, invitees, newTags };
}

export interface SavedInvitee {
  contactId: string;
  isNew: boolean;
  status: string;
  inviteeUri: string;
  context: Record<string, string>;
}

const TZ = () => process.env.APP_TIMEZONE || "America/New_York";
export const formatCallDate = (isoTime: string) =>
  new Date(isoTime).toLocaleString("en-US", { timeZone: TZ(), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

/** Stores one invitee of one Calendly event (from the sync or the instant webhook). */
export async function saveInvitee(ev: CEvent, i: CInvitee): Promise<SavedInvitee> {
  const status = ev.status === "canceled" || i.status === "canceled" ? "canceled" : "active";
  const first = i.first_name || i.name?.split(/\s+/)[0] || "";
  const last = i.last_name || i.name?.split(/\s+/).slice(1).join(" ") || "";
  const answers = i.questions_and_answers ?? [];
  const phoneAnswer = answers.find((x) => /phone/i.test(x.question) && /\d{6,}/.test(x.answer))?.answer;
  const c = await upsertContact({
    email: i.email,
    first_name: first,
    last_name: last,
    phone: i.text_reminder_number || phoneAnswer || "",
    activity_at: ev.start_time < new Date().toISOString() ? ev.start_time : undefined,
  });
  const [row] = await q(
    `insert into bookings (invitee_uri, event_uri, event_name, email, name, contact_id, start_time, end_time, status, no_show, cancel_reason, reschedule_url, cancel_url, answers)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     on conflict (invitee_uri) do update set
       event_name = excluded.event_name, email = excluded.email, name = excluded.name, contact_id = excluded.contact_id,
       start_time = excluded.start_time, end_time = excluded.end_time, status = excluded.status, no_show = excluded.no_show,
       cancel_reason = excluded.cancel_reason, reschedule_url = excluded.reschedule_url, cancel_url = excluded.cancel_url,
       answers = excluded.answers, updated_at = now()
     returning (xmax = 0) as inserted`,
    [
      i.uri,
      ev.uri,
      ev.name ?? "",
      i.email.toLowerCase(),
      i.name ?? "",
      c.id,
      ev.start_time,
      ev.end_time,
      status,
      !!i.no_show,
      i.cancellation?.reason ?? "",
      i.reschedule_url ?? "",
      i.cancel_url ?? "",
      json(answers),
    ],
  );
  const context: Record<string, string> = {
    call_date: formatCallDate(ev.start_time),
    call_event: ev.name ?? "",
    call_status: status,
  };
  answers.slice(0, 5).forEach((x, n) => (context[`call_answer_${n + 1}`] = x.answer ?? ""));
  return { contactId: c.id, isNew: !!row?.inserted, status, inviteeUri: i.uri, context };
}

/** New active bookings start "A call is booked" automations (e.g. the Discord alert). */
export async function announce(saved: SavedInvitee[]) {
  const events = saved
    .filter((s) => s.isNew && s.status === "active")
    .map((s) => ({ type: "call_booked" as const, contactId: s.contactId, key: s.inviteeUri, context: s.context }));
  if (events.length) await emit(events);
}

export async function retagAfterWebhook(contactId: string) {
  return retagContact(contactId);
}

async function metaGet(key: string): Promise<string | null> {
  const [r] = await q(`select value from app_meta where key = $1`, [key]);
  return (r?.value as string) ?? null;
}
async function metaSet(key: string, value: string) {
  await q(`insert into app_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, value]);
}
export const calendlySigningKey = () => metaGet("calendly_signing_key");

/** Asks Calendly to call /api/calendly/webhook the moment something happens (needs a paid Calendly plan). */
export async function connectInstantUpdates(userUri?: string): Promise<{ ok: boolean; error?: string }> {
  await metaSet("calendly_webhook_tried", new Date().toISOString());
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!/^https:\/\//.test(base)) return { ok: false, error: "No public address for this app yet." };
  const me = userUri ? null : await get<{ resource: { uri: string; current_organization: string } }>("/users/me");
  const user = userUri ?? me!.resource.uri;
  const org = me?.resource.current_organization ?? (await get<{ resource: { current_organization: string } }>("/users/me")).resource.current_organization;
  const key = (await metaGet("calendly_signing_key")) ?? crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await metaSet("calendly_signing_key", key);
  const callback = `${base.replace(/\/$/, "")}/api/calendly/webhook`;
  const create = () =>
    fetch(`${API}/webhook_subscriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CALENDLY_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        url: callback,
        events: ["invitee.created", "invitee.canceled", "invitee_no_show.created", "invitee_no_show.deleted"],
        organization: org,
        user,
        scope: "user",
        signing_key: key,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  let res = await create();
  if (res.status === 409) {
    // one already points here (signed with an older key): replace it
    const list = await get<{ collection: { uri: string; callback_url: string }[] }>(
      `/webhook_subscriptions?organization=${encodeURIComponent(org)}&user=${encodeURIComponent(user)}&scope=user&count=100`,
    );
    for (const w of list.collection.filter((x) => x.callback_url === callback)) {
      await fetch(w.uri, { method: "DELETE", headers: { authorization: `Bearer ${process.env.CALENDLY_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
    }
    res = await create();
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { resource?: { uri?: string } };
    await metaSet("calendly_webhook_uri", body.resource?.uri ?? "existing");
    return { ok: true };
  }
  return { ok: false, error: res.status === 403 ? "Your Calendly plan doesn't include webhooks; syncing every 15 minutes instead." : `Calendly answered ${res.status}.` };
}

/** Booked / Call done / No-show / Canceled tags, from all of a contact's calls. */
async function retagContact(contactId: string): Promise<number> {
  const rows = await q(`select status, no_show, start_time from bookings where contact_id = $1`, [contactId]);
  const states = new Set(rows.map((r) => bookingState({ status: r.status as string, no_show: !!r.no_show, start_time: iso(r.start_time) })));
  const want: string[] = [];
  if (states.has("upcoming")) want.push(TAG.upcoming);
  if (states.has("done")) want.push(TAG.done);
  if (states.has("no_show")) want.push(TAG.no_show);
  if (states.has("canceled") && !states.has("upcoming") && !states.has("done")) want.push(TAG.canceled);
  const drop = states.has("upcoming") || states.has("done") ? [TAG.canceled] : [];
  if (drop.length) await removeTags([contactId], drop);
  const added = await addTags([contactId], want);
  if (added.length) await emit(added.map((a) => ({ type: "tag_added" as const, contactId: a.contactId, tag: a.tag })));
  return added.length;
}

export async function contactBookings(contactId: string) {
  if (!isUuid(contactId)) return [];
  const rows = await q(`select * from bookings where contact_id = $1 order by start_time desc`, [contactId]);
  return rows.map((r) => ({
    invitee_uri: r.invitee_uri as string,
    event_name: r.event_name as string,
    start_time: iso(r.start_time),
    state: bookingState({ status: r.status as string, no_show: !!r.no_show, start_time: iso(r.start_time) }),
    cancel_reason: r.cancel_reason as string,
    reschedule_url: r.reschedule_url as string,
  }));
}

export async function upcomingCalls(limit = 10) {
  const rows = await q(
    `select b.*, c.first_name, c.last_name, c.tags from bookings b left join contacts c on c.id = b.contact_id
     where b.status = 'active' and b.start_time > now() order by b.start_time limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    contact_id: (r.contact_id as string | null) ?? null,
    name: `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim() || (r.name as string),
    email: r.email as string,
    event_name: r.event_name as string,
    start_time: iso(r.start_time),
    tags: (r.tags as string[] | null) ?? [],
  }));
}

export async function callStats() {
  const [r] = await q(
    `select
       count(*) filter (where status = 'active' and start_time > now())::int as upcoming,
       count(*) filter (where status = 'active' and start_time <= now() and not no_show)::int as done,
       count(*) filter (where no_show)::int as no_show,
       count(*) filter (where status = 'canceled')::int as canceled
     from bookings where start_time > now() - interval '90 days'`,
  );
  return { upcoming: Number(r?.upcoming ?? 0), done: Number(r?.done ?? 0), no_show: Number(r?.no_show ?? 0), canceled: Number(r?.canceled ?? 0) };
}

export type CallStatus = BookingState | "booked" | "none";

/**
 * Call status for each response: its Calendly bookings (matched by contact or email),
 * else "booked" when they booked through the form but the sync hasn't pulled it in yet.
 */
export async function callStatuses(rows: { id: string; contact_id?: string | null; email: string; booked?: boolean }[]): Promise<Record<string, CallStatus>> {
  const ids = rows.map((r) => r.contact_id).filter((x): x is string => !!x && isUuid(x));
  const emails = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  const found = ids.length || emails.length
    ? await q(`select contact_id, lower(email) email, status, no_show, start_time from bookings where contact_id = any($1::uuid[]) or lower(email) = any($2::text[])`, [ids, emails])
    : [];
  const byKey = new Map<string, Set<BookingState>>();
  for (const b of found) {
    const st = bookingState({ status: b.status as string, no_show: !!b.no_show, start_time: iso(b.start_time) });
    for (const k of [b.contact_id as string | null, b.email as string]) {
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(st);
    }
  }
  const out: Record<string, CallStatus> = {};
  for (const r of rows) {
    const s = new Set([...(r.contact_id ? byKey.get(r.contact_id) ?? [] : []), ...(byKey.get(r.email.trim().toLowerCase()) ?? [])]);
    out[r.id] = s.has("upcoming") ? "upcoming" : s.has("done") ? "done" : s.has("no_show") ? "no_show" : r.booked ? "booked" : s.has("canceled") ? "canceled" : "none";
  }
  return out;
}
