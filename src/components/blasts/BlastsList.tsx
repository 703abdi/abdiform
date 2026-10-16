"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Blast } from "@/blasts/types";
import { createBlastAction, deleteBlastAction, duplicateBlastAction } from "@/blasts/actions";
import { Menu } from "@/components/admin/Menu";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";

export const STATUS: Record<Blast["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[#f0f0f0] text-[#5e5e5e]" },
  scheduled: { label: "Scheduled", cls: "bg-[#e8f0ff] text-[#1d4ed8]" },
  sending: { label: "Sending", cls: "bg-[#fff6e0] text-[#7a5300]" },
  sent: { label: "Sent", cls: "bg-[#e3f5e9] text-[#1f7a43]" },
  failed: { label: "Failed", cls: "bg-[#fde8e4] text-[#c2331d]" },
  cancelled: { label: "Cancelled", cls: "bg-[#f0f0f0] text-[#5e5e5e]" },
};

export function BlastsList({ blasts, brevoReady }: { blasts: Blast[]; brevoReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const create = () =>
    start(async () => {
      const r = await createBlastAction("New blast");
      if (r.ok) router.push(`/blasts/${r.data}`);
      else setErr(r.error);
    });
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Blasts</h1>
          <p className="text-[14px] text-[#5e5e5e]">Email your contacts, a list, or anyone matching a filter. Sent through Brevo.</p>
        </div>
        <button type="button" className={cn(tf.btn, "ml-auto")} disabled={pending} onClick={create}>+ New blast</button>
      </div>
      {!brevoReady && (
        <p className="mb-4 rounded-md bg-[#fff6e0] px-4 py-3 text-[14px] text-[#7a5300]">
          Brevo isn&apos;t connected yet. You can write and preview blasts now; sending starts working once BREVO_API_KEY and BLAST_FROM_EMAIL are added in Vercel.
        </p>
      )}
      {err && <p className="mb-3 text-[13px] text-[#c2331d]">{err}</p>}
      {blasts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d4d4d4] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">No blasts yet</p>
          <p className="mt-1 text-[14px] text-[#5e5e5e]">Write one email, pick who gets it, send it now or schedule it.</p>
          <button type="button" className={cn(tf.btn, "mt-4")} onClick={create}>Write your first blast</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-4 py-2.5 font-normal">Blast</th>
                <th className="px-4 py-2.5 font-normal">Status</th>
                <th className="px-4 py-2.5 text-right font-normal">Sent</th>
                <th className="px-4 py-2.5 font-normal">When</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {blasts.map((b) => (
                <tr key={b.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3">
                    <Link href={`/blasts/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                    <span className="block truncate text-[13px] text-[#6b6b6b]">{b.subject || "No subject yet"}</span>
                  </td>
                  <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-0.5 text-[12px]", STATUS[b.status].cls)}>{STATUS[b.status].label}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.stats ? `${b.stats.sent.toLocaleString()}${b.stats.total ? ` / ${b.stats.total.toLocaleString()}` : ""}` : "-"}</td>
                  <td className="px-4 py-3 text-[#5e5e5e]" suppressHydrationWarning>
                    {b.sent_at ? new Date(b.sent_at).toLocaleString() : b.scheduled_at ? `Scheduled ${new Date(b.scheduled_at).toLocaleString()}` : "-"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Menu
                      label={`Actions for ${b.name}`}
                      items={[
                        { label: "Open", href: `/blasts/${b.id}` },
                        { label: "Duplicate", onSelect: () => start(async () => { const r = await duplicateBlastAction(b.id); if (r.ok && r.data) router.push(`/blasts/${r.data}`); }) },
                        { label: "Delete", danger: true, divider: true, disabled: b.status === "sending", onSelect: () => start(async () => { if (window.confirm(`Delete "${b.name}"?`)) { await deleteBlastAction(b.id); router.refresh(); } }) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
