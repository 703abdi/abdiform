"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { bulkLeadsAction, deleteLeadAction, updateLeadAction } from "@/forms/actions";
import { answerFields, formatAnswer, isPartial, leadIdentity, plainText, STATUS_TONE } from "@/forms/lib";
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const PAGE = 50;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (view === "complete" && isPartial(r)) return false;
      if (view === "partial" && !isPartial(r)) return false;
      if (from && r.submitted_at.slice(0, 10) < from) return false;
      if (to && r.submitted_at.slice(0, 10) > to) return false;
      if (!needle) return true;
      return (
        answerFields(form.fields).some((f) => formatAnswer(f, r.answers[f.id]).toLowerCase().includes(needle)) ||
        r.notes.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status, view, from, to, form.fields]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const allShownSelected = shown.length > 0 && shown.every((r) => sel.has(r.id));

  function bulk(op: Parameters<typeof bulkLeadsAction>[2]) {
    const ids = [...sel];
    if (op.type === "delete" && !confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"} permanently?`)) return;
    start(async () => {
      const res = await bulkLeadsAction(form.id, ids, op);
      if (!res.ok) return setErr(res.error);
      setRows((rs) => (op.type === "delete" ? rs.filter((r) => !sel.has(r.id)) : rs.map((r) => (sel.has(r.id) ? { ...r, status: op.status } : r))));
      setSel(new Set());
    });
  }

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
        <Input placeholder="Search answers and notes..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="max-w-xs" />
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
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-40" aria-label="To date" />
        <span className="text-xs text-slate-400">{filtered.length} of {rows.length}</span>
        <a href={`/api/forms/${form.id}/export`} className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Export CSV
        </a>
      </div>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm">
          <b>{sel.size} selected</b>
          {sel.size < filtered.length && (
            <button className="text-brand underline" onClick={() => setSel(new Set(filtered.map((r) => r.id)))}>Select all {filtered.length}</button>
          )}
          <Select className="ml-auto w-44" value="" disabled={pending} onChange={(e) => e.target.value && bulk({ type: "status", status: e.target.value as LeadStatus })} aria-label="Change status of selected">
            <option value="">Mark as...</option>
            {LEAD_STATUSES.map((st) => (<option key={st} value={st}>{st}</option>))}
          </Select>
          <Button variant="danger" disabled={pending} onClick={() => bulk({ type: "delete" })}>Delete</Button>
          <Button variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-10 px-4 py-2">
                <input type="checkbox" aria-label="Select all on this page" checked={allShownSelected} onChange={(e) => setSel((o) => { const n = new Set(o); shown.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} />
              </th>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Submitted</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No responses match.</td></tr>
            )}
            {shown.map((r) => {
              const id = leadIdentity(form, r);
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${id.name || "lead"}`} checked={sel.has(r.id)} onChange={(e) => setSel((o) => { const n = new Set(o); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                  </td>
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
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>Page {cur + 1} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
            <Button variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
          </div>
        </div>
      )}

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
                    <dt className="text-xs font-medium text-slate-500">{plainText(f.title)}</dt>
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
