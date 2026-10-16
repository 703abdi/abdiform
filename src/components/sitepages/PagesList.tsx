"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SitePage } from "@/sitepages/types";
import { PAGE_TEMPLATES } from "@/sitepages/templates";
import { createPageAction, deletePageAction, duplicatePageAction } from "@/sitepages/actions";
import { Menu } from "@/components/admin/Menu";
import { Modal } from "@/components/admin/Modal";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function PagesList({ pages }: { pages: SitePage[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [tpl, setTpl] = useState(PAGE_TEMPLATES[0].key);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [del, setDel] = useState<SitePage | null>(null);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Pages</h1>
          <p className="text-[14px] text-[#5e5e5e]">VSLs, pre-call pages and landing pages. Edit them here or ask Claude to build one.</p>
        </div>
        <button type="button" className={cn(tf.btn, "ml-auto")} onClick={() => setOpen(true)}>+ Create page</button>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d4d4d4] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">No pages yet</p>
          <p className="mt-1 text-[14px] text-[#5e5e5e]">Start from the pre-call template, a VSL page or a blank page.</p>
          <button type="button" className={cn(tf.btn, "mt-4")} onClick={() => setOpen(true)}>Create your first page</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-4 py-2.5 font-normal">Page</th>
                <th className="px-4 py-2.5 font-normal">Link</th>
                <th className="px-4 py-2.5 text-right font-normal">Visitors</th>
                <th className="px-4 py-2.5 text-right font-normal">Button clicks</th>
                <th className="px-4 py-2.5 font-normal">Updated</th>
                <th className="w-12 px-2 py-2.5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3">
                    <Link href={`/pages/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                    <span className="ml-2 inline-flex items-center gap-1 text-[12px] text-[#6b6b6b]">
                      <span className={cn("h-1.5 w-1.5 rounded-full", p.status === "published" ? "bg-[#1f9d55]" : "bg-[#767676]")} />
                      {p.status === "published" ? "Live" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#5e5e5e]">/p/{p.slug}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{(p.visitors ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{(p.clicks ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#5e5e5e]" suppressHydrationWarning>{shortDate(p.updated_at)}</td>
                  <td className="px-2 py-3 text-right">
                    <Menu
                      label={`Actions for ${p.title}`}
                      items={[
                        { label: "Edit", href: `/pages/${p.id}` },
                        { label: p.status === "published" ? "Open live page" : "Preview", href: `/p/${p.slug}${p.status === "published" ? "" : "?preview=1"}` },
                        {
                          label: "Copy link",
                          onSelect: async () => {
                            await navigator.clipboard.writeText(`${window.location.origin}/p/${p.slug}`);
                            flash(p.status === "published" ? "Link copied" : "Link copied. Publish the page so people can open it.");
                          },
                        },
                        {
                          label: "Duplicate",
                          divider: true,
                          onSelect: () =>
                            start(async () => {
                              const r = await duplicatePageAction(p.id);
                              flash(r.ok ? "Page duplicated" : r.error);
                              router.refresh();
                            }),
                        },
                        { label: "Delete", danger: true, onSelect: () => setDel(p) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && <p className="mt-3 text-[13px] text-[#6b6b6b]" role="status">Working...</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="Create a page" width="max-w-2xl">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createPageAction(title, tpl);
              if (r.ok) router.push(`/pages/${r.data}`);
              else setErr(r.error);
            });
          }}
        >
          <div>
            <label className={tf.label} htmlFor="new-page-title">Page name</label>
            <input id="new-page-title" className={tf.input} placeholder="e.g. Pre-call page" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <fieldset>
            <legend className={tf.label}>Start from</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PAGE_TEMPLATES.map((t) => (
                <label key={t.key} className={cn("cursor-pointer rounded-lg border px-3.5 py-3", tpl === t.key ? "border-[#262627] bg-[#fafafa] ring-1 ring-[#262627]" : "border-[#e3e3e3] hover:border-[#bdbdbd]")}>
                  <input type="radio" name="tpl" className="sr-only" checked={tpl === t.key} onChange={() => setTpl(t.key)} />
                  <span className="block text-[14px] font-medium">{t.name}</span>
                  <span className="block text-[13px] text-[#5e5e5e]">{t.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {err && <p className="text-[13px] text-[#c2331d]">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={tf.btnOutline} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={tf.btn} disabled={pending}>{pending ? "Creating..." : "Create page"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Delete this page?">
        <p className="text-[14px] text-[#5e5e5e]"><b className="text-[#262627]">{del?.title}</b> will be deleted and its link will stop working.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={tf.btnOutline} onClick={() => setDel(null)}>Cancel</button>
          <button
            type="button"
            className={tf.btnDanger}
            onClick={() => {
              const p = del!;
              setDel(null);
              start(async () => {
                const r = await deletePageAction(p.id);
                flash(r.ok ? "Page deleted" : r.error);
                router.refresh();
              });
            }}
          >
            Delete page
          </button>
        </div>
      </Modal>
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-md bg-[#262627] px-4 py-2.5 text-[14px] text-white shadow-lg">{toast}</div>}
    </main>
  );
}
