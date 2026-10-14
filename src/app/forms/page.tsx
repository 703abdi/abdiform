import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { TimelineChart } from "@/components/forms/charts";
import { NewFormButton } from "@/components/forms/NewFormButton";
import { listForms, listResponses } from "@/forms/repo";
import { overview, perFormStats, timeline } from "@/forms/metrics";
import { leadIdentity, STATUS_TONE } from "@/forms/lib";
import { LEAD_STATUSES } from "@/forms/types";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

export default async function FormsOverview() {
  const [forms, responses] = await Promise.all([listForms(), listResponses()]);
  const o = overview(forms, responses);
  const formById = new Map(forms.map((f) => [f.id, f]));
  const delta = o.last7 - o.prev7;
  const recent = responses.slice(0, 8);

  const kpis = [
    { label: "Total leads", value: o.total, sub: `${o.today} today` },
    {
      label: "Last 7 days",
      value: o.last7,
      sub: `${delta >= 0 ? "+" : ""}${delta} vs previous week`,
    },
    { label: "Awaiting contact", value: o.byStatus.new ?? 0, sub: "status: new" },
    { label: "Form completion", value: pct(o.completion), sub: "submissions / views" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads &amp; Forms</h1>
          <p className="text-sm text-slate-500">Capture applicants, track them to a close.</p>
        </div>
        <NewFormButton />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardBody>
              <p className="text-xs font-medium text-slate-500">{k.label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{k.value}</p>
              <p className="mt-1 text-xs text-slate-400">{k.sub}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Leads, last 30 days</CardTitle></CardHeader>
          <CardBody><TimelineChart data={timeline(responses, 30)} /></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {LEAD_STATUSES.map((s) => {
              const c = o.byStatus[s] ?? 0;
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium capitalize text-slate-700">{s}</span>
                    <span className="text-slate-500">{c}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${o.total ? (c / o.total) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-slate-400">Win rate {pct(o.total ? o.winRate : null)}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Your forms</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2 font-medium">Form</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Leads</th>
                <th className="px-3 py-2 font-medium">New</th>
                <th className="px-3 py-2 font-medium">Views</th>
                <th className="px-3 py-2 font-medium">Completion</th>
                <th className="px-3 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {forms.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  No forms yet. Create one, or <Link className="text-brand underline" href="/forms/import">import from Typeform</Link>.
                </td></tr>
              )}
              {forms.map((f) => {
                const s = perFormStats(f, responses);
                return (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/forms/${f.id}`} className="font-medium text-slate-900 hover:text-brand">{f.title}</Link>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={f.status === "published" ? "green" : f.status === "closed" ? "red" : "neutral"}>{f.status}</Badge>
                    </td>
                    <td className="px-3 py-3 font-medium">{s.count}</td>
                    <td className="px-3 py-3">{s.newCount > 0 ? <Badge tone="blue">{s.newCount}</Badge> : <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{f.views}</td>
                    <td className="px-3 py-3 text-slate-600">{pct(s.completion)}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">/apply/{f.slug}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Latest leads</CardTitle></CardHeader>
          <ul className="divide-y divide-slate-100">
            {recent.map((r) => {
              const f = formById.get(r.form_id);
              const id = f ? leadIdentity(f, r) : { name: "", email: "", phone: "" };
              return (
                <li key={r.id}>
                  <Link href={`/forms/${r.form_id}?lead=${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{id.name || id.email || "Anonymous"}</p>
                      <p className="truncate text-xs text-slate-500">{f?.title} · {new Date(r.submitted_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
