// Runs automations. Events (form submitted, added to list, tag added) start runs for matching
// live automations; each run executes its steps until it reaches a Wait, then sleeps until the
// cron job (/api/cron/automations) or the next admin page load picks it up again.

import type { Automation, AutomationRun, RunLogEntry, Step } from "@/automations/types";
import { waitMs } from "@/automations/types";
import { claimDueRuns, enqueueRun, liveAutomations, saveRun } from "@/automations/repo";
import { addTags, addToList, getContact, removeFromList, removeTags } from "@/contacts/repo";
import { matchesFilter } from "@/contacts/filter";
import type { Contact } from "@/contacts/types";
import { escapeHtml, sendEmail } from "@/lib/notify";
import { signValue } from "@/lib/session";
import { isPublicHttpsUrl } from "@/forms/lib";
import { renderTemplate } from "@/automations/template";

export { renderTemplate };

export type AutomationEvent =
  | { type: "form_submitted"; contactId: string; formId: string; ending?: string; responseId: string }
  | { type: "list_added"; contactId: string; listId: string }
  | { type: "tag_added"; contactId: string; tag: string };

const MAX_DEPTH = 3; // tag/list steps can trigger other automations; stop loops

export function triggerMatches(a: Pick<Automation, "trigger">, e: AutomationEvent): boolean {
  const t = a.trigger;
  if (t.type !== e.type) return false;
  if (e.type === "form_submitted") return (!t.form_id || t.form_id === e.formId) && (!t.ending || t.ending === e.ending);
  if (e.type === "list_added") return !!t.list_id && t.list_id === e.listId;
  return !!t.tag && t.tag.trim().toLowerCase() === e.tag.trim().toLowerCase();
}

function triggerKey(e: AutomationEvent): string {
  if (e.type === "form_submitted") return `response:${e.responseId}`;
  if (e.type === "list_added") return `list:${e.listId}`;
  return `tag:${e.tag.toLowerCase()}`;
}

/** Fire events: start runs for every matching live automation and run them right away. */
export async function emit(events: AutomationEvent[], depth = 0): Promise<number> {
  if (!events.length || depth > MAX_DEPTH) return 0;
  const autos = await liveAutomations();
  if (!autos.length) return 0;
  const contacts = new Map<string, Contact | null>();
  const started: string[] = [];
  for (const e of events) {
    for (const a of autos) {
      if (!triggerMatches(a, e)) continue;
      if (!contacts.has(e.contactId)) contacts.set(e.contactId, await getContact(e.contactId));
      const c = contacts.get(e.contactId);
      if (!c || !matchesFilter(c, a.trigger.filter)) continue;
      const id = await enqueueRun(a.id, c.id, triggerKey(e));
      if (id) started.push(id);
    }
  }
  if (started.length) await processRuns(await claimDueRuns(started.length, started), autos, depth);
  return started.length;
}

/** Process whatever is due (cron). */
export async function processDue(limit = 50): Promise<number> {
  const runs = await claimDueRuns(limit);
  if (runs.length) await processRuns(runs, await liveAutomations(), 0);
  return runs.length;
}

async function processRuns(runs: AutomationRun[], autos: Automation[], depth: number) {
  const byId = new Map(autos.map((a) => [a.id, a]));
  for (const run of runs) {
    const a = byId.get(run.automation_id);
    const log = [...run.log];
    const now = () => new Date().toISOString();
    if (!a) {
      // paused or deleted: keep the run parked, check again in an hour
      await saveRun(run.id, { step: run.step, status: "waiting", next_run_at: new Date(Date.now() + 3_600_000).toISOString(), log });
      continue;
    }
    let step = run.step;
    let status: AutomationRun["status"] = "done";
    let next = now();
    while (step < a.steps.length) {
      const s = a.steps[step];
      if (s.type === "wait") {
        step++;
        next = new Date(Date.now() + waitMs(s)).toISOString();
        log.push({ at: now(), step: step - 1, ok: true, message: `Waiting ${s.amount} ${s.unit}` });
        status = step < a.steps.length ? "waiting" : "done";
        break;
      }
      const contact = run.contact_id ? await getContact(run.contact_id) : null;
      if (!contact) {
        log.push({ at: now(), step, ok: false, message: "Contact no longer exists" });
        status = "skipped";
        break;
      }
      const entry = await runStep(s, contact, step, depth);
      log.push(entry);
      step++;
      if (!entry.ok && s.type !== "send_email") {
        status = "failed";
        break;
      }
    }
    if (status === "done" && step < a.steps.length) status = "waiting";
    await saveRun(run.id, { step, status, next_run_at: next, log });
  }
}

export function appUrl(): string {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (u || "http://localhost:3000").replace(/\/$/, "");
}

export async function unsubscribeUrl(contactId: string): Promise<string | null> {
  const sig = await signValue(`unsub:${contactId}`);
  return sig ? `${appUrl()}/u/${contactId}.${sig}` : null;
}

async function runStep(s: Exclude<Step, { type: "wait" }>, c: Contact, i: number, depth: number): Promise<RunLogEntry> {
  const at = new Date().toISOString();
  const ok = (message: string): RunLogEntry => ({ at, step: i, ok: true, message });
  const fail = (message: string): RunLogEntry => ({ at, step: i, ok: false, message });
  try {
    switch (s.type) {
      case "send_email": {
        if (!c.subscribed) return ok(`Skipped email: ${c.email} is unsubscribed`);
        const subject = renderTemplate(s.subject, c).slice(0, 200) || "(no subject)";
        const body = renderTemplate(s.body, c);
        const unsub = await unsubscribeUrl(c.id);
        const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;max-width:560px;white-space:pre-wrap">${escapeHtml(body)}</div>${
          unsub ? `<p style="font-family:system-ui,sans-serif;font-size:12px;color:#94a3b8;margin-top:28px"><a href="${escapeHtml(unsub)}" style="color:#94a3b8">Unsubscribe</a></p>` : ""
        }`;
        const res = await sendEmail({
          to: c.email,
          subject,
          html,
          text: unsub ? `${body}\n\nUnsubscribe: ${unsub}` : body,
          headers: unsub ? { "List-Unsubscribe": `<${unsub}>` } : undefined,
        });
        return res.ok ? ok(`Sent "${subject}" to ${c.email}`) : fail(`Email not sent: ${res.error}`);
      }
      case "add_tag": {
        const added = await addTags([c.id], [s.tag]);
        if (added.length) await emit(added.map((x) => ({ type: "tag_added", contactId: x.contactId, tag: x.tag })), depth + 1);
        return ok(added.length ? `Added tag "${s.tag}"` : `Already tagged "${s.tag}"`);
      }
      case "remove_tag":
        await removeTags([c.id], [s.tag]);
        return ok(`Removed tag "${s.tag}"`);
      case "add_to_list": {
        if (!s.list_id) return fail("No list chosen");
        const added = await addToList([c.id], s.list_id);
        if (added.length) await emit([{ type: "list_added", contactId: c.id, listId: s.list_id }], depth + 1);
        return ok(added.length ? "Added to list" : "Already on the list");
      }
      case "remove_from_list":
        if (!s.list_id) return fail("No list chosen");
        await removeFromList([c.id], s.list_id);
        return ok("Removed from list");
      case "webhook": {
        if (!isPublicHttpsUrl(s.url)) return fail("Webhook URL must be a public https:// address");
        const res = await fetch(s.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contact: {
              id: c.id,
              email: c.email,
              first_name: c.first_name,
              last_name: c.last_name,
              phone: c.phone,
              tags: c.tags,
              properties: c.properties,
            },
            sent_at: at,
          }),
          signal: AbortSignal.timeout(5000),
        });
        return res.ok ? ok(`Webhook answered ${res.status}`) : fail(`Webhook answered ${res.status}`);
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 200) : "Step failed");
  }
}
