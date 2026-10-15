"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { deleteLeadAction, updateLeadAction } from "@/forms/actions";
import { answerFields, formatAnswer, isPartial, leadIdentity, STATUS_TONE } from "@/forms/lib";
import { LEAD_STATUSES, type Form, type FormResponse, type LeadStatus } from "@/forms/types";

export function ResponsesView({
  form,
  responses,
  initialLead,
}: {
  form: Form;
  responses: FormResponse[];
  initialLead?: string;
}) {
  const [rows, setRows] = useState(responses);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [view, setView] = useState<"complete" | "partial" | "all">("complete");
  const [openId, setOpenId] = useState<string | null>(initialLead ?? null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (view === "complete" && isPartial(r)) return false;
      if (view === "partial" && !isPartial(r)) return false;
      if (!needle) return true;
      return (
        answerFields(form.fields).some((f) => formatAnswer(f, r.answers[f.id]).toLowerCase().includes(needle)) ||
        r.notes.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status, view, form.fields]);

  const open = rows.find((r) => r.id === openId) ?? null;

  function patch(id: string, p: { status?: LeadStatus; notes?: string }) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    start(async () => {
      const res = await updateLeadAction(form.id, id, p);
      if (!res.ok) setErr(res.error);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this lead permanently?")) return;
    setRows((rs) => rs.filter((r) => r.id !== id));
    setOpenId(null);
    start(async () => {
      const res = await deleteLeadAction(form.id, id);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search answers and notes..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={view} onChange={(e) => setView(e.target.value as "complete" | "partial" | "all")} className="w-44">
          <option value="complete">Completed</option>
          <option value="partial">Incomplete (quit early)</option>
          <option value="all">Everything</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as "all" | LeadStatus)} className="w-40">
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <span className="text-xs text-slate-400">{filtered.length} of {rows.length}</span>
        <a href={`/api/forms/${form.id}/export`} className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Export CSV
        </a>
      </div>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Submitted</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No responses match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = leadIdentity(form, r);
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{id.name || "Anonymous"}</td>
                  <td className="px-3 py-3 text-slate-600">
                    <div>{id.email}</div>
                    <div className="text-xs text-slate-400">{id.phone}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {new Date(r.submitted_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-3"><Badge tone="slate" className="bg-slate-100 text-slate-600 ring-slate-200">{r.source}</Badge></td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    {isPartial(r) && <Badge tone="amber" className="ml-1">incomplete</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setOpenId(null)}>
          <aside
            role="dialog"
            aria-label="Lead details"
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{leadIdentity(form, open).name || "Anonymous"}</h2>
                <p className="text-xs text-slate-400">
                  {new Date(open.submitted_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} · {open.source}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setOpenId(null)} aria-label="Close">Close</Button>
            </div>

            <div className="mt-4 flex gap-2">
              <Select value={open.status} onChange={(e) => patch(open.id, { status: e.target.value as LeadStatus })}>
                {LEAD_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
              {leadIdentity(form, open).email && (
                <a href={`mailto:${leadIdentity(form, open).email}`} className="inline-flex items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">Email</a>
              )}
            </div>

            {typeof open.meta.score === "number" && (
              <p className="mt-4 text-sm text-slate-700">Quiz score: <b>{open.meta.score}</b></p>
            )}

            <dl className="mt-5 space-y-4">
              {answerFields(form.fields).map((f) => {
                const v = formatAnswer(f, open.answers[f.id]);
                return (
                  <div key={f.id}>
                    <dt className="text-xs font-medium text-slate-500">{f.title}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{v || <span className="text-slate-300">No answer</span>}</dd>
                  </div>
                );
              })}
            </dl>

            <NotesEditor key={open.id} initial={open.notes} onSave={(notes) => patch(open.id, { notes })} saving={pending} />

            {(open.meta.referrer || open.meta.device || open.meta.duration_s || open.meta.ending || (open.meta.utm && Object.keys(open.meta.utm).length > 0)) && (
              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                {open.meta.device && <p>Device: {open.meta.device}</p>}
                {typeof open.meta.duration_s === "number" && <p>Time to complete: {Math.floor(open.meta.duration_s / 60)}m {open.meta.duration_s % 60}s</p>}
                {open.meta.ending && <p>Ending reached: {open.meta.ending}</p>}
                {open.meta.referrer && <p>Referrer: {open.meta.referrer}</p>}
                {open.meta.utm && Object.entries(open.meta.utm).map(([k, v]) => (<p key={k}>{k}: {v}</p>))}
              </div>
            )}

            <Button variant="danger" className="mt-6" onClick={() => remove(open.id)}>Delete lead</Button>
          </aside>
        </div>
      )}
    </div>
  );
}

function NotesEditor({ initial, onSave, saving }: { initial: string; onSave: (n: string) => void; saving: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-6">
      <label className="mb-1 block text-xs font-medium text-slate-500">Internal notes</label>
      <Textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="Call notes, objections, next step..." />
      <Button className="mt-2" variant="outline" disabled={saving || v === initial} onClick={() => onSave(v)}>
        {saving ? "Saving..." : "Save notes"}
      </Button>
    </div>
  );
}
