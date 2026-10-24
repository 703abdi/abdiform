// Live: the "Lead magnet" form (name, email, phone -> button that emails the resource).
// Draft until the resource link is added.
import { createForm, getFormBySlug } from "../src/forms/repo.ts";
import { DESIGN_PRESETS } from "../src/forms/lib.ts";

if (await getFormBySlug("lead-magnet")) {
  console.log("exists");
  process.exit(0);
}
const nid = () => Math.random().toString(36).slice(2, 14);
const f = await createForm({
  slug: "lead-magnet",
  title: "Lead magnet",
  status: "draft",
  fields: [
    {
      id: nid(),
      type: "group",
      title: "Where should we send it?",
      required: false,
      fields: [
        { id: nid(), type: "short_text", title: "Name", required: true },
        { id: nid(), type: "email", title: "Email", required: true },
        { id: nid(), type: "phone", title: "Phone number", required: true },
      ],
    },
  ],
  settings: {
    welcome_enabled: false,
    show_progress_bar: false,
    brand_name: "Tawakkul Trading",
    design: DESIGN_PRESETS.find((d) => d.name === "Tawakkul")!.design,
    thank_you_title: "You're in, {{field:NAME}}!",
    thank_you_message: "Press the button and we'll email it straight to you.",
    thank_you_tag: "Lead magnet",
    allow_another: false,
    resource: { title: "", url: "" },
  },
});
// recall the name in the ending
const nameId = (f.fields[0].fields ?? [])[0].id;
const { updateForm } = await import("../src/forms/repo.ts");
await updateForm(f.id, { settings: { ...f.settings, thank_you_title: `You're in, {{field:${nameId}}}!` } });
console.log("created (draft):", f.id, "/apply/" + f.slug);
process.exit(0);
