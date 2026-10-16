"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { tf } from "@/components/admin/styles";
import { setFormStatusAction } from "@/forms/actions";
import type { FormStatus } from "@/forms/types";

const TABS = [
  ["create", "Content"],
  ["workflow", "Workflow"],
  ["connect", "Connect"],
  ["share", "Share"],
  ["results", "Results"],
] as const;

export function FormHeader({
  id,
  title,
  slug,
  status,
  workspace,
}: {
  id: string;
  title: string;
  slug: string;
  status: FormStatus;
  workspace: { id: string; name: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const live = status === "published";

  const setStatus = (s: FormStatus) =>
    start(async () => {
      const r = await setFormStatusAction(id, s);
      if (r.ok) {
        setErr(null);
        router.refresh();
      } else setErr(r.error);
    });

  return (
    <header className="sticky top-0 z-40 border-b border-[#e3e3e3] bg-white">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14px]">
          <Link href="/forms" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#262627] text-[13px] font-bold text-white" aria-label="Home">T</Link>
          <Link href={workspace ? `/forms?ws=${workspace.id}` : "/forms"} className="hidden truncate text-[#5e5e5e] hover:text-[#262627] sm:inline">
            {workspace?.name ?? "My workspace"}
          </Link>
          <span aria-hidden className="hidden text-[#767676] sm:inline">›</span>
          <span className="truncate font-medium">{title}</span>
        </nav>

        <nav aria-label="Form" className="mx-auto hidden h-full items-stretch lg:flex">
          {TABS.map(([k, label]) => {
            const href = `/forms/${id}/${k}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={k}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center border-b-2 px-3.5 text-[14px]",
                  active ? "border-[#262627] font-medium text-[#262627]" : "border-transparent text-[#5e5e5e] hover:text-[#262627]",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {err && <span className="hidden text-[13px] text-[#c2331d] md:inline">{err}</span>}
          <a href={`/apply/${slug}?preview=1`} target="_blank" rel="noreferrer" className={cn(tf.btnGhost, "px-2.5")} title="Preview">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10z" /><circle cx="10" cy="10" r="2.5" /></svg>
            <span className="sr-only">Preview</span>
          </a>
          {live ? (
            <button type="button" disabled={pending} onClick={() => setStatus("draft")} className={tf.btnOutline} title="Stop accepting responses">
              <span className="h-2 w-2 rounded-full bg-[#1f9d55]" aria-hidden /> Live
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => setStatus("published")} className={tf.btn}>
              {pending ? "Publishing..." : "Publish"}
            </button>
          )}
        </div>
      </div>
      <nav aria-label="Form sections" className="flex overflow-x-auto border-t border-[#ececec] px-2 lg:hidden">
        {TABS.map(([k, label]) => {
          const href = `/forms/${id}/${k}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={k} href={href} className={cn("border-b-2 px-3 py-2.5 text-[14px] whitespace-nowrap", active ? "border-[#262627] font-medium" : "border-transparent text-[#5e5e5e]")}>
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
