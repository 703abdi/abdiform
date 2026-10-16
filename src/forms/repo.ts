// Forms data facade. Everything imports from here. Uses Postgres when
// DATABASE_URL is set, otherwise a local JSON file (development only).

import crypto from "node:crypto";
import * as pg from "@/forms/pg-repo";

// Postgres is the only store (DATABASE_URL). The browser tests use an in-memory Postgres (PGlite).
export const listForms = pg.listForms;
export const getForm = pg.getForm;
export const getFormBySlug = pg.getFormBySlug;
export const createForm = pg.createForm;
export const updateForm = pg.updateForm;
export const deleteForm = pg.deleteForm;
export const bumpCounter = pg.bumpCounter;
export const saveWebResponse = pg.saveWebResponse;
export const getResponse = pg.getResponse;
export const setResponseContact = pg.setResponseContact;
export const countCompleted = pg.countCompleted;
export const listResponses = pg.listResponses;
export const addResponses = pg.addResponses;
export const updateResponse = pg.updateResponse;
export const bulkUpdateStatus = pg.bulkUpdateStatus;
export const bulkDelete = pg.bulkDelete;
export const saveFile = pg.saveFile;
export const getFile = pg.getFile;
export const filesExist = pg.filesExist;
export const deleteResponse = pg.deleteResponse;

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

/**
 * Shared rate limit (database-backed, so it holds across serverless instances).
 * The caller's address is hashed before it is stored. If the limiter itself breaks it
 * fails open: applicants must never be blocked by our own infrastructure problem.
 */
export async function rateLimited(scope: string, who: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const key = `${scope}:${crypto.createHash("sha256").update(who).digest("hex").slice(0, 24)}`;
    return await pg.rateLimited(key, max, windowSec);
  } catch (e) {
    console.error("rateLimited failed (failing open)", e);
    return false;
  }
}
