// Test fixtures: a replica of the real 1:1 application form plus forms for every widget, a password
// form and a response-limited form. Ids are fixed so tests can refer to them.
import * as repo from "../src/forms/pg-repo.ts";
import { hashPassword } from "../src/forms/access.ts";
import type { Field } from "../src/forms/types.ts";

const choice = (id: string, title: string, choices: string[], extra: Partial<Field> = {}): Field =>
  ({ id, type: "multiple_choice", title, required: true, choices, ...extra }) as Field;

const apply: Field[] = [
  choice("ready", "*Are you finally ready to become a profitable trader?*", ["Yes, 100%. I'm ready.", "No, not right now."]),
  choice("exp", "*Which best describes your current trading experience?*", ["I'm completely new to trading", "I've been learning", "I've taken trades before"]),
  choice("obstacle", "Based on your answer above, *what has been the main obstacle?*", ["Strategy", "Fear and risk", "Consistency", "Where to start"], { allow_other: true }),
  { id: "contact", type: "group", title: "So we can reach out, what's your:", required: false, fields: [
    { id: "fn", type: "short_text", title: "First name", required: true },
    { id: "ln", type: "short_text", title: "Last name", required: true },
    { id: "ph", type: "phone", title: "Phone number", required: true },
    { id: "em", type: "email", title: "Email", required: true, verify: true },
  ] },
  choice("success", "If everything went right, *what would success look like?*", ["Learn the foundations", "Build a consistent strategy", "Replace part of my income", "Replace my income"]),
  choice("budget", "*How much can you set aside, {{field:fn}}?*", ["Under $500 USD", "$500-$1k USD", "$1k-2k USD", "$2k-$5k USD", "$5k+ USD"], {
    rules: [{ id: "low", match: "any", goto: "end:lowbudget", conditions: [{ field: "budget", op: "any_of", value: ["Under $500 USD", "$500-$1k USD"] }] }],
  }),
  choice("hours", "Last question, *if everything made sense and you loved the program, are you ready to move forward today?*", ["Yes, I'm ready to move forward today", "No, not today"], {
    rules: [{ id: "notready", match: "any", goto: "end:notready", conditions: [{ field: "hours", op: "is", value: "No, not today" }] }],
  }),
];

await repo.createForm({
  slug: "apply", title: "Mentorship application", status: "published", fields: apply,
  settings: {
    welcome_enabled: false, show_progress_bar: false,
    thank_you_title: "Schedule your 1-1 call", thank_you_message: "If you can't find a time, [DM me](https://instagram.com/x).",
    thank_you_calendly_url: "https://calendly.com/abdiyassin/1on1", thank_you_booked_title: "Thank you!", thank_you_booked_message: "We'll be in touch.",
    thank_you_tag: "Qualified", thank_you_booked_redirect: "http://localhost:3100/p/precall", brand_name: "Tawakkul Trading",
    endings: [{ id: "lowbudget", title: "*The Mentorship needs more capital right now.*", message: "Start here instead.", button_label: "See what's inside.", button_url: "https://whop.com/example/", tag: "Low budget" },
      { id: "notready", title: "*No problem. Start with the Trading Room.*", message: "Learn the setups live and trade alongside me.", button_label: "See what's inside.", button_url: "https://whop.com/example/", tag: "Not ready" }],
  },
});

await repo.createForm({
  slug: "widgets", title: "Widgets", status: "published",
  fields: [
    { id: "scale", type: "scale", title: "How satisfied are you?", required: true, steps: 5, start_at_one: true, labels: { left: "Not", right: "Very" } },
    { id: "date", type: "date", title: "When did you start?", required: true, date_format: "DD/MM/YYYY" },
    { id: "country", type: "dropdown", title: "Which country?", required: true, choices: ["Australia", "Canada", "United Kingdom", "United States"] },
    { id: "markets", type: "checkboxes", title: "Which markets?", required: true, choices: ["Forex", "Gold", "Indices", "Crypto"], max_selections: 2, none_of_the_above: true },
    { id: "matrix", type: "matrix", title: "Rate each area", required: true, rows: ["Strategy", "Discipline"], choices: ["Weak", "Strong"] },
    { id: "age", type: "number", title: "How old are you?", required: true, min: 18, max: 99 },
    { id: "rank", type: "ranking", title: "Rank these", required: true, choices: ["One", "Two", "Three"] },
    { id: "stars", type: "rating", title: "Rate us", required: true, steps: 5 },
    { id: "legal", type: "legal", title: "I agree to be contacted", required: true },
    { id: "file", type: "file_upload", title: "Upload your ID", required: true },
    { id: "more", type: "long_text", title: "Tell us more", required: false, max_chars: 40 },
  ],
  settings: { welcome_enabled: false },
});

const locked = await repo.createForm({
  slug: "locked", title: "Private application", status: "published",
  fields: [{ id: "n", type: "short_text", title: "Name", required: true }], settings: { welcome_enabled: false },
});
await repo.updateForm(locked.id, { settings: { ...locked.settings, password_hash: hashPassword("open-sesame", locked.id) } });

await repo.createForm({
  slug: "limited", title: "Limited spots", status: "published",
  fields: [{ id: "n", type: "short_text", title: "Name", required: true }],
  settings: { welcome_enabled: false, max_responses: 1, closed_message: "All spots are taken." },
});

await repo.createForm({
  slug: "draft", title: "Not live", status: "draft",
  fields: [{ id: "n", type: "short_text", title: "Name", required: true }], settings: {},
});

await repo.createForm({
  slug: "welcome", title: "Welcome form", status: "published",
  fields: [{ id: "n", type: "short_text", title: "What is your name?", required: true }],
  settings: { welcome_enabled: true, welcome_title: "Join us", welcome_description: "It takes a minute.", start_label: "Let's go" },
});

await repo.createForm({
  slug: "magnet", title: "Lead magnet", status: "published",
  fields: [{ id: "contact", type: "group", title: "Where should we send it?", required: false, fields: [
    { id: "nm", type: "short_text", title: "Name", required: true },
    { id: "me", type: "email", title: "Email", required: true },
    { id: "mp", type: "phone", title: "Phone number", required: true },
  ] }],
  settings: {
    welcome_enabled: false, thank_you_title: "You're in!", thank_you_message: "Press the button and we'll email it to you.",
    resource: { title: "The Trading Checklist", url: "https://example.com/checklist.pdf" },
  },
});

console.log("e2e fixtures seeded");
// pre-call page the booking ending sends people to
{
  const { createPage } = await import("../src/sitepages/repo.ts");
  const { PAGE_TEMPLATES } = await import("../src/sitepages/templates.ts");
  const t = PAGE_TEMPLATES.find((x) => x.key === "precall")!.build();
  await createPage({ title: "Pre-call", slug: "precall", blocks: t.blocks, theme: t.theme, status: "published" });
}

process.exit(0);
