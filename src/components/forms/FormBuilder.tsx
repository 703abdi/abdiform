"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select, Textarea } from "@/components/ui";
import { deleteFormAction, saveFormAction } from "@/forms/actions";
import { newId } from "@/forms/lib";
import {
  FIELD_TYPE_LABELS,
  hasChoices,
  type Field,
  type FieldType,
  type Form,
  type FormSettings,
  type FormStatus,
} from "@/forms/types";

export function FormBuilder({ form }: { form: Form }) {
  const router = useRouter();
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [slug, setSlug] = useState(form.slug);
  const [status, setStatus] = useState<FormStatus>(form.status);
  const [fields, setFields] = useState<Field[]>(form.fields);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const setS = <K extends keyof FormSettings>(k: K, v: FormSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const update = (id: string, p: Partial<Field>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) =>
    setFields((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const c = [...fs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  function changeType(f: Field, type: FieldType) {
    const p: Partial<Field> = { type };
    if (hasChoices(type) && !(f.choices && f.choices.length)) p.choices = ["Option 1", "Option 2"];
    if (type === "rating" && !f.steps) p.steps = 5;
    update(f.id, p);
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveFormAction(form.id, { title, description, slug, status, fields, settings });
      if (r.ok) {
        setSlug(r.data.slug);
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/apply/${slug}` : `/apply/${slug}`;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <Select value={status} onChange={(e) => setStatus(e.target.value as FormStatus)} className="w-36">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </Select>
        <Button onClick={save} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
        <a href={`/apply/${slug}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Preview
        </a>
        {msg && <span className={msg.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"} role="status">{msg.text}</span>}
      </div>

      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Form title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Link</label>
            <div className="flex items-center gap-1 text-sm text-slate-400">/apply/<Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
          </div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Description (shown on the welcome screen)</label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Questions ({fields.length})</h3>
        {fields.map((f, i) => (
          <Card key={f.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <Select value={f.type} onChange={(e) => changeType(f, e.target.value as FieldType)} className="w-52">
                  {Object.entries(FIELD_TYPE_LABELS).map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                </Select>
                {f.type !== "statement" && (
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" checked={f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> Required
                  </label>
                )}
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>&uarr;</Button>
                  <Button variant="ghost" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>&darr;</Button>
                  <Button variant="ghost" aria-label="Delete question" onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}>Delete</Button>
                </div>
              </div>
              <Input placeholder="Your question" value={f.title} onChange={(e) => update(f.id, { title: e.target.value })} />
              <Input placeholder="Description (optional)" value={f.description ?? ""} onChange={(e) => update(f.id, { description: e.target.value })} />
              {hasChoices(f.type) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Choices (one per line)</label>
                  <Textarea rows={4} value={(f.choices ?? []).join("\n")} onChange={(e) => update(f.id, { choices: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                  {f.type !== "dropdown" && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                      <input type="checkbox" checked={!!f.allow_other} onChange={(e) => update(f.id, { allow_other: e.target.checked })} /> Allow an &quot;Other&quot; answer
                    </label>
                  )}
                </div>
              )}
              {f.type === "rating" && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  Stars
                  <Select value={f.steps ?? 5} onChange={(e) => update(f.id, { steps: Number(e.target.value) })} className="w-20">
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (<option key={n} value={n}>{n}</option>))}
                  </Select>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
        <Button variant="outline" onClick={() => setFields((fs) => [...fs, { id: newId(), type: "short_text", title: "", required: false }])}>
          + Add question
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Look &amp; messages</CardTitle></CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-end gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Accent colour</label><input type="color" value={settings.accent} onChange={(e) => setS("accent", e.target.value)} className="h-10 w-16 cursor-pointer rounded border border-slate-300" /></div>
            <div className="flex-1"><label className="mb-1 block text-xs font-medium text-slate-600">Theme</label>
              <Select value={settings.theme} onChange={(e) => setS("theme", e.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark</option></Select></div>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={settings.welcome_enabled} onChange={(e) => setS("welcome_enabled", e.target.checked)} /> Show a welcome screen</label>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Welcome headline</label><Input value={settings.welcome_title} placeholder={title} onChange={(e) => setS("welcome_title", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Start button</label><Input value={settings.start_label} onChange={(e) => setS("start_label", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Welcome text</label><Textarea rows={2} value={settings.welcome_description} onChange={(e) => setS("welcome_description", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Thank-you headline</label><Input value={settings.thank_you_title} onChange={(e) => setS("thank_you_title", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Redirect after submit (optional URL)</label><Input value={settings.redirect_url} placeholder="https://calendly.com/you/call" onChange={(e) => setS("redirect_url", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Thank-you message</label><Textarea rows={2} value={settings.thank_you_message} onChange={(e) => setS("thank_you_message", e.target.value)} /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Share &amp; notifications</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Public link {status !== "published" && <span className="text-amber-600">(set status to Published and save to go live)</span>}</label>
            <div className="flex gap-2">
              <Input readOnly value={link} />
              <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Embed</label>
            <Textarea readOnly rows={2} value={`<iframe src="${link}" style="width:100%;height:640px;border:0" title="${title.replace(/"/g, "")}"></iframe>`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email me on each new application (comma-separate up to 5 addresses). Needs BREVO_API_KEY and NOTIFY_FROM_EMAIL on the server.</label>
            <Input value={settings.notify_email} placeholder="you@example.com" onChange={(e) => setS("notify_email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Webhook URL (optional). Each new application is POSTed here as JSON, so you can wire Zapier, Make, or a Discord relay.</label>
            <Input value={settings.webhook_url} placeholder="https://hooks.zapier.com/..." onChange={(e) => setS("webhook_url", e.target.value)} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Deleting a form also deletes all of its responses.</p>
          <Button variant="danger" onClick={() => {
            if (!confirm(`Delete "${form.title}" and all its responses permanently?`)) return;
            start(async () => { const r = await deleteFormAction(form.id); if (r.ok) router.push("/forms"); else setMsg({ ok: false, text: r.error }); });
          }}>Delete form</Button>
        </CardBody>
      </Card>
    </div>
  );
}
