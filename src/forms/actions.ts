"use server";

// Admin-only server actions for the Forms / Lead Capture dashboard.
// Every action re-checks the instructor session (middleware is the first lock).

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  addResponses,
  createForm,
  deleteForm,
  deleteResponse,
  getForm,
  listForms,
  uniqueSlug,
  updateForm,
  updateResponse,
} from "@/forms/repo";
import { allEndings, flattenFields, newId, slugify } from "@/forms/lib";
import { sanitizeLogic } from "@/forms/logic";
import {
  TypeformError,
  fetchTypeform,
  fieldsFromCsv,
  parseCsv,
  parseFormId,
  rowsToResponses,
} from "@/forms/typeform";
import type { Field, FormSettings, FormStatus, LeadStatus } from "@/forms/types";
import { LEAD_STATUSES } from "@/forms/types";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function guard(): Promise<string | null> {
  return (await isAdmin()) ? null : "Not allowed.";
}
function refresh(formId?: string) {
  revalidatePath("/forms");
  if (formId) revalidatePath(`/forms/${formId}`);
}
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

export async function createBlankFormAction(title: string): Promise<Result<{ id: string }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const t = title.trim() || "Untitled form";
    const form = await createForm({
      slug: await uniqueSlug(slugify(t)),
      title: t,
      fields: [
        { id: newId(), type: "short_text", title: "What's your full name?", required: true },
        { id: newId(), type: "email", title: "What's your email address?", required: true },
        { id: newId(), type: "phone", title: "What's your phone number?", required: false },
      ],
    });
    refresh();
    return { ok: true, data: { id: form.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveFormAction(
  id: string,
  patch: {
    title: string;
    description: string;
    slug: string;
    status: FormStatus;
    fields: Field[];
    settings: FormSettings;
  },
): Promise<Result<{ slug: string }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const existing = await getForm(id);
    if (!existing) return { ok: false, error: "Form not found." };
    const wanted = slugify(patch.slug);
    const taken = (await listForms()).some((f) => f.slug === wanted && f.id !== id);
    if (taken) return { ok: false, error: `The link "${wanted}" is already used by another form.` };
    if (!patch.title.trim()) return { ok: false, error: "Give the form a title." };
    const leaves = flattenFields(patch.fields);
    if (patch.fields.some((f) => !f.title.trim()) || leaves.some((f) => !f.title.trim()))
      return { ok: false, error: "Every question needs a title." };
    for (const g of patch.fields.filter((f) => f.type === "group"))
      if ((g.fields ?? []).length < 1) return { ok: false, error: `"${g.title}" needs at least one input.` };
    for (const f of leaves) {
      if (["multiple_choice", "checkboxes", "dropdown", "picture_choice", "ranking"].includes(f.type) && (f.choices ?? []).length < 1)
        return { ok: false, error: `"${f.title}" needs at least one choice.` };
    }
    const dupes = leaves.map((f) => f.id).filter((id, i, a) => a.indexOf(id) !== i);
    if (dupes.length) return { ok: false, error: "Two questions share the same id. Remove the duplicate and try again." };
    const emails = patch.settings.notify_email
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length > 5 || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)))
      return { ok: false, error: "Notification emails must be valid addresses (max 5, comma-separated)." };
    const calendlyOk = (u?: string) => {
      if (!u) return true;
      try {
        const x = new URL(u);
        return x.protocol === "https:" && /(^|\.)calendly\.com$/i.test(x.hostname);
      } catch {
        return false;
      }
    };
    const urlOk = (u?: string) => !u || /^https?:\/\/\S+$/i.test(u);
    const mergedSettings = { ...existing.settings, ...patch.settings, notify_email: emails.join(", ") };
    for (const e of allEndings(mergedSettings)) {
      if (!calendlyOk(e.calendly_url)) return { ok: false, error: "Calendly links must start with https://calendly.com/" };
      if (!urlOk(e.button_url) || !urlOk(e.redirect_url))
        return { ok: false, error: "Button and redirect links must start with http:// or https://" };
    }
    const settings = mergedSettings;
    patch = { ...patch, fields: sanitizeLogic(patch.fields, allEndings(mergedSettings).map((e) => e.id)) };
    await updateForm(id, {
      title: patch.title.trim(),
      description: patch.description,
      slug: wanted,
      status: patch.status,
      fields: patch.fields,
      settings,
    });
    refresh(id);
    return { ok: true, data: { slug: wanted } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFormAction(id: string): Promise<Result> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    await deleteForm(id);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLeadAction(
  formId: string,
  responseId: string,
  patch: { status?: LeadStatus; notes?: string },
): Promise<Result> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  if (patch.status && !LEAD_STATUSES.includes(patch.status))
    return { ok: false, error: "Invalid status." };
  try {
    await updateResponse(responseId, {
      status: patch.status,
      notes: patch.notes?.slice(0, 5000),
    });
    refresh(formId);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLeadAction(formId: string, responseId: string): Promise<Result> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    await deleteResponse(responseId);
    refresh(formId);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export interface ImportSummary {
  formId: string;
  formTitle: string;
  inserted: number;
  skipped: number;
}

/** Import a Typeform form definition + all its responses via the Typeform API. */
export async function importTypeformAction(input: {
  token: string;
  formRef: string;
  eu: boolean;
}): Promise<Result<ImportSummary>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const token = input.token.trim();
  const tfId = parseFormId(input.formRef);
  if (!token) return { ok: false, error: "Paste your Typeform personal access token." };
  if (!tfId) return { ok: false, error: "Paste your Typeform form ID or its link." };
  try {
    const tf = await fetchTypeform({ token, formId: tfId, eu: input.eu });
    // Re-import into the same form if we've imported this Typeform before.
    const prior = (await listForms()).find((f) => f.settings.typeform_form_id === tfId);
    const form =
      prior ??
      (await createForm({
        slug: await uniqueSlug(slugify(tf.title)),
        title: tf.title,
        status: "draft",
        fields: tf.fields,
        settings: { typeform_form_id: tfId },
      }));
    const res = await addResponses(form.id, tf.items);
    refresh();
    return {
      ok: true,
      data: { formId: form.id, formTitle: form.title, ...res },
    };
  } catch (e) {
    if (e instanceof TypeformError) return { ok: false, error: e.message };
    return fail(e);
  }
}

/** Import a Typeform "Download responses" CSV into a new or existing form. */
export async function importCsvAction(formData: FormData): Promise<Result<ImportSummary>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const file = formData.get("file");
  const target = String(formData.get("target") ?? "new");
  const name = String(formData.get("name") ?? "").trim();
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Choose a CSV file." };
  try {
    const text = (await file.text()).replace(/^﻿/, "");
    const { headers, rows } = parseCsv(text);
    if (rows.length === 0) return { ok: false, error: "That CSV has no rows." };

    let form;
    if (target === "new") {
      const title = name || file.name.replace(/\.csv$/i, "") || "Imported form";
      form = await createForm({
        slug: await uniqueSlug(slugify(title)),
        title,
        status: "draft",
        fields: fieldsFromCsv(headers, rows),
      });
    } else {
      form = await getForm(target);
      if (!form) return { ok: false, error: "Target form not found." };
    }
    const res = await addResponses(form.id, rowsToResponses(rows, form.fields));
    refresh();
    return { ok: true, data: { formId: form.id, formTitle: form.title, ...res } };
  } catch (e) {
    return fail(e);
  }
}
