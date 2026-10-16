// Turns form responses into contacts: one contact per email, merged across forms.
// Tags added automatically: the form title, "Completed" or "Incomplete", and the tag of the
// ending screen the person reached (e.g. "Qualified", "Low budget").

import type { Form, FormResponse } from "@/forms/types";
import { allEndings, answerFields, flattenFields, formatAnswer, isPartial, plainText } from "@/forms/lib";
import { getResponse, setResponseContact } from "@/forms/repo";
import { upsertContact } from "@/contacts/repo";
import { q } from "@/lib/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COMPLETED_TAG = "Completed";
export const INCOMPLETE_TAG = "Incomplete";

export function contactFromResponse(form: Pick<Form, "title" | "fields" | "settings">, r: Pick<FormResponse, "answers" | "meta">) {
  const all = flattenFields(form.fields);
  const get = (pred: (t: string) => boolean, type = "short_text") => {
    const f = all.find((x) => x.type === type && pred(plainText(x.title)));
    return f ? formatAnswer(f, r.answers[f.id]).trim() : "";
  };
  const emailField = all.find((f) => f.type === "email");
  const email = emailField ? formatAnswer(emailField, r.answers[emailField.id]).trim().toLowerCase() : "";
  const phoneField = all.find((f) => f.type === "phone");
  const phone = phoneField ? formatAnswer(phoneField, r.answers[phoneField.id]).trim() : "";

  let first = get((t) => /first.?name/i.test(t));
  let last = get((t) => /last.?name|surname/i.test(t));
  if (!first) {
    const full = get((t) => /name/i.test(t));
    if (full) {
      const [a, ...rest] = full.split(/\s+/);
      first = a;
      if (!last) last = rest.join(" ");
    }
  }

  const properties: Record<string, string> = {};
  for (const f of answerFields(form.fields)) {
    if (f.type === "email" || f.type === "file_upload") continue;
    const v = formatAnswer(f, r.answers[f.id]);
    if (v) properties[plainText(f.title).slice(0, 80)] = v.slice(0, 1000);
  }

  const partial = isPartial(r);
  const tags = [form.title.trim(), partial ? INCOMPLETE_TAG : COMPLETED_TAG];
  const endingId = (r.meta as { ending?: string } | undefined)?.ending;
  if (!partial && endingId) {
    const tag = allEndings(form.settings).find((e) => e.id === endingId)?.tag?.trim();
    if (tag) tags.push(tag);
  }
  return {
    email: EMAIL.test(email) ? email : "",
    first_name: first.slice(0, 100),
    last_name: last.slice(0, 100),
    phone,
    properties,
    tags,
    remove_tags: partial ? [] : [INCOMPLETE_TAG],
  };
}

export interface SyncResult {
  contactId: string;
  created: boolean;
  addedTags: string[];
}

/** Create/merge the contact for one response and link the response to it. Null when there is no email. */
export async function syncResponse(form: Form, responseOrId: FormResponse | string): Promise<SyncResult | null> {
  const r = typeof responseOrId === "string" ? await getResponse(responseOrId) : responseOrId;
  if (!r) return null;
  const c = contactFromResponse(form, r);
  if (!c.email) return null;
  // An incomplete response never marks someone who already finished as "Incomplete".
  if (isPartial(r)) {
    const [row] = await q(`select tags from contacts where lower(email) = $1`, [c.email]);
    if (((row?.tags as string[]) ?? []).some((t) => t.toLowerCase() === COMPLETED_TAG.toLowerCase())) {
      c.tags = c.tags.filter((t) => t !== INCOMPLETE_TAG);
    }
  }
  const res = await upsertContact({ ...c, source_form_id: form.id, activity_at: r.submitted_at });
  if (r.contact_id !== res.id) await setResponseContact(r.id, res.id);
  return { contactId: res.id, created: res.created, addedTags: res.addedTags };
}

/** Builds contacts for every response that isn't linked to one yet (oldest first, so the newest answers win). */
export async function backfillContacts(forms: Form[]): Promise<{ linked: number; contacts: number }> {
  let linked = 0;
  const seen = new Set<string>();
  for (const form of forms) {
    const rows = await q(
      `select id from form_responses where form_id = $1 and contact_id is null order by submitted_at asc`,
      [form.id],
    );
    for (const row of rows) {
      const res = await syncResponse(form, row.id as string);
      if (res) {
        linked++;
        seen.add(res.contactId);
      }
    }
  }
  return { linked, contacts: seen.size };
}
