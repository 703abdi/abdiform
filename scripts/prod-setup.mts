// One-time setup of the live Tawakkul 1:1 App: Typeform history, ending tags, publish, contacts.
import { getForm, updateForm } from "../src/forms/repo.ts";
import { resolvePath } from "../src/forms/logic.ts";
import { flattenFields, plainText } from "../src/forms/lib.ts";
import { backfillContacts } from "../src/contacts/sync.ts";
import { q } from "../src/lib/db.ts";

const ID = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const form = (await getForm(ID))!;

// routing check against the real questions
const all = flattenFields(form.fields);
const budget = all.find((f) => /set aside|budget|invest/i.test(plainText(f.title)) && f.choices?.length)!;
const hours = all.find((f) => /hours|time/i.test(plainText(f.title)) && f.choices?.length)!;
console.log("budget q:", plainText(budget.title), budget.choices);
console.log("hours q:", plainText(hours.title), hours.choices);
const base: Record<string, unknown> = {};
for (const f of all) if (f.choices?.length) base[f.id] = f.choices[0];
for (const b of budget.choices!) for (const h of hours.choices!) {
  const p = resolvePath(form.fields, { ...base, [budget.id]: b, [hours.id]: h });
  console.log(`  ${b} / ${h} -> ending ${p.ending} (asked hours: ${p.visited.some((f) => f.id === hours.id)})`);
}

if (process.argv.includes("--apply")) {
  const settings = {
    ...form.settings,
    history: { views: 2400, starts: 1531, submissions: 602, avg_seconds: 170 },
    thank_you_tag: "Qualified",
    endings: (form.settings.endings ?? []).map((e) => (e.id === "lowbudget" ? { ...e, tag: "Low budget" } : e)),
  };
  await updateForm(ID, { settings, status: "published" });
  const r = await backfillContacts([(await getForm(ID))!]);
  console.log("contacts:", r);
  const [c] = await q(`select count(*)::int n from contacts`);
  console.log("total contacts:", c.n);
}
process.exit(0);
