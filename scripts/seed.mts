import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({
  slug: "e2e-check", title: "E2E check", status: "published",
  fields: [
    { id: "n", type: "short_text", title: "Name", required: true },
    { id: "e", type: "email", title: "Email", required: true },
  ],
});
console.log(f.id);
process.exit(0);
