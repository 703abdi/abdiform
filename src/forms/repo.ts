// Forms data facade. Everything imports from here. Uses Postgres when
// DATABASE_URL is set, otherwise a local JSON file (development only).

import * as local from "@/forms/store";
import * as pg from "@/forms/pg-repo";

const hasDatabase = () => !!process.env.DATABASE_URL;
const impl = () => (hasDatabase() ? pg : local);

export const formsBackend = (): "postgres" | "local" => (hasDatabase() ? "postgres" : "local");

export const listForms = () => impl().listForms();
export const getForm = (id: string) => impl().getForm(id);
export const getFormBySlug = (slug: string) => impl().getFormBySlug(slug);
export const createForm = (...a: Parameters<typeof local.createForm>) => impl().createForm(...a);
export const updateForm = (...a: Parameters<typeof local.updateForm>) => impl().updateForm(...a);
export const deleteForm = (id: string) => impl().deleteForm(id);
export const bumpCounter = (...a: Parameters<typeof local.bumpCounter>) => impl().bumpCounter(...a);
export const listResponses = (formId?: string) => impl().listResponses(formId);
export const addResponses = (...a: Parameters<typeof local.addResponses>) => impl().addResponses(...a);
export const updateResponse = (...a: Parameters<typeof local.updateResponse>) => impl().updateResponse(...a);
export const deleteResponse = (id: string) => impl().deleteResponse(id);

/** Slug that doesn't collide with an existing form. */
export async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await getFormBySlug(slug); i++) slug = `${base}-${i}`;
  return slug;
}
