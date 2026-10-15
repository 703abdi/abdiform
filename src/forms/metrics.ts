import type { Form, FormResponse } from "@/forms/types";
import { LEAD_STATUSES } from "@/forms/types";
import { flattenFields, isEmptyAnswer, isPartial } from "@/forms/lib";

const DAY = 86_400_000;

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Submissions per day for the last `days` days (zero-filled). */
export function timeline(all: FormResponse[], days = 30) {
  const responses = all.filter((r) => !isPartial(r));
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

export function overview(forms: Form[], all: FormResponse[]) {
  const responses = all.filter((r) => !isPartial(r));
  const now = Date.now();
  const within = (r: FormResponse, d: number) => now - Date.parse(r.submitted_at) <= d * DAY;
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of responses) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const views = forms.reduce((a, f) => a + f.views, 0);
  const webSubs = responses.filter((r) => r.source === "web").length;
  return {
    partials: all.length - responses.length,
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
  const all = responses.filter((r) => r.form_id === f.id);
  const mine = all.filter((r) => !isPartial(r));
  const web = mine.filter((r) => r.source === "web").length;
  return {
    partials: all.length - mine.length,
    count: mine.length,
    newCount: mine.filter((r) => r.status === "new").length,
    completion: f.views > 0 ? Math.min(1, web / f.views) : null,
    last: mine[0]?.submitted_at ?? null,
  };
}

const countBy = (xs: string[]) =>
  Object.entries(
    xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);

/** Typeform-style insights: funnel, devices, endings, traffic sources, completion time. */
export function insights(form: Form, all: FormResponse[]) {
  const done = all.filter((r) => !isPartial(r));
  const durations = done.map((r) => r.meta?.duration_s).filter((n): n is number => typeof n === "number" && n > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

  const funnel = form.fields.map((screen) => {
    const leaves = flattenFields([screen]);
    const answered = all.filter((r) => leaves.some((l) => !isEmptyAnswer(r.answers[l.id]) || typeof r.answers[l.id] === "boolean")).length;
    return { id: screen.id, title: screen.title, answered };
  });
  const endingNames = new Map([["default", "Default ending"], ...(form.settings.endings ?? []).map((e) => [e.id, e.title.slice(0, 60) || e.id] as [string, string])]);
  const scored = done.map((r) => r.meta?.score).filter((n): n is number => typeof n === "number");

  return {
    avgSeconds: avg,
    medianSeconds: median,
    funnel,
    devices: countBy(all.map((r) => r.meta?.device).filter((x): x is NonNullable<typeof x> => !!x)),
    endings: countBy(done.map((r) => r.meta?.ending).filter((x): x is string => !!x)).map(([id, n]) => [endingNames.get(id) ?? id, n] as [string, number]),
    sources: countBy(all.map((r) => r.meta?.utm?.utm_source).filter((x): x is string => !!x)),
    avgScore: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
  };
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return "n/a";
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

/**
 * Chart data that fits the data: the last 30 days (daily) when there is recent
 * activity, otherwise weekly buckets across the whole history.
 */
export function timelineAuto(all: FormResponse[]): { title: string; data: { day: string; label: string; count: number }[] } {
  const done = all.filter((r) => !isPartial(r));
  const now = Date.now();
  if (done.length === 0 || done.some((r) => now - Date.parse(r.submitted_at) <= 30 * DAY)) {
    return { title: "Leads, last 30 days", data: timeline(all, 30) };
  }
  const times = done.map((r) => Date.parse(r.submitted_at));
  const weekStart = (t: number) => {
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  };
  const first = weekStart(Math.min(...times));
  const last = weekStart(Math.max(...times));
  const counts = new Map<number, number>();
  for (const t of times) counts.set(weekStart(t), (counts.get(weekStart(t)) ?? 0) + 1);
  const data: { day: string; label: string; count: number }[] = [];
  for (let w = Math.max(first, last - 103 * 7 * DAY); w <= last; w += 7 * DAY) {
    const d = new Date(w);
    data.push({
      day: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      count: counts.get(w) ?? 0,
    });
  }
  return { title: "Leads per week", data };
}
