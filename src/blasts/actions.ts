"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { audienceContacts, createBlast, deleteBlast, duplicateBlast, getBlast, setBlastStatus, updateBlast } from "@/blasts/repo";
import { blastSender, runBlast, sendBlastTest } from "@/blasts/send";
import type { Blast, BlastAudience } from "@/blasts/types";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  if (!(await isAdmin())) return { ok: false, error: "Not allowed." };
  try {
    const data = await fn();
    revalidatePath("/blasts");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function createBlastAction(name: string) {
  return run(async () => (await createBlast(name)).id);
}

export async function saveBlastAction(id: string, patch: Pick<Blast, "name" | "subject" | "preheader" | "body" | "audience">) {
  return run(() => updateBlast(id, patch));
}

export async function audienceCountAction(a: BlastAudience) {
  return run(async () => (await audienceContacts(a)).length);
}

export async function testBlastAction(id: string, to: string) {
  return run(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim())) throw new Error("Enter a valid email address.");
    const r = await sendBlastTest(id, to.trim().toLowerCase());
    if (!r.ok) throw new Error(r.error ?? "Couldn't send the test.");
  });
}

function ready(b: Blast) {
  if (!b.subject.trim()) throw new Error("Add a subject line.");
  if (!b.body.trim()) throw new Error("Write the email first.");
  if (!blastSender() && !process.env.EMAIL_OUTBOX_FILE) throw new Error("Brevo isn't set up yet. Add BREVO_API_KEY and BLAST_FROM_EMAIL in Vercel.");
}

export async function sendBlastNowAction(id: string) {
  return run(async () => {
    const b = await getBlast(id);
    if (!b) throw new Error("Blast not found.");
    if (b.status !== "draft" && b.status !== "scheduled") throw new Error("This blast has already been sent.");
    ready(b);
    const n = (await audienceContacts(b.audience)).length;
    if (!n) throw new Error("Nobody matches this audience.");
    const first = await runBlast(id, 20_000);
    if (first.error) throw new Error(first.error);
    if (first.left) after(() => runBlast(id, 45_000).then(() => undefined).catch(() => undefined));
    revalidatePath(`/blasts/${id}`);
    return first;
  });
}

/** Keeps a big send going from the open blast page. */
export async function continueBlastAction(id: string) {
  return run(async () => {
    const r = await runBlast(id, 30_000);
    revalidatePath(`/blasts/${id}`);
    return r;
  });
}

export async function scheduleBlastAction(id: string, whenIso: string | null) {
  return run(async () => {
    const b = await getBlast(id);
    if (!b) throw new Error("Blast not found.");
    if (b.status !== "draft" && b.status !== "scheduled") throw new Error("This blast has already been sent.");
    if (whenIso === null) return void (await setBlastStatus(id, "draft", { scheduled_at: null }));
    ready(b);
    const t = Date.parse(whenIso);
    if (!Number.isFinite(t) || t < Date.now() + 60_000) throw new Error("Pick a time at least a minute from now.");
    await setBlastStatus(id, "scheduled", { scheduled_at: new Date(t).toISOString() });
    revalidatePath(`/blasts/${id}`);
  });
}

export async function duplicateBlastAction(id: string) {
  return run(() => duplicateBlast(id));
}

export async function deleteBlastAction(id: string) {
  return run(async () => {
    const b = await getBlast(id);
    if (b?.status === "sending") throw new Error("Wait for the send to finish first.");
    await deleteBlast(id);
  });
}
