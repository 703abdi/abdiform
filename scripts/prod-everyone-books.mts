// Live: copy of the main application where EVERY applicant who finishes goes to the booking page.
// Same questions, no routing rules. The original form is not changed.
import { createForm, getForm, getFormBySlug } from "../src/forms/repo.ts";
import { cloneFields, flattenFields } from "../src/forms/lib.ts";
import { validateSubmission } from "../src/forms/validate.ts";
import type { Field } from "../src/forms/types.ts";

const ORIGINAL = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const SLUG = "tawakkul-1-1-call";
const src = (await getForm(ORIGINAL))!;
const before = JSON.stringify({ f: src.fields, s: src.settings, st: src.status });

let form = await getFormBySlug(SLUG);
if (!form) {
  const noLogic = (f: Field): Field => ({ ...f, rules: undefined, otherwise: undefined, fields: f.fields?.map(noLogic) });
  const fields = cloneFields(src.fields).map(noLogic);
  const { typeform_form_id: _a, history: _b, endings: _c, thank_you_tag: _d, ...settings } = src.settings;
  void _a; void _b; void _c; void _d;
  form = await createForm({ slug: SLUG, title: "Tawakkul 1:1 App (everyone books a call)", status: "draft", fields, settings: { ...settings, endings: [] } });
  console.log("created (draft):", form.id, "/apply/" + form.slug);
} else console.log("exists:", form.id);

// ---- check every path: all answer combinations must finish on the booking page and see every question
const all = flattenFields(form.fields);
const choiceQs = form.fields.filter((f) => f.type === "multiple_choice");
const sample: Record<string, unknown> = {};
for (const f of all) {
  if (f.type === "email") sample[f.id] = "test@example.com";
  else if (f.type === "phone") sample[f.id] = "+18012345678";
  else if (f.type === "short_text") sample[f.id] = "Test";
  else if (f.choices?.length) sample[f.id] = f.choices[0];
}
let combos = 0, bad = 0;
const walk = (i: number, answers: Record<string, unknown>) => {
  if (i === choiceQs.length) {
    combos++;
    const r = validateSubmission(form!.fields, answers);
    const askedAll = r.ok && choiceQs.every((q) => (r.answers as Record<string, unknown>)[q.id] !== undefined);
    if (!r.ok || r.ending !== "default" || !askedAll) {
      bad++;
      if (bad < 5) console.log("BAD", r.ok ? r.ending : JSON.stringify(r.errors), JSON.stringify(answers).slice(0, 200));
    }
    return;
  }
  for (const c of choiceQs[i].choices ?? []) walk(i + 1, { ...answers, [choiceQs[i].id]: c });
};
walk(0, sample);
console.log(`checked ${combos} answer combinations: ${bad} did not end on the booking page`);
console.log("ending:", form.settings.thank_you_title, "| calendly:", form.settings.thank_you_calendly_url, "| after booking ->", form.settings.thank_you_booked_redirect);
console.log("questions:", form.fields.map((f) => f.title.replace(/\*/g, "").slice(0, 45)).join(" | "));
const after = await getForm(ORIGINAL);
console.log("original unchanged:", JSON.stringify({ f: after!.fields, s: after!.settings, st: after!.status }) === before, "| status:", after!.status);
process.exit(0);
