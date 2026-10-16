// Results > Summary: per-question breakdowns (server component).

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { TimelineChart } from "@/components/forms/charts";
import { formatDuration, insights, timelineAuto } from "@/forms/metrics";
import { hasQuiz } from "@/forms/logic";
import { answerFields, formatAnswer, isEmptyAnswer, plainText } from "@/forms/lib";
import type { Field, Form, FormResponse } from "@/forms/types";

export function ResultsSummary({ form, responses, all }: { form: Form; responses: FormResponse[]; all: FormResponse[] }) {
  if (all.length === 0)
    return <Card><CardBody className="py-10 text-center text-slate-400">No responses yet. Summaries appear once leads come in.</CardBody></Card>;
  const ins = insights(form, all);
  const top = Math.max(form.views, ...ins.funnel.map((f) => f.answered), 1);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Answers per question</CardTitle></CardHeader>
          <CardBody className="space-y-2.5">
            <p className="text-xs text-slate-400">People who answered each screen (includes people who didn&apos;t finish). See Performance for drop-off.</p>
            {ins.funnel.map((f, i) => (
              <div key={f.id}>
                <div className="mb-0.5 flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{i + 1}. {plainText(f.title) || "Untitled"}</span>
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
              {ins.avgScore !== null && hasQuiz(form.fields) && <> · Average quiz score <b>{ins.avgScore.toFixed(1)}</b></>}
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
        <CardHeader><CardTitle>{timelineAuto(all).title.replace("Leads", "Responses")}</CardTitle></CardHeader>
        <CardBody><TimelineChart data={timelineAuto(all).data} /></CardBody>
      </Card>
      {answerFields(form.fields).map((f) => (
        <Card key={f.id}>
          <CardHeader><CardTitle>{plainText(f.title)}</CardTitle></CardHeader>
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
