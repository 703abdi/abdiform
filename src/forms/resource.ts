// Lead magnet delivery: emails the form's resource link to the address on a finished response.

import { q } from "@/lib/db";
import type { Form } from "@/forms/types";
import { flattenFields } from "@/forms/lib";
import { getContactByEmail, addTags } from "@/contacts/repo";
import { emailConfigured, sendEmail } from "@/lib/notify";
import { renderBlastEmail } from "@/blasts/render";
import { unsubscribeUrl, emit } from "@/automations/engine";
import type { Contact } from "@/contacts/types";

export async function sendResource(
  form: Form,
  rid: string,
): Promise<{ ok: boolean; sent?: boolean; to?: string; url?: string; error?: string }> {
  const r = form.settings.resource!;
  const [row] = await q(
    `select answers from form_responses where form_id = $1 and external_id = $2 and (meta->>'partial') is distinct from 'true'`,
    [form.id, `web:${rid}`],
  );
  if (!row) return { ok: false, error: "Submit the form first." };
  const emailField = flattenFields(form.fields).find((f) => f.type === "email");
  const email = emailField ? String((row.answers as Record<string, unknown>)[emailField.id] ?? "").trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "We couldn't find your email." };
  // no email account connected yet: hand the link over directly so nobody leaves empty-handed
  if (!emailConfigured()) return { ok: true, sent: false, url: r.url };

  const contact: Contact = (await getContactByEmail(email)) ?? {
    id: "", email, first_name: "", last_name: "", phone: "", properties: {}, tags: [], subscribed: true,
    source_form_id: form.id, created_at: "", updated_at: "", last_activity_at: "", list_ids: [], response_count: 1,
  };
  const title = r.title?.trim() || "your resource";
  const body = `${r.message?.trim() || `Hi {{first_name}},\n\nHere's ${title}, as promised.`}\n\n[[${r.button?.replace(/^email me /i, "Get ") || `Get ${title}`}|${r.url}]]\n\nIf the button doesn't work, copy this link: ${r.url}`;
  const m = renderBlastEmail(
    { subject: r.subject?.trim() || `Here's ${title}`, preheader: `Your copy of ${title}`, body },
    contact,
    contact.id ? await unsubscribeUrl(contact.id) : null,
  );
  const sent = await sendEmail({ to: email, subject: m.subject, html: m.html, text: m.text });
  if (!sent.ok) return { ok: true, sent: false, url: r.url };
  if (contact.id) {
    const added = await addTags([contact.id], [`Got: ${title}`.slice(0, 60)]);
    if (added.length) await emit(added.map((a) => ({ type: "tag_added" as const, contactId: a.contactId, tag: a.tag })));
  }
  return { ok: true, sent: true, to: email };
}
