"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function ResultsTabs({ id, responses }: { id: string; responses: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/forms/${id}/results`, label: "Performance", exact: true },
    { href: `/forms/${id}/results/summary`, label: "Summary" },
    { href: `/forms/${id}/results/responses`, label: `Responses (${responses.toLocaleString()})` },
  ];
  return (
    <nav aria-label="Results" className="mb-6 flex gap-1 border-b border-[#e3e3e3]">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-[14px]",
              active ? "border-[#262627] font-medium text-[#262627]" : "border-transparent text-[#5e5e5e] hover:text-[#262627]",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
