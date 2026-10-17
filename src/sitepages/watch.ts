// Video watch tracking: how far each known contact got through each video on a page.

import { iso, isUuid, q } from "@/lib/db";
import { addTags } from "@/contacts/repo";
import { emit } from "@/automations/engine";
import type { SitePage } from "@/sitepages/types";

export const MILESTONES = [0, 25, 50, 75, 90, 100] as const;
export const WATCHED_AT = 75; // % that counts as "watched"

export const watchTag = (p: Pick<SitePage, "title" | "seo">) => (p.seo.watch_tag?.trim() || `Watched: ${p.title}`).slice(0, 60);

/** Saves the furthest point a contact reached; tags them once they pass WATCHED_AT. */
export async function recordWatch(page: Pick<SitePage, "id" | "title" | "seo">, contactId: string, blockId: string, pct: number, seconds: number) {
  if (!isUuid(contactId)) return;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  await q(
    `insert into video_watch (page_id, contact_id, block_id, pct, seconds) values ($1, $2, $3, $4, $5)
     on conflict (page_id, contact_id, block_id) do update
       set pct = greatest(video_watch.pct, excluded.pct), seconds = greatest(video_watch.seconds, excluded.seconds), updated_at = now()`,
    [page.id, contactId, blockId.slice(0, 40), p, Math.max(0, Math.min(86_400, Math.round(seconds)))],
  );
  await q(`update contacts set last_activity_at = now() where id = $1`, [contactId]);
  if (p >= WATCHED_AT) {
    const added = await addTags([contactId], [watchTag(page)]);
    if (added.length) await emit(added.map((a) => ({ type: "tag_added" as const, contactId: a.contactId, tag: a.tag })));
  }
}

export async function contactWatches(contactId: string) {
  if (!isUuid(contactId)) return [];
  const rows = await q(
    `select w.*, p.title, p.slug from video_watch w join pages p on p.id = w.page_id where w.contact_id = $1 order by w.updated_at desc`,
    [contactId],
  );
  return rows.map((r) => ({
    page_title: r.title as string,
    page_slug: r.slug as string,
    block_id: r.block_id as string,
    pct: Number(r.pct),
    seconds: Number(r.seconds),
    updated_at: iso(r.updated_at),
  }));
}

/** Per video block: how many viewers reached each milestone (anonymous + known). */
export async function watchFunnel(pageId: string): Promise<Record<string, Record<number, number>>> {
  const rows = await q(
    `select target, count(*)::int n from page_events where page_id = $1 and kind = 'watch' group by target`,
    [pageId],
  );
  const out: Record<string, Record<number, number>> = {};
  for (const r of rows) {
    const [block, m] = String(r.target).split(":");
    (out[block] ??= {})[Number(m)] = Number(r.n);
  }
  return out;
}
