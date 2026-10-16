"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEVICE_LABELS, RANGE_LABELS, type DeviceKey, type RangeKey } from "@/forms/events-labels";
import { tf } from "@/components/admin/styles";

export function PerformanceFilters({ range, device }: { range: RangeKey; device: DeviceKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v === "all") next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <div className="flex gap-2">
      <select aria-label="Date range" className={tf.select} value={range} onChange={(e) => set("range", e.target.value)}>
        {Object.entries(RANGE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
      </select>
      <select aria-label="Device" className={tf.select} value={device} onChange={(e) => set("device", e.target.value)}>
        {Object.entries(DEVICE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
      </select>
    </div>
  );
}
