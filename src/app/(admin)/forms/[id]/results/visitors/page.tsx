import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { DEVICE_LABELS, RANGE_LABELS, since, type DeviceKey, type RangeKey } from "@/forms/events";
import { visitReport } from "@/forms/visits";
import { plainText } from "@/forms/lib";
import { PerformanceFilters } from "@/components/admin/PerformanceFilters";
import { LocalTime } from "@/components/forms/LocalTime";

const dur = (s: number) => (s <= 0 ? "-" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
const countryName = (cc: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
};

function Bars({ title, rows, total, hint, label = (k: string) => k }: { title: string; rows: { key: string; n: number; done: number }[]; total: number; hint?: string; label?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="rounded-lg border border-[#e3e3e3] p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-[12px] text-[#6b6b6b]">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#6b6b6b]">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">{label(r.key)}</span>
                <span className="shrink-0 tabular-nums text-[#5e5e5e]">
                  {r.n.toLocaleString()} <span className="text-[#6b6b6b]">· {pct(r.n, total)}</span>
                  {" · "}
                  <span title="Of these visits, how many finished the form" className="text-[#1f7a43]">{pct(r.done, r.n)} finished</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                <div className="h-full rounded-full bg-[#262627]" style={{ width: `${(r.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function VisitorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; device?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const form = await getForm(id);
  if (!form) notFound();
  const range = (sp.range && sp.range in RANGE_LABELS ? sp.range : "all") as RangeKey;
  const device = (sp.device && sp.device in DEVICE_LABELS ? sp.device : "all") as DeviceKey;
  const r = await visitReport(form.id, since(range), device === "all" ? null : device);
  const t = r.totals;
  const qIndex = new Map(form.fields.map((f, i) => [f.id, { n: i + 1, title: plainText(f.title) }]));
  const howFar = (v: (typeof r.visits)[number]) => {
    if (v.finished) return "Finished";
    const q = qIndex.get(v.last_screen);
    if (q) return `Left at Q${q.n}`;
    return v.started ? "Started" : "Only looked";
  };
  const peak = Math.max(1, ...r.byHour.map((h) => h.n));
  const hours = Array.from({ length: 24 }, (_, h) => r.byHour.find((x) => x.h === h)?.n ?? 0);

  const tiles = [
    ["Visits", t.visits.toLocaleString(), "Times someone opened the form"],
    ["People", t.people.toLocaleString(), "Different browsers (counted with a cookie)"],
    ["Came back", pct(t.returning, t.visits), "Visits from someone who had been here before"],
    ["Started", pct(t.started, t.visits), "Answered at least one question"],
    ["Finished", pct(t.finished, t.visits), "Submitted the form"],
    ["Time on form", dur(t.avg_s), `Average. Median ${dur(t.median_s)}. Only counts time the tab was open in front of them.`],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Visitors</h1>
          <p className="text-[14px] text-[#5e5e5e]">Where people came from, where they are, what they used and how long they stayed.</p>
        </div>
        <PerformanceFilters range={range} device={device} />
      </div>

      <dl className="grid grid-cols-2 rounded-lg border border-[#e3e3e3] sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([k, v, hint], i) => (
          <div key={k} title={hint} className={`px-4 py-4 ${i > 0 ? "lg:border-l" : ""} border-[#ececec]`}>
            <dt className="text-[13px] text-[#5e5e5e]">{k}</dt>
            <dd className="mt-1 text-[24px] leading-tight font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {t.visits === 0 && (
        <p className="rounded-md bg-[#f5f5f5] px-4 py-3 text-[14px] text-[#5e5e5e]">
          No visits recorded yet for this period. Visitor details are collected from now on; older visits only have view and start counts.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bars
          title="Where they came from"
          rows={r.sources}
          total={t.visits}
          hint='From your link tags (utm_source), the app they opened it in, or the site that linked them. "Direct" means typed, saved, or the app hid it.'
        />
        <Bars title="Opened inside an app" rows={r.apps} total={t.visits} hint="Instagram, TikTok and others open links in their own browser." />
        <Bars title="Countries" rows={r.countries} total={t.visits} label={(k) => (k === "Unknown" ? k : `${flag(k)} ${countryName(k)}`)} />
        <Bars title="Cities" rows={r.cities} total={t.visits} />
        <Bars title="Devices" rows={r.devices} total={t.visits} label={(k) => k[0].toUpperCase() + k.slice(1)} />
        <Bars title="Phone / browser" rows={r.browsers} total={t.visits} />
        {r.campaigns.length > 0 && <Bars title="Campaigns (utm_campaign)" rows={r.campaigns} total={t.visits} />}
        <section className="rounded-lg border border-[#e3e3e3] p-5">
          <h2 className="text-[15px] font-semibold">When they visit</h2>
          <p className="mb-3 text-[12px] text-[#6b6b6b]">Visits by hour of day (your time zone)</p>
          <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Visits by hour">
            {hours.map((n, h) => (
              <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${h}:00 - ${n} visits`}>
                <div className="rounded-t bg-[#262627]" style={{ height: `${(n / peak) * 100}%`, minHeight: n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-[#6b6b6b] tabular-nums">
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Every visit <span className="font-normal text-[#6b6b6b]">(latest 200)</span></h2>
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[12px] text-[#5e5e5e]">
                <th className="px-3 py-2 font-normal">When</th>
                <th className="px-3 py-2 font-normal">From</th>
                <th className="px-3 py-2 font-normal">Where</th>
                <th className="px-3 py-2 font-normal">Device</th>
                <th className="px-3 py-2 text-right font-normal">Time</th>
                <th className="px-3 py-2 font-normal">How far</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {r.visits.map((v) => (
                <tr key={v.rid} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-[#5e5e5e]"><LocalTime iso={v.first_at} /></td>
                  <td className="px-3 py-2">
                    {v.source}
                    {v.utm_campaign && <span className="text-[#6b6b6b]"> · {v.utm_campaign}</span>}
                    {v.returning && <span className="ml-1.5 rounded-full bg-[#e8f0ff] px-1.5 py-0.5 text-[11px] text-[#1d4ed8]">returning</span>}
                  </td>
                  <td className="px-3 py-2">{v.country ? `${flag(v.country)} ${[v.city, v.region].filter(Boolean).join(", ") || countryName(v.country)}` : "-"}</td>
                  <td className="px-3 py-2 text-[#5e5e5e]">{[v.device, v.os, v.in_app || v.browser].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{dur(v.active_s)}</td>
                  <td className="px-3 py-2">
                    <span className={v.finished ? "text-[#1f7a43]" : v.started ? "text-[#b45309]" : "text-[#6b6b6b]"}>{howFar(v)}</span>
                    {v.backs > 0 && <span className="text-[#6b6b6b]"> · went back {v.backs}x</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {v.response_id && <Link className="underline" href={`/forms/${form.id}/results/responses?lead=${v.response_id}`}>Answers</Link>}
                  </td>
                </tr>
              ))}
              {r.visits.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[#6b6b6b]">No visits yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-[#6b6b6b]">Location is approximate (city level, from the visitor&apos;s internet connection). No IP addresses are stored.</p>
      </section>
    </div>
  );
}
