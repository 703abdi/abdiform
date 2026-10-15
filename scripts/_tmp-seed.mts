import * as repo from "../src/forms/pg-repo.ts";
const mk = (slug: string) => repo.createForm({
  slug, title: slug, status: "published",
  fields: [{ id: "n", type: "short_text", title: "Name", required: true }, { id: "f", type: "file_upload", title: "Upload your ID", required: true }],
  settings: { welcome_enabled: false },
});
const a = await mk("scratch-up-a"); const b = await mk("scratch-up-b");
console.log(JSON.stringify({ a: a.id, b: b.id })); process.exit(0);
