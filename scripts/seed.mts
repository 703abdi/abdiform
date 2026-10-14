import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({
  slug: "e2e", title: "E2E", status: "published",
  fields: [
    { id: "n", type: "short_text", title: "Name", required: true },
    { id: "e", type: "email", title: "Email", required: true },
  ],
  settings: { notify_email: "owner@example.com" },
});
console.log(f.id);
process.exit(0);
