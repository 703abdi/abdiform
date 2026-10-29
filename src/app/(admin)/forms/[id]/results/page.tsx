import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { DEVICE_LABELS, RANGE_LABELS, dropOff, performance, since, type DeviceKey, type RangeKey } from "@/forms/events";
import { timePerScreen } from "@/forms/visits";
import { PerformanceFilters } from "@/components/admin/PerformanceFilters";

const mmss = (sec: number | null) => {
  if (sec === null) return "-";
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const pct = (n: number | null, digits = 1) => (n === null ? "-" : `${(n * 100).toFixed(digits).replace(/\.0$/, "")}%`);

export default async function PerformancePage({
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
  const [p, d, secs] = await Promise.all([
    performance(form, range, device),
    dropOff(form, range, device),
    timePerScreen(form.id, since(range), device === "all" ? null : device),
  ]);
  const maxViews = Math.max(1, ...d.rows.map((r) => r.views));
  const worst = d.rows.reduce<(typeof d.rows)[number] | null>((w, r) => (r.dropoffs > (w?.dropoffs ?? 0) ? r : w), null);

  const glance = [
    { label: "Views", value: p.views.toLocaleString(), hint: "Times the form was opened" },
    { label: "Starts", value: p.starts.toLocaleString(), hint: "People who answered at least one question" },
    { label: "Submissions", value: p.submissions.toLocaleString(), hint: "Finished responses" },
    { label: "Completion rate", value: pct(p.completion_rate), hint: "Submissions divided by starts" },
    { label: "Time to complete", value: mmss(p.avg_seconds), hint: "Average time to finish" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold">Form performance</h1>
            <p className="text-[14px] text-[#5e5e5e]">How people find, start and finish {form.title}.</p>
          </div>
          <PerformanceFilters range={range} device={device} />
        </div>
        <div className="rounded-lg border border-[#e3e3e3]">
          <h2 className="border-b border-[#ececec] px-5 py-3 text-[15px] font-semibold">At a glance</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {glance.map((g, i) => (
              <div key={g.label} className={`px-5 py-5 ${i > 0 ? "lg:border-l" : ""} border-[#ececec]`} title={g.hint}>
                <dt className="text-[13px] text-[#5e5e5e]">{g.label}</dt>
                <dd className="mt-1 text-[28px] leading-tight font-semibold tabular-nums" data-metric={g.label}>{g.value}</dd>
              </div>
            ))}
          </dl>
          {p.includes_history && (
            <p className="border-t border-[#ececec] px-5 py-2.5 text-[12px] text-[#6b6b6b]">
              Includes views and starts recorded in Typeform before this form moved here.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] font-semibold">See where users drop off</h2>
          <span className="rounded-full bg-[#f4ecff] px-2 py-0.5 text-[12px] font-medium text-[#7b3fe4]">Drop-off analysis</span>
        </div>
        <p className="mb-4 max-w-2xl text-[14px] text-[#5e5e5e]">
          For each question: how many people saw it, and how many left the form there without finishing.
          {worst && worst.dropoffs > 0 && (
            <>
              {" "}Biggest drop-off: <b className="text-[#262627]">{worst.index + 1}. {worst.title}</b> ({worst.dropoffs.toLocaleString()} people, {pct(worst.rate, 0)} of those who saw it).
            </>
          )}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-[#ececec] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-5 py-2.5 font-normal">Question</th>
                <th className="w-[34%] px-3 py-2.5 font-normal">Views</th>
                <th className="w-[110px] px-3 py-2.5 text-right font-normal" title="Average time people spent on this question">Avg time</th>
                <th className="w-[110px] px-3 py-2.5 text-right font-normal">Drop-offs</th>
                <th className="w-[110px] px-5 py-2.5 text-right font-normal">Drop-off rate</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f0f0f0] last:border-0" data-question={r.id}>
                  <td className="px-5 py-3">
                    <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-[#f0f0f0] px-1.5 text-[12px] font-medium text-[#5e5e5e]">{r.index + 1}</span>
                    <span className="align-middle">{r.title}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                        <div className="h-full rounded-full bg-[#262627]" style={{ width: `${(r.views / maxViews) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums" data-cell="views">{r.views.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[#5e5e5e]" data-cell="time">{secs[r.id] !== undefined ? `${secs[r.id]}s` : "-"}</td>
                  <td className="px-3 py-3 text-right tabular-nums" data-cell="dropoffs">{r.dropoffs.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={r.rate !== null && r.rate >= 0.2 ? "font-medium text-[#c2331d]" : ""}>{pct(r.rate)}</span>
                  </td>
                </tr>
              ))}
              {d.rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-[#6b6b6b]">This form has no questions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-[#6b6b6b]">
          New visits are tracked screen by screen. For responses imported from Typeform, the drop-off point is the question after their last answer.
        </p>
      </section>
    </div>
  );
}
