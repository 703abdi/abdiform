"use client";

// Typeform-style Contacts: lists on the left, searchable / filterable / sortable table,
// bulk Actions menu, contact drawer.

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Contact, ContactFilter, ContactList, FilterField, FilterRule } from "@/contacts/types";
import { EMPTY_FILTER } from "@/contacts/types";
import { matchesFilter, needsValue, OP_LABELS, opsFor } from "@/contacts/filter";
import { Menu } from "@/components/admin/Menu";
import { Modal } from "@/components/admin/Modal";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";
import {
  contactDetailAction,
  createContactAction,
  createListAction,
  deleteContactsAction,
  deleteListAction,
  listMembershipAction,
  setSubscribedAction,
  syncCalendlyAction,
  syncContactsAction,
  tagContactsAction,
  updateContactAction,
  updateListAction,
} from "@/contacts/actions";

type FormRef = { id: string; title: string };
type SortKey = "name" | "email" | "last_activity_at" | "created_at" | "responses";
const PAGE = 50;

const BASE_FIELDS: { key: FilterField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "tag", label: "Tag" },
  { key: "list", label: "List" },
  { key: "source_form", label: "Source form" },
  { key: "subscribed", label: "Subscribed" },
  { key: "responses", label: "Responses" },
  { key: "created_at", label: "Date added" },
  { key: "last_activity_at", label: "Last activity" },
];

const fullName = (c: Contact) => `${c.first_name} ${c.last_name}`.trim();
const initials = (c: Contact) => (fullName(c) || c.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const AVATAR = ["#ffe2c6", "#c9e4ff", "#d9f2d0", "#f3d4f7", "#fff1b8", "#d6d6ff"];
const tint = (s: string) => AVATAR[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR.length];

function csvCell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // stop spreadsheet formulas
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function ContactsView({
  contacts,
  lists,
  forms,
  propertyKeys,
  initialList,
  calendly = false,
}: {
  contacts: Contact[];
  lists: ContactList[];
  forms: FormRef[];
  propertyKeys: string[];
  initialList: string | null;
  calendly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [listId, setListId] = useState<string | null>(initialList);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContactFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "last_activity_at", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "tag-add" | "tag-remove" | "list-add" | "list-remove" | "delete" | "new-list" | "new-contact" | "rename-list"; value?: string }>(null);
  const [text, setText] = useState("");
  const [listKind, setListKind] = useState<"static" | "smart">("static");
  const [newContact, setNewContact] = useState({ email: "", first_name: "", last_name: "", phone: "", tags: "" });

  const list = lists.find((l) => l.id === listId) ?? null;
  const formTitle = useMemo(() => new Map(forms.map((f) => [f.id, f.title])), [forms]);
  const staticLists = lists.filter((l) => l.kind === "static");
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [contacts]);
  const fields = useMemo(
    () => [...BASE_FIELDS, ...propertyKeys.map((k) => ({ key: `property:${k}` as FilterField, label: k }))],
    [propertyKeys],
  );

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  };
  const act = <T,>(p: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string, after?: (d: T) => void) =>
    start(async () => {
      const r = await p();
      if (!r.ok) return flash(r.error);
      flash(done);
      after?.(r.data);
      router.refresh();
    });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = contacts.filter((c) => {
      if (list) {
        if (list.kind === "static" && !c.list_ids.includes(list.id)) return false;
        if (list.kind === "smart" && !matchesFilter(c, list.filter)) return false;
      }
      if (s && !`${fullName(c)} ${c.email} ${c.phone} ${c.tags.join(" ")}`.toLowerCase().includes(s)) return false;
      return matchesFilter(c, filter);
    });
    const val = (c: Contact): string | number =>
      sort.key === "name" ? (fullName(c) || "~").toLowerCase() : sort.key === "email" ? c.email : sort.key === "responses" ? c.response_count : c[sort.key];
    out = [...out].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return out;
  }, [contacts, list, search, filter, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const ids = [...selected];
  const allOnPage = pageRows.length > 0 && pageRows.every((c) => selected.has(c.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" || key === "email" ? 1 : -1 }));
  const activeRules = filter.rules.length;

  function exportCsv(which: Contact[]) {
    const props = propertyKeys;
    const head = ["Email", "First name", "Last name", "Phone", "Tags", "Subscribed", "Source form", "Responses", "Created", "Last activity", ...props];
    const lines = which.map((c) =>
      [c.email, c.first_name, c.last_name, c.phone, c.tags.join("; "), c.subscribed ? "yes" : "no", formTitle.get(c.source_form_id ?? "") ?? "", String(c.response_count), c.created_at, c.last_activity_at, ...props.map((p) => c.properties[p] ?? "")]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const setRule = (i: number, p: Partial<FilterRule>) =>
    setFilter((f) => ({ ...f, rules: f.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) }));

  const sortHead = (k: SortKey, label: string) => (
    <th key={k} className="px-3 py-2.5 font-normal" aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-[#262627]">
        {label}
        <span aria-hidden className={sort.key === k ? "text-[#262627]" : "text-transparent"}>{sort.dir === 1 ? "↑" : "↓"}</span>
      </button>
    </th>
  );

  const open = contacts.find((c) => c.id === openId) ?? null;

  return (
    <div className="flex min-h-[calc(100dvh-57px)]">
      {/* ------------------------------ sidebar ------------------------------ */}
      <aside className="hidden w-[248px] shrink-0 border-r border-[#e3e3e3] bg-[#fafafa] px-3 py-4 md:block">
        <button
          type="button"
          onClick={() => { setListId(null); setPage(0); setSelected(new Set()); }}
          className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[14px]", !listId ? "bg-[#ececec] font-medium" : "text-[#5e5e5e] hover:bg-[#f0f0f0]")}
        >
          All contacts <span className="text-[12px] text-[#6b6b6b]">{contacts.length.toLocaleString()}</span>
        </button>
        <div className="mt-5 mb-1 flex items-center justify-between px-2">
          <span className="text-[12px] font-medium uppercase tracking-wide text-[#6b6b6b]">Contact lists</span>
          <button type="button" aria-label="New contact list" onClick={() => { setText(""); setListKind("static"); setDialog({ kind: "new-list" }); }} className="flex h-6 w-6 items-center justify-center rounded text-[#5e5e5e] hover:bg-[#ececec]">+</button>
        </div>
        <ul className="space-y-0.5">
          {lists.length === 0 && <li className="px-2 py-1 text-[13px] text-[#6b6b6b]">No lists yet</li>}
          {lists.map((l) => {
            const count = l.kind === "smart" ? contacts.filter((c) => matchesFilter(c, l.filter)).length : l.member_count;
            return (
              <li key={l.id} className="group relative">
                <button
                  type="button"
                  onClick={() => { setListId(l.id); setPage(0); setSelected(new Set()); }}
                  className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 pr-9 text-left text-[14px]", listId === l.id ? "bg-[#ececec] font-medium" : "text-[#5e5e5e] hover:bg-[#f0f0f0]")}
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {l.kind === "smart" && <span aria-label="Smart list" title="Smart list (updates automatically)">⚡</span>}
                    <span className="truncate">{l.name}</span>
                  </span>
                  <span className="text-[12px] text-[#6b6b6b]">{count}</span>
                </button>
                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <Menu
                    label={`${l.name} options`}
                    items={[
                      { label: "Rename", onSelect: () => { setListId(l.id); setText(l.name); setDialog({ kind: "rename-list" }); } },
                      ...(l.kind === "smart" ? [{ label: "Use current filter", onSelect: () => act(() => updateListAction(l.id, { filter }), "List filter updated") }] : []),
                      { label: "Delete list", danger: true, onSelect: () => act(() => deleteListAction(l.id), "List deleted", () => setListId(null)) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {allTags.length > 0 && (
          <>
            <div className="mt-5 mb-1 px-2 text-[12px] font-medium uppercase tracking-wide text-[#6b6b6b]">Tags</div>
            <ul className="space-y-0.5">
              {allTags.slice(0, 14).map(([t, n]) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => { setFilter({ match: "all", rules: [{ field: "tag", op: "has", value: t }] }); setPage(0); }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px] text-[#5e5e5e] hover:bg-[#f0f0f0]"
                  >
                    <span className="truncate">#{t}</span>
                    <span className="text-[12px] text-[#6b6b6b]">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      {/* ------------------------------ main ------------------------------ */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold">{list ? list.name : "All contacts"}</h1>
          <span className="text-[14px] text-[#5e5e5e]">{rows.length.toLocaleString()} {rows.length === 1 ? "contact" : "contacts"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => act(syncContactsAction, "Contacts synced from responses")}>
              Sync from responses
            </button>
            {calendly && (
              <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => act(syncCalendlyAction, "Calendly calls synced")}>
                Sync Calendly
              </button>
            )}
            <button type="button" className={tf.btn} onClick={() => { setNewContact({ email: "", first_name: "", last_name: "", phone: "", tags: "" }); setDialog({ kind: "new-contact" }); }}>
              + Add contact
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#6b6b6b]" width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
            <input aria-label="Search contacts" placeholder="Search contacts" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className={cn(tf.input, "w-64 py-1.5 pl-8")} />
          </div>
          <button type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)} className={cn(tf.btnOutline, "py-1.5", activeRules > 0 && "border-[#262627]")}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h12M4.5 8h7M7 13h2" /></svg>
            Filter{activeRules > 0 && <span className="rounded-full bg-[#262627] px-1.5 text-[11px] text-white">{activeRules}</span>}
          </button>
          {activeRules > 0 && (
            <button type="button" className="text-[13px] text-[#5e5e5e] underline" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && <span className="text-[13px] text-[#5e5e5e]">{selected.size} selected</span>}
            <Menu
              align="right"
              label="Actions"
              trigger={<span className={cn(tf.btnOutline, "py-1.5")}>Actions <span aria-hidden>▾</span></span>}
              items={[
                { label: "Add tag", disabled: !selected.size, onSelect: () => { setText(""); setDialog({ kind: "tag-add" }); } },
                { label: "Remove tag", disabled: !selected.size, onSelect: () => { setText(""); setDialog({ kind: "tag-remove" }); } },
                { label: "Add to list", disabled: !selected.size, divider: true, onSelect: () => { setText(staticLists[0]?.id ?? ""); setDialog({ kind: "list-add" }); } },
                { label: "Remove from list", disabled: !selected.size || !staticLists.length, onSelect: () => { setText(list?.kind === "static" ? list.id : staticLists[0]?.id ?? ""); setDialog({ kind: "list-remove" }); } },
                { label: "Unsubscribe", disabled: !selected.size, divider: true, onSelect: () => act(() => setSubscribedAction(ids, false), "Unsubscribed") },
                { label: "Resubscribe", disabled: !selected.size, onSelect: () => act(() => setSubscribedAction(ids, true), "Subscribed again") },
                { label: selected.size ? "Export selected (CSV)" : "Export all (CSV)", divider: true, onSelect: () => exportCsv(selected.size ? contacts.filter((c) => selected.has(c.id)) : rows) },
                { label: "Save filter as smart list", disabled: !activeRules, onSelect: () => { setText(""); setListKind("smart"); setDialog({ kind: "new-list" }); } },
                { label: "Delete contacts", danger: true, divider: true, disabled: !selected.size, onSelect: () => setDialog({ kind: "delete" }) },
              ]}
            />
          </div>
        </div>

        {filterOpen && (
          <div className="mb-4 rounded-lg border border-[#e3e3e3] bg-[#fafafa] p-4" role="region" aria-label="Filters">
            <div className="mb-3 flex items-center gap-2 text-[14px]">
              Show contacts that match
              <select aria-label="Match" className={cn(tf.select, "py-1")} value={filter.match} onChange={(e) => setFilter({ ...filter, match: e.target.value as "all" | "any" })}>
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              of these conditions
            </div>
            <div className="space-y-2">
              {filter.rules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Condition ${i + 1} field`}
                    className={cn(tf.select, "py-1.5")}
                    value={r.field}
                    onChange={(e) => {
                      const field = e.target.value as FilterField;
                      setRule(i, { field, op: opsFor(field)[0], value: field === "subscribed" ? "yes" : "" });
                    }}
                  >
                    {fields.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                  </select>
                  <select aria-label={`Condition ${i + 1} operator`} className={cn(tf.select, "py-1.5")} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as FilterRule["op"] })}>
                    {opsFor(r.field).map((op) => (<option key={op} value={op}>{OP_LABELS[op]}</option>))}
                  </select>
                  {needsValue(r.op) && <RuleValue rule={r} onChange={(v) => setRule(i, { value: v })} tags={allTags.map(([t]) => t)} lists={staticLists} forms={forms} index={i} />}
                  <button type="button" aria-label={`Remove condition ${i + 1}`} className="text-[#6b6b6b] hover:text-[#c2331d]" onClick={() => setFilter((f) => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className={cn(tf.btnGhost, "mt-2 px-2 py-1 text-[13px]")} onClick={() => setFilter((f) => ({ ...f, rules: [...f.rules, { field: "tag", op: "has", value: allTags[0]?.[0] ?? "" }] }))}>
              + Add condition
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[900px] text-[14px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[13px] text-[#5e5e5e]">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={() => setSelected((s) => { const n = new Set(s); for (const c of pageRows) { if (allOnPage) n.delete(c.id); else n.add(c.id); } return n; })}
                  />
                </th>
                {sortHead("name", "Contact")}
                {sortHead("email", "Email")}
                <th className="px-3 py-2.5 font-normal">Phone</th>
                <th className="px-3 py-2.5 font-normal">Tags</th>
                <th className="px-3 py-2.5 font-normal">Source</th>
                {sortHead("responses", "Responses")}
                {sortHead("last_activity_at", "Last activity")}
                {sortHead("created_at", "Added")}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c.id} className={cn("border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]", selected.has(c.id) && "bg-[#f5f8ff]")}>
                  <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${c.email}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => setOpenId(c.id)} className="flex items-center gap-2.5 text-left">
                      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: tint(c.email) }}>{initials(c)}</span>
                      <span className="max-w-[180px] truncate font-medium hover:underline">{fullName(c) || "No name"}</span>
                      {!c.subscribed && <span className="rounded bg-[#f0f0f0] px-1.5 text-[11px] text-[#5e5e5e]">Unsubscribed</span>}
                    </button>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-[#5e5e5e]">{c.email}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#5e5e5e]">{c.phone || "-"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (<span key={t} className="truncate rounded-full bg-[#ececec] px-2 py-0.5 text-[12px]">{t}</span>))}
                      {c.tags.length > 3 && <span className="text-[12px] text-[#6b6b6b]">+{c.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-[#5e5e5e]">{formTitle.get(c.source_form_id ?? "") ?? "Manual"}</td>
                  <td className="px-3 py-2.5 text-[#5e5e5e]">{c.response_count}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#5e5e5e]" suppressHydrationWarning>{shortDate(c.last_activity_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#5e5e5e]" suppressHydrationWarning>{shortDate(c.created_at)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-[#5e5e5e]">
                    {contacts.length === 0 ? (
                      <>No contacts yet. They appear here when someone submits a form with their email, or press <b>Sync from responses</b>.</>
                    ) : (
                      "No contacts match."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-[13px]">
            <span className="text-[#5e5e5e]">Page {page + 1} of {pages}</span>
            <button type="button" className={cn(tf.btnOutline, "py-1")} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className={cn(tf.btnOutline, "py-1")} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
        {pending && <p className="mt-3 text-[13px] text-[#6b6b6b]" role="status">Working...</p>}
      </main>

      {open && (
        <ContactDrawer
          key={open.id}
          contact={open}
          lists={staticLists}
          formTitle={formTitle}
          onClose={() => setOpenId(null)}
          act={act}
        />
      )}

      {/* ------------------------------ dialogs ------------------------------ */}
      <Modal
        open={dialog?.kind === "tag-add" || dialog?.kind === "tag-remove"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "tag-add" ? `Add a tag to ${selected.size} contacts` : `Remove a tag from ${selected.size} contacts`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const add = dialog?.kind === "tag-add";
            setDialog(null);
            act(() => tagContactsAction(ids, text, add), add ? `Tagged "${text}"` : `Removed "${text}"`);
          }}
        >
          <input aria-label="Tag" list="tag-options" className={tf.input} placeholder="Tag name" value={text} onChange={(e) => setText(e.target.value)} />
          <datalist id="tag-options">{allTags.map(([t]) => (<option key={t} value={t} />))}</datalist>
          <div className="flex justify-end gap-2">
            <button type="button" className={tf.btnOutline} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={tf.btn} disabled={!text.trim()}>{dialog?.kind === "tag-add" ? "Add tag" : "Remove tag"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog?.kind === "list-add" || dialog?.kind === "list-remove"} onClose={() => setDialog(null)} title={dialog?.kind === "list-add" ? "Add to list" : "Remove from list"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const add = dialog?.kind === "list-add";
            setDialog(null);
            if (text === "__new") {
              act(() => createListAction(`New list ${new Date().toLocaleDateString()}`, "static"), "List created", (newId) => {
                start(async () => { await listMembershipAction(ids, newId, true); router.refresh(); });
              });
            } else act(() => listMembershipAction(ids, text, add), add ? "Added to list" : "Removed from list");
          }}
        >
          <select aria-label="List" className={cn(tf.select, "w-full")} value={text} onChange={(e) => setText(e.target.value)}>
            {staticLists.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            {dialog?.kind === "list-add" && <option value="__new">+ New list</option>}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" className={tf.btnOutline} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={tf.btn} disabled={!text}>{dialog?.kind === "list-add" ? "Add" : "Remove"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog?.kind === "new-list" || dialog?.kind === "rename-list"} onClose={() => setDialog(null)} title={dialog?.kind === "rename-list" ? "Rename list" : "New contact list"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const renaming = dialog?.kind === "rename-list";
            setDialog(null);
            if (renaming && listId) act(() => updateListAction(listId, { name: text }), "List renamed");
            else act(() => createListAction(text, listKind, listKind === "smart" ? filter : undefined), "List created", (id) => setListId(id));
          }}
        >
          <input aria-label="List name" className={tf.input} placeholder="e.g. Qualified leads" value={text} onChange={(e) => setText(e.target.value)} />
          {dialog?.kind === "new-list" && (
            <fieldset className="space-y-2 text-[14px]">
              <label className="flex items-start gap-2">
                <input type="radio" name="kind" checked={listKind === "static"} onChange={() => setListKind("static")} className="mt-1" />
                <span><b className="font-medium">Static list</b><br /><span className="text-[#5e5e5e]">You choose who is on it (Actions › Add to list, or an automation).</span></span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="kind" checked={listKind === "smart"} onChange={() => setListKind("smart")} className="mt-1" />
                <span><b className="font-medium">Smart list</b><br /><span className="text-[#5e5e5e]">Everyone matching the current filter ({activeRules} {activeRules === 1 ? "condition" : "conditions"}), always up to date.</span></span>
              </label>
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={tf.btnOutline} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={tf.btn} disabled={!text.trim()}>{dialog?.kind === "rename-list" ? "Save" : "Create list"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog?.kind === "delete"} onClose={() => setDialog(null)} title={`Delete ${selected.size} contacts?`}>
        <p className="text-[14px] text-[#5e5e5e]">The contacts are removed for good. Their form responses stay in each form&apos;s Results.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={tf.btnOutline} onClick={() => setDialog(null)}>Cancel</button>
          <button type="button" className={tf.btnDanger} onClick={() => { setDialog(null); act(() => deleteContactsAction(ids), "Contacts deleted", () => setSelected(new Set())); }}>Delete</button>
        </div>
      </Modal>

      <Modal open={dialog?.kind === "new-contact"} onClose={() => setDialog(null)} title="Add contact">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setDialog(null);
            act(
              () => createContactAction({ ...newContact, tags: newContact.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
              "Contact added",
            );
          }}
        >
          <div className="sm:col-span-2"><label className={tf.label} htmlFor="nc-email">Email</label><input id="nc-email" type="email" required className={tf.input} value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></div>
          <div><label className={tf.label} htmlFor="nc-first">First name</label><input id="nc-first" className={tf.input} value={newContact.first_name} onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })} /></div>
          <div><label className={tf.label} htmlFor="nc-last">Last name</label><input id="nc-last" className={tf.input} value={newContact.last_name} onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })} /></div>
          <div><label className={tf.label} htmlFor="nc-phone">Phone</label><input id="nc-phone" className={tf.input} value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} /></div>
          <div><label className={tf.label} htmlFor="nc-tags">Tags (comma separated)</label><input id="nc-tags" className={tf.input} value={newContact.tags} onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className={tf.btnOutline} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={tf.btn}>Add contact</button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-md bg-[#262627] px-4 py-2.5 text-[14px] text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

export function RuleValue({
  rule,
  onChange,
  tags,
  lists,
  forms,
  index,
}: {
  rule: FilterRule;
  onChange: (v: string) => void;
  tags: string[];
  lists: ContactList[];
  forms: FormRef[];
  index: number;
}) {
  const label = `Condition ${index + 1} value`;
  const v = rule.value ?? "";
  const sel = (opts: [string, string][]) => (
    <select aria-label={label} className={cn(tf.select, "py-1.5")} value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose...</option>
      {opts.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
    </select>
  );
  if (rule.field === "tag") return sel(tags.map((t) => [t, t]));
  if (rule.field === "list") return sel(lists.map((l) => [l.id, l.name]));
  if (rule.field === "source_form") return sel(forms.map((f) => [f.id, f.title]));
  if (rule.field === "subscribed") return sel([["yes", "Yes"], ["no", "No"]]);
  if ((rule.field === "created_at" || rule.field === "last_activity_at") && rule.op !== "in_last_days")
    return <input aria-label={label} type="date" className={cn(tf.input, "w-auto py-1.5")} value={v} onChange={(e) => onChange(e.target.value)} />;
  const numeric = rule.field === "responses" || rule.op === "in_last_days";
  return <input aria-label={label} type={numeric ? "number" : "text"} min={0} className={cn(tf.input, "w-48 py-1.5")} value={v} onChange={(e) => onChange(e.target.value)} />;
}

type ActFn = <T>(p: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string, after?: (d: T) => void) => void;

function ContactDrawer({
  contact: c,
  lists,
  formTitle,
  onClose,
  act,
}: {
  contact: Contact;
  lists: ContactList[];
  formTitle: Map<string, string>;
  onClose: () => void;
  act: ActFn;
}) {
  const [edit, setEdit] = useState({ first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone });
  const [tag, setTag] = useState("");
  const [subscribed, setSubscribed] = useState(c.subscribed); // flips instantly; the server catches up
  const [detail, setDetail] = useState<null | Awaited<ReturnType<typeof loadDetail>>>(null);
  const dirty = edit.first_name !== c.first_name || edit.last_name !== c.last_name || edit.email !== c.email || edit.phone !== c.phone;

  useEffect(() => {
    let live = true;
    loadDetail(c.id).then((d) => live && setDetail(d));
    return () => {
      live = false;
    };
  }, [c.id, c.tags.length, c.list_ids.length]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Contact ${c.email}`}
        onMouseDown={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#ececec] bg-white px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-semibold" style={{ background: tint(c.email) }}>{initials(c)}</span>
            <div>
              <p className="text-[16px] font-semibold">{fullName(c) || "No name"}</p>
              <p className="text-[13px] text-[#5e5e5e]">{c.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-[#5e5e5e] hover:bg-[#f0f0f0]">✕</button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={tf.label} htmlFor="cd-first">First name</label><input id="cd-first" className={tf.input} value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} /></div>
              <div><label className={tf.label} htmlFor="cd-last">Last name</label><input id="cd-last" className={tf.input} value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} /></div>
              <div className="col-span-2"><label className={tf.label} htmlFor="cd-email">Email</label><input id="cd-email" className={tf.input} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div className="col-span-2"><label className={tf.label} htmlFor="cd-phone">Phone</label><input id="cd-phone" className={tf.input} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" className={tf.btn} disabled={!dirty} onClick={() => act(() => updateContactAction(c.id, edit), "Contact saved")}>Save</button>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={subscribed} onChange={(e) => { const on = e.target.checked; setSubscribed(on); act(() => setSubscribedAction([c.id], on), on ? "Subscribed" : "Unsubscribed"); }} />
                Subscribed to emails
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#ececec] py-0.5 pr-1 pl-2.5 text-[13px]">
                  {t}
                  <button type="button" aria-label={`Remove tag ${t}`} className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] hover:bg-[#d4d4d4]" onClick={() => act(() => tagContactsAction([c.id], t, false), `Removed "${t}"`)}>✕</button>
                </span>
              ))}
              {c.tags.length === 0 && <span className="text-[13px] text-[#6b6b6b]">No tags</span>}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = tag; setTag(""); act(() => tagContactsAction([c.id], t, true), `Tagged "${t}"`); }}>
              <input aria-label="New tag" className={cn(tf.input, "py-1.5")} placeholder="Add a tag" value={tag} onChange={(e) => setTag(e.target.value)} />
              <button type="submit" className={tf.btnOutline} disabled={!tag.trim()}>Add</button>
            </form>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Lists</h3>
            {lists.length === 0 ? (
              <p className="text-[13px] text-[#6b6b6b]">No static lists yet.</p>
            ) : (
              <ul className="space-y-1">
                {lists.map((l) => (
                  <li key={l.id}>
                    <label className="flex items-center gap-2 text-[14px]">
                      <input type="checkbox" checked={c.list_ids.includes(l.id)} onChange={(e) => act(() => listMembershipAction([c.id], l.id, e.target.checked), e.target.checked ? `Added to ${l.name}` : `Removed from ${l.name}`)} />
                      {l.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {Object.keys(c.properties).length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Properties</h3>
              <dl className="divide-y divide-[#f0f0f0] rounded-lg border border-[#ececec]">
                {Object.entries(c.properties).map(([k, v]) => (
                  <div key={k} className="px-3 py-2">
                    <dt className="text-[12px] text-[#6b6b6b]">{k}</dt>
                    <dd className="text-[14px] break-words whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {detail && detail.bookings.length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Calls</h3>
              <ul className="space-y-2">
                {detail.bookings.map((b) => (
                  <li key={b.invitee_uri} className="rounded-md border border-[#ececec] px-3 py-2 text-[14px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{b.event_name || "Call"}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", b.state === "upcoming" ? "bg-[#e8f0ff] text-[#1d4ed8]" : b.state === "done" ? "bg-[#e3f5e9] text-[#1f7a43]" : "bg-[#fde8e4] text-[#c2331d]")}>
                        {b.state === "upcoming" ? "Upcoming" : b.state === "done" ? "Happened" : b.state === "no_show" ? "No-show" : "Canceled"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#6b6b6b]" suppressHydrationWarning>{new Date(b.start_time).toLocaleString()}</p>
                    {b.cancel_reason && <p className="text-[12px] text-[#6b6b6b]">Reason: {b.cancel_reason}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail && detail.watches.length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Videos watched</h3>
              <ul className="space-y-2">
                {detail.watches.map((w) => (
                  <li key={`${w.page_slug}-${w.block_id}`} className="rounded-md border border-[#ececec] px-3 py-2 text-[14px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{w.page_title}</span>
                      <b className={w.pct >= 75 ? "text-[#1f7a43]" : "text-[#b45309]"}>{w.pct}%</b>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]"><div className="h-full rounded-full bg-[#1f9d55]" style={{ width: `${w.pct}%` }} /></div>
                    <p className="mt-1 text-[12px] text-[#6b6b6b]" suppressHydrationWarning>{Math.round(w.seconds / 60)} min watched · {new Date(w.updated_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[#6b6b6b]">Activity</h3>
            {!detail ? (
              <p className="text-[13px] text-[#6b6b6b]">Loading...</p>
            ) : (
              <ul className="space-y-2">
                {detail.responses.map((r) => (
                  <li key={r.id} className="rounded-md border border-[#ececec] px-3 py-2 text-[14px]">
                    <Link href={`/forms/${r.form_id}/results/responses?lead=${r.id}`} className="font-medium hover:underline">
                      {r.partial ? "Started" : "Submitted"} {r.form_title}
                    </Link>
                    <p className="text-[12px] text-[#6b6b6b]" suppressHydrationWarning>{new Date(r.submitted_at).toLocaleString()}</p>
                  </li>
                ))}
                {detail.runs.map((r) => (
                  <li key={r.id} className="rounded-md border border-[#ececec] px-3 py-2 text-[14px]">
                    <Link href={`/automations/${r.automation_id}`} className="font-medium hover:underline">Automation: {r.automation_name}</Link>
                    <span className="ml-2 text-[12px] text-[#5e5e5e]">{r.status}</span>
                    {r.log.at(-1) && <p className="text-[12px] text-[#6b6b6b]">{r.log.at(-1)!.message}</p>}
                  </li>
                ))}
                {detail.responses.length + detail.runs.length === 0 && <p className="text-[13px] text-[#6b6b6b]">No activity yet.</p>}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-[#6b6b6b]">
              Source: {formTitle.get(c.source_form_id ?? "") ?? "Added by hand"}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

async function loadDetail(id: string) {
  const r = await contactDetailAction(id);
  return r.ok ? r.data : { responses: [], runs: [], watches: [], bookings: [] };
}
