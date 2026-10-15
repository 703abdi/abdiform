"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FormRunner from "@/components/forms/FormRunner";
import { LogicEditor } from "@/components/forms/LogicEditor";
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { deleteFormAction, saveFormAction } from "@/forms/actions";
import { allEndings, answerFields, FONTS, DESIGN_PRESETS, newId, resolveDesign } from "@/forms/lib";
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

type Tab = "questions" | "design" | "endings" | "settings";

/** Question types offered in the "add question" picker, grouped like Typeform. */
const PICKER: { group: string; items: { type: FieldType | "contact"; label: string; hint: string }[] }[] = [
  {
    group: "Contact info",
    items: [
      { type: "contact", label: "Contact info", hint: "First name, last name, phone and email on one screen" },
      { type: "email", label: "Email", hint: "Validated email address" },
      { type: "phone", label: "Phone number", hint: "Validated phone number" },
      { type: "url", label: "Website", hint: "A web address" },
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

const GROUP_CHILD_TYPES: FieldType[] = ["short_text", "long_text", "email", "phone", "number", "url", "date"];

function makeField(type: FieldType | "contact"): Field {
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
  const [tab, setTab] = useState<Tab>("questions");
  const [openId, setOpenId] = useState<string | null>(form.fields[0]?.id ?? null);
  const [logicOpen, setLogicOpen] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

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
  function addField(type: FieldType | "contact") {
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
        setSlug(r.data.slug);
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/apply/${slug}`;
  const previewKey = `${openId ?? ""}|${fields.map((f) => f.id).join(",")}|${settings.welcome_enabled}|${(settings.endings ?? []).length}`;

  const TABS: [Tab, string][] = [
    ["questions", "Questions"],
    ["design", "Design"],
    ["endings", "Endings"],
    ["settings", "Settings & share"],
  ];

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <Select value={status} onChange={(e) => setStatus(e.target.value as FormStatus)} className="w-36" aria-label="Status">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </Select>
        <Button onClick={save} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <div className="min-w-0 space-y-4">
          {/* ------------------------------ QUESTIONS ------------------------------ */}
          {tab === "questions" && (
            <>
              <Card>
                <CardBody className="grid gap-3 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Form title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-slate-600">Description (welcome screen)</label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                </CardBody>
              </Card>

              {fields.map((f, i) => {
                const open = openId === f.id;
                return (
                  <Card
                    key={f.id}
                    className={cn(open && "ring-2 ring-brand/40", dragId === f.id && "opacity-50")}
                    draggable
                    onDragStart={() => setDragId(f.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(f.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="flex cursor-pointer items-center gap-2 px-3 py-2.5" onClick={() => setOpenId(open ? null : f.id)}>
                      <span className="cursor-grab select-none px-1 text-slate-300" title="Drag to reorder" aria-hidden>⋮⋮</span>
                      <span className="flex h-6 min-w-6 items-center justify-center rounded bg-brand-soft px-1 text-xs font-semibold text-brand">{i + 1}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{FIELD_TYPE_LABELS[f.type]}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{f.title || <span className="text-slate-400">Untitled question</span>}</span>
                      {(f.rules?.length ?? 0) > 0 && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">logic</span>}
                      <div className="flex" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>&uarr;</Button>
                        <Button variant="ghost" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>&darr;</Button>
                        <Button variant="ghost" aria-label="Duplicate question" onClick={() => setFields((fs) => { const c = [...fs]; c.splice(i + 1, 0, cloneField(f)); return c; })}>Copy</Button>
                        <Button variant="ghost" aria-label="Delete question" onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}>Delete</Button>
                      </div>
                    </div>

                    {open && (
                      <CardBody className="space-y-3 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-3">
                          <Select value={f.type} onChange={(e) => changeType(f, e.target.value as FieldType)} className="w-56">
                            {Object.entries(FIELD_TYPE_LABELS).map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                          </Select>
                          {f.type !== "statement" && f.type !== "group" && (
                            <label className="flex items-center gap-1.5 text-sm text-slate-600">
                              <input type="checkbox" checked={f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> Required
                            </label>
                          )}
                        </div>
                        <Input placeholder="Your question" value={f.title} onChange={(e) => update(f.id, { title: e.target.value })} />
                        <Input placeholder="Description (optional)" value={f.description ?? ""} onChange={(e) => update(f.id, { description: e.target.value })} />
                        {i > 0 && (
                          <Select value="" className="w-72" aria-label="Insert an earlier answer into the question" onChange={(e) => e.target.value && update(f.id, { title: `${f.title} {{field:${e.target.value}}}`.trim() })}>
                            <option value="">Insert an earlier answer...</option>
                            {answerFields(fields.slice(0, i)).map((x) => (
                              <option key={x.id} value={x.id}>{(x.title || "Untitled").slice(0, 50)}</option>
                            ))}
                          </Select>
                        )}

                        {f.type === "group" && (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-medium text-slate-500">Inputs on this screen</p>
                            {(f.fields ?? []).map((c) => (
                              <div key={c.id} className="flex flex-wrap items-center gap-2">
                                <Select value={c.type} className="w-36" onChange={(e) => updateChild(f, c.id, { type: e.target.value as FieldType })}>
                                  {GROUP_CHILD_TYPES.map((t) => (<option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>))}
                                </Select>
                                <Input className="min-w-0 flex-1" value={c.title} placeholder="Label" onChange={(e) => updateChild(f, c.id, { title: e.target.value })} />
                                <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={c.required} onChange={(e) => updateChild(f, c.id, { required: e.target.checked })} /> Required</label>
                                <Button variant="ghost" onClick={() => update(f.id, { fields: (f.fields ?? []).filter((x) => x.id !== c.id) })}>Remove</Button>
                              </div>
                            ))}
                            <Button variant="outline" onClick={() => update(f.id, { fields: [...(f.fields ?? []), { id: newId(), type: "short_text", title: "", required: false }] })}>+ Add input</Button>
                          </div>
                        )}

                        {hasChoices(f.type) && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">{f.type === "ranking" ? "Items to rank" : "Choices"} (one per line)</label>
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
                            {f.type !== "ranking" && f.type !== "dropdown" && (
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
                      </CardBody>
                    )}
                  </Card>
                );
              })}

              <div className="relative">
                <Button onClick={() => setPicker((p) => !p)}>+ Add question</Button>
                {picker && (
                  <div className="absolute left-0 z-30 mt-2 max-h-[70vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
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
                )}
              </div>
            </>
          )}

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
                  <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">Auto-redirect after submit (optional)</label><Input value={settings.redirect_url} placeholder="https://" onChange={(e) => setS("redirect_url", e.target.value)} /></div>
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
                    <label className="mb-1 block text-xs font-medium text-slate-600">Embed</label>
                    <Textarea readOnly rows={2} value={`<iframe src="${link}" style="width:100%;height:640px;border:0" title="${title.replace(/"/g, "")}"></iframe>`} />
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
                  <Toggle label={'"Takes X minutes" on the welcome screen'} checked={settings.show_time_to_complete !== false} onChange={(v) => setS("show_time_to_complete", v)} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Email me on each new application (comma-separate up to 5). Needs BREVO_API_KEY and NOTIFY_FROM_EMAIL on the server.</label>
                    <Input value={settings.notify_email} placeholder="you@example.com" onChange={(e) => setS("notify_email", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Webhook URL. Each new application is POSTed here as JSON (Zapier, Make, a Discord relay).</label>
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
                initialId={tab === "questions" ? openId ?? undefined : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
