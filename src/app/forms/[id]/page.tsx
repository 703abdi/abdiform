import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { ResponsesView } from "@/components/forms/ResponsesView";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { TimelineChart } from "@/components/forms/charts";
import { getForm, listResponses } from "@/forms/repo";
import { formatDuration, insights, perFormStats, timeline } from "@/forms/metrics";
import { answerFields, formatAnswer, isEmptyAnswer, isPartial } from "@/forms/lib";
import type { Field, Form, FormResponse } from "@/forms/types";

export const dynamic = "force-dynamic";

const TABS = [
  ["responses", "Responses"],
  ["summary", "Summary"],
  ["build", "Build & share"],
] as const;

export default async function FormDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; lead?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const form = await getForm(id);
  if (!form) notFound();
  const responses = await listResponses(id);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "responses";
  const stats = perFormStats(form, responses);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/forms" className="text-xs text-slate-400 hover:text-slate-600">&larr; All forms</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{form.title}</h1>
          <Badge tone={form.status === "published" ? "green" : form.status === "closed" ? "red" : "neutral"}>{form.status}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Views", String(form.views)],
            ["Starts", String(form.starts)],
            ["Responses", String(stats.count)],
            ["Incomplete", String(stats.partials)],
            ["Completion rate", stats.completion === null ? "n/a" : `${Math.round(stats.completion * 100)}%`],
            ["Avg. time", formatDuration(insights(form, responses).avgSeconds)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{k}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-900">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/forms/${id}?tab=${k}`} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </Link>
        ))}
      </div>

      {tab === "responses" && <ResponsesView form={form} responses={responses} initialLead={sp.lead} />}
      {tab === "summary" && <Summary form={form} responses={responses.filter((r) => !isPartial(r))} all={responses} />}
      {tab === "build" && <FormBuilder form={form} />}
    </div>
  );
}

function Summary({ form, responses, all }: { form: Form; responses: FormResponse[]; all: FormResponse[] }) {
  if (all.length === 0)
    return <Card><CardBody className="py-10 text-center text-slate-400">No responses yet. Summaries appear once leads come in.</CardBody></Card>;
  const ins = insights(form, all);
  const top = Math.max(form.views, ...ins.funnel.map((f) => f.answered), 1);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Where people drop off</CardTitle></CardHeader>
          <CardBody className="space-y-2.5">
            <p className="text-xs text-slate-400">People who answered each screen (includes people who didn&apos;t finish).</p>
            {ins.funnel.map((f, i) => (
              <div key={f.id}>
                <div className="mb-0.5 flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{i + 1}. {f.title || "Untitled"}</span>
                  <span className="shrink-0 text-slate-500">{f.answered}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${(f.answered / top) * 100}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Time to complete</CardTitle></CardHeader>
            <CardBody className="text-sm text-slate-700">
              Average <b>{formatDuration(ins.avgSeconds)}</b> · Median <b>{formatDuration(ins.medianSeconds)}</b>
              {ins.avgScore !== null && <> · Average quiz score <b>{ins.avgScore.toFixed(1)}</b></>}
            </CardBody>
          </Card>
          {ins.endings.length > 0 && (
            <Card><CardHeader><CardTitle>Endings reached</CardTitle></CardHeader><CardBody><Bars rows={ins.endings} total={ins.endings.reduce((a, [, n]) => a + n, 0)} /></CardBody></Card>
          )}
          {ins.devices.length > 0 && (
            <Card><CardHeader><CardTitle>Devices</CardTitle></CardHeader><CardBody><Bars rows={ins.devices} total={ins.devices.reduce((a, [, n]) => a + n, 0)} /></CardBody></Card>
          )}
          {ins.sources.length > 0 && (
            <Card><CardHeader><CardTitle>Traffic sources (utm_source)</CardTitle></CardHeader><CardBody><Bars rows={ins.sources} total={ins.sources.reduce((a, [, n]) => a + n, 0)} /></CardBody></Card>
          )}
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Responses over time</CardTitle></CardHeader>
        <CardBody><TimelineChart data={timeline(responses, 30)} /></CardBody>
      </Card>
      {answerFields(form.fields).map((f) => (
        <Card key={f.id}>
          <CardHeader><CardTitle>{f.title}</CardTitle></CardHeader>
          <CardBody><QuestionSummary field={f} responses={responses} /></CardBody>
        </Card>
      ))}
    </div>
  );
}

function Bars({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, c]) => (
        <div key={label}>
          <div className="mb-0.5 flex justify-between text-xs"><span className="truncate pr-2 text-slate-700">{label}</span><span className="text-slate-500">{c} · {total ? Math.round((c / total) * 100) : 0}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${total ? (c / total) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function QuestionSummary({ field, responses }: { field: Field; responses: FormResponse[] }) {
  const answered = responses.filter((r) => !isEmptyAnswer(r.answers[field.id]) || typeof r.answers[field.id] === "boolean");
  const header = <p className="mb-3 text-xs text-slate-400">{answered.length} of {responses.length} answered</p>;

  if (["multiple_choice", "checkboxes", "dropdown", "yes_no"].includes(field.type)) {
    const counts = new Map<string, number>();
    for (const r of answered) {
      const v = r.answers[field.id];
      const items = Array.isArray(v) ? v : [formatAnswer(field, v)];
      for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return <>{header}<Bars rows={rows} total={answered.length} /></>;
  }
  if (field.type === "rating" || field.type === "scale") {
    const nums = answered.map((r) => Number(r.answers[field.id])).filter(Number.isFinite);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const lo = field.type === "scale" ? 0 : 1;
    const hi = field.type === "scale" ? 10 : field.steps ?? 5;
    const rows: [string, number][] = [];
    for (let i = lo; i <= hi; i++) rows.push([String(i), nums.filter((n) => n === i).length]);
    return <>{header}<p className="mb-3 text-2xl font-bold text-slate-900">{avg.toFixed(1)} <span className="text-sm font-normal text-slate-400">average</span></p><Bars rows={rows} total={nums.length} /></>;
  }
  if (field.type === "number") {
    const nums = answered.map((r) => Number(r.answers[field.id])).filter(Number.isFinite);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    return <>{header}<p className="text-sm text-slate-700">Average {avg.toFixed(1)} · Min {Math.min(...nums)} · Max {Math.max(...nums)}</p></>;
  }
  return (
    <>
      {header}
      <ul className="space-y-1.5">
        {answered.slice(0, 6).map((r) => (
          <li key={r.id} className="truncate rounded bg-slate-50 px-3 py-1.5 text-sm text-slate-700">{formatAnswer(field, r.answers[field.id])}</li>
        ))}
      </ul>
      {answered.length > 6 && <p className="mt-2 text-xs text-slate-400">+ {answered.length - 6} more in Responses</p>}
    </>
  );
}
