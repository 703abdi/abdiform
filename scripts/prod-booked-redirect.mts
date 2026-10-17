// Live: after booking on the form, show "You're booked" then send them to the pre-call page.
// Also creates the VSL page (draft) from the template.
import { getForm, updateForm } from "../src/forms/repo.ts";
import { createPage, getPageBySlug } from "../src/sitepages/repo.ts";
import { PAGE_TEMPLATES } from "../src/sitepages/templates.ts";

const ID = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const f = (await getForm(ID))!;
console.log("before:", JSON.stringify({ t: f.settings.thank_you_booked_title, m: f.settings.thank_you_booked_message }));
await updateForm(ID, {
  settings: {
    ...f.settings,
    thank_you_booked_title: "You're booked! One last step...",
    thank_you_booked_message: "Taking you to a short video you need to watch before your call.",
    thank_you_booked_redirect: "https://abdiform.vercel.app/p/precall",
  },
});
console.log("after:", (await getForm(ID))!.settings.thank_you_booked_redirect);

if (!(await getPageBySlug("vsl"))) {
  const t = PAGE_TEMPLATES.find((x) => x.key === "vsl")!.build();
  const p = await createPage({ title: "Tawakkul VSL", slug: "vsl", blocks: t.blocks, theme: t.theme, status: "draft" });
  console.log("VSL page created (draft):", p.id);
}
process.exit(0);
