"use client";

// Typeform-style workspace home: workspaces on the left, forms table (or grid) on the right,
// a "..." menu per form with the usual actions.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormListItem, Workspace } from "@/workspace/repo";
import { Menu, type MenuItem } from "@/components/admin/Menu";
import { Modal } from "@/components/admin/Modal";
import { tf } from "@/components/admin/styles";
import { TEMPLATES } from "@/forms/templates";
import { createBlankFormAction, deleteFormAction, duplicateFormAction } from "@/forms/actions";
import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  moveFormAction,
  renameFormAction,
  renameWorkspaceAction,
} from "@/workspace/actions";
import { cn } from "@/lib/cn";

type Sort = "created" | "updated" | "name" | "responses";
const SORTS: Record<Sort, string> = { created: "Date created", updated: "Last updated", name: "Alphabetical", responses: "Most responses" };
const COLORS = ["#c9e4ff", "#ffe2c6", "#d9f2d0", "#f3d4f7", "#fff1b8", "#d6d6ff"];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function FormsHome({ workspaces, forms, current }: { workspaces: Workspace[]; forms: FormListItem[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sort, setSort] = useState<Sort>("created");
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [rename, setRename] = useState<{ kind: "form" | "workspace"; id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FormListItem | null>(null);
  const [newWs, setNewWs] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const ws = workspaces.find((w) => w.id === current) ?? workspaces[0];
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  const act = (p: Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) flash(r.error ?? "Something went wrong.");
      else {
        if (done) flash(done);
        router.refresh();
      }
    });

  const rows = useMemo(() => {
    const list = forms.filter((f) => f.workspace_id === ws?.id && f.title.toLowerCase().includes(query.trim().toLowerCase()));
    const by: Record<Sort, (a: FormListItem, b: FormListItem) => number> = {
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      name: (a, b) => a.title.localeCompare(b.title),
      responses: (a, b) => b.responses - a.responses,
    };
    return list.sort(by[sort]);
  }, [forms, ws, query, sort]);

  const link = (f: FormListItem) => `${window.location.origin}/apply/${f.slug}`;

  function menuFor(f: FormListItem): MenuItem[] {
    const others = workspaces.filter((w) => w.id !== f.workspace_id);
    return [
      {
        label: "Copy link",
        onSelect: async () => {
          await navigator.clipboard.writeText(link(f));
          flash(f.status === "published" ? "Link copied" : "Link copied. Publish the form so people can open it.");
        },
      },
      { label: "Content", href: `/forms/${f.id}/create`, divider: true },
      { label: "Workflow", href: `/forms/${f.id}/workflow` },
      { label: "Connect", href: `/forms/${f.id}/connect` },
      { label: "Share", href: `/forms/${f.id}/share` },
      { label: "Results", href: `/forms/${f.id}/results` },
      { label: "Rename", divider: true, onSelect: () => setRename({ kind: "form", id: f.id, value: f.title }) },
      {
        label: "Duplicate",
        onSelect: () =>
          start(async () => {
            const r = await duplicateFormAction(f.id);
            if (r.ok) {
              flash("Form duplicated");
              router.refresh();
            } else flash(r.error);
          }),
      },
      {
        label: "Copy to",
        submenu: workspaces.map((w) => ({
          label: w.name,
          onSelect: () => act(duplicateFormAction(f.id, w.id), `Copied to ${w.name}`),
        })),
      },
      {
        label: "Move to",
        submenu: others.map((w) => ({ label: w.name, onSelect: () => act(moveFormAction(f.id, w.id), `Moved to ${w.name}`) })),
      },
      { label: "Delete", danger: true, divider: true, onSelect: () => setConfirmDelete(f) },
    ];
  }

  return (
    <div className="flex min-h-[calc(100dvh-57px)]">
      {/* ------------------------------ sidebar ------------------------------ */}
      <aside className="hidden w-[248px] shrink-0 border-r border-[#e3e3e3] bg-[#fafafa] px-3 py-4 md:block">
        <button type="button" onClick={() => setCreateOpen(true)} className={cn(tf.btn, "mb-5 w-full")}>
          <span aria-hidden className="text-[16px] leading-none">+</span> Create a new form
        </button>
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[12px] font-medium uppercase tracking-wide text-[#6b6b6b]">Workspaces</span>
          <button type="button" aria-label="New workspace" onClick={() => setNewWs("")} className="flex h-6 w-6 items-center justify-center rounded text-[#5e5e5e] hover:bg-[#ececec]">
            +
          </button>
        </div>
        <ul className="space-y-0.5">
          {workspaces.map((w) => (
            <li key={w.id} className="group relative">
              <Link
                href={`/forms?ws=${w.id}`}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 pr-9 text-[14px]",
                  w.id === ws?.id ? "bg-[#ececec] font-medium text-[#262627]" : "text-[#5e5e5e] hover:bg-[#f0f0f0]",
                )}
              >
                <span className="truncate">{w.name}</span>
                <span className="text-[12px] text-[#6b6b6b]">{w.form_count}</span>
              </Link>
              <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <Menu
                  label={`${w.name} options`}
                  items={[
                    { label: "Rename", onSelect: () => setRename({ kind: "workspace", id: w.id, value: w.name }) },
                    {
                      label: "Delete",
                      danger: true,
                      disabled: workspaces.length <= 1,
                      onSelect: () => act(deleteWorkspaceAction(w.id), "Workspace deleted. Its forms moved to your first workspace."),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
        {newWs !== null && (
          <form
            className="mt-2 px-1"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createWorkspaceAction(newWs);
                setNewWs(null);
                if (r.ok) router.push(`/forms?ws=${r.data}`);
                else flash(r.error);
              });
            }}
          >
            <input autoFocus aria-label="Workspace name" className={tf.input} placeholder="Workspace name" value={newWs} onChange={(e) => setNewWs(e.target.value)} onBlur={() => !newWs && setNewWs(null)} />
          </form>
        )}
      </aside>

      {/* ------------------------------ main ------------------------------ */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold">{ws?.name ?? "My workspace"}</h1>
          <button type="button" onClick={() => setInviteOpen(true)} className={cn(tf.btnOutline, "py-1 text-[13px]")}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2.5" /><path d="M1.5 13c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M12.5 5v4M10.5 7h4" /></svg>
            Invite
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setCreateOpen(true)} className={cn(tf.btn, "md:hidden")}>+ Create form</button>
            <input
              aria-label="Search forms"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(tf.input, "hidden w-44 py-1.5 sm:block")}
            />
            <select aria-label="Sort forms" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cn(tf.select, "py-1.5")}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex rounded-md border border-[#d4d4d4] p-0.5" role="group" aria-label="View">
              {(["list", "grid"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded px-2.5 py-1 text-[13px] capitalize", view === v ? "bg-[#ececec] font-medium" : "text-[#5e5e5e]")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {banner && (
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg bg-[#f4ecff] px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[18px]" aria-hidden>✦</div>
            <p className="min-w-0 flex-1 text-[14px] text-[#262627]">
              <b className="font-semibold">Capture visitor info with an enticing offer.</b> Turn traffic into qualified leads with a short application, then route them to a booking page automatically.
            </p>
            <button type="button" onClick={() => setCreateOpen(true)} className={tf.btn}>Create form</button>
            <button type="button" aria-label="Dismiss" onClick={() => setBanner(false)} className="text-[#5e5e5e] hover:text-[#262627]">✕</button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d4d4d4] px-6 py-16 text-center">
            <p className="text-[15px] font-medium">{query ? "No forms match your search." : "This workspace is empty."}</p>
            <p className="mt-1 text-[14px] text-[#5e5e5e]">Create a form from scratch, a template, or import one from Typeform.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setCreateOpen(true)} className={tf.btn}>Create form</button>
              <Link href="/forms/import" className={tf.btnOutline}>Import from Typeform</Link>
            </div>
          </div>
        ) : view === "list" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-b border-[#e3e3e3] text-left text-[13px] text-[#5e5e5e]">
                  <th className="py-2.5 pr-3 font-normal">Name</th>
                  <th className="w-[110px] px-3 py-2.5 font-normal">Responses</th>
                  <th className="w-[110px] px-3 py-2.5 font-normal">Completed</th>
                  <th className="w-[130px] px-3 py-2.5 font-normal">Updated</th>
                  <th className="w-[130px] px-3 py-2.5 font-normal">Integrations</th>
                  <th className="w-[48px] py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((f, i) => (
                  <tr key={f.id} className="group border-b border-[#ececec] hover:bg-[#fafafa]">
                    <td className="py-3 pr-3">
                      <Link href={`/forms/${f.id}/results`} className="flex items-center gap-3">
                        <span aria-hidden className="h-10 w-10 shrink-0 rounded-md" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#262627] group-hover:underline">{f.title}</span>
                          <span className="flex items-center gap-1.5 text-[12px] text-[#6b6b6b]">
                            <span className={cn("h-1.5 w-1.5 rounded-full", f.status === "published" ? "bg-[#1f9d55]" : f.status === "closed" ? "bg-[#c2331d]" : "bg-[#a3a3a3]")} />
                            {f.status === "published" ? "Live" : f.status === "closed" ? "Closed" : "Draft"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{f.responses > 0 ? f.responses.toLocaleString() : "-"}</td>
                    <td className="px-3 py-3">{f.starts > 0 ? `${Math.min(100, Math.round((f.completed / f.starts) * 100))}%` : f.responses > 0 ? `${Math.round((f.completed / f.responses) * 100)}%` : "-"}</td>
                    <td className="px-3 py-3 text-[#5e5e5e]" suppressHydrationWarning>{shortDate(f.updated_at)}</td>
                    <td className="px-3 py-3"><Integrations list={f.integrations} /></td>
                    <td className="py-3 text-right"><Menu items={menuFor(f)} label={`Actions for ${f.title}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {rows.map((f, i) => (
              <div key={f.id} className="group relative overflow-hidden rounded-lg border border-[#e3e3e3] bg-white hover:shadow-md">
                <Link href={`/forms/${f.id}/results`} className="block">
                  <div className="flex h-32 items-center justify-center px-4 text-center text-[15px] font-medium" style={{ background: COLORS[i % COLORS.length] }}>
                    {f.title}
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px] text-[#5e5e5e]">
                    <span>{f.responses > 0 ? `${f.responses.toLocaleString()} responses` : "No responses"}</span>
                  </div>
                </Link>
                <div className="absolute right-1.5 bottom-1"><Menu items={menuFor(f)} label={`Actions for ${f.title}`} /></div>
              </div>
            ))}
          </div>
        )}
        {pending && <p className="mt-4 text-[13px] text-[#6b6b6b]" role="status">Working...</p>}
      </main>

      {/* ------------------------------ dialogs ------------------------------ */}
      <CreateFormDialog open={createOpen} onClose={() => setCreateOpen(false)} workspaceId={ws?.id} />

      <Modal open={!!rename} onClose={() => setRename(null)} title={rename?.kind === "workspace" ? "Rename workspace" : "Rename form"}>
        {rename && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const r = rename;
              setRename(null);
              act(r.kind === "form" ? renameFormAction(r.id, r.value) : renameWorkspaceAction(r.id, r.value), "Renamed");
            }}
            className="space-y-4"
          >
            <input aria-label="Name" className={tf.input} value={rename.value} onChange={(e) => setRename({ ...rename, value: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className={tf.btnOutline} onClick={() => setRename(null)}>Cancel</button>
              <button type="submit" className={tf.btn}>Save</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this form?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-[14px] text-[#5e5e5e]">
              <b className="text-[#262627]">{confirmDelete.title}</b> and its {confirmDelete.responses.toLocaleString()} responses will be deleted for good. Contacts it created stay in Contacts.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={tf.btnOutline} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className={tf.btnDanger}
                onClick={() => {
                  const f = confirmDelete;
                  setConfirmDelete(null);
                  act(deleteFormAction(f.id), "Form deleted");
                }}
              >
                Delete form
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite to workspace">
        <p className="text-[14px] text-[#5e5e5e]">
          This workspace uses a single admin login. To give a teammate access, share the admin page link and the admin password with them privately.
        </p>
        <InviteLink />
      </Modal>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-md bg-[#262627] px-4 py-2.5 text-[14px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function InviteLink() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex gap-2">
      <input readOnly aria-label="Admin link" className={tf.input} value={typeof window === "undefined" ? "/forms" : `${window.location.origin}/forms`} />
      <button
        type="button"
        className={tf.btn}
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}/forms`);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Integrations({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-[#767676]">-</span>;
  const meta: Record<string, { title: string; bg: string; glyph: string }> = {
    calendly: { title: "Calendly", bg: "#006bff", glyph: "C" },
    email: { title: "Email notifications", bg: "#262627", glyph: "@" },
    webhook: { title: "Webhook", bg: "#7b3fe4", glyph: "⚡" },
  };
  return (
    <span className="flex gap-1">
      {list.map((k) => (
        <span key={k} title={meta[k]?.title ?? k} className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-white" style={{ background: meta[k]?.bg ?? "#8a8a8a" }}>
          {meta[k]?.glyph ?? "?"}
        </span>
      ))}
    </span>
  );
}

export function CreateFormDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title="Create a new form" width="max-w-2xl">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createBlankFormAction(title, tpl, workspaceId);
            if (r.ok) router.push(`/forms/${r.data.id}/create`);
            else setErr(r.error);
          });
        }}
      >
        <div>
          <label className={tf.label} htmlFor="new-form-name">Form name</label>
          <input id="new-form-name" className={tf.input} placeholder="My new form" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset>
          <legend className={tf.label}>Start from</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <label
                key={t.key}
                className={cn(
                  "cursor-pointer rounded-lg border px-3.5 py-3",
                  tpl === t.key ? "border-[#262627] bg-[#fafafa] ring-1 ring-[#262627]" : "border-[#e3e3e3] hover:border-[#bdbdbd]",
                )}
              >
                <input type="radio" name="tpl" value={t.key} checked={tpl === t.key} onChange={() => setTpl(t.key)} className="sr-only" />
                <span className="block text-[14px] font-medium">{t.name}</span>
                <span className="block text-[13px] text-[#5e5e5e]">{t.description}</span>
              </label>
            ))}
            <Link href="/forms/import" className="rounded-lg border border-dashed border-[#d4d4d4] px-3.5 py-3 hover:border-[#bdbdbd]">
              <span className="block text-[14px] font-medium">Import from Typeform</span>
              <span className="block text-[13px] text-[#5e5e5e]">Bring over questions, logic and responses.</span>
            </Link>
          </div>
        </fieldset>
        {err && <p className="text-[13px] text-[#c2331d]">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={tf.btnOutline} onClick={onClose}>Cancel</button>
          <button type="submit" className={tf.btn} disabled={pending}>{pending ? "Creating..." : "Create form"}</button>
        </div>
      </form>
    </Modal>
  );
}
