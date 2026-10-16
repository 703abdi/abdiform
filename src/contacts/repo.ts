// Contacts + contact lists storage (Postgres).

import type { Contact, ContactFilter, ContactList, ListKind } from "@/contacts/types";
import { EMPTY_FILTER } from "@/contacts/types";
import { iso, isUuid, json, q, type Row } from "@/lib/db";

const ids = (xs: string[]) => [...new Set(xs.filter(isUuid))];
const cleanTag = (t: string) => t.trim().replace(/\s+/g, " ").slice(0, 60);

function toContact(r: Row): Contact {
  return {
    id: r.id as string,
    email: r.email as string,
    first_name: (r.first_name as string) ?? "",
    last_name: (r.last_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    properties: (r.properties as Record<string, string>) ?? {},
    tags: (r.tags as string[]) ?? [],
    subscribed: r.subscribed !== false,
    source_form_id: (r.source_form_id as string | null) ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    last_activity_at: iso(r.last_activity_at),
    list_ids: (r.list_ids as string[] | null) ?? [],
    response_count: Number(r.response_count ?? 0),
  };
}

const SELECT = `
  select c.*,
    coalesce((select array_agg(m.list_id::text) from contact_list_members m where m.contact_id = c.id), '{}') as list_ids,
    (select count(*)::int from form_responses r where r.contact_id = c.id) as response_count
  from contacts c`;

export async function listContacts(): Promise<Contact[]> {
  return (await q(`${SELECT} order by c.last_activity_at desc`)).map(toContact);
}

export async function getContact(id: string): Promise<Contact | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(`${SELECT} where c.id = $1`, [id]);
  return r ? toContact(r) : null;
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const [r] = await q(`${SELECT} where lower(c.email) = lower($1)`, [email.trim()]);
  return r ? toContact(r) : null;
}

export interface ContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  properties?: Record<string, string>;
  tags?: string[];
  remove_tags?: string[];
  source_form_id?: string | null;
  activity_at?: string; // when the contact last did something (default now)
}

/**
 * Create the contact, or merge into the existing one with the same email (case-insensitive).
 * Non-empty new values win; tags are added (and `remove_tags` taken away).
 * Returns the contact id, whether it was new, and the tags that were newly added.
 */
export async function upsertContact(input: ContactInput): Promise<{ id: string; created: boolean; addedTags: string[] }> {
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const before = await getContactByEmail(email);
  const tags = [...new Set((input.tags ?? []).map(cleanTag).filter(Boolean))];
  const remove = new Set((input.remove_tags ?? []).map((t) => cleanTag(t).toLowerCase()));
  const activity = input.activity_at ?? new Date().toISOString();
  if (!before) {
    const [r] = await q(
      `insert into contacts (email, first_name, last_name, phone, properties, tags, source_form_id, created_at, last_activity_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::text[], $7, $8::timestamptz, $8::timestamptz)
       on conflict ((lower(email))) do update set updated_at = now()
       returning id`,
      [
        email,
        (input.first_name ?? "").slice(0, 100),
        (input.last_name ?? "").slice(0, 100),
        (input.phone ?? "").slice(0, 40),
        json(input.properties ?? {}),
        tags.filter((t) => !remove.has(t.toLowerCase())),
        input.source_form_id ?? null,
        activity,
      ],
    );
    return { id: r.id as string, created: true, addedTags: tags };
  }
  const have = new Set(before.tags.map((t) => t.toLowerCase()));
  const addedTags = tags.filter((t) => !have.has(t.toLowerCase()));
  const nextTags = [...before.tags.filter((t) => !remove.has(t.toLowerCase())), ...addedTags];
  await q(
    `update contacts set
       first_name = case when $2 <> '' then $2 else first_name end,
       last_name = case when $3 <> '' then $3 else last_name end,
       phone = case when $4 <> '' then $4 else phone end,
       properties = properties || $5::jsonb,
       tags = $6::text[],
       last_activity_at = greatest(last_activity_at, $7::timestamptz),
       updated_at = now()
     where id = $1`,
    [
      before.id,
      (input.first_name ?? "").slice(0, 100),
      (input.last_name ?? "").slice(0, 100),
      (input.phone ?? "").slice(0, 40),
      json(input.properties ?? {}),
      nextTags,
      activity,
    ],
  );
  return { id: before.id, created: false, addedTags };
}

export async function updateContact(
  id: string,
  patch: Partial<Pick<Contact, "email" | "first_name" | "last_name" | "phone" | "properties" | "subscribed">>,
): Promise<void> {
  if (!isUuid(id)) return;
  const cur = await getContact(id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  await q(
    `update contacts set email = $2, first_name = $3, last_name = $4, phone = $5, properties = $6::jsonb, subscribed = $7, updated_at = now()
     where id = $1`,
    [id, n.email.trim().toLowerCase(), n.first_name, n.last_name, n.phone, json(n.properties), n.subscribed],
  );
}

/** Adds tags; returns, per contact, the tags that were actually new (for automation triggers). */
export async function addTags(contactIds: string[], tags: string[]): Promise<{ contactId: string; tag: string }[]> {
  const clean = [...new Set(tags.map(cleanTag).filter(Boolean))];
  const ok = ids(contactIds);
  if (!clean.length || !ok.length) return [];
  const rows = await q(`select id, tags from contacts where id = any($1::uuid[])`, [ok]);
  const added: { contactId: string; tag: string }[] = [];
  for (const r of rows) {
    const have = new Set(((r.tags as string[]) ?? []).map((t) => t.toLowerCase()));
    const fresh = clean.filter((t) => !have.has(t.toLowerCase()));
    if (!fresh.length) continue;
    await q(`update contacts set tags = tags || $2::text[], updated_at = now() where id = $1`, [r.id, fresh]);
    for (const t of fresh) added.push({ contactId: r.id as string, tag: t });
  }
  return added;
}

export async function removeTags(contactIds: string[], tags: string[]): Promise<void> {
  const lower = tags.map((t) => cleanTag(t).toLowerCase()).filter(Boolean);
  const ok = ids(contactIds);
  if (!lower.length || !ok.length) return;
  await q(
    `update contacts set tags = coalesce(array(select t from unnest(tags) t where lower(t) <> all($2::text[])), '{}'), updated_at = now()
     where id = any($1::uuid[])`,
    [ok, lower],
  );
}

export async function setSubscribed(contactIds: string[], subscribed: boolean): Promise<void> {
  const ok = ids(contactIds);
  if (ok.length) await q(`update contacts set subscribed = $2, updated_at = now() where id = any($1::uuid[])`, [ok, subscribed]);
}

export async function deleteContacts(contactIds: string[]): Promise<void> {
  const ok = ids(contactIds);
  if (ok.length) await q(`delete from contacts where id = any($1::uuid[])`, [ok]);
}

export async function contactResponses(contactId: string) {
  if (!isUuid(contactId)) return [];
  const rows = await q(
    `select r.id, r.form_id, r.submitted_at, r.status, r.meta, f.title as form_title
     from form_responses r join forms f on f.id = r.form_id
     where r.contact_id = $1 order by r.submitted_at desc`,
    [contactId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    form_id: r.form_id as string,
    form_title: r.form_title as string,
    submitted_at: iso(r.submitted_at),
    status: r.status as string,
    partial: (r.meta as { partial?: boolean })?.partial === true,
    ending: (r.meta as { ending?: string })?.ending ?? null,
  }));
}

/* ---------------------------------- lists ---------------------------------- */

function toList(r: Row): ContactList {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: (r.kind as ListKind) ?? "static",
    filter: (r.filter as ContactFilter)?.rules ? (r.filter as ContactFilter) : EMPTY_FILTER,
    created_at: iso(r.created_at),
    member_count: Number(r.member_count ?? 0),
  };
}

export async function listLists(): Promise<ContactList[]> {
  const rows = await q(
    `select l.*, (select count(*)::int from contact_list_members m where m.list_id = l.id) as member_count
     from contact_lists l order by l.created_at`,
  );
  return rows.map(toList);
}

export async function getList(id: string): Promise<ContactList | null> {
  if (!isUuid(id)) return null;
  const [r] = await q(
    `select l.*, (select count(*)::int from contact_list_members m where m.list_id = l.id) as member_count from contact_lists l where id = $1`,
    [id],
  );
  return r ? toList(r) : null;
}

export async function createList(name: string, kind: ListKind = "static", filter: ContactFilter = EMPTY_FILTER): Promise<ContactList> {
  const [r] = await q(`insert into contact_lists (name, kind, filter) values ($1, $2, $3::jsonb) returning *`, [
    name.trim().slice(0, 80) || "Untitled list",
    kind,
    json(filter),
  ]);
  return toList(r);
}

export async function updateList(id: string, patch: { name?: string; filter?: ContactFilter }): Promise<void> {
  if (!isUuid(id)) return;
  if (patch.name !== undefined) await q(`update contact_lists set name = $2 where id = $1`, [id, patch.name.trim().slice(0, 80) || "Untitled list"]);
  if (patch.filter) await q(`update contact_lists set filter = $2::jsonb where id = $1`, [id, json(patch.filter)]);
}

export async function deleteList(id: string): Promise<void> {
  if (isUuid(id)) await q(`delete from contact_lists where id = $1`, [id]);
}

/** Adds contacts to a static list; returns the contacts that were not already on it. */
export async function addToList(contactIds: string[], listId: string): Promise<string[]> {
  const ok = ids(contactIds);
  if (!ok.length || !isUuid(listId)) return [];
  const rows = await q(
    `insert into contact_list_members (list_id, contact_id)
     select $1, unnest($2::uuid[]) on conflict do nothing returning contact_id`,
    [listId, ok],
  );
  return rows.map((r) => r.contact_id as string);
}

export async function removeFromList(contactIds: string[], listId: string): Promise<void> {
  const ok = ids(contactIds);
  if (ok.length && isUuid(listId)) await q(`delete from contact_list_members where list_id = $1 and contact_id = any($2::uuid[])`, [listId, ok]);
}
