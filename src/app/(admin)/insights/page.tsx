import Link from "next/link";
import { listForms, listResponses } from "@/forms/repo";
import { listContacts } from "@/contacts/repo";
import { performance } from "@/forms/events";
import { timelineAuto } from "@/forms/metrics";
import { isPartial } from "@/forms/lib";
import { TimelineChart } from "@/components/forms/charts";
import { calendlyConfigured, callStats, upcomingCalls } from "@/calendly/sync";

export const metadata = { title: "Insights · Tawakkul Forms" };

function withinDays(iso: string, days: number) {
  return Date.now() - Date.parse(iso) <= days * 86_400_000;
}

const pct = (n: number | null) => (n === null ? "-" : `${(n * 100).toFixed(1).replace(/\.0$/, "")}%`);

export default async function InsightsPage() {
  const [forms, responses, contacts] = await Promise.all([listForms(), listResponses(), listContacts()]);
  const perf = await Promise.all(forms.map(async (f) => ({ f, p: await performance(f, "all", "all") })));
  const totals = perf.reduce(
    (a, { p }) => ({ views: a.views + p.views, starts: a.starts + p.starts, submissions: a.submissions + p.submissions }),
    { views: 0, starts: 0, submissions: 0 },
  );
  const tl = timelineAuto(responses);
  const [calls, upcoming] = calendlyConfigured() ? await Promise.all([callStats(), upcomingCalls(8)]) : [null, []];
  const last30 = responses.filter((r) => !isPartial(r) && withinDays(r.submitted_at, 30)).length;
  const newContacts30 = contacts.filter((c) => withinDays(c.created_at, 30)).length;
  const tagCounts = new Map<string, number>();
  for (const c of contacts) for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const cards = [
    ["Views", totals.views.toLocaleString()],
    ["Starts", totals.starts.toLocaleString()],
    ["Submissions", totals.submissions.toLocaleString()],
    ["Completion rate", pct(totals.starts ? totals.submissions / totals.starts : null)],
    ["Contacts", contacts.length.toLocaleString()],
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-[22px] font-semibold">Insights</h1>
        <p className="text-[14px] text-[#5e5e5e]">All your forms at a glance.</p>
      </div>

      <dl className="grid grid-cols-2 rounded-lg border border-[#e3e3e3] sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([k, v], i) => (
          <div key={k} className={`px-5 py-5 ${i > 0 ? "lg:border-l" : ""} border-[#ececec]`}>
            <dt className="text-[13px] text-[#5e5e5e]">{k}</dt>
            <dd className="mt-1 text-[28px] leading-tight font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-[#e3e3e3] p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-semibold">{tl.title.replace("Leads", "Submissions")}</h2>
          <p className="mb-3 text-[13px] text-[#5e5e5e]">{last30} submissions and {newContacts30} new contacts in the last 30 days</p>
          <TimelineChart data={tl.data} />
        </section>
        <section className="rounded-lg border border-[#e3e3e3] p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Top contact tags</h2>
          {topTags.length === 0 ? (
            <p className="text-[13px] text-[#6b6b6b]">No tags yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {topTags.map(([t, n]) => (
                <li key={t}>
                  <div className="mb-1 flex justify-between text-[13px]"><span className="truncate pr-2">{t}</span><span className="text-[#5e5e5e]">{n}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]"><div className="h-full rounded-full bg-[#262627]" style={{ width: `${(n / Math.max(1, contacts.length)) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {calls && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-[#e3e3e3] p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Calls (last 90 days)</h2>
            <dl className="grid grid-cols-2 gap-3">
              {([["Upcoming", calls.upcoming], ["Happened", calls.done], ["No-shows", calls.no_show], ["Canceled", calls.canceled]] as [string, number][]).map(([k, v]) => (
                <div key={k}><dt className="text-[13px] text-[#5e5e5e]">{k}</dt><dd className="text-[24px] font-semibold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-[#5e5e5e]">Show-up rate: <b>{calls.done + calls.no_show ? `${Math.round((calls.done / (calls.done + calls.no_show)) * 100)}%` : "-"}</b></p>
          </div>
          <div className="rounded-lg border border-[#e3e3e3] p-5 lg:col-span-2">
            <h2 className="mb-3 text-[15px] font-semibold">Next calls</h2>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-[#6b6b6b]">No upcoming calls.</p>
            ) : (
              <ul className="divide-y divide-[#f0f0f0] text-[14px]">
                {upcoming.map((u) => (
                  <li key={`${u.email}-${u.start_time}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{u.name || u.email}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-[#5e5e5e]">
                      {u.tags.some((t) => t.startsWith("Watched")) ? <span className="rounded-full bg-[#e3f5e9] px-2 py-0.5 text-[11px] text-[#1f7a43]">Watched video</span> : <span className="rounded-full bg-[#fff6e0] px-2 py-0.5 text-[11px] text-[#7a5300]">Hasn&apos;t watched</span>}
                      <span suppressHydrationWarning>{new Date(u.start_time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Forms</h2>
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-4 py-2.5 font-normal">Form</th>
                <th className="px-4 py-2.5 text-right font-normal">Views</th>
                <th className="px-4 py-2.5 text-right font-normal">Starts</th>
                <th className="px-4 py-2.5 text-right font-normal">Submissions</th>
                <th className="px-4 py-2.5 text-right font-normal">Completion</th>
              </tr>
            </thead>
            <tbody>
              {perf.map(({ f, p }) => (
                <tr key={f.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3"><Link href={`/forms/${f.id}/results`} className="font-medium hover:underline">{f.title}</Link></td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.views.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.starts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.submissions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(p.completion_rate)}</td>
                </tr>
              ))}
              {perf.length === 0 && (<tr><td colSpan={5} className="px-4 py-8 text-center text-[#6b6b6b]">No forms yet.</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
