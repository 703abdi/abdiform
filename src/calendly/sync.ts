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

interface CEvent { uri: string; name: string; start_time: string; end_time: string; status: string }
interface CInvitee {
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

  for (let pages = 0; url && pages < 10; pages++) {
    const page: Page<CEvent> = await get<Page<CEvent>>(url);
    for (const ev of page.collection) {
      events++;
      const uuid = ev.uri.split("/").pop();
      const inv = await get<Page<CInvitee>>(`/scheduled_events/${uuid}/invitees?count=100`);
      for (const i of inv.collection) {
        if (!i.email) continue;
        invitees++;
        const status = ev.status === "canceled" || i.status === "canceled" ? "canceled" : "active";
        const first = i.first_name || i.name?.split(/\s+/)[0] || "";
        const last = i.last_name || i.name?.split(/\s+/).slice(1).join(" ") || "";
        const c = await upsertContact({
          email: i.email,
          first_name: first,
          last_name: last,
          phone: i.text_reminder_number ?? "",
          activity_at: ev.start_time < new Date().toISOString() ? ev.start_time : undefined,
        });
        await q(
          `insert into bookings (invitee_uri, event_uri, event_name, email, name, contact_id, start_time, end_time, status, no_show, cancel_reason, reschedule_url, cancel_url, answers)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
           on conflict (invitee_uri) do update set
             event_name = excluded.event_name, email = excluded.email, name = excluded.name, contact_id = excluded.contact_id,
             start_time = excluded.start_time, end_time = excluded.end_time, status = excluded.status, no_show = excluded.no_show,
             cancel_reason = excluded.cancel_reason, reschedule_url = excluded.reschedule_url, cancel_url = excluded.cancel_url,
             answers = excluded.answers, updated_at = now()`,
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
            json(i.questions_and_answers ?? []),
          ],
        );
        touched.add(c.id);
      }
    }
    url = page.pagination.next_page;
  }

  let newTags = 0;
  for (const id of touched) newTags += await retagContact(id);
  return { events, invitees, newTags };
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
