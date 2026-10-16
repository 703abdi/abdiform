// Blasts storage + the send queue.

import type { Blast, BlastAudience, BlastStatus } from "@/blasts/types";
import type { Contact } from "@/contacts/types";
import { listContacts } from "@/contacts/repo";
import { matchesFilter } from "@/contacts/filter";
import { iso, isUuid, json, q, type Row } from "@/lib/db";

function toBlast(r: Row): Blast {
  const d = (v: unknown) => (v ? iso(v) : null);
  return {
    id: r.id as string,
    name: r.name as string,
    subject: (r.subject as string) ?? "",
    preheader: (r.preheader as string) ?? "",
    body: (r.body as string) ?? "",
    audience: ((r.audience as BlastAudience)?.type ? r.audience : { type: "all" }) as BlastAudience,
    status: r.status as BlastStatus,
    scheduled_at: d(r.scheduled_at),
    started_at: d(r.started_at),
    sent_at: d(r.sent_at),
    error: (r.error as string) ?? "",
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    stats:
      r.total !== undefined
        ? { total: Number(r.total), sent: Number(r.sent), failed: Number(r.failed), queued: Number(r.queued) }
        : undefined,
  };
}

const STATS = `
  (select count(*)::int from blast_recipients x where x.blast_id = b.id) as total,
  (select count(*)::int from blast_recipients x where x.blast_id = b.id and x.status = 'sent') as sent,
  (select count(*)::int from blast_recipients x where x.blast_id = b.id and x.status = 'failed') as failed,
  (select count(*)::int from blast_recipients x where x.blast_id = b.id and x.status = 'queued') as queued`;

export async function listBlasts(): Promise<Blast[]> {
  return (await q(`select b.*, ${STATS} from blasts b order by b.created_at desc`)).map(toBlast);
}

export async function getBlast(id: string): Promise<Blast | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select b.*, ${STATS} from blasts b where b.id = $1`, [id]);
  return r ? toBlast(r) : null;
}

export async function createBlast(name: string): Promise<Blast> {
  const [r] = await q(`insert into blasts (name, body, audience) values ($1, $2, $3::jsonb) returning *`, [
    name.trim().slice(0, 120) || "Untitled blast",
    "Hi {{first_name}},\n\nWrite your message here.\n\n[[Book your call|https://calendly.com/abdiyassin/1on1]]\n\nAbdi",
    json({ type: "all" }),
  ]);
  return toBlast(r);
}

export async function updateBlast(id: string, patch: Partial<Pick<Blast, "name" | "subject" | "preheader" | "body" | "audience">>): Promise<void> {
  const cur = await getBlast(id);
  if (!cur) return;
  if (cur.status !== "draft" && cur.status !== "scheduled") throw new Error("This blast has already been sent.");
  const n = { ...cur, ...patch };
  await q(`update blasts set name = $2, subject = $3, preheader = $4, body = $5, audience = $6::jsonb, updated_at = now() where id = $1`, [
    id,
    n.name.trim().slice(0, 120) || "Untitled blast",
    n.subject.slice(0, 200),
    n.preheader.slice(0, 200),
    n.body.slice(0, 50_000),
    json(n.audience),
  ]);
}

export async function setBlastStatus(id: string, status: BlastStatus, extra: { scheduled_at?: string | null; error?: string } = {}): Promise<void> {
  await q(
    `update blasts set status = $2,
       scheduled_at = case when $3::boolean then $4::timestamptz else scheduled_at end,
       error = coalesce($5, error),
       started_at = case when $2 = 'sending' and started_at is null then now() else started_at end,
       sent_at = case when $2 = 'sent' then now() else sent_at end,
       updated_at = now()
     where id = $1`,
    [id, status, "scheduled_at" in extra, extra.scheduled_at ?? null, extra.error ?? null],
  );
}

export async function deleteBlast(id: string): Promise<void> {
  if (isUuid(id)) await q(`delete from blasts where id = $1`, [id]);
}

export async function duplicateBlast(id: string): Promise<string | null> {
  const b = await getBlast(id);
  if (!b) return null;
  const [r] = await q(`insert into blasts (name, subject, preheader, body, audience) values ($1, $2, $3, $4, $5::jsonb) returning id`, [
    `${b.name} (copy)`,
    b.subject,
    b.preheader,
    b.body,
    json(b.audience),
  ]);
  return r.id as string;
}

/** Who a blast goes to right now: subscribed contacts matching the audience. */
export async function audienceContacts(a: BlastAudience): Promise<Contact[]> {
  const all = (await listContacts()).filter((c) => c.subscribed);
  if (a.type === "list" && a.list_id) {
    const [l] = await q(`select kind, filter from contact_lists where id = $1`, [a.list_id]);
    if (!l) return [];
    if (l.kind === "smart") return all.filter((c) => matchesFilter(c, l.filter as never));
    return all.filter((c) => c.list_ids.includes(a.list_id!));
  }
  if (a.type === "filter") return all.filter((c) => matchesFilter(c, a.filter));
  return all;
}

/** Freezes the audience into the recipient queue (once). */
export async function enqueueRecipients(blastId: string, contacts: Contact[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < contacts.length; i += 500) {
    const chunk = contacts.slice(i, i + 500);
    const rows = await q(
      `insert into blast_recipients (blast_id, contact_id, email)
       select $1, unnest($2::uuid[]), unnest($3::text[]) on conflict do nothing returning email`,
      [blastId, chunk.map((c) => c.id), chunk.map((c) => c.email.toLowerCase())],
    );
    n += rows.length;
  }
  return n;
}

/** Takes the next recipients off the queue; parallel senders never get the same ones. */
export async function claimRecipients(blastId: string, limit: number): Promise<{ email: string; contact_id: string | null }[]> {
  const rows = await q(
    `update blast_recipients set status = 'sending'
     where blast_id = $1 and email in (
       select email from blast_recipients where blast_id = $1 and status = 'queued' order by email limit $2 for update skip locked
     ) returning email, contact_id`,
    [blastId, limit],
  );
  return rows.map((r) => ({ email: r.email as string, contact_id: (r.contact_id as string | null) ?? null }));
}

export async function pendingCount(blastId: string): Promise<number> {
  const [r] = await q(`select count(*)::int n from blast_recipients where blast_id = $1 and status in ('queued', 'sending')`, [blastId]);
  return Number(r?.n ?? 0);
}

export async function markRecipients(blastId: string, emails: string[], status: "sent" | "failed" | "skipped", error = ""): Promise<void> {
  if (!emails.length) return;
  await q(
    `update blast_recipients set status = $3, error = $4, sent_at = case when $3 = 'sent' then now() else sent_at end where blast_id = $1 and email = any($2::text[])`,
    [blastId, emails, status, error.slice(0, 300)],
  );
}

export async function recipientLog(blastId: string, limit = 200) {
  const rows = await q(`select email, status, error, sent_at from blast_recipients where blast_id = $1 order by sent_at desc nulls last, email limit $2`, [blastId, limit]);
  return rows.map((r) => ({ email: r.email as string, status: r.status as string, error: r.error as string, sent_at: r.sent_at ? iso(r.sent_at) : null }));
}

export async function dueScheduledBlasts(): Promise<string[]> {
  const rows = await q(`select id from blasts where (status = 'scheduled' and scheduled_at <= now()) or status = 'sending' order by created_at`);
  return rows.map((r) => r.id as string);
}
