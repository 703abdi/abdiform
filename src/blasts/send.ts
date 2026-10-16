// Sends a blast through Brevo's batch API (one personalised version per contact).
// Works in slices so a big list never hits the serverless time limit: whatever is left is picked
// up by the next call (the "Send" button keeps it going, plus the cron job and admin page loads).

import { getBlast, claimRecipients, pendingCount, markRecipients, setBlastStatus, audienceContacts, enqueueRecipients, dueScheduledBlasts } from "@/blasts/repo";
import { renderBlastEmail } from "@/blasts/render";
import { getContactByEmail } from "@/contacts/repo";
import { unsubscribeUrl } from "@/automations/engine";
import type { Contact } from "@/contacts/types";

const PER_REQUEST = 100;

export function blastSender(): { email: string; name: string } | null {
  const email = process.env.BLAST_FROM_EMAIL || process.env.NOTIFY_FROM_EMAIL;
  if (!process.env.BREVO_API_KEY || !email) return null;
  return { email, name: process.env.BLAST_FROM_NAME || process.env.NOTIFY_FROM_NAME || "Tawakkul Trading" };
}

async function brevoBatch(
  sender: { email: string; name: string },
  versions: { to: string; name: string; subject: string; html: string }[],
  tag: string,
): Promise<{ ok: boolean; error?: string }> {
  if (process.env.EMAIL_OUTBOX_FILE) {
    // automated tests: write instead of sending
    const fs = await import("node:fs");
    for (const v of versions) fs.appendFileSync(process.env.EMAIL_OUTBOX_FILE, JSON.stringify({ to: [v.to], subject: v.subject, text: v.html, tag }) + "\n");
    return { ok: true };
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender,
      subject: versions[0].subject,
      htmlContent: versions[0].html,
      tags: [tag],
      messageVersions: versions.map((v) => ({ to: [{ email: v.to, name: v.name || undefined }], subject: v.subject, htmlContent: v.html })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.ok) return { ok: true };
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.error("Brevo batch failed", res.status, detail);
  return { ok: false, error: res.status === 401 ? "Brevo rejected the API key." : /sender/i.test(detail) ? "Brevo doesn't accept that sender address. Verify it in Brevo > Senders." : `Brevo answered ${res.status}: ${detail}` };
}

/** Starts a blast (freezes the audience) and sends as much as fits in `budgetMs`. */
export async function runBlast(id: string, budgetMs = 40_000): Promise<{ sent: number; left: number; error?: string }> {
  const started = Date.now();
  const b = await getBlast(id);
  if (!b) return { sent: 0, left: 0, error: "Blast not found." };
  const sender = blastSender();
  if (!sender && !process.env.EMAIL_OUTBOX_FILE) {
    await setBlastStatus(id, "failed", { error: "Brevo isn't set up (BREVO_API_KEY and BLAST_FROM_EMAIL)." });
    return { sent: 0, left: 0, error: "Brevo isn't set up." };
  }
  if (b.status === "draft" || b.status === "scheduled") {
    await enqueueRecipients(id, await audienceContacts(b.audience));
    await setBlastStatus(id, "sending");
  } else if (b.status !== "sending") return { sent: 0, left: 0 };

  let sent = 0;
  while (Date.now() - started < budgetMs) {
    const batch = await claimRecipients(id, PER_REQUEST);
    if (!batch.length) break;
    const versions: { to: string; name: string; subject: string; html: string }[] = [];
    const skipped: string[] = [];
    for (const r of batch) {
      const c: Contact | null = await getContactByEmail(r.email);
      if (!c || !c.subscribed) {
        skipped.push(r.email); // unsubscribed or deleted since the blast started
        continue;
      }
      const m = renderBlastEmail(b, c, await unsubscribeUrl(c.id));
      versions.push({ to: c.email, name: `${c.first_name} ${c.last_name}`.trim(), subject: m.subject || "(no subject)", html: m.html });
    }
    await markRecipients(id, skipped, "skipped");
    if (!versions.length) continue;
    const res = await brevoBatch(sender ?? { email: "test@example.com", name: "Test" }, versions, `blast-${id.slice(0, 8)}`);
    if (!res.ok) {
      await markRecipients(id, versions.map((v) => v.to), "failed", res.error);
      await setBlastStatus(id, "failed", { error: res.error });
      return { sent, left: 0, error: res.error };
    }
    await markRecipients(id, versions.map((v) => v.to), "sent");
    sent += versions.length;
  }
  const left = await pendingCount(id);
  if (!left) await setBlastStatus(id, "sent");
  return { sent, left };
}

/** Sends one copy to an address (for checking how it looks). */
export async function sendBlastTest(id: string, to: string): Promise<{ ok: boolean; error?: string }> {
  const b = await getBlast(id);
  if (!b) return { ok: false, error: "Blast not found." };
  const sender = blastSender();
  if (!sender && !process.env.EMAIL_OUTBOX_FILE) return { ok: false, error: "Brevo isn't set up yet (BREVO_API_KEY and BLAST_FROM_EMAIL)." };
  const fake: Contact = {
    id: "00000000-0000-0000-0000-000000000000", email: to, first_name: "Abdi", last_name: "", phone: "", properties: {}, tags: [], subscribed: true,
    source_form_id: null, created_at: "", updated_at: "", last_activity_at: "", list_ids: [], response_count: 0,
  };
  const m = renderBlastEmail(b, (await getContactByEmail(to)) ?? fake, null);
  return brevoBatch(sender ?? { email: "test@example.com", name: "Test" }, [{ to, name: "", subject: `[Test] ${m.subject}`, html: m.html }], "blast-test");
}

/** Cron / page-load hook: start scheduled blasts and continue ones in progress. */
export async function processBlasts(budgetMs = 40_000): Promise<number> {
  let n = 0;
  const started = Date.now();
  for (const id of await dueScheduledBlasts()) {
    const left = budgetMs - (Date.now() - started);
    if (left < 3000) break;
    n += (await runBlast(id, left)).sent;
  }
  return n;
}
