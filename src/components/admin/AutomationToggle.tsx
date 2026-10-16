"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAutomationStatusAction } from "@/automations/actions";
import type { AutomationStatus } from "@/automations/types";
import { cn } from "@/lib/cn";

export function AutomationToggle({ id, status }: { id: string; status: AutomationStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const on = status === "live";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? "Turn off" : "Turn on"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setAutomationStatusAction(id, on ? "paused" : "live");
            setErr(r.ok ? null : r.error);
            if (r.ok) router.refresh();
          })
        }
        className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-[#1f9d55]" : "bg-[#d4d4d4]")}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="text-[13px] text-[#5e5e5e]">{on ? "On" : status === "paused" ? "Paused" : "Draft"}</span>
      {err && <span className="text-[12px] text-[#c2331d]">{err}</span>}
    </span>
  );
}
