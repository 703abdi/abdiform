import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({
  slug: "scratch-limit", title: "Limit", status: "published",
  fields: [{ id: "n", type: "short_text", title: "Name", required: true }],
  settings: { max_responses: 1, closed_message: "Applications are full. Join the waitlist." },
});
console.log(f.id); process.exit(0);
