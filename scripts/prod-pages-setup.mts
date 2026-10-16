// Live: create the pre-call page (draft until the YouTube link is added) and give the
// application form the Tawakkul look.
import { createPage, getPageBySlug } from "../src/sitepages/repo.ts";
import { PAGE_TEMPLATES } from "../src/sitepages/templates.ts";
import { getForm, updateForm } from "../src/forms/repo.ts";
import { DESIGN_PRESETS } from "../src/forms/lib.ts";

if (!(await getPageBySlug("precall"))) {
  const t = PAGE_TEMPLATES.find((x) => x.key === "precall")!.build();
  const p = await createPage({ title: "Tawakkul pre-call", slug: "precall", blocks: t.blocks, theme: t.theme, status: "draft" });
  console.log("page created:", p.slug, p.id);
} else console.log("page exists");

const ID = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const f = (await getForm(ID))!;
const design = DESIGN_PRESETS.find((d) => d.name === "Tawakkul")!.design;
await updateForm(ID, { settings: { ...f.settings, design: { ...design, background_image: f.settings.design?.background_image } } });
console.log("form design:", (await getForm(ID))!.settings.design?.background);
process.exit(0);
