"use server";

// Admin actions for the Contacts page. Tag and list changes fire automation triggers.

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  addTags,
  addToList,
  contactResponses,
  createList,
  deleteContacts,
  deleteList,
  getContactByEmail,
  removeFromList,
  removeTags,
  setSubscribed,
  updateContact,
  updateList,
  upsertContact,
} from "@/contacts/repo";
import { backfillContacts } from "@/contacts/sync";
import { contactRuns } from "@/automations/repo";
import { contactWatches } from "@/sitepages/watch";
import { contactBookings } from "@/calendly/sync";
import { contactPayments } from "@/payments/whop";
import { emit } from "@/automations/engine";
import { listForms } from "@/forms/repo";
import type { Contact, ContactFilter, ListKind } from "@/contacts/types";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  if (!(await isAdmin())) return { ok: false, error: "Not allowed." };
  try {
    const data = await fn();
    revalidatePath("/contacts");
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function tagContactsAction(ids: string[], tag: string, add: boolean) {
  return run(async () => {
    if (!tag.trim()) throw new Error("Type a tag.");
    if (!add) return void (await removeTags(ids, [tag]));
    const added = await addTags(ids, [tag]);
    await emit(added.map((a) => ({ type: "tag_added" as const, contactId: a.contactId, tag: a.tag })));
  });
}

export async function listMembershipAction(ids: string[], listId: string, add: boolean) {
  return run(async () => {
    if (!add) return void (await removeFromList(ids, listId));
    const added = await addToList(ids, listId);
    await emit(added.map((contactId) => ({ type: "list_added" as const, contactId, listId })));
  });
}

export async function setSubscribedAction(ids: string[], subscribed: boolean) {
  return run(() => setSubscribed(ids, subscribed));
}

export async function deleteContactsAction(ids: string[]) {
  return run(() => deleteContacts(ids));
}

export async function createListAction(name: string, kind: ListKind, filter?: ContactFilter) {
  return run(async () => (await createList(name, kind, filter)).id);
}

export async function updateListAction(id: string, patch: { name?: string; filter?: ContactFilter }) {
  return run(() => updateList(id, patch));
}

export async function deleteListAction(id: string) {
  return run(() => deleteList(id));
}

export async function updateContactAction(
  id: string,
  patch: Partial<Pick<Contact, "email" | "first_name" | "last_name" | "phone" | "properties" | "subscribed">>,
) {
  return run(async () => {
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      if (!EMAIL.test(email)) throw new Error("That email address doesn't look right.");
      const other = await getContactByEmail(email);
      if (other && other.id !== id) throw new Error("Another contact already uses that email.");
      patch.email = email;
    }
    await updateContact(id, patch);
  });
}

export async function createContactAction(input: { email: string; first_name?: string; last_name?: string; phone?: string; tags?: string[] }) {
  return run(async () => {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new Error("That email address doesn't look right.");
    const r = await upsertContact({ ...input, email });
    if (r.addedTags.length) await emit(r.addedTags.map((tag) => ({ type: "tag_added" as const, contactId: r.id, tag })));
    return r.id;
  });
}

export async function contactDetailAction(id: string) {
  return run(async () => ({
    responses: await contactResponses(id),
    runs: await contactRuns(id),
    watches: await contactWatches(id),
    bookings: await contactBookings(id),
    payments: await contactPayments(id),
  }));
}

export async function syncCalendlyAction() {
  return run(async () => {
    const { syncCalendly } = await import("@/calendly/sync");
    return syncCalendly();
  });
}

/** Builds contacts from every response that isn't linked to one yet. */
export async function syncContactsAction() {
  return run(async () => backfillContacts(await listForms()));
}
