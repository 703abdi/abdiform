"use client";

// Automation editor: trigger card, then a vertical list of steps (Typeform / Zapier style),
// audience filter, test run and activity log.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Automation, AutomationRun, Step, StepType, Trigger, TriggerType } from "@/automations/types";
import { STEP_LABELS, TRIGGER_LABELS, newStep } from "@/automations/types";
import type { ContactFilter, ContactList, FilterField, FilterRule } from "@/contacts/types";
import { EMPTY_FILTER } from "@/contacts/types";
import { OP_LABELS, needsValue, opsFor } from "@/contacts/filter";
import { deleteAutomationAction, saveAutomationAction, testAutomationAction } from "@/automations/actions";
import { RuleValue } from "@/components/admin/ContactsView";
import { Menu } from "@/components/admin/Menu";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";

type FormRef = { id: string; title: string; endings: { id: string; title: string; tag: string }[] };

const STEP_ICON: Record<StepType, { glyph: string; bg: string }> = {
  send_email: { glyph: "@", bg: "#262627" },
  wait: { glyph: "⏱", bg: "#e8590c" },
  add_tag: { glyph: "#", bg: "#1f9d55" },
  remove_tag: { glyph: "#", bg: "#8a8a8a" },
  add_to_list: { glyph: "≡", bg: "#006bff" },
  remove_from_list: { glyph: "≡", bg: "#8a8a8a" },
  webhook: { glyph: "⚡", bg: "#7b3fe4" },
  discord: { glyph: "D", bg: "#5865f2" },
};

const FILTER_FIELDS: { key: FilterField; label: string }[] = [
  { key: "tag", label: "Tag" },
  { key: "list", label: "List" },
  { key: "email", label: "Email" },
  { key: "name", label: "Name" },
  { key: "subscribed", label: "Subscribed" },
  { key: "responses", label: "Responses" },
];

export function AutomationEditor({
  automation,
  forms,
  lists,
  tags,
  runs,
  emailReady,
}: {
  automation: Automation;
  forms: FormRef[];
  lists: ContactList[];
  tags: string[];
  runs: AutomationRun[];
  emailReady: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(automation.name);
  const [trigger, setTrigger] = useState<Trigger>(automation.trigger);
  const [steps, setSteps] = useState<Step[]>(automation.steps);
  const [status, setStatus] = useState(automation.status);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [pending, start] = useTransition();
  const filter: ContactFilter = trigger.filter ?? EMPTY_FILTER;
  const form = forms.find((f) => f.id === trigger.form_id);

  const setStep = (i: number, p: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? ({ ...x, ...p } as Step) : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const setFilter = (f: ContactFilter) => setTrigger((t) => ({ ...t, filter: f }));
  const setRule = (i: number, p: Partial<FilterRule>) => setFilter({ ...filter, rules: filter.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  const save = (nextStatus = status) =>
    start(async () => {
      const r = await saveAutomationAction(automation.id, { name, trigger, steps, status: nextStatus });
      if (r.ok) {
        setStatus(nextStatus);
        setMsg({ ok: true, text: nextStatus === "live" && status !== "live" ? "Saved and turned on" : "Saved" });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });

  const addMenu = (at: number) =>
    (Object.keys(STEP_LABELS) as StepType[]).map((t) => ({
      label: STEP_LABELS[t],
      onSelect: () => setSteps((s) => [...s.slice(0, at), newStep(t), ...s.slice(at)]),
    }));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/automations" className="text-[14px] text-[#5e5e5e] hover:text-[#262627]">Automations</Link>
        <span aria-hidden className="text-[#767676]">›</span>
        <input aria-label="Automation name" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-[20px] font-semibold hover:border-[#e3e3e3] focus:border-[#262627] focus:outline-none" />
        <div className="flex items-center gap-2">
          {msg && <span role="status" className={cn("text-[13px]", msg.ok ? "text-[#1f7a43]" : "text-[#c2331d]")}>{msg.text}</span>}
          <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => save()}>Save</button>
          {status === "live" ? (
            <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => save("paused")}>
              <span className="h-2 w-2 rounded-full bg-[#1f9d55]" aria-hidden /> On · Turn off
            </button>
          ) : (
            <button type="button" className={tf.btn} disabled={pending} onClick={() => save("live")}>Turn on</button>
          )}
          <Menu
            label="More"
            items={[
              {
                label: "Delete automation",
                danger: true,
                onSelect: () =>
                  start(async () => {
                    if (!window.confirm("Delete this automation and its history?")) return;
                    const r = await deleteAutomationAction(automation.id);
                    if (r.ok) router.push("/automations");
                  }),
              },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------ flow ------------------------------ */}
        <div className="flex flex-col items-center">
          <section className="w-full max-w-[560px] rounded-lg border-2 border-[#262627] bg-white p-4" aria-label="Trigger">
            <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#6b6b6b]">When this happens</p>
            <select
              aria-label="Trigger"
              className={cn(tf.select, "w-full")}
              value={trigger.type}
              onChange={(e) => setTrigger({ type: e.target.value as TriggerType, filter: trigger.filter, form_id: trigger.form_id })}
            >
              {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (<option key={t} value={t}>{TRIGGER_LABELS[t]}</option>))}
            </select>
            {trigger.type === "form_submitted" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={tf.label} htmlFor="tr-form">Form</label>
                  <select id="tr-form" className={cn(tf.select, "w-full")} value={trigger.form_id ?? ""} onChange={(e) => setTrigger({ ...trigger, form_id: e.target.value || undefined, ending: undefined })}>
                    <option value="">Any form</option>
                    {forms.map((f) => (<option key={f.id} value={f.id}>{f.title}</option>))}
                  </select>
                </div>
                <div>
                  <label className={tf.label} htmlFor="tr-ending">Only people who reach</label>
                  <select id="tr-ending" className={cn(tf.select, "w-full")} value={trigger.ending ?? ""} disabled={!form} onChange={(e) => setTrigger({ ...trigger, ending: e.target.value || undefined })}>
                    <option value="">Any ending</option>
                    {form?.endings.map((e) => (<option key={e.id} value={e.id}>{e.title}{e.tag ? ` (${e.tag})` : ""}</option>))}
                  </select>
                </div>
              </div>
            )}
            {trigger.type === "list_added" && (
              <div className="mt-3">
                <label className={tf.label} htmlFor="tr-list">List</label>
                <select id="tr-list" className={cn(tf.select, "w-full")} value={trigger.list_id ?? ""} onChange={(e) => setTrigger({ ...trigger, list_id: e.target.value || undefined })}>
                  <option value="">Choose a list...</option>
                  {lists.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
                {lists.length === 0 && <p className="mt-1 text-[12px] text-[#6b6b6b]">Create a list in <Link className="underline" href="/contacts">Contacts</Link> first.</p>}
              </div>
            )}
            {trigger.type === "call_booked" && (
              <div className="mt-3">
                <label className={tf.label} htmlFor="tr-event">Calendly event (leave empty for any)</label>
                <input id="tr-event" className={tf.input} value={trigger.event_name ?? ""} placeholder="e.g. Tawakkul | Discovery Call" onChange={(e) => setTrigger({ ...trigger, event_name: e.target.value || undefined })} />
                <p className="mt-1 text-[12px] text-[#6b6b6b]">Use {"{{call_date}}"}, {"{{call_event}}"}, {"{{call_answer_1}}"}, {"{{call_answer_2}}"}, {"{{call_answer_3}}"} in messages.</p>
              </div>
            )}
            {trigger.type === "payment_received" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={tf.label} htmlFor="tr-kind">Payment type</label>
                  <select id="tr-kind" className={cn(tf.select, "w-full")} value={trigger.payment_kind ?? "any"} onChange={(e) => setTrigger({ ...trigger, payment_kind: e.target.value as Trigger["payment_kind"] })}>
                    <option value="any">Any payment</option>
                    <option value="one_time">One-time (paid in full)</option>
                    <option value="recurring">Recurring (split pay / subscription)</option>
                  </select>
                </div>
                <div>
                  <label className={tf.label} htmlFor="tr-product">Product name contains (optional)</label>
                  <input id="tr-product" className={tf.input} value={trigger.product ?? ""} onChange={(e) => setTrigger({ ...trigger, product: e.target.value || undefined })} />
                </div>
                <p className="text-[12px] text-[#6b6b6b] sm:col-span-2">Use {"{{payment_amount}}"}, {"{{payment_product}}"}, {"{{payment_type}}"} in messages.</p>
              </div>
            )}
            {trigger.type === "tag_added" && (
              <div className="mt-3">
                <label className={tf.label} htmlFor="tr-tag">Tag</label>
                <input id="tr-tag" list="auto-tags" className={tf.input} value={trigger.tag ?? ""} onChange={(e) => setTrigger({ ...trigger, tag: e.target.value })} placeholder="e.g. Qualified" />
              </div>
            )}

            <details className="mt-3" open={filter.rules.length > 0}>
              <summary className="cursor-pointer text-[13px] text-[#5e5e5e]">Only for contacts who match... {filter.rules.length > 0 && `(${filter.rules.length})`}</summary>
              <div className="mt-2 space-y-2">
                {filter.rules.length > 1 && (
                  <select aria-label="Audience match" className={cn(tf.select, "py-1")} value={filter.match} onChange={(e) => setFilter({ ...filter, match: e.target.value as "all" | "any" })}>
                    <option value="all">Match all</option>
                    <option value="any">Match any</option>
                  </select>
                )}
                {filter.rules.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <select aria-label={`Audience ${i + 1} field`} className={cn(tf.select, "py-1")} value={r.field} onChange={(e) => { const field = e.target.value as FilterField; setRule(i, { field, op: opsFor(field)[0], value: field === "subscribed" ? "yes" : "" }); }}>
                      {FILTER_FIELDS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                    </select>
                    <select aria-label={`Audience ${i + 1} operator`} className={cn(tf.select, "py-1")} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as FilterRule["op"] })}>
                      {opsFor(r.field).map((op) => (<option key={op} value={op}>{OP_LABELS[op]}</option>))}
                    </select>
                    {needsValue(r.op) && <RuleValue rule={r} onChange={(v) => setRule(i, { value: v })} tags={tags} lists={lists} forms={forms} index={i} />}
                    <button type="button" aria-label={`Remove audience condition ${i + 1}`} className="text-[#6b6b6b] hover:text-[#c2331d]" onClick={() => setFilter({ ...filter, rules: filter.rules.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                <button type="button" className={cn(tf.btnGhost, "px-2 py-1 text-[13px]")} onClick={() => setFilter({ ...filter, rules: [...filter.rules, { field: "tag", op: "has", value: tags[0] ?? "" }] })}>+ Add condition</button>
              </div>
            </details>
          </section>

          <Connector />
          <Menu align="left" label="Add step" items={addMenu(0)} trigger={<span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4d4d4] bg-white text-[18px] hover:bg-[#f5f5f5]">+</span>} />

          {steps.map((s, i) => (
            <div key={s.id} className="flex w-full flex-col items-center">
              <Connector />
              <section className="w-full max-w-[560px] rounded-lg border border-[#e3e3e3] bg-white p-4 shadow-sm" aria-label={`Step ${i + 1}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold text-white" style={{ background: STEP_ICON[s.type].bg }}>{STEP_ICON[s.type].glyph}</span>
                  <span className="text-[14px] font-medium">{i + 1}. {STEP_LABELS[s.type]}</span>
                  <span className="ml-auto flex items-center gap-0.5">
                    <button type="button" aria-label="Move step up" disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 rounded text-[#5e5e5e] hover:bg-[#f0f0f0] disabled:opacity-30">↑</button>
                    <button type="button" aria-label="Move step down" disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="h-7 w-7 rounded text-[#5e5e5e] hover:bg-[#f0f0f0] disabled:opacity-30">↓</button>
                    <button type="button" aria-label={`Delete step ${i + 1}`} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} className="h-7 w-7 rounded text-[#5e5e5e] hover:bg-[#f0f0f0] hover:text-[#c2331d]">✕</button>
                  </span>
                </div>
                <StepFields step={s} i={i} set={(p) => setStep(i, p)} lists={lists} emailReady={emailReady} />
              </section>
              <Connector />
              <Menu align="left" label="Add step" items={addMenu(i + 1)} trigger={<span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4d4d4] bg-white text-[18px] hover:bg-[#f5f5f5]">+</span>} />
            </div>
          ))}
          {steps.length === 0 && <p className="mt-3 text-[13px] text-[#6b6b6b]">Add the first step with +</p>}
          <datalist id="auto-tags">{tags.map((t) => (<option key={t} value={t} />))}</datalist>
        </div>

        {/* ------------------------------ side ------------------------------ */}
        <aside className="space-y-6">
          <section className="rounded-lg border border-[#e3e3e3] p-4">
            <h2 className="mb-1 text-[15px] font-semibold">Test it</h2>
            <p className="mb-3 text-[13px] text-[#5e5e5e]">Runs the steps now for one contact (saved version, automation must be on).</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await testAutomationAction(automation.id, testEmail);
                  setMsg(r.ok ? { ok: true, text: "Test run started. See the activity below." } : { ok: false, text: r.error });
                  if (r.ok) router.refresh();
                });
              }}
            >
              <input aria-label="Contact email to test with" type="email" required className={cn(tf.input, "py-1.5")} placeholder="contact@email.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
              <button type="submit" className={tf.btnOutline} disabled={pending}>Run</button>
            </form>
          </section>

          <section className="rounded-lg border border-[#e3e3e3]">
            <h2 className="border-b border-[#ececec] px-4 py-3 text-[15px] font-semibold">
              Activity <span className="font-normal text-[#6b6b6b]">({automation.stats?.total ?? runs.length})</span>
            </h2>
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[#6b6b6b]">Nobody has gone through this automation yet.</p>
            ) : (
              <ul className="max-h-[520px] divide-y divide-[#f0f0f0] overflow-y-auto">
                {runs.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.contact_email ?? "Deleted contact"}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", r.status === "done" ? "bg-[#e3f5e9] text-[#1f7a43]" : r.status === "failed" ? "bg-[#fde8e4] text-[#c2331d]" : "bg-[#f0f0f0] text-[#5e5e5e]")}>
                        {r.status === "waiting" ? `waiting until ${new Date(r.next_run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : r.status}
                      </span>
                    </div>
                    {r.log.slice(-3).map((l, k) => (
                      <p key={k} className={cn("truncate", l.ok ? "text-[#6b6b6b]" : "text-[#c2331d]")}>{l.message}</p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Connector() {
  return <span aria-hidden className="block h-6 w-px bg-[#d4d4d4]" />;
}

function StepFields({ step: s, i, set, lists, emailReady }: { step: Step; i: number; set: (p: Partial<Step>) => void; lists: ContactList[]; emailReady: boolean }) {
  const id = (k: string) => `step-${i}-${k}`;
  switch (s.type) {
    case "send_email":
      return (
        <div className="space-y-2">
          {!emailReady && <p className="rounded-md bg-[#fff6e0] px-3 py-2 text-[12px] text-[#7a5300]">Email sending isn&apos;t set up yet (add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel), so this step will be logged as not sent.</p>}
          <div><label className={tf.label} htmlFor={id("subject")}>Subject</label><input id={id("subject")} className={tf.input} value={s.subject} onChange={(e) => set({ subject: e.target.value })} /></div>
          <div><label className={tf.label} htmlFor={id("body")}>Message</label><textarea id={id("body")} rows={6} className={tf.input} value={s.body} onChange={(e) => set({ body: e.target.value })} /></div>
          <p className="text-[12px] text-[#6b6b6b]">Personalize with {"{{first_name}}"}, {"{{last_name}}"}, {"{{email}}"} or {"{{property:Question title}}"}. An unsubscribe link is added automatically.</p>
        </div>
      );
    case "wait":
      return (
        <div className="flex items-center gap-2">
          <label className="text-[14px]" htmlFor={id("amount")}>Wait</label>
          <input id={id("amount")} type="number" min={1} className={cn(tf.input, "w-24")} value={s.amount} onChange={(e) => set({ amount: Number(e.target.value) })} />
          <select aria-label="Unit" className={tf.select} value={s.unit} onChange={(e) => set({ unit: e.target.value as "minutes" | "hours" | "days" })}>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      );
    case "add_tag":
    case "remove_tag":
      return <input aria-label="Tag" list="auto-tags" className={tf.input} placeholder="Tag name" value={s.tag} onChange={(e) => set({ tag: e.target.value })} />;
    case "add_to_list":
    case "remove_from_list":
      return (
        <select aria-label="List" className={cn(tf.select, "w-full")} value={s.list_id} onChange={(e) => set({ list_id: e.target.value })}>
          <option value="">Choose a list...</option>
          {lists.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </select>
      );
    case "webhook":
      return <input aria-label="Webhook URL" className={tf.input} placeholder="https://hooks.zapier.com/..." value={s.url} onChange={(e) => set({ url: e.target.value })} />;
    case "discord":
      return (
        <div className="space-y-2">
          <div>
            <label className={tf.label} htmlFor={id("discord-url")}>Discord channel webhook link</label>
            <input id={id("discord-url")} className={tf.input} placeholder="https://discord.com/api/webhooks/..." value={s.url} onChange={(e) => set({ url: e.target.value })} />
            <p className="mt-1 text-[12px] text-[#6b6b6b]">In Discord: channel settings › Integrations › Webhooks › New webhook › Copy webhook URL.</p>
          </div>
          <div>
            <label className={tf.label} htmlFor={id("discord-msg")}>Message</label>
            <textarea id={id("discord-msg")} rows={7} className={cn(tf.input, "font-mono text-[12px]")} value={s.message} onChange={(e) => set({ message: e.target.value })} />
            <p className="mt-1 text-[12px] text-[#6b6b6b]">Discord formatting works (**bold**, @here). Merge: {"{{first_name}} {{last_name}} {{email}} {{phone}}"} plus the trigger&apos;s fields above.</p>
          </div>
        </div>
      );
  }
}
