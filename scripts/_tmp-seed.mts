import * as repo from "../src/forms/pg-repo.ts";
const f = await repo.createForm({
  slug: "scratch-resume", title: "Resume test", status: "published",
  fields: [
    { id: "a", type: "short_text", title: "First name", required: true },
    { id: "b", type: "email", title: "Hi {{field:a}}, what's your email?", required: true },
    { id: "c", type: "short_text", title: "Anything else?", required: false },
  ],
  settings: { welcome_enabled: false },
});
console.log(f.id); process.exit(0);
