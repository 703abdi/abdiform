"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { createAutomation, deleteAutomation, getAutomation, updateAutomation } from "@/automations/repo";
import { emit, isDiscordWebhook, processDue, type AutomationEvent } from "@/automations/engine";
import type { Automation, Step, Trigger } from "@/automations/types";
import { isPublicHttpsUrl } from "@/forms/lib";
import { getContactByEmail } from "@/contacts/repo";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  if (!(await isAdmin())) return { ok: false, error: "Not allowed." };
  try {
    const data = await fn();
    revalidatePath("/automations");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

function check(trigger: Trigger, steps: Step[], live: boolean) {
  if (!live) return;
  if (trigger.type === "list_added" && !trigger.list_id) throw new Error("Choose the list that starts this automation.");
  if (trigger.type === "tag_added" && !trigger.tag?.trim()) throw new Error("Type the tag that starts this automation.");
  if (steps.length === 0) throw new Error("Add at least one step.");
  for (const [i, s] of steps.entries()) {
    const n = `Step ${i + 1}`;
    if (s.type === "send_email" && (!s.subject.trim() || !s.body.trim())) throw new Error(`${n}: the email needs a subject and a message.`);
    if ((s.type === "add_tag" || s.type === "remove_tag") && !s.tag.trim()) throw new Error(`${n}: type a tag.`);
    if ((s.type === "add_to_list" || s.type === "remove_from_list") && !s.list_id) throw new Error(`${n}: choose a list.`);
    if (s.type === "webhook" && !isPublicHttpsUrl(s.url)) throw new Error(`${n}: the webhook needs a public https:// address.`);
    if (s.type === "discord" && !isDiscordWebhook(s.url)) throw new Error(`${n}: paste the Discord channel webhook link (Channel settings › Integrations › Webhooks).`);
    if (s.type === "discord" && !s.message.trim()) throw new Error(`${n}: write the Discord message.`);
    if (s.type === "wait" && !(Number(s.amount) > 0)) throw new Error(`${n}: wait at least 1 ${s.unit.replace(/s$/, "")}.`);
  }
}

export async function createAutomationAction(input: { name: string; trigger: Trigger; steps: Step[] }) {
  return run(async () => (await createAutomation(input)).id);
}

export async function saveAutomationAction(id: string, patch: Pick<Automation, "name" | "status" | "trigger" | "steps">) {
  return run(async () => {
    check(patch.trigger, patch.steps, patch.status === "live");
    await updateAutomation(id, patch);
    revalidatePath(`/automations/${id}`);
  });
}

export async function setAutomationStatusAction(id: string, status: Automation["status"]) {
  return run(async () => {
    const a = await getAutomation(id);
    if (!a) throw new Error("Automation not found.");
    check(a.trigger, a.steps, status === "live");
    await updateAutomation(id, { status });
    revalidatePath(`/automations/${id}`);
  });
}

export async function deleteAutomationAction(id: string) {
  return run(() => deleteAutomation(id));
}

/** Runs the automation for one contact right now, as if its trigger just happened. */
export async function testAutomationAction(id: string, email: string) {
  return run(async () => {
    const a = await getAutomation(id);
    if (!a) throw new Error("Automation not found.");
    if (a.status !== "live") throw new Error("Turn the automation on first, then test it.");
    const c = await getContactByEmail(email);
    if (!c) throw new Error("No contact with that email.");
    const t = a.trigger;
    const key = `test-${Date.now()}`;
    const sample = {
      call_date: new Date(Date.now() + 86_400_000).toLocaleString("en-US", { timeZone: process.env.APP_TIMEZONE || "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      call_event: t.event_name || "Tawakkul | Discovery Call",
      payment_amount: "$199.00",
      payment_product: t.product || "Trading Room",
      payment_recurring: t.payment_kind === "recurring" ? "yes" : "no",
      payment_type: t.payment_kind === "recurring" ? "Recurring" : "One-time",
    };
    const event: AutomationEvent =
      t.type === "form_submitted"
        ? { type: t.type, contactId: c.id, formId: t.form_id ?? "", ending: t.ending, responseId: key }
        : t.type === "list_added"
          ? { type: t.type, contactId: c.id, listId: t.list_id ?? "" }
          : t.type === "call_booked" || t.type === "payment_received"
            ? { type: t.type, contactId: c.id, key, context: sample }
            : { type: t.type, contactId: c.id, tag: t.tag ?? "" };
    const started = await emit([event]);
    if (!started) throw new Error("It didn't run: the contact doesn't match the audience filter, or already went through it for this trigger.");
    return started;
  });
}

export async function processDueAction() {
  return run(() => processDue());
}
