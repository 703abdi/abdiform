import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({
  slug: "scratch-widgets", title: "Widgets", status: "draft",
  fields: [
    { id: "sc", type: "scale", title: "How satisfied are you?", required: true, steps: 5, start_at_one: true, labels: { left: "Not satisfied", center: "Neutral", right: "Very satisfied" } },
    { id: "dt", type: "date", title: "When did you start trading?", required: true, date_format: "DD/MM/YYYY" },
    { id: "dd", type: "dropdown", title: "Which country are you in?", required: true, choices: ["Australia", "Canada", "United Kingdom", "United States", "Ireland", "India"] },
    { id: "cb", type: "checkboxes", title: "Which markets do you trade?", description: "Pick up to 2", required: true, choices: ["Forex", "Gold", "Indices", "Crypto"], max_selections: 2, none_of_the_above: true, randomize: true },
    { id: "mx", type: "matrix", title: "Rate each area", required: true, rows: ["Strategy", "Discipline", "Risk"], choices: ["Weak", "OK", "Strong"] },
    { id: "nb", type: "number", title: "How old are you?", required: true, min: 18, max: 99 },
    { id: "lt", type: "long_text", title: "Tell us more", required: false, max_chars: 120 },
  ],
  settings: { welcome_enabled: false },
});
console.log(f.id); process.exit(0);
