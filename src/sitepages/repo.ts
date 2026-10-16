// Pages storage (Postgres).

import type { Block, PageSeo, PageStatus, PageTheme, SitePage } from "@/sitepages/types";
import { BLOCK_LABELS, DEFAULT_THEME } from "@/sitepages/types";
import { iso, isUuid, json, q, type Row } from "@/lib/db";

function toPage(r: Row): SitePage {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    status: (r.status as PageStatus) ?? "draft",
    blocks: Array.isArray(r.blocks) ? (r.blocks as Block[]) : [],
    theme: { ...DEFAULT_THEME, ...((r.theme as Partial<PageTheme>) ?? {}) },
    seo: (r.seo as PageSeo) ?? {},
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    views: r.views !== undefined ? Number(r.views) : undefined,
    visitors: r.visitors !== undefined ? Number(r.visitors) : undefined,
    clicks: r.clicks !== undefined ? Number(r.clicks) : undefined,
  };
}

const STATS = `
  (select count(*)::int from page_events e where e.page_id = p.id and e.kind = 'view') as views,
  (select count(distinct vid)::int from page_events e where e.page_id = p.id) as visitors,
  (select count(*)::int from page_events e where e.page_id = p.id and e.kind = 'click') as clicks`;

export async function listPages(): Promise<SitePage[]> {
  return (await q(`select p.*, ${STATS} from pages p order by p.updated_at desc`)).map(toPage);
}

export async function getPage(id: string): Promise<SitePage | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`select p.*, ${STATS} from pages p where p.id = $1`, [id]);
  return r ? toPage(r) : null;
}

export async function getPageBySlug(slug: string): Promise<SitePage | null> {
  const [r] = await q(`select * from pages where slug = $1`, [slug]);
  return r ? toPage(r) : null;
}

export function slugifyPage(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

export async function uniquePageSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugifyPage(base);
  for (let n = 0; n < 200; n++) {
    const s = n === 0 ? root : `${root}-${n + 1}`;
    const [r] = await q(`select id from pages where slug = $1`, [s]);
    if (!r || r.id === exceptId) return s;
  }
  return `${root}-${Date.now()}`;
}

/** Keeps only known block types and caps text sizes (the editor and Claude both write here). */
export function cleanBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
  const out: Block[] = [];
  for (const raw of input.slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    if (typeof b.type !== "string" || !(b.type in BLOCK_LABELS)) continue;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) {
      if (typeof v === "string") clean[k] = str(v);
      else if (typeof v === "number" && Number.isFinite(v)) clean[k] = Math.max(0, Math.min(5000, v));
      else if (typeof v === "boolean") clean[k] = v;
      else if (Array.isArray(v))
        clean[k] = v.slice(0, 50).map((it) =>
          typeof it === "string"
            ? str(it, 1000)
            : it && typeof it === "object"
              ? Object.fromEntries(Object.entries(it).filter(([, x]) => typeof x === "string").map(([kk, x]) => [kk, str(x, 2000)]))
              : "",
        );
    }
    clean.id = /^[A-Za-z0-9_-]{1,40}$/.test(String(b.id)) ? b.id : Math.random().toString(36).slice(2, 10);
    out.push(clean as unknown as Block);
  }
  return out;
}

export async function createPage(input: { title: string; slug?: string; blocks?: Block[]; theme?: PageTheme; seo?: PageSeo; status?: PageStatus }): Promise<SitePage> {
  const slug = await uniquePageSlug(input.slug || input.title);
  const [r] = await q(
    `insert into pages (slug, title, status, blocks, theme, seo) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb) returning *`,
    [slug, input.title.trim().slice(0, 200) || "Untitled page", input.status ?? "draft", json(cleanBlocks(input.blocks ?? [])), json(input.theme ?? DEFAULT_THEME), json(input.seo ?? {})],
  );
  return toPage(r);
}

export async function updatePage(id: string, patch: Partial<Pick<SitePage, "title" | "slug" | "status" | "blocks" | "theme" | "seo">>): Promise<SitePage | null> {
  const cur = await getPage(id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  const slug = patch.slug !== undefined ? await uniquePageSlug(patch.slug || n.title, id) : cur.slug;
  const [r] = await q(
    `update pages set slug = $2, title = $3, status = $4, blocks = $5::jsonb, theme = $6::jsonb, seo = $7::jsonb, updated_at = now() where id = $1 returning *`,
    [id, slug, n.title.trim().slice(0, 200) || "Untitled page", n.status === "published" ? "published" : "draft", json(cleanBlocks(n.blocks)), json(n.theme), json(n.seo ?? {})],
  );
  return r ? toPage(r) : null;
}

export async function deletePage(id: string): Promise<void> {
  if (isUuid(id)) await q(`delete from pages where id = $1`, [id]);
}

export async function duplicatePage(id: string): Promise<SitePage | null> {
  const p = await getPage(id);
  if (!p) return null;
  return createPage({ title: `${p.title} (copy)`, slug: `${p.slug}-copy`, blocks: p.blocks, theme: p.theme, seo: p.seo });
}

export async function recordPageEvent(pageId: string, vid: string, kind: "view" | "click", target: string): Promise<void> {
  await q(`insert into page_events (page_id, vid, kind, target) values ($1, $2, $3, $4) on conflict do nothing`, [
    pageId,
    vid.slice(0, 64),
    kind,
    target.slice(0, 64),
  ]);
}

export async function pageClicksByBlock(pageId: string): Promise<Record<string, number>> {
  const rows = await q(`select target, count(*)::int n from page_events where page_id = $1 and kind = 'click' group by target`, [pageId]);
  return Object.fromEntries(rows.map((r) => [r.target as string, Number(r.n)]));
}
