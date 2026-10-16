"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import FormRunner from "@/components/forms/FormRunner";
import { LogicEditor } from "@/components/forms/LogicEditor";
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { deleteFormAction, saveFormAction, testEmailAction, testWebhookAction } from "@/forms/actions";
import { allEndings, answerFields, FONTS, DESIGN_PRESETS, newId, plainText, resolveDesign } from "@/forms/lib";
import { hasQuiz } from "@/forms/logic";
import {
  FIELD_TYPE_LABELS,
  hasChoices,
  type Design,
  type Ending,
  type Field,
  type FieldType,
  type Form,
  type FormSettings,
  type FormStatus,
} from "@/forms/types";

export type BuilderTab = "questions" | "design" | "endings" | "settings";
type Tab = BuilderTab;

/** Question types offered in the "add question" picker, grouped like Typeform. */
const PICKER: { group: string; items: { type: FieldType | "contact" | "address"; label: string; hint: string }[] }[] = [
  {
    group: "Contact info",
    items: [
      { type: "contact", label: "Contact info", hint: "First name, last name, phone and email on one screen" },
      { type: "address", label: "Address", hint: "Street, city, state, zip and country on one screen" },
      { type: "email", label: "Email", hint: "Validated email address" },
      { type: "phone", label: "Phone number", hint: "Validated phone number" },
      { type: "url", label: "Website", hint: "A web address" },
      { type: "file_upload", label: "File upload", hint: "Applicant attaches a file (4 MB max)" },
    ],
  },
  {
    group: "Text & numbers",
    items: [
      { type: "short_text", label: "Short text", hint: "One line, e.g. a name" },
      { type: "long_text", label: "Long text", hint: "A paragraph" },
      { type: "number", label: "Number", hint: "Digits only" },
      { type: "date", label: "Date", hint: "A calendar date" },
    ],
  },
  {
    group: "Choice",
    items: [
      { type: "multiple_choice", label: "Multiple choice", hint: "Pick one" },
      { type: "checkboxes", label: "Checkboxes", hint: "Pick several" },
      { type: "picture_choice", label: "Picture choice", hint: "Pick one image" },
      { type: "dropdown", label: "Dropdown", hint: "Pick from a list" },
      { type: "yes_no", label: "Yes / No", hint: "Two options" },
      { type: "legal", label: "Legal / consent", hint: "Accept or decline" },
      { type: "ranking", label: "Ranking", hint: "Put options in order" },
      { type: "matrix", label: "Matrix", hint: "Rows and columns, one answer per row" },
    ],
  },
  {
    group: "Rating",
    items: [
      { type: "rating", label: "Rating", hint: "Stars" },
      { type: "scale", label: "Opinion scale", hint: "0 to 10" },
    ],
  },
  { group: "Other", items: [{ type: "statement", label: "Statement", hint: "Text with no answer" }] },
];

const GROUP_CHILD_TYPES: FieldType[] = ["short_text", "long_text", "email", "phone", "number", "url", "date", "dropdown", "multiple_choice", "yes_no"];

function makeField(type: FieldType | "contact" | "address"): Field {
  if (type === "address") {
    return {
      id: newId(),
      type: "group",
      title: "What's your address?",
      required: false,
      fields: [
        { id: newId(), type: "short_text", title: "Address", required: true },
        { id: newId(), type: "short_text", title: "Address line 2", required: false },
        { id: newId(), type: "short_text", title: "City", required: true },
        { id: newId(), type: "short_text", title: "State / Province", required: false },
        { id: newId(), type: "short_text", title: "ZIP / Postal code", required: true },
        { id: newId(), type: "short_text", title: "Country", required: true },
      ],
    };
  }
  if (type === "contact") {
    return {
      id: newId(),
      type: "group",
      title: "So we can reach out, what's your:",
      required: false,
      fields: [
        { id: newId(), type: "short_text", title: "First name", required: true },
        { id: newId(), type: "short_text", title: "Last name", required: true },
        { id: newId(), type: "phone", title: "Phone number", required: true },
        { id: newId(), type: "email", title: "Email", required: true },
      ],
    };
  }
  const f: Field = { id: newId(), type, title: "", required: false };
  if (hasChoices(type)) f.choices = ["Option 1", "Option 2"];
  if (type === "rating") f.steps = 5;
  if (type === "matrix") f.rows = ["Row 1", "Row 2"];
  if (type === "yes_no" || type === "legal") f.required = true;
  return f;
}

function cloneField(f: Field): Field {
  return { ...f, id: newId(), rules: undefined, otherwise: undefined, fields: f.fields?.map(cloneField) };
}

const toHex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000");

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5" aria-label={label} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

export function FormBuilder({ form, initialTab = "questions" }: { form: Form; initialTab?: Tab }) {
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
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(form.fields[0]?.id ?? null);
  const [logicOpen, setLogicOpen] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const snapshot = useMemo(() => JSON.stringify({ title, description, slug, status, fields, settings }), [title, description, slug, status, fields, settings]);
  const [baseline, setBaseline] = useState(snapshot); // what is saved on the server
  // Publishing from the form header changes the status on the server: follow it here too.
  const [serverStatus, setServerStatus] = useState(form.status);
  if (form.status !== serverStatus) {
    setServerStatus(form.status);
    setStatus(form.status);
    setBaseline((b) => JSON.stringify({ ...JSON.parse(b), status: form.status }));
  }
  const dirty = snapshot !== baseline;
  const [dragId, setDragId] = useState<string | null>(null);
  const [embedMode, setEmbedMode] = useState<"standard" | "popup" | "slider" | "sidetab" | "popover" | "fullpage">("standard");
  const [embedLabel, setEmbedLabel] = useState("Apply now");
  const [qr, setQr] = useState("");

  const setS = <K extends keyof FormSettings>(k: K, v: FormSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const design = resolveDesign(settings);
  const setD = <K extends keyof Design>(k: K, v: Design[K]) => setSettings((s) => ({ ...s, design: { ...resolveDesign(s), [k]: v } }));
  const update = (id: string, p: Partial<Field>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const inputs = useMemo(() => answerFields(fields), [fields]);
  const endings = useMemo(() => allEndings(settings), [settings]);
  const quiz = hasQuiz(fields);

  function move(i: number, d: -1 | 1) {
    setFields((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const c = [...fs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setFields((fs) => {
      const from = fs.findIndex((f) => f.id === dragId);
      const to = fs.findIndex((f) => f.id === targetId);
      if (from < 0 || to < 0) return fs;
      const c = [...fs];
      const [m] = c.splice(from, 1);
      c.splice(to, 0, m);
      return c;
    });
    setDragId(null);
  }
  function addField(type: FieldType | "contact" | "address") {
    const f = makeField(type);
    setFields((fs) => [...fs, f]);
    setOpenId(f.id);
    setPicker(false);
  }
  function changeType(f: Field, type: FieldType) {
    const p: Partial<Field> = { type };
    if (hasChoices(type) && !(f.choices && f.choices.length)) p.choices = ["Option 1", "Option 2"];
    if (type === "rating" && !f.steps) p.steps = 5;
    update(f.id, p);
  }
  function updateChild(parent: Field, childId: string, p: Partial<Field>) {
    update(parent.id, { fields: (parent.fields ?? []).map((c) => (c.id === childId ? { ...c, ...p } : c)) });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveFormAction(form.id, { title, description, slug, status, fields, settings });
      if (r.ok) {
        // the server consumed a newly typed password; reflect that locally so the form isn't "dirty"
        const saved: FormSettings = { ...settings, access_password: "", has_password: settings.access_password ? true : settings.has_password };
        setSettings(saved);
        setSlug(r.data.slug);
        setBaseline(JSON.stringify({ title, description, slug: r.data.slug, status, fields, settings: saved }));
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  // warn before leaving with unsaved work; Ctrl/Cmd+S saves
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!pending) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/apply/${slug}`;
  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(`${origin}/apply/${slug}`, { width: 360, margin: 2 }).then(setQr).catch(() => setQr(""));
  }, [origin, slug]);
  const embedCode =
    embedMode === "standard"
      ? `<iframe src="${link}" style="width:100%;height:640px;border:0" title="${title.replace(/"/g, "")}"></iframe>`
      : `<script src="${origin}/embed.js" data-form="${slug}" data-mode="${embedMode}" data-label="${embedLabel.replace(/"/g, "")}" async></script>`;
  const previewKey = `${openId ?? ""}|${fields.map((f) => f.id).join(",")}|${settings.welcome_enabled}|${(settings.endings ?? []).length}`;

  const TABS: [Tab, string][] = [
    ["questions", "Questions"],
    ["design", "Design"],
    ["endings", "Endings"],
    ["settings", "Settings & share"],
  ];

  function renderEditor(f: Field, i: number) {
    return (
      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <Select value={f.type} onChange={(e) => changeType(f, e.target.value as FieldType)} className="w-56">
                            {Object.entries(FIELD_TYPE_LABELS).map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                          </Select>
                          {f.type !== "statement" && f.type !== "group" && (
                            <label className="flex items-center gap-1.5 text-sm text-slate-600">
                              <input type="checkbox" checked={f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> Required
                            </label>
                          )}
                          {f.type === "email" && (
                            <label className="flex items-center gap-1.5 text-sm text-slate-600">
                              <input type="checkbox" checked={!!f.verify} onChange={(e) => update(f.id, { verify: e.target.checked || undefined })} /> Verify with a code
                            </label>
                          )}
                        </div>
                        <Input placeholder="Your question" value={f.title} onChange={(e) => update(f.id, { title: e.target.value })} />
                        <Input placeholder="Description (optional)" value={f.description ?? ""} onChange={(e) => update(f.id, { description: e.target.value })} />
                        {i > 0 && (
                          <Select value="" className="w-72" aria-label="Insert an earlier answer into the question" onChange={(e) => e.target.value && update(f.id, { title: `${f.title} {{field:${e.target.value}}}`.trim() })}>
                            <option value="">Insert an earlier answer...</option>
                            {answerFields(fields.slice(0, i)).map((x) => (
                              <option key={x.id} value={x.id}>{(plainText(x.title) || "Untitled").slice(0, 50)}</option>
                            ))}
                          </Select>
                        )}

                        {f.type === "group" && (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-medium text-slate-500">Inputs on this screen</p>
                            {(f.fields ?? []).map((c) => (
                              <div key={c.id} className="flex flex-wrap items-center gap-2">
                                <Select value={c.type} className="w-36" onChange={(e) => updateChild(f, c.id, { type: e.target.value as FieldType, ...(hasChoices(e.target.value as FieldType) && !(c.choices && c.choices.length) ? { choices: ["Option 1", "Option 2"] } : {}) })}>
                                  {GROUP_CHILD_TYPES.map((t) => (<option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>))}
                                </Select>
                                <Input className="min-w-0 flex-1" value={c.title} placeholder="Label" onChange={(e) => updateChild(f, c.id, { title: e.target.value })} />
                                <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={c.required} onChange={(e) => updateChild(f, c.id, { required: e.target.checked })} /> Required</label>
                                {c.type === "email" && (
                                  <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={!!c.verify} onChange={(e) => updateChild(f, c.id, { verify: e.target.checked || undefined })} /> Verify with a code</label>
                                )}
                                <Button variant="ghost" onClick={() => update(f.id, { fields: (f.fields ?? []).filter((x) => x.id !== c.id) })}>Remove</Button>
                                {hasChoices(c.type) && (
                                  <Textarea className="basis-full" rows={3} placeholder="Choices (one per line)" value={(c.choices ?? []).join("\n")} onChange={(e) => updateChild(f, c.id, { choices: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                                )}
                              </div>
                            ))}
                            <Button variant="outline" onClick={() => update(f.id, { fields: [...(f.fields ?? []), { id: newId(), type: "short_text", title: "", required: false }] })}>+ Add input</Button>
                          </div>
                        )}

                        {hasChoices(f.type) && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">{f.type === "ranking" ? "Items to rank" : f.type === "matrix" ? "Columns" : "Choices"} (one per line)</label>
                            <Textarea rows={4} value={(f.choices ?? []).join("\n")} onChange={(e) => update(f.id, { choices: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                            {(f.type === "multiple_choice" || f.type === "checkboxes") && (
                              <label className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                                <input type="checkbox" checked={!!f.allow_other} onChange={(e) => update(f.id, { allow_other: e.target.checked })} /> Allow an &quot;Other&quot; answer
                              </label>
                            )}
                            {f.type === "picture_choice" && (
                              <div className="mt-2 space-y-1.5">
                                <p className="text-xs font-medium text-slate-500">Image links (https) for each choice</p>
                                {(f.choices ?? []).map((c) => (
                                  <div key={c} className="flex items-center gap-2">
                                    <span className="w-32 truncate text-sm text-slate-600">{c}</span>
                                    <Input placeholder="https://..." value={f.images?.[c] ?? ""} onChange={(e) => update(f.id, { images: { ...(f.images ?? {}), [c]: e.target.value } })} />
                                  </div>
                                ))}
                              </div>
                            )}
                            {f.type !== "ranking" && f.type !== "dropdown" && f.type !== "matrix" && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-medium text-slate-500">Quiz points (optional)</summary>
                                <div className="mt-1.5 space-y-1.5">
                                  {(f.choices ?? []).map((c) => (
                                    <div key={c} className="flex items-center gap-2">
                                      <span className="w-48 truncate text-sm text-slate-600">{c}</span>
                                      <Input type="number" className="w-24" value={f.points?.[c] ?? ""} placeholder="0" onChange={(e) => update(f.id, { points: { ...(f.points ?? {}), [c]: e.target.value === "" ? 0 : Number(e.target.value) } })} />
                                    </div>
                                  ))}
                                </div>
                              </details>
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

                        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">Options</p>
                          {f.type === "matrix" && (
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-slate-600">Rows (one per line)</label>
                              <Textarea rows={3} value={(f.rows ?? []).join("\n")} onChange={(e) => update(f.id, { rows: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                            </div>
                          )}
                          {f.type === "scale" && (
                            <>
                              <div><label className="mb-1 block text-xs font-medium text-slate-600">Steps</label>
                                <Select value={f.steps ?? 11} onChange={(e) => update(f.id, { steps: Number(e.target.value) })}>{[5, 6, 7, 8, 9, 10, 11].map((n) => (<option key={n} value={n}>{n}</option>))}</Select></div>
                              <div><label className="mb-1 block text-xs font-medium text-slate-600">Starts at</label>
                                <Select value={f.start_at_one ? 1 : 0} onChange={(e) => update(f.id, { start_at_one: e.target.value === "1" })}><option value={0}>0</option><option value={1}>1</option></Select></div>
                              <Input placeholder="Left label" value={f.labels?.left ?? ""} onChange={(e) => update(f.id, { labels: { ...f.labels, left: e.target.value } })} />
                              <Input placeholder="Centre label" value={f.labels?.center ?? ""} onChange={(e) => update(f.id, { labels: { ...f.labels, center: e.target.value } })} />
                              <Input placeholder="Right label" value={f.labels?.right ?? ""} onChange={(e) => update(f.id, { labels: { ...f.labels, right: e.target.value } })} />
                            </>
                          )}
                          {f.type === "number" && (
                            <>
                              <Input type="number" placeholder="Minimum" value={f.min ?? ""} onChange={(e) => update(f.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })} />
                              <Input type="number" placeholder="Maximum" value={f.max ?? ""} onChange={(e) => update(f.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                            </>
                          )}
                          {(f.type === "short_text" || f.type === "long_text") && (
                            <Input type="number" placeholder="Max characters" value={f.max_chars ?? ""} onChange={(e) => update(f.id, { max_chars: e.target.value === "" ? undefined : Number(e.target.value) })} />
                          )}
                          {f.type === "checkboxes" && (
                            <>
                              <Input type="number" min={1} placeholder="Min selections" value={f.min_selections ?? ""} onChange={(e) => update(f.id, { min_selections: e.target.value === "" ? undefined : Number(e.target.value) })} />
                              <Input type="number" min={1} placeholder="Max selections" value={f.max_selections ?? ""} onChange={(e) => update(f.id, { max_selections: e.target.value === "" ? undefined : Number(e.target.value) })} />
                            </>
                          )}
                          {f.type === "date" && (
                            <Select value={f.date_format ?? "MM/DD/YYYY"} onChange={(e) => update(f.id, { date_format: e.target.value as Field["date_format"] })}>
                              <option value="MM/DD/YYYY">MM / DD / YYYY</option><option value="DD/MM/YYYY">DD / MM / YYYY</option><option value="YYYY/MM/DD">YYYY / MM / DD</option>
                            </Select>
                          )}
                          {["multiple_choice", "checkboxes", "picture_choice", "ranking", "dropdown"].includes(f.type) && (
                            <Toggle label="Randomize the order of choices" checked={!!f.randomize} onChange={(v) => update(f.id, { randomize: v })} />
                          )}
                          {(f.type === "multiple_choice" || f.type === "checkboxes") && (
                            <Toggle label={'Add a "None of the above" option'} checked={!!f.none_of_the_above} onChange={(v) => update(f.id, { none_of_the_above: v })} />
                          )}
                          <Input placeholder='Button text (default "OK")' value={f.button_text ?? ""} onChange={(e) => update(f.id, { button_text: e.target.value || undefined })} />
                          <Input placeholder="Picture link (https://...)" value={f.image ?? ""} onChange={(e) => update(f.id, { image: e.target.value || undefined })} />
                          {f.image && (
                            <Select value={f.image_layout ?? "stack"} onChange={(e) => update(f.id, { image_layout: e.target.value as Field["image_layout"] })}>
                              <option value="stack">Picture above the question</option><option value="split-right">Picture on the right</option><option value="split-left">Picture on the left</option><option value="wallpaper">Picture as wallpaper</option>
                            </Select>
                          )}
                        </div>

                        <div>
                          <Button variant="outline" onClick={() => setLogicOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}>
                            Logic{(f.rules?.length || f.otherwise) ? ` (${f.rules?.length ?? 0} rule${(f.rules?.length ?? 0) === 1 ? "" : "s"})` : ""} {logicOpen[f.id] ? "▲" : "▼"}
                          </Button>
                          {logicOpen[f.id] && (
                            <div className="mt-2">
                              <LogicEditor field={f} fields={fields} inputs={inputs} quiz={quiz} endings={endings} onChange={(p) => update(f.id, p)} />
                            </div>
                          )}
                        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <Select value={status} onChange={(e) => setStatus(e.target.value as FormStatus)} className="w-36" aria-label="Status">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </Select>
        <Button onClick={save} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
        {dirty && !pending && <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Unsaved changes (Ctrl/Cmd+S)</span>}
        <a href={`/apply/${slug}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Open preview
        </a>
        {msg && <span className={msg.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"} role="status">{msg.text}</span>}
        <div className="ml-auto flex gap-1">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "questions" && (
        <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_390px]">
          {/* left: structure */}
          <aside className="space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-110px)] xl:self-start xl:overflow-y-auto">
            <Card>
              <CardBody className="space-y-2 p-3">
                <label className="block text-xs font-medium text-slate-600">Form title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                <label className="block text-xs font-medium text-slate-600">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </CardBody>
            </Card>
            <button onClick={() => setTab("endings")} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
              <span aria-hidden>👋</span> Welcome screen {settings.welcome_enabled ? "" : <span className="text-slate-400">(off)</span>}
            </button>
            {fields.map((f, i) => (
              <div
                key={f.id}
                draggable
                onDragStart={() => setDragId(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(f.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => setOpenId(f.id)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-sm shadow-sm", openId === f.id ? "border-brand ring-2 ring-brand/30" : "border-slate-200 hover:border-slate-300", dragId === f.id && "opacity-50")}
              >
                <span className="cursor-grab select-none text-slate-300" title="Drag to reorder" aria-hidden>⋮⋮</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-brand px-1 text-[11px] font-semibold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{plainText(f.title) || <span className="text-slate-400">Untitled question</span>}</span>
                  <span className="block truncate text-[11px] text-slate-400">{FIELD_TYPE_LABELS[f.type]}{(f.rules?.length ?? 0) > 0 ? " · logic" : ""}</span>
                </span>
              </div>
            ))}
            <Button className="w-full" onClick={() => setPicker(true)}>+ Add question</Button>
            <button onClick={() => setTab("endings")} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
              <span aria-hidden>🏁</span> Endings ({allEndings(settings).length})
            </button>
          </aside>

          {/* middle: big live preview */}
          <section className="min-w-0 space-y-2">
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span className="font-medium">Live preview</span>
              <div className="flex gap-1">
                {(["desktop", "mobile"] as const).map((d) => (
                  <button key={d} onClick={() => setDevice(d)} className={cn("rounded px-2 py-1", device === d ? "bg-slate-800 text-white" : "hover:bg-slate-100")}>{d === "desktop" ? "Desktop" : "Mobile"}</button>
                ))}
              </div>
            </div>
            <div className={cn("mx-auto h-[calc(100vh-190px)] min-h-[520px] overflow-hidden rounded-xl border border-slate-200 shadow-sm", device === "mobile" && "max-w-[390px]")}>
              <FormRunner key={previewKey} embedded preview slug={slug} title={title} description={description} fields={fields} settings={settings} endings={endings} initialId={openId ?? undefined} />
            </div>
          </section>

          {/* right: selected question */}
          <aside className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-110px)] xl:self-start xl:overflow-y-auto">
            {(() => {
              const i = fields.findIndex((x) => x.id === openId);
              const f = fields[i];
              if (!f) return <Card><CardBody className="text-sm text-slate-400">Select a question on the left to edit it.</CardBody></Card>;
              return (
                <Card>
                  <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
                    <span className="flex h-6 min-w-6 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">{i + 1}</span>
                    <span className="flex-1 truncate text-sm font-semibold text-slate-700">{FIELD_TYPE_LABELS[f.type]}</span>
                    <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>&uarr;</Button>
                    <Button variant="ghost" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>&darr;</Button>
                    <Button variant="ghost" aria-label="Duplicate question" onClick={() => setFields((fs) => { const c = [...fs]; c.splice(i + 1, 0, cloneField(f)); return c; })}>Copy</Button>
                    <Button variant="ghost" aria-label="Delete question" onClick={() => { setFields((fs) => fs.filter((x) => x.id !== f.id)); setOpenId(fields[i + 1]?.id ?? fields[i - 1]?.id ?? null); }}>Delete</Button>
                  </div>
                  <CardBody>{renderEditor(f, i)}</CardBody>
                </Card>
              );
            })()}
          </aside>
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setPicker(false)}>
          <div role="dialog" aria-label="Add a question" className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">Add a question</h3>
              <Button variant="ghost" onClick={() => setPicker(false)}>Close</Button>
            </div>
            {PICKER.map((g) => (
              <div key={g.group} className="mb-3">
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {g.items.map((it) => (
                    <button key={it.label} onClick={() => addField(it.type)} className="rounded-lg px-3 py-2 text-left hover:bg-brand-soft">
                      <span className="block text-sm font-medium text-slate-800">{it.label}</span>
                      <span className="block text-xs text-slate-500">{it.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab !== "questions" && (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <div className="min-w-0 space-y-4">
          {/* -------------------------------- DESIGN -------------------------------- */}
          {tab === "design" && (
            <>
              <Card>
                <CardHeader><CardTitle>Themes</CardTitle></CardHeader>
                <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {DESIGN_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setSettings((s) => ({ ...s, design: { ...p.design, background_image: resolveDesign(s).background_image } }))}
                      className="overflow-hidden rounded-lg border border-slate-200 text-left hover:ring-2 hover:ring-brand/40"
                    >
                      <div className="p-3" style={{ background: p.design.background, fontFamily: FONTS[p.design.font].css }}>
                        <p style={{ color: p.design.question, fontSize: 14 }}>Question text</p>
                        <span className="mt-1 inline-block px-2 py-0.5 text-[11px]" style={{ background: p.design.button, color: p.design.button_text, borderRadius: p.design.rounded === "none" ? 0 : p.design.rounded === "small" ? 3 : 8 }}>OK</span>
                        <p className="mt-1 text-[11px]" style={{ color: p.design.answer }}>Answer</p>
                      </div>
                      <div className="border-t border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{p.name}</div>
                    </button>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Colours</CardTitle></CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-2">
                  <ColorField label="Questions" value={design.question} onChange={(v) => setD("question", v)} />
                  <ColorField label="Answers" value={design.answer} onChange={(v) => setD("answer", v)} />
                  <ColorField label="Buttons" value={design.button} onChange={(v) => setD("button", v)} />
                  <ColorField label="Button text" value={design.button_text} onChange={(v) => setD("button_text", v)} />
                  <ColorField label="Background" value={design.background} onChange={(v) => setD("background", v)} />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Background image (https link, optional)</label>
                    <Input value={design.background_image ?? ""} placeholder="https://..." onChange={(e) => setD("background_image", e.target.value || undefined)} />
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Typography &amp; shape</CardTitle></CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Font</label>
                    <Select value={design.font} onChange={(e) => setD("font", e.target.value as Design["font"])}>
                      {Object.entries(FONTS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                    </Select></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Text size</label>
                    <Select value={design.font_size} onChange={(e) => setD("font_size", e.target.value as Design["font_size"])}>
                      <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
                    </Select></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Rounded corners</label>
                    <Select value={design.rounded} onChange={(e) => setD("rounded", e.target.value as Design["rounded"])}>
                      <option value="none">None</option><option value="small">Small</option><option value="large">Large</option>
                    </Select></div>
                  <div className="flex items-end"><Toggle label="Outline buttons (transparent)" checked={design.transparent_button} onChange={(v) => setD("transparent_button", v)} /></div>
                </CardBody>
              </Card>
              <Button variant="outline" onClick={() => setSettings((s) => ({ ...s, design: {} }))}>Reset to Classic blue</Button>
            </>
          )}

          {/* -------------------------------- ENDINGS -------------------------------- */}
          {tab === "endings" && (
            <>
              <Card>
                <CardHeader><CardTitle>Welcome screen</CardTitle></CardHeader>
                <CardBody className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Toggle label="Show a welcome screen" checked={settings.welcome_enabled} onChange={(v) => setS("welcome_enabled", v)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Headline</label><Input value={settings.welcome_title} placeholder={title} onChange={(e) => setS("welcome_title", e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Start button</label><Input value={settings.start_label} onChange={(e) => setS("start_label", e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Text</label><Textarea rows={2} value={settings.welcome_description} onChange={(e) => setS("welcome_description", e.target.value)} /></div>
                  <Input placeholder="Picture link (https://...)" value={settings.welcome_image ?? ""} onChange={(e) => setS("welcome_image", e.target.value || undefined)} />
                  {settings.welcome_image && (
                    <Select value={settings.welcome_image_layout ?? "stack"} onChange={(e) => setS("welcome_image_layout", e.target.value as FormSettings["welcome_image_layout"])}>
                      <option value="stack">Picture above</option><option value="split-right">Picture on the right</option><option value="split-left">Picture on the left</option><option value="wallpaper">Picture as wallpaper</option>
                    </Select>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Default ending</CardTitle></CardHeader>
                <CardBody className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Headline</label><Input value={settings.thank_you_title} onChange={(e) => setS("thank_you_title", e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Message</label><Textarea rows={3} value={settings.thank_you_message} onChange={(e) => setS("thank_you_message", e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Button text</label><Input value={settings.thank_you_button_label ?? ""} onChange={(e) => setS("thank_you_button_label", e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Button link</label><Input value={settings.thank_you_button_url ?? ""} placeholder="https://" onChange={(e) => setS("thank_you_button_url", e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Calendly booking calendar</label><Input value={settings.thank_you_calendly_url ?? ""} placeholder="https://calendly.com/yourname/30min" onChange={(e) => setS("thank_you_calendly_url", e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">After booking: headline</label><Input value={settings.thank_you_booked_title ?? ""} onChange={(e) => setS("thank_you_booked_title", e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">After booking: message</label><Input value={settings.thank_you_booked_message ?? ""} onChange={(e) => setS("thank_you_booked_message", e.target.value)} /></div>
                  <Input placeholder="Picture link (https://...)" value={settings.thank_you_image ?? ""} onChange={(e) => setS("thank_you_image", e.target.value || undefined)} />
                  {settings.thank_you_image && (
                    <Select value={settings.thank_you_image_layout ?? "stack"} onChange={(e) => setS("thank_you_image_layout", e.target.value as FormSettings["thank_you_image_layout"])}>
                      <option value="stack">Picture above</option><option value="split-right">Picture on the right</option><option value="split-left">Picture on the left</option><option value="wallpaper">Picture as wallpaper</option>
                    </Select>
                  )}
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Auto-redirect after submit (optional)</label><Input value={settings.redirect_url} placeholder="https://" onChange={(e) => setS("redirect_url", e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Contact tag for people who reach this ending (optional)</label><Input value={settings.thank_you_tag ?? ""} placeholder="e.g. Qualified" onChange={(e) => setS("thank_you_tag", e.target.value || undefined)} /></div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Extra endings (used by logic)</CardTitle></CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-slate-500">Send people to these from a question&apos;s Logic. Example: a Calendly booking for qualified applicants and a different message for everyone else.</p>
                  {(settings.endings ?? []).map((e, i) => {
                    const set = (p: Partial<Ending>) => setS("endings", (settings.endings ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)));
                    return (
                      <div key={e.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ending {i + 1}</span>
                          <Button variant="ghost" className="ml-auto" onClick={() => setS("endings", (settings.endings ?? []).filter((_, j) => j !== i))}>Remove</Button>
                        </div>
                        <Input placeholder="Headline" value={e.title} onChange={(ev) => set({ title: ev.target.value })} />
                        <Textarea rows={2} placeholder="Message" value={e.message} onChange={(ev) => set({ message: ev.target.value })} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Button text" value={e.button_label ?? ""} onChange={(ev) => set({ button_label: ev.target.value })} />
                          <Input placeholder="Button link https://" value={e.button_url ?? ""} onChange={(ev) => set({ button_url: ev.target.value })} />
                          <Input placeholder="Auto-redirect to https://" value={e.redirect_url ?? ""} onChange={(ev) => set({ redirect_url: ev.target.value })} />
                          <Input placeholder="Calendly link https://calendly.com/..." value={e.calendly_url ?? ""} onChange={(ev) => set({ calendly_url: ev.target.value })} />
                          <Input placeholder="After booking: headline" value={e.booked_title ?? ""} onChange={(ev) => set({ booked_title: ev.target.value })} />
                          <Input placeholder="After booking: message" value={e.booked_message ?? ""} onChange={(ev) => set({ booked_message: ev.target.value })} />
                          <Input placeholder="Picture link (https://...)" value={e.image ?? ""} onChange={(ev) => set({ image: ev.target.value || undefined })} />
                          <Input placeholder="Contact tag (e.g. Qualified)" aria-label={`Contact tag for ending ${i + 1}`} value={e.tag ?? ""} onChange={(ev) => set({ tag: ev.target.value || undefined })} />
                        </div>
                      </div>
                    );
                  })}
                  <Button variant="outline" onClick={() => setS("endings", [...(settings.endings ?? []), { id: newId("e"), title: "", message: "" }])}>+ Add ending</Button>
                </CardBody>
              </Card>
            </>
          )}

          {/* ------------------------------- SETTINGS ------------------------------- */}
          {tab === "settings" && (
            <>
              <Card>
                <CardHeader><CardTitle>Share</CardTitle></CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Form link name</label>
                    <div className="flex items-center gap-1 text-sm text-slate-400">/apply/<Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Public link {status !== "published" && <span className="text-amber-600">(set status to Published and save to go live)</span>}</label>
                    <div className="flex gap-2">
                      <Input readOnly value={link} />
                      <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Embed on your website</label>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Select value={embedMode} onChange={(e) => setEmbedMode(e.target.value as typeof embedMode)} className="w-56" aria-label="Embed style">
                        <option value="standard">Standard (inline)</option>
                        <option value="popup">Popup (button opens the form)</option>
                        <option value="slider">Slide-in panel</option>
                        <option value="sidetab">Side tab</option>
                        <option value="popover">Chat-style bubble</option>
                        <option value="fullpage">Full page</option>
                      </Select>
                      {embedMode !== "standard" && embedMode !== "fullpage" && (
                        <Input className="w-48" value={embedLabel} onChange={(e) => setEmbedLabel(e.target.value)} placeholder="Button text" aria-label="Button text" />
                      )}
                    </div>
                    <Textarea readOnly rows={3} value={embedCode} />
                    <Button variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(embedCode)}>Copy embed code</Button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">QR code</label>
                    {qr && (
                      <div className="flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="QR code for the form link" className="h-36 w-36 rounded border border-slate-200" />
                        <a href={qr} download={`${slug}-qr.png`} className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Download PNG</a>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>How the form looks</CardTitle></CardHeader>
                <CardBody className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Progress bar" checked={settings.show_progress_bar !== false} onChange={(v) => setS("show_progress_bar", v)} />
                  <Toggle label="Question numbers" checked={settings.show_question_numbers !== false} onChange={(v) => setS("show_question_numbers", v)} />
                  <Toggle label="Key hints (A, B, C on choices)" checked={settings.show_key_hints !== false} onChange={(v) => setS("show_key_hints", v)} />
                  <Toggle label="Navigation arrows" checked={settings.show_navigation !== false} onChange={(v) => setS("show_navigation", v)} />
                  <Toggle label={'"Submit another response" button on endings'} checked={settings.allow_another !== false} onChange={(v) => setS("allow_another", v)} />
                  <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
                    <div><label className="mb-1 block text-xs font-medium text-slate-600">Brand name at the top (click = start over)</label><Input value={settings.brand_name ?? ""} placeholder="e.g. Tawakkul Trading" onChange={(e) => setS("brand_name", e.target.value || undefined)} /></div>
                    <div><label className="mb-1 block text-xs font-medium text-slate-600">Logo link (optional, https://...)</label><Input value={settings.brand_logo ?? ""} placeholder="https://..." onChange={(e) => setS("brand_logo", e.target.value || undefined)} /></div>
                  </div>
                  <Toggle label={'"Takes X minutes" on the welcome screen'} checked={settings.show_time_to_complete !== false} onChange={(v) => setS("show_time_to_complete", v)} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Access &amp; privacy</CardTitle></CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Password protection {settings.has_password && <span className="text-emerald-600">(a password is set)</span>}
                    </label>
                    <div className="flex gap-2">
                      <Input type="password" autoComplete="new-password" placeholder={settings.has_password ? "Enter a new password to change it" : "No password"} value={settings.access_password ?? ""} onChange={(e) => setS("access_password", e.target.value)} />
                      {settings.has_password && <Button variant="outline" onClick={() => { setS("has_password", false); setS("access_password", ""); }}>Remove</Button>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Visitors must enter it before they can see or submit the form.</p>
                  </div>
                  <Toggle label="Allow search engines to index this form" hint="Off by default so your application link stays private." checked={!!settings.allow_indexing} onChange={(v) => setS("allow_indexing", v)} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Hidden fields</CardTitle></CardHeader>
                <CardBody>
                  <label className="mb-1 block text-xs font-medium text-slate-600">URL parameters to save with each response (comma-separated)</label>
                  <Input value={(settings.hidden_fields ?? ["utm_source", "utm_medium", "utm_campaign", "utm_content"]).join(", ")} onChange={(e) => setS("hidden_fields", e.target.value.split(","))} />
                  <p className="mt-1 text-xs text-slate-400">Example: share <code>?utm_source=instagram</code> and the response records where it came from. Use <code>{"{{hidden:utm_source}}"}</code> inside a question to show it.</p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Link preview (WhatsApp, Instagram, iMessage)</CardTitle></CardHeader>
                <CardBody className="space-y-3">
                  <Input placeholder="Title (defaults to the form title)" value={settings.meta_title ?? ""} onChange={(e) => setS("meta_title", e.target.value || undefined)} />
                  <Input placeholder="Description" value={settings.meta_description ?? ""} onChange={(e) => setS("meta_description", e.target.value || undefined)} />
                  <Input placeholder="Preview image link (https://...)" value={settings.meta_image ?? ""} onChange={(e) => setS("meta_image", e.target.value || undefined)} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Availability</CardTitle></CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Stop accepting responses after (optional)</label>
                    <Input type="datetime-local" value={settings.close_at ? new Date(new Date(settings.close_at).getTime() - new Date(settings.close_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(e) => setS("close_at", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Maximum completed responses (optional)</label>
                    <Input type="number" min={1} value={settings.max_responses ?? ""} placeholder="No limit" onChange={(e) => setS("max_responses", e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Message when the form is closed</label>
                    <Input value={settings.closed_message ?? ""} placeholder="This form is no longer accepting responses." onChange={(e) => setS("closed_message", e.target.value)} />
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Email me on each new application (comma-separate up to 5). Leave empty to use your Gmail from the server settings.</label>
                    <div className="flex gap-2">
                      <Input value={settings.notify_email} placeholder="you@example.com" onChange={(e) => setS("notify_email", e.target.value)} />
                      <Button variant="outline" disabled={!settings.notify_email || pending} onClick={() => start(async () => { const r = await testEmailAction(settings.notify_email); setMsg(r.ok ? { ok: true, text: `Test email sent to ${r.data.sentTo}.` } : { ok: false, text: r.error }); })}>Send test</Button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Webhook URL. Each new application is POSTed here as JSON (Zapier, Make, a Discord relay).</label>
                    <div className="flex gap-2">
                      <Input value={settings.webhook_url} placeholder="https://hooks.zapier.com/..." onChange={(e) => setS("webhook_url", e.target.value)} />
                      <Button variant="outline" disabled={!settings.webhook_url || pending} onClick={() => start(async () => { const r = await testWebhookAction(settings.webhook_url); setMsg(r.ok ? { ok: true, text: `Webhook answered ${r.data.status}.` } : { ok: false, text: r.error }); })}>Send test</Button>
                    </div>
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
            </>
          )}
        </div>

        {/* ------------------------------ LIVE PREVIEW ------------------------------ */}
        <div className="hidden xl:block">
          <div className="sticky top-20 space-y-2">
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span className="font-medium">Live preview</span>
              <span>Click a question to preview it</span>
            </div>
            <div className="h-[640px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <FormRunner
                key={previewKey}
                embedded
                preview
                slug={slug}
                title={title}
                description={description}
                fields={fields}
                settings={settings}
                endings={endings}
              />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
