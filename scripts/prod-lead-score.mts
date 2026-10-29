// One-off: turn on Hot / Warm / Cold lead scoring for the 1:1 application (new and old form),
// then tag existing contacts from their latest finished application.
import { q } from "../src/lib/db";
import { getForm, listResponses } from "../src/forms/repo";
import { leadTier, TIER_TAG } from "../src/forms/logic";
import { isPartial } from "../src/forms/lib";
import { addTags, removeTags } from "../src/contacts/repo";
import type { Field } from "../src/forms/types";

// points by question position (1-based) and choice position; same questions on both forms
const POINTS: Record<number, number[]> = {
  1: [1, 0], // ready to become profitable: yes / no
  2: [0, 1, 1, 2, 2], // experience: new .. somewhat profitable
  5: [0, 1, 1, 2], // 90-day goal
  6: [0, 3, 5, 7, 8], // budget: under $500 .. $5k+
  7: [3, 0], // ready to move forward today
};
const THRESHOLDS = { hot: 10, warm: 6 };

const counts: Record<string, number> = {};
for (const slug of ["tawakkul-1-1-app", "tawakkul-1-1-app-old"]) {
  const [row] = await q(`select id, fields, settings from forms where slug = $1`, [slug]);
  const fields = row.fields as Field[];
  for (const [pos, pts] of Object.entries(POINTS)) {
    const f = fields[Number(pos) - 1];
    if (!f?.choices || f.choices.length !== pts.length) throw new Error(`${slug} Q${pos} doesn't match`);
    f.points = Object.fromEntries(f.choices.map((c, i) => [c, pts[i]]));
  }
  await q(`update forms set fields = $2::jsonb, settings = settings || $3::jsonb, updated_at = now() where id = $1`, [row.id, JSON.stringify(fields), JSON.stringify({ lead_score: THRESHOLDS })]);

  const form = (await getForm(row.id as string))!;
  // newest first, so the first finished response per contact is their latest
  const seen = new Set<string>();
  for (const r of await listResponses(form.id)) {
    if (!r.contact_id || isPartial(r) || seen.has(r.contact_id)) continue;
    seen.add(r.contact_id);
    const t = leadTier(form, r.answers)!;
    counts[`${slug} ${t.tier}`] = (counts[`${slug} ${t.tier}`] ?? 0) + 1;
    await removeTags([r.contact_id], Object.values(TIER_TAG).filter((x) => x !== TIER_TAG[t.tier]));
    await addTags([r.contact_id], [TIER_TAG[t.tier]]);
  }
}
console.log(counts);
const tagged = await q(`select t, count(*)::int n from contacts, unnest(tags) t where t like '% lead' group by t`);
console.log(tagged);
process.exit(0);
