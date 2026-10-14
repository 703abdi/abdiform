import type { Form, FormResponse } from "@/forms/types";
import { LEAD_STATUSES } from "@/forms/types";

const DAY = 86_400_000;

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Submissions per day for the last `days` days (zero-filled). */
export function timeline(responses: FormResponse[], days = 30) {
  const counts = new Map<string, number>();
  for (const r of responses) counts.set(dayKey(r.submitted_at), (counts.get(dayKey(r.submitted_at)) ?? 0) + 1);
  const out: { day: string; label: string; count: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const k = d.toISOString().slice(0, 10);
    out.push({
      day: k,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: counts.get(k) ?? 0,
    });
  }
  return out;
}

export function overview(forms: Form[], responses: FormResponse[]) {
  const now = Date.now();
  const within = (r: FormResponse, d: number) => now - Date.parse(r.submitted_at) <= d * DAY;
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of responses) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const views = forms.reduce((a, f) => a + f.views, 0);
  const webSubs = responses.filter((r) => r.source === "web").length;
  return {
    total: responses.length,
    last7: responses.filter((r) => within(r, 7)).length,
    prev7: responses.filter((r) => within(r, 14) && !within(r, 7)).length,
    today: responses.filter((r) => within(r, 1)).length,
    byStatus,
    completion: views > 0 ? Math.min(1, webSubs / views) : null,
    winRate: responses.length ? byStatus.won / responses.length : 0,
  };
}

export function perFormStats(f: Form, responses: FormResponse[]) {
  const mine = responses.filter((r) => r.form_id === f.id);
  const web = mine.filter((r) => r.source === "web").length;
  return {
    count: mine.length,
    newCount: mine.filter((r) => r.status === "new").length,
    completion: f.views > 0 ? Math.min(1, web / f.views) : null,
    last: mine[0]?.submitted_at ?? null,
  };
}
