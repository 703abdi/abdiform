"use client";

// Write a blast, pick the audience, preview, test, send now or schedule; then watch it go out.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Blast, BlastAudience } from "@/blasts/types";
import type { ContactFilter, ContactList, FilterField, FilterRule } from "@/contacts/types";
import { EMPTY_FILTER } from "@/contacts/types";
import { OP_LABELS, needsValue, opsFor } from "@/contacts/filter";
import { renderBlastEmail } from "@/blasts/render";
import {
  audienceCountAction,
  continueBlastAction,
  saveBlastAction,
  scheduleBlastAction,
  sendBlastNowAction,
  testBlastAction,
} from "@/blasts/actions";
import { RuleValue } from "@/components/admin/ContactsView";
import { Modal } from "@/components/admin/Modal";
import { tf } from "@/components/admin/styles";
import { STATUS } from "@/components/blasts/BlastsList";
import { cn } from "@/lib/cn";

const FILTER_FIELDS: { key: FilterField; label: string }[] = [
  { key: "tag", label: "Tag" },
  { key: "source_form", label: "Source form" },
  { key: "list", label: "List" },
  { key: "created_at", label: "Date added" },
  { key: "last_activity_at", label: "Last activity" },
  { key: "email", label: "Email" },
  { key: "responses", label: "Responses" },
];

const SAMPLE = {
  id: "preview", email: "lead@example.com", first_name: "Sam", last_name: "Lee", phone: "", properties: {}, tags: [], subscribed: true,
  source_form_id: null, created_at: "", updated_at: "", last_activity_at: "", list_ids: [], response_count: 1,
};

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function BlastEditor({
  blast,
  lists,
  tags,
  forms,
  log,
  sender,
  subscribed,
}: {
  blast: Blast;
  lists: ContactList[];
  tags: string[];
  forms: { id: string; title: string }[];
  log: { email: string; status: string; error: string; sent_at: string | null }[];
  sender: string | null;
  subscribed: number;
}) {
  const router = useRouter();
  const editable = blast.status === "draft" || blast.status === "scheduled";
  const [name, setName] = useState(blast.name);
  const [subject, setSubject] = useState(blast.subject);
  const [preheader, setPreheader] = useState(blast.preheader);
  const [body, setBody] = useState(blast.body);
  const [audience, setAudience] = useState<BlastAudience>(blast.audience);
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [testTo, setTestTo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [when, setWhen] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const snapshot = JSON.stringify({ name, subject, preheader, body, audience });
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = editable && snapshot !== baseline;

  // live audience size
  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      audienceCountAction(JSON.parse(audienceKey) as BlastAudience).then((r) => live && setCount(r.ok ? r.data : null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [audienceKey]);

  // keep a big send moving while this page is open
  const sending = blast.status === "sending";
  useEffect(() => {
    if (!sending) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      await continueBlastAction(blast.id);
      router.refresh();
      if (!stop) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [sending, blast.id, router]);

  const preview = useMemo(() => renderBlastEmail({ subject, preheader, body }, SAMPLE, "#unsubscribe"), [subject, preheader, body]);

  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveBlastAction(blast.id, { name, subject, preheader, body, audience });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setBaseline(snapshot);
      setMsg({ ok: true, text: "Saved" });
      if (then) then();
      else router.refresh();
    });

  const insert = (txt: string) => {
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + txt);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + txt + body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + txt.length;
    });
  };

  const filter: ContactFilter = audience.filter ?? EMPTY_FILTER;
  const setFilter = (f: ContactFilter) => setAudience({ ...audience, filter: f });
  const setRule = (i: number, p: Partial<FilterRule>) => setFilter({ ...filter, rules: filter.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const stats = blast.stats;

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/blasts" className="text-[14px] text-[#5e5e5e] hover:text-[#262627]">Blasts</Link>
        <span aria-hidden className="text-[#767676]">›</span>
        <input aria-label="Blast name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-[20px] font-semibold hover:border-[#e3e3e3] focus:border-[#262627] focus:outline-none disabled:bg-transparent" />
        <span className={cn("rounded-full px-2.5 py-0.5 text-[12px]", STATUS[blast.status].cls)}>{STATUS[blast.status].label}</span>
        {msg && <span role="status" className={cn("text-[13px]", msg.ok ? "text-[#1f7a43]" : "text-[#c2331d]")}>{msg.text}</span>}
        {editable && (
          <>
            {dirty && <span className="text-[12px] text-[#b45309]">Unsaved</span>}
            <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => save()}>Save</button>
            <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => { setWhen(toLocalInput(new Date(Date.now() + 3_600_000))); setSchedOpen(true); }}>{blast.status === "scheduled" ? "Reschedule" : "Schedule"}</button>
            <button type="button" className={tf.btn} disabled={pending} onClick={() => save(() => setConfirm(true))}>Send now</button>
          </>
        )}
      </div>

      {blast.status === "scheduled" && blast.scheduled_at && (
        <p className="mb-4 rounded-md bg-[#e8f0ff] px-4 py-3 text-[14px] text-[#1d4ed8]" suppressHydrationWarning>
          Scheduled for {new Date(blast.scheduled_at).toLocaleString()}.{" "}
          <button type="button" className="underline" onClick={() => start(async () => { await scheduleBlastAction(blast.id, null); router.refresh(); })}>Cancel schedule</button>
        </p>
      )}
      {!editable && stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Recipients", stats.total], ["Sent", stats.sent], ["Waiting", stats.queued], ["Failed", stats.failed]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-[#e3e3e3] px-4 py-3">
              <p className="text-[13px] text-[#5e5e5e]">{k}</p>
              <p className="text-[26px] font-semibold tabular-nums">{Number(v).toLocaleString()}</p>
            </div>
          ))}
          {blast.error && <p className="col-span-full rounded-md bg-[#fde8e4] px-4 py-2 text-[14px] text-[#c2331d]">{blast.error}</p>}
          {sending && <p className="col-span-full text-[13px] text-[#5e5e5e]" role="status">Sending... keep this page open to speed it up (it also continues on its own).</p>}
          <p className="col-span-full text-[13px] text-[#5e5e5e]">Opens and clicks are tracked in Brevo (Transactional › Logs, tag <code>blast-{blast.id.slice(0, 8)}</code>).</p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-[#e3e3e3] p-4">
            <p className="mb-3 text-[15px] font-semibold">To</p>
            <div className="space-y-2 text-[14px]" role="radiogroup" aria-label="Audience">
              <label className="flex items-center gap-2"><input type="radio" disabled={!editable} checked={audience.type === "all"} onChange={() => setAudience({ type: "all" })} /> All subscribed contacts ({subscribed.toLocaleString()})</label>
              <label className="flex items-center gap-2"><input type="radio" disabled={!editable || !lists.length} checked={audience.type === "list"} onChange={() => setAudience({ type: "list", list_id: lists[0]?.id })} /> A contact list {!lists.length && <span className="text-[#6b6b6b]">(create one in Contacts)</span>}</label>
              {audience.type === "list" && (
                <select aria-label="List" disabled={!editable} className={cn(tf.select, "ml-6")} value={audience.list_id ?? ""} onChange={(e) => setAudience({ type: "list", list_id: e.target.value })}>
                  {lists.map((l) => (<option key={l.id} value={l.id}>{l.name}{l.kind === "smart" ? " (smart)" : ""}</option>))}
                </select>
              )}
              <label className="flex items-center gap-2"><input type="radio" disabled={!editable} checked={audience.type === "filter"} onChange={() => setAudience({ type: "filter", filter: { match: "all", rules: [{ field: "tag", op: "has", value: tags[0] ?? "" }] } })} /> Contacts who match...</label>
              {audience.type === "filter" && (
                <div className="ml-6 space-y-2">
                  {filter.rules.length > 1 && (
                    <select aria-label="Match" disabled={!editable} className={cn(tf.select, "py-1")} value={filter.match} onChange={(e) => setFilter({ ...filter, match: e.target.value as "all" | "any" })}>
                      <option value="all">all of these</option><option value="any">any of these</option>
                    </select>
                  )}
                  {filter.rules.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1.5">
                      <select aria-label={`Audience ${i + 1} field`} disabled={!editable} className={cn(tf.select, "py-1")} value={r.field} onChange={(e) => { const field = e.target.value as FilterField; setRule(i, { field, op: opsFor(field)[0], value: "" }); }}>
                        {FILTER_FIELDS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                      </select>
                      <select aria-label={`Audience ${i + 1} operator`} disabled={!editable} className={cn(tf.select, "py-1")} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as FilterRule["op"] })}>
                        {opsFor(r.field).map((op) => (<option key={op} value={op}>{OP_LABELS[op]}</option>))}
                      </select>
                      {needsValue(r.op) && <RuleValue rule={r} onChange={(v) => setRule(i, { value: v })} tags={tags} lists={lists} forms={forms} index={i} />}
                      {editable && <button type="button" aria-label={`Remove condition ${i + 1}`} className="text-[#6b6b6b] hover:text-[#c2331d]" onClick={() => setFilter({ ...filter, rules: filter.rules.filter((_, j) => j !== i) })}>✕</button>}
                    </div>
                  ))}
                  {editable && <button type="button" className={cn(tf.btnGhost, "px-2 py-1 text-[13px]")} onClick={() => setFilter({ ...filter, rules: [...filter.rules, { field: "tag", op: "has", value: tags[0] ?? "" }] })}>+ Add condition</button>}
                </div>
              )}
            </div>
            <p className="mt-3 text-[13px] text-[#5e5e5e]" data-testid="audience-count">
              {count === null ? "Counting..." : `${count.toLocaleString()} ${count === 1 ? "person" : "people"} will get this. Unsubscribed contacts are always skipped.`}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-[#e3e3e3] p-4">
            <p className="text-[15px] font-semibold">Email</p>
            {sender ? <p className="text-[13px] text-[#5e5e5e]">From: {sender}</p> : <p className="rounded-md bg-[#fff6e0] px-3 py-2 text-[13px] text-[#7a5300]">Brevo isn&apos;t connected yet (BREVO_API_KEY and BLAST_FROM_EMAIL in Vercel).</p>}
            <div><label className={tf.label} htmlFor="bl-subject">Subject</label><input id="bl-subject" disabled={!editable} className={tf.input} value={subject} placeholder="e.g. {{first_name}}, your spot is still open" onChange={(e) => setSubject(e.target.value)} /></div>
            <div><label className={tf.label} htmlFor="bl-pre">Preview text (shown after the subject in the inbox)</label><input id="bl-pre" disabled={!editable} className={tf.input} value={preheader} onChange={(e) => setPreheader(e.target.value)} /></div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <label className={cn(tf.label, "mb-0 mr-auto")} htmlFor="bl-body">Message</label>
                {editable && (
                  <>
                    <button type="button" className="rounded border border-[#e3e3e3] px-2 py-0.5 text-[12px] hover:bg-[#f5f5f5]" onClick={() => insert("{{first_name}}")}>First name</button>
                    <button type="button" className="rounded border border-[#e3e3e3] px-2 py-0.5 text-[12px] hover:bg-[#f5f5f5]" onClick={() => insert("**bold text**")}>Bold</button>
                    <button type="button" className="rounded border border-[#e3e3e3] px-2 py-0.5 text-[12px] hover:bg-[#f5f5f5]" onClick={() => insert("[link text](https://)")}>Link</button>
                    <button type="button" className="rounded border border-[#e3e3e3] px-2 py-0.5 text-[12px] hover:bg-[#f5f5f5]" onClick={() => insert("\n\n[[Button text|https://]]\n\n")}>Button</button>
                  </>
                )}
              </div>
              <textarea ref={bodyRef} id="bl-body" disabled={!editable} rows={14} className={cn(tf.input, "font-mono text-[13px]")} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="mt-1 text-[12px] text-[#6b6b6b]">Blank line = new paragraph. A line like [[Book your call|https://...]] becomes a button. An unsubscribe link is added automatically.</p>
            </div>
          </div>

          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-[#e3e3e3] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(() =>
                start(async () => {
                  const r = await testBlastAction(blast.id, testTo);
                  setMsg(r.ok ? { ok: true, text: `Test sent to ${testTo}` } : { ok: false, text: r.error });
                }),
              );
            }}
          >
            <div className="min-w-0 flex-1"><label className={tf.label} htmlFor="bl-test">Send a test to</label><input id="bl-test" type="email" required className={tf.input} placeholder="you@email.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
            <button type="submit" className={tf.btnOutline} disabled={pending}>Send test</button>
          </form>
        </section>

        <section>
          <p className="mb-2 text-[15px] font-semibold">Preview</p>
          <div className="overflow-hidden rounded-lg border border-[#e3e3e3]">
            <div className="border-b border-[#ececec] bg-[#fafafa] px-4 py-2.5 text-[13px]">
              <b>{preview.subject || "(no subject)"}</b> <span className="text-[#6b6b6b]">{preheader}</span>
            </div>
            <iframe title="Email preview" className="h-[640px] w-full bg-white" sandbox="" srcDoc={preview.html} />
          </div>
          {log.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-[15px] font-semibold">Delivery log</p>
              <ul className="max-h-[360px] divide-y divide-[#f0f0f0] overflow-y-auto rounded-lg border border-[#e3e3e3] text-[13px]">
                {log.map((l) => (
                  <li key={l.email} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate">{l.email}</span>
                    <span className={cn("shrink-0", l.status === "sent" ? "text-[#1f7a43]" : l.status === "failed" ? "text-[#c2331d]" : "text-[#6b6b6b]")} title={l.error}>{l.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send this blast now?">
        <p className="text-[14px] text-[#5e5e5e]">
          <b className="text-[#262627]">{subject || "(no subject)"}</b> goes to <b className="text-[#262627]">{count ?? "?"} people</b> right away. This can&apos;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={tf.btnOutline} onClick={() => setConfirm(false)}>Cancel</button>
          <button
            type="button"
            className={tf.btn}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await sendBlastNowAction(blast.id);
                setConfirm(false);
                setMsg(r.ok ? { ok: true, text: r.data.left ? `Sending... ${r.data.sent} sent so far` : `Sent to ${r.data.sent} people` } : { ok: false, text: r.error });
                router.refresh();
              })
            }
          >
            {pending ? "Sending..." : "Send now"}
          </button>
        </div>
      </Modal>

      <Modal open={schedOpen} onClose={() => setSchedOpen(false)} title="Schedule this blast">
        <label className={tf.label} htmlFor="bl-when">Send at (your time)</label>
        <input id="bl-when" type="datetime-local" className={tf.input} value={when} onChange={(e) => setWhen(e.target.value)} />
        <p className="mt-2 text-[12px] text-[#6b6b6b]">Scheduled blasts go out when the daily job runs or when anyone opens Blasts after that time. For an exact minute, send it yourself.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={tf.btnOutline} onClick={() => setSchedOpen(false)}>Cancel</button>
          <button
            type="button"
            className={tf.btn}
            onClick={() =>
              save(() =>
                start(async () => {
                  const r = await scheduleBlastAction(blast.id, new Date(when).toISOString());
                  setSchedOpen(false);
                  setMsg(r.ok ? { ok: true, text: "Scheduled" } : { ok: false, text: r.error });
                  router.refresh();
                }),
              )
            }
          >
            Schedule
          </button>
        </div>
      </Modal>
    </main>
  );
}
