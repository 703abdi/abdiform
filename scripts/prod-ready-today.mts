// Live form update: email verification after contact info; new last question
// ("ready to move forward today?"): Yes -> booking page, No -> Trading Room page.
import { getForm, updateForm } from "../src/forms/repo.ts";
import { resolvePath } from "../src/forms/logic.ts";
import type { Field } from "../src/forms/types.ts";

const ID = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const OLD_LAST = "Zv88RN4JJxuz";
const NEW_LAST = "ReadyTodayQ1";
const YES = "Yes, I'm ready to move forward today";
const NO = "No, not today";
const form = (await getForm(ID))!;

const fields: Field[] = form.fields.map((f) => {
  if (f.type === "group") return { ...f, fields: (f.fields ?? []).map((c) => (c.type === "email" ? { ...c, verify: true } : c)) };
  if (f.id === OLD_LAST)
    return {
      ...f,
      id: NEW_LAST,
      title: "Last question, *if everything made sense and you loved the program, are you ready to move forward today?*",
      choices: [YES, NO],
      rules: [{ id: "r_notready", match: "any", goto: "end:notready", conditions: [{ field: NEW_LAST, op: "is", value: NO }] }],
      otherwise: undefined,
    };
  return f;
});
const low = (form.settings.endings ?? []).find((e) => e.id === "lowbudget")!;
const endings = [
  ...(form.settings.endings ?? []).filter((e) => e.id !== "notready"),
  {
    id: "notready",
    title: "*No problem. The best place to start is the Trading Room.*",
    message: "Learn the setups live, trade alongside me every session, and build the skill at your own pace.\n\n$199/month. Cancel anytime.",
    button_label: low.button_label,
    button_url: low.button_url,
    tag: "Not ready",
  },
];

const budget = fields.find((f) => f.id === "Oy11aJpNzwiU")!;
const base: Record<string, unknown> = {};
for (const f of fields) if (f.choices?.length) base[f.id] = f.choices[0];
for (const b of budget.choices!) for (const h of [YES, NO]) {
  const p = resolvePath(fields, { ...base, [budget.id]: b, [NEW_LAST]: h });
  console.log(`${b.padEnd(15)} / ${h.padEnd(38)} -> ${p.ending}`);
}
if (process.argv.includes("--apply")) {
  await updateForm(ID, { fields, settings: { ...form.settings, endings } });
  console.log("applied");
}
process.exit(0);
