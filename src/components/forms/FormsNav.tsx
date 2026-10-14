"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/forms", label: "Overview", exact: true },
  { href: "/forms/import", label: "Import from Typeform" },
];

export function FormsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-0.5 lg:flex-col">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
