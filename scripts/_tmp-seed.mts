import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({ slug: "scratch-fuzz", title: "Fuzz", status: "published",
  fields: [{ id: "a", type: "short_text", title: "Name", required: true }, { id: "b", type: "email", title: "Email", required: true }] });
console.log(f.id); process.exit(0);
