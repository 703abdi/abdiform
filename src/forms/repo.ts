// Forms data facade. Everything imports from here. Uses Postgres when
// DATABASE_URL is set, otherwise a local JSON file (development only).

import type { LeadStatus } from "@/forms/types";
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
export const saveWebResponse = (...a: Parameters<typeof local.saveWebResponse>) => impl().saveWebResponse(...a);
export const countCompleted = (id: string) => impl().countCompleted(id);
export const listResponses = (formId?: string) => impl().listResponses(formId);
export const addResponses = (...a: Parameters<typeof local.addResponses>) => impl().addResponses(...a);
export const updateResponse = (...a: Parameters<typeof local.updateResponse>) => impl().updateResponse(...a);
export const bulkUpdateStatus = (ids: string[], status: LeadStatus) => impl().bulkUpdateStatus(ids, status);
export const bulkDelete = (ids: string[]) => impl().bulkDelete(ids);
export const deleteResponse = (id: string) => impl().deleteResponse(id);

/** Slug that doesn't collide with an existing form. */
export async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await getFormBySlug(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Why a published form is not taking responses right now, or null if it is open. */
export async function closedReason(form: {
  id: string;
  status: string;
  settings: { close_at?: string; max_responses?: number };
}): Promise<string | null> {
  if (form.status === "closed") return "closed";
  const at = form.settings.close_at ? Date.parse(form.settings.close_at) : NaN;
  if (Number.isFinite(at) && Date.now() > at) return "closed";
  const max = form.settings.max_responses;
  if (max && max > 0 && (await countCompleted(form.id)) >= max) return "full";
  return null;
}
