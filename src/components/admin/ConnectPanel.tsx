"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";
import { testEmailAction, testWebhookAction, updateFormSettingsAction } from "@/forms/actions";

function Card({ icon, color, title, desc, connected, children }: { icon: string; color: string; title: string; desc: string; connected: boolean; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e3e3e3] p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[16px] font-bold text-white" style={{ background: color }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-[12px]", connected ? "bg-[#e3f5e9] text-[#1f7a43]" : "bg-[#f0f0f0] text-[#5e5e5e]")}>
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-0.5 text-[14px] text-[#5e5e5e]">{desc}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function ConnectPanel({
  id,
  notifyEmail,
  webhookUrl,
  calendly,
  emailReady,
  automations,
}: {
  id: string;
  notifyEmail: string;
  webhookUrl: string;
  calendly: string[];
  emailReady: boolean;
  automations: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(notifyEmail);
  const [hook, setHook] = useState(webhookUrl);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);
  const [pending, start] = useTransition();

  const save = (where: string, patch: { notify_email?: string; webhook_url?: string }) =>
    start(async () => {
      const r = await updateFormSettingsAction(id, patch);
      setMsg(r.ok ? { ok: true, text: "Saved", where } : { ok: false, text: r.error, where });
      if (r.ok) router.refresh();
    });
  const note = (where: string) =>
    msg?.where === where && (
      <p role="status" className={cn("mt-2 text-[13px]", msg.ok ? "text-[#1f7a43]" : "text-[#c2331d]")}>{msg.text}</p>
    );

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 py-6 sm:px-8">
      <div className="mb-2">
        <h1 className="text-[22px] font-semibold">Connect</h1>
        <p className="text-[14px] text-[#5e5e5e]">Send each new response to the tools you already use.</p>
      </div>

      <Card icon="C" color="#006bff" title="Calendly" desc="Qualified applicants book a call right on the ending screen." connected={calendly.length > 0}>
        {calendly.length > 0 ? (
          <ul className="space-y-1 text-[14px]">
            {calendly.map((u) => (<li key={u} className="truncate"><a className="underline" href={u} target="_blank" rel="noreferrer">{u}</a></li>))}
          </ul>
        ) : (
          <p className="text-[14px] text-[#5e5e5e]">Add a Calendly link to an ending in <Link className="underline" href={`/forms/${id}/create`}>Content › Endings</Link>.</p>
        )}
      </Card>

      <Card icon="@" color="#262627" title="Email notifications" desc="Get an email for every new application." connected={!!notifyEmail && emailReady}>
        {!emailReady && (
          <p className="mb-3 rounded-md bg-[#fff6e0] px-3 py-2 text-[13px] text-[#7a5300]">
            Email sending isn&apos;t set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel. Alerts then go to that Gmail automatically.
          </p>
        )}
        <label className={tf.label} htmlFor="notify-email">Send to (comma separated)</label>
        <div className="flex flex-wrap gap-2">
          <input id="notify-email" className={cn(tf.input, "min-w-0 flex-1")} placeholder="Leave empty to use your Gmail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" className={tf.btn} disabled={pending} aria-label="Save email recipients" onClick={() => save("email", { notify_email: email.trim() })}>Save</button>
          <button
            type="button"
            className={tf.btnOutline}
            disabled={pending || !email.trim()}
            onClick={() =>
              start(async () => {
                const r = await testEmailAction(email.trim());
                setMsg(r.ok ? { ok: true, text: `Test email sent to ${r.data.sentTo}.`, where: "email" } : { ok: false, text: r.error, where: "email" });
              })
            }
          >
            Send test
          </button>
        </div>
        {note("email")}
      </Card>

      <Card icon="⚡" color="#7b3fe4" title="Webhooks" desc="Post each response to Zapier, Make, Discord or your own server." connected={!!webhookUrl}>
        <label className={tf.label} htmlFor="webhook-url">Endpoint URL</label>
        <div className="flex flex-wrap gap-2">
          <input id="webhook-url" className={cn(tf.input, "min-w-0 flex-1")} placeholder="https://hooks.zapier.com/..." value={hook} onChange={(e) => setHook(e.target.value)} />
          <button type="button" className={tf.btn} disabled={pending} aria-label="Save webhook" onClick={() => save("hook", { webhook_url: hook.trim() })}>Save</button>
          <button
            type="button"
            className={tf.btnOutline}
            disabled={pending || !hook.trim()}
            onClick={() =>
              start(async () => {
                const r = await testWebhookAction(hook.trim());
                setMsg(r.ok ? { ok: true, text: `Webhook answered ${r.data.status}.`, where: "hook" } : { ok: false, text: r.error, where: "hook" });
              })
            }
          >
            Send test
          </button>
        </div>
        {note("hook")}
      </Card>

      <Card icon="◎" color="#1f9d55" title="Contacts" desc="Everyone who leaves an email becomes a contact, tagged with this form and their outcome." connected>
        <Link href="/contacts" className={tf.btnOutline}>Open Contacts</Link>
      </Card>

      <Card icon="↻" color="#e8590c" title="Automations" desc="Follow-up emails, tags, lists and webhooks that run after each submission." connected={automations > 0}>
        <div className="flex gap-2">
          <Link href={`/automations/new?form=${id}`} className={tf.btn}>+ New automation</Link>
          <Link href="/automations" className={tf.btnOutline}>All automations</Link>
        </div>
      </Card>
    </div>
  );
}
