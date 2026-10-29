"use server";

// Admin-only server actions for the Forms / Lead Capture dashboard.
// Every action re-checks the instructor session (middleware is the first lock).

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  addResponses,
  createForm,
  deleteForm,
  bulkDelete,
  bulkUpdateStatus,
  deleteResponse,
  getForm,
  listForms,
  listResponses,
  uniqueSlug,
  updateForm,
  updateResponse,
} from "@/forms/repo";
import { allEndings, cloneFields, flattenFields, isPublicHttpsUrl, slugify } from "@/forms/lib";
import { sanitizeLogic } from "@/forms/logic";
import { templateByKey } from "@/forms/templates";
import { hashPassword } from "@/forms/access";
import { sendLeadEmail } from "@/lib/notify";
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
import { backfillContacts } from "@/contacts/sync";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function guard(): Promise<string | null> {
  return (await isAdmin()) ? null : "Not allowed.";
}
function refresh(formId?: string) {
  revalidatePath("/forms");
  revalidatePath("/contacts");
  if (formId) revalidatePath(`/forms/${formId}`);
}
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

export async function createBlankFormAction(title: string, template = "blank", workspaceId?: string): Promise<Result<{ id: string }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const tpl = templateByKey(template).build();
    const t = title.trim() || tpl.title;
    const form = await createForm({
      workspace_id: workspaceId,
      slug: await uniqueSlug(slugify(t)),
      title: t,
      fields: tpl.fields,
      settings: tpl.settings,
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
    for (const f of leaves) {
      if (f.type === "matrix" && (f.rows ?? []).length < 1) return { ok: false, error: `"${f.title}" needs at least one row.` };
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) return { ok: false, error: `"${f.title}": minimum is higher than the maximum.` };
      if (f.min_selections && f.max_selections && f.min_selections > f.max_selections) return { ok: false, error: `"${f.title}": min selections is higher than max.` };
    }
    const httpsOnly = (u?: string) => !u || /^https:\/\/\S+$/i.test(u);
    const allImages = [
      ...patch.fields.map((f) => f.image),
      ...Object.values(patch.settings.design?.background_image ? { b: patch.settings.design.background_image } : {}),
      patch.settings.welcome_image,
      patch.settings.thank_you_image,
      ...(patch.settings.endings ?? []).map((e) => e.image),
      ...leaves.flatMap((f) => Object.values(f.images ?? {})),
    ];
    if (!allImages.every(httpsOnly)) return { ok: false, error: "Picture links must start with https://" };
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
      if (!urlOk(e.button_url) || !urlOk(e.redirect_url) || !urlOk(e.booked_redirect))
        return { ok: false, error: "Button and redirect links must start with http:// or https://" };
    }
    if (mergedSettings.resource?.url && !/^https:\/\/\S+$/i.test(mergedSettings.resource.url))
      return { ok: false, error: "The resource link must start with https://" };
    if (mergedSettings.webhook_url && !isPublicHttpsUrl(mergedSettings.webhook_url))
      return { ok: false, error: "The webhook link must be a public https:// address." };
    const settings = { ...mergedSettings };
    // password: a new one replaces the old; has_password=false removes it; otherwise keep what's stored
    if (patch.settings.access_password) settings.password_hash = hashPassword(patch.settings.access_password, id);
    else if (patch.settings.has_password === false) delete settings.password_hash;
    else settings.password_hash = existing.settings.password_hash;
    delete settings.access_password;
    delete settings.has_password;
    // server-owned values the editor never changes
    settings.history = existing.settings.history;
    // changing the link keeps the old one working (it redirects)
    const olds = new Set(existing.settings.old_slugs ?? []);
    if (wanted !== existing.slug) olds.add(existing.slug);
    olds.delete(wanted);
    settings.old_slugs = [...olds].slice(-20);
    settings.typeform_form_id = existing.settings.typeform_form_id;
    settings.hidden_fields = (patch.settings.hidden_fields ?? [])
      .map((h) => h.trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
    if (settings.meta_image && !/^https:\/\/\S+$/i.test(settings.meta_image))
      return { ok: false, error: "The share image must be an https:// link." };
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

export async function duplicateFormAction(id: string, workspaceId?: string): Promise<Result<{ id: string }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const src = await getForm(id);
    if (!src) return { ok: false, error: "Form not found." };
    const { typeform_form_id: _drop, history: _h, ...settings } = src.settings;
    void _drop;
    void _h;
    const form = await createForm({
      workspace_id: workspaceId ?? src.workspace_id ?? undefined,
      slug: await uniqueSlug(`${src.slug}-copy`),
      title: `${src.title} (copy)`,
      description: src.description,
      status: "draft",
      fields: cloneFields(src.fields),
      settings,
    });
    refresh();
    return { ok: true, data: { id: form.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Sends a sample payload to a webhook URL so you can check Zapier / Make / Discord is wired up. */
export async function testWebhookAction(url: string): Promise<Result<{ status: number }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "That doesn't look like a web address." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Webhook links must start with https://" };
  // Never let this button be used to probe the server's own network.
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname) || !u.hostname.includes("."))
    return { ok: false, error: "Use a public https address." };
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        test: true,
        form: { title: "Test form", slug: "test" },
        lead: { name: "Test Person", email: "test@example.com", phone: "+15551234567" },
        answers: { "What's your name?": "Test Person" },
        submitted_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(6000),
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400
      ? { ok: true, data: { status: res.status } }
      : { ok: false, error: `The webhook answered with status ${res.status}.` };
  } catch {
    return { ok: false, error: "Couldn't reach that address." };
  }
}

/** Sends a sample alert email so you can check Brevo is configured. */
export async function testEmailAction(to: string): Promise<Result<{ sentTo: string }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const addr = to.split(",")[0].trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) return { ok: false, error: "Enter a valid email address first." };
  const r = await sendLeadEmail({
    to: [addr],
    formTitle: "Test form",
    lead: { name: "Test Person", email: "test@example.com", phone: "+15551234567" },
    lines: [["What's your name?", "Test Person"], ["Budget", "$5k+"]],
    dashboardUrl: "https://example.com/forms",
  });
  return r.ok ? { ok: true, data: { sentTo: addr } } : { ok: false, error: r.error ?? "Couldn't send." };
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

export async function bulkLeadsAction(
  formId: string,
  ids: string[],
  op: { type: "status"; status: LeadStatus } | { type: "delete" },
): Promise<Result<{ count: number }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  if (ids.length === 0 || ids.length > 5000) return { ok: false, error: "Select between 1 and 5000 leads." };
  if (op.type === "status" && !LEAD_STATUSES.includes(op.status)) return { ok: false, error: "Invalid status." };
  try {
    // only touch leads that really belong to this form
    const mine = new Set((await listResponses(formId)).map((r) => r.id));
    const safe = ids.filter((i) => mine.has(i));
    if (op.type === "status") await bulkUpdateStatus(safe, op.status);
    else await bulkDelete(safe);
    refresh(formId);
    return { ok: true, data: { count: safe.length } };
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
    await backfillContacts([form]);
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
    await backfillContacts([form]);
    refresh();
    return { ok: true, data: { formId: form.id, formTitle: form.title, ...res } };
  } catch (e) {
    return fail(e);
  }
}

/** Partial settings update used by the Connect tab (email alerts, webhook, ending tags). */
export async function updateFormSettingsAction(
  id: string,
  patch: Partial<Pick<FormSettings, "notify_email" | "webhook_url" | "thank_you_tag" | "endings">>,
): Promise<Result> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const existing = await getForm(id);
    if (!existing) return { ok: false, error: "Form not found." };
    if (patch.webhook_url && !isPublicHttpsUrl(patch.webhook_url))
      return { ok: false, error: "The webhook link must be a public https:// address." };
    if (patch.notify_email) {
      const bad = patch.notify_email.split(",").map((e) => e.trim()).filter(Boolean).find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (bad) return { ok: false, error: `"${bad}" isn't a valid email address.` };
    }
    await updateForm(id, { settings: { ...existing.settings, ...patch } });
    refresh(id);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function setFormStatusAction(id: string, status: FormStatus): Promise<Result> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    if (!["draft", "published", "closed"].includes(status)) return { ok: false, error: "Unknown status." };
    await updateForm(id, { status });
    refresh(id);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
