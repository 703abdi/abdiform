// One-off: give the FREE STRAT form the link /apply/free-strat; /apply/lead-magnet keeps working via old_slugs.
import { q } from "../src/lib/db";

const id = "5ffabe2d";
const [f] = await q(`select id, title, slug, settings from forms where id::text like $1 || '%'`, [id]);
if (!f) throw new Error("form not found");
const taken = await q(`select id from forms where slug = 'free-strat' and id <> $1`, [f.id]);
if (taken.length) throw new Error("free-strat is already used by another form");
const settings = (f.settings ?? {}) as { old_slugs?: string[] };
const old = Array.from(new Set([...(settings.old_slugs ?? []), f.slug as string])).filter((s) => s !== "free-strat");
await q(`update forms set slug = 'free-strat', settings = jsonb_set(coalesce(settings, '{}'), '{old_slugs}', $2::jsonb), updated_at = now() where id = $1`, [f.id, JSON.stringify(old)]);
console.log(`${f.title}: ${f.slug} -> free-strat (old links: ${old.join(", ")})`);
process.exit(0);
