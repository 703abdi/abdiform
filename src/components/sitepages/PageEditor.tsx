"use client";

// Page builder: block list (left), live preview (centre, click a block to edit it),
// settings for the selected block or the whole page (right).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Block, BlockType, PageSeo, PageStatus, PageTheme, SitePage } from "@/sitepages/types";
import { BLOCK_LABELS, THEMES, newBlock } from "@/sitepages/types";
import { savePageAction } from "@/sitepages/actions";
import { PageView } from "@/components/sitepages/PageView";
import { Menu } from "@/components/admin/Menu";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";

type FormRef = { slug: string; title: string };

function blockSummary(b: Block): string {
  const strip = (s: string) => s.replace(/\*\*|==|\[\[|\]\]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  switch (b.type) {
    case "hero":
      return strip(b.title);
    case "heading":
    case "text":
      return strip(b.text);
    case "button":
      return b.label;
    case "video":
      return b.url;
    case "form":
      return `/apply/${b.slug}`;
    case "steps":
    case "testimonials":
    case "faq":
    case "checklist":
      return `${b.items.length} items`;
    case "countdown":
      return b.until.replace("T", " ");
    case "calendly":
    case "image":
      return b.url;
    default:
      return "";
  }
}

/** ISO time -> value for <input type="datetime-local"> in the editor's own time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const label = (t: string, htmlFor?: string) => (
  <label className={tf.label} htmlFor={htmlFor}>{t}</label>
);

export function PageEditor({ page, forms, clicks }: { page: SitePage; forms: FormRef[]; clicks: Record<string, number> }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [status, setStatus] = useState<PageStatus>(page.status);
  const [blocks, setBlocks] = useState<Block[]>(page.blocks);
  const [theme, setTheme] = useState<PageTheme>(page.theme);
  const [seo, setSeo] = useState<PageSeo>(page.seo ?? {});
  const [sel, setSel] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [panel, setPanel] = useState<"block" | "page">("block");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [jsonText, setJsonText] = useState<string | null>(null);
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");

  const snapshot = useMemo(() => JSON.stringify({ title, slug, status, blocks, theme, seo }), [title, slug, status, blocks, theme, seo]);
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;
  const block = blocks.find((b) => b.id === sel) ?? null;

  const save = useCallback(
    (nextStatus = status) =>
      start(async () => {
        const r = await savePageAction(page.id, { title, slug, status: nextStatus, blocks, theme, seo });
        if (r.ok) {
          setStatus(nextStatus);
          setSlug(r.data.slug);
          setBaseline(JSON.stringify({ title, slug: r.data.slug, status: nextStatus, blocks, theme, seo }));
          setMsg({ ok: true, text: nextStatus === "published" && status !== "published" ? "Published" : "Saved" });
          router.refresh();
        } else setMsg({ ok: false, text: r.error });
      }),
    [page.id, title, slug, status, blocks, theme, seo, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, dirty]);

  const update = (id: string, patch: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const n = [...bs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const add = (type: BlockType, at = blocks.length) => {
    const b = newBlock(type);
    setBlocks((bs) => [...bs.slice(0, at), b, ...bs.slice(at)]);
    setSel(b.id);
    setPanel("block");
  };
  const addItems = (Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => ({ label: BLOCK_LABELS[t], onSelect: () => add(t, sel ? blocks.findIndex((b) => b.id === sel) + 1 : blocks.length) }));
  const setT = <K extends keyof PageTheme>(k: K, v: PageTheme[K]) => setTheme((t) => ({ ...t, [k]: v }));
  const claudePrompt = `In ~/tawakkul-forms, edit the page "${title}" (id ${page.id}, ${origin}/p/${slug}): `;

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] bg-white px-4 py-2.5">
        <Link href="/pages" className="text-[14px] text-[#5e5e5e] hover:text-[#262627]">Pages</Link>
        <span aria-hidden className="text-[#767676]">›</span>
        <input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-[16px] font-semibold hover:border-[#e3e3e3] focus:border-[#262627] focus:outline-none" />
        {dirty && !pending && <span className="text-[12px] text-[#b45309]">Unsaved changes (Ctrl/Cmd+S)</span>}
        {msg && !dirty && <span role="status" className={cn("text-[13px]", msg.ok ? "text-[#1f7a43]" : "text-[#c2331d]")}>{msg.text}</span>}
        {msg && !msg.ok && dirty && <span role="status" className="text-[13px] text-[#c2331d]">{msg.text}</span>}
        <div className="flex rounded-md border border-[#d4d4d4] p-0.5" role="group" aria-label="Preview size">
          {(["desktop", "mobile"] as const).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={cn("rounded px-2.5 py-1 text-[13px] capitalize", device === d ? "bg-[#ececec] font-medium" : "text-[#5e5e5e]")}>{d}</button>
          ))}
        </div>
        <a href={`/p/${slug}${status === "published" ? "" : "?preview=1"}`} target="_blank" rel="noreferrer" className={tf.btnOutline}>Open</a>
        <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => save()}>Save</button>
        {status === "published" ? (
          <button type="button" className={tf.btnOutline} disabled={pending} onClick={() => save("draft")} title="Take the page offline">
            <span className="h-2 w-2 rounded-full bg-[#1f9d55]" aria-hidden /> Live
          </button>
        ) : (
          <button type="button" className={tf.btn} disabled={pending} onClick={() => save("published")}>Publish</button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* blocks */}
        <aside className="min-h-0 overflow-y-auto border-r border-[#e3e3e3] bg-[#fafafa] p-3" aria-label="Blocks">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wide text-[#6b6b6b]">Blocks</span>
            <Menu align="left" label="Add block" items={addItems} trigger={<span className={cn(tf.btn, "px-2.5 py-1 text-[13px]")}>+ Add</span>} />
          </div>
          <ol className="space-y-1">
            {blocks.map((b, i) => (
              <li key={b.id}>
                <div className={cn("group flex items-center gap-1 rounded-md border px-2 py-1.5", sel === b.id ? "border-[#262627] bg-white" : "border-transparent hover:bg-white")}>
                  <button type="button" onClick={() => { setSel(b.id); setPanel("block"); }} className="min-w-0 flex-1 text-left">
                    <span className="block text-[12px] text-[#6b6b6b]">{i + 1}. {BLOCK_LABELS[b.type].split(" (")[0]}{clicks[b.id] ? ` · ${clicks[b.id]} clicks` : ""}</span>
                    <span className="block truncate text-[13px]">{blockSummary(b) || " "}</span>
                  </button>
                  <span className="flex opacity-60 group-hover:opacity-100">
                    <button type="button" aria-label={`Move block ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="h-6 w-6 rounded text-[12px] hover:bg-[#ececec] disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move block ${i + 1} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} className="h-6 w-6 rounded text-[12px] hover:bg-[#ececec] disabled:opacity-30">↓</button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {blocks.length === 0 && <p className="px-2 py-4 text-[13px] text-[#6b6b6b]">No blocks yet. Use + Add.</p>}
          <div className="mt-6 rounded-lg border border-[#e3e3e3] bg-white p-3">
            <p className="text-[13px] font-semibold">Build it with Claude</p>
            <p className="mt-1 text-[12px] text-[#5e5e5e]">Copy this, paste it into your Claude Code chat, and describe the change.</p>
            <button type="button" className={cn(tf.btnOutline, "mt-2 w-full py-1.5 text-[13px]")} onClick={() => navigator.clipboard.writeText(claudePrompt)}>Copy prompt</button>
          </div>
        </aside>

        {/* preview */}
        <div className="min-h-0 overflow-y-auto bg-[#e9e9e9] p-4">
          <div className={cn("mx-auto overflow-hidden rounded-lg shadow-lg transition-all", device === "mobile" ? "max-w-[390px]" : "max-w-[1200px]")}>
            <PageView blocks={blocks} theme={theme} selectedId={sel} onSelect={(id) => { setSel(id); setPanel("block"); }} origin={origin} />
          </div>
        </div>

        {/* settings */}
        <aside className="min-h-0 overflow-y-auto border-l border-[#e3e3e3] bg-white" aria-label="Settings">
          <div className="sticky top-0 z-10 flex border-b border-[#e3e3e3] bg-white">
            {(["block", "page"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={panel === p} onClick={() => setPanel(p)} className={cn("flex-1 border-b-2 py-2.5 text-[14px] capitalize", panel === p ? "border-[#262627] font-medium" : "border-transparent text-[#5e5e5e]")}>
                {p === "block" ? "Block" : "Page & design"}
              </button>
            ))}
          </div>
          <div className="space-y-4 p-4">
            {panel === "block" && !block && <p className="text-[14px] text-[#5e5e5e]">Click a block in the preview or the list to edit it.</p>}
            {panel === "block" && block && (
              <BlockFields
                key={block.id}
                b={block}
                forms={forms}
                set={(p) => update(block.id, p)}
                onDuplicate={() => {
                  const i = blocks.findIndex((x) => x.id === block.id);
                  const copy = { ...structuredClone(block), id: Math.random().toString(36).slice(2, 10) };
                  setBlocks((bs) => [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)]);
                  setSel(copy.id);
                }}
                onDelete={() => {
                  const i = blocks.findIndex((x) => x.id === block.id);
                  setBlocks((bs) => bs.filter((x) => x.id !== block.id));
                  setSel(blocks[i + 1]?.id ?? blocks[i - 1]?.id ?? null);
                }}
              />
            )}
            {panel === "page" && (
              <>
                <div>
                  {label("Link", "pg-slug")}
                  <div className="flex items-center gap-1 text-[13px] text-[#6b6b6b]">/p/<input id="pg-slug" className={tf.input} value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
                </div>
                <div>
                  {label("Theme")}
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(THEMES).map(([k, t]) => (
                      <button key={k} type="button" onClick={() => setTheme({ ...t.theme, logo: theme.logo, logo_text: theme.logo_text })} className="rounded-md border border-[#e3e3e3] p-2 text-left text-[12px] hover:border-[#262627]">
                        <span className="mb-1 flex gap-1">
                          <span className="h-4 w-4 rounded" style={{ background: t.theme.background, border: "1px solid #ddd" }} />
                          <span className="h-4 w-4 rounded" style={{ background: t.theme.accent }} />
                        </span>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([["background", "Background"], ["background2", "Glow"], ["text", "Text"], ["muted", "Muted text"], ["accent", "Accent"], ["accent_text", "Text on accent"], ["card", "Cards"]] as [keyof PageTheme, string][]).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-[13px]">
                      <input type="color" value={String(theme[k] ?? "#000000")} onChange={(e) => setT(k, e.target.value as never)} className="h-7 w-9 cursor-pointer rounded border border-[#d4d4d4]" />
                      {l}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label("Font", "pg-font")}
                    <select id="pg-font" className={cn(tf.select, "w-full")} value={theme.font} onChange={(e) => setT("font", e.target.value as PageTheme["font"])}>
                      <option value="montserrat">Montserrat</option><option value="inter">Inter</option><option value="poppins">Poppins</option><option value="dm-sans">DM Sans</option><option value="playfair">Playfair (serif)</option>
                    </select>
                  </div>
                  <div>
                    {label("Corners", "pg-radius")}
                    <select id="pg-radius" className={cn(tf.select, "w-full")} value={theme.radius} onChange={(e) => setT("radius", e.target.value as PageTheme["radius"])}>
                      <option value="none">Square</option><option value="small">Small</option><option value="large">Round</option>
                    </select>
                  </div>
                </div>
                <div>{label("Logo text", "pg-logo-text")}<input id="pg-logo-text" className={tf.input} value={theme.logo_text ?? ""} onChange={(e) => setT("logo_text", e.target.value || undefined)} /></div>
                <div>{label("Logo image link (https://)", "pg-logo")}<input id="pg-logo" className={tf.input} value={theme.logo ?? ""} placeholder="https://..." onChange={(e) => setT("logo", e.target.value || undefined)} /></div>
                <hr className="border-[#ececec]" />
                <p className="text-[13px] font-semibold">Search and sharing</p>
                <div>{label("Title", "seo-title")}<input id="seo-title" className={tf.input} value={seo.title ?? ""} placeholder={title} onChange={(e) => setSeo({ ...seo, title: e.target.value || undefined })} /></div>
                <div>{label("Description", "seo-desc")}<textarea id="seo-desc" rows={2} className={tf.input} value={seo.description ?? ""} onChange={(e) => setSeo({ ...seo, description: e.target.value || undefined })} /></div>
                <div>{label("Share image (https://)", "seo-img")}<input id="seo-img" className={tf.input} value={seo.image ?? ""} onChange={(e) => setSeo({ ...seo, image: e.target.value || undefined })} /></div>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked || undefined })} /> Hide from Google</label>
                <hr className="border-[#ececec]" />
                <p className="text-[13px] font-semibold">Advanced</p>
                <div className="flex gap-2">
                  <button type="button" className={cn(tf.btnOutline, "flex-1 py-1.5 text-[13px]")} onClick={() => navigator.clipboard.writeText(JSON.stringify({ blocks, theme }, null, 2))}>Copy page JSON</button>
                  <button type="button" className={cn(tf.btnOutline, "flex-1 py-1.5 text-[13px]")} onClick={() => setJsonText("")}>Paste JSON</button>
                </div>
                {jsonText !== null && (
                  <div>
                    <textarea aria-label="Page JSON" rows={8} className={cn(tf.input, "font-mono text-[11px]")} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='{"blocks": [...], "theme": {...}}' />
                    <button
                      type="button"
                      className={cn(tf.btn, "mt-2 w-full py-1.5 text-[13px]")}
                      onClick={() => {
                        try {
                          const v = JSON.parse(jsonText) as { blocks?: Block[]; theme?: PageTheme };
                          if (Array.isArray(v.blocks)) setBlocks(v.blocks.filter((b) => b && typeof b === "object" && b.type in BLOCK_LABELS));
                          if (v.theme && typeof v.theme === "object") setTheme({ ...theme, ...v.theme });
                          setJsonText(null);
                          setMsg({ ok: true, text: "JSON applied. Save to keep it." });
                        } catch {
                          setMsg({ ok: false, text: "That isn't valid JSON." });
                        }
                      }}
                    >
                      Apply JSON
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ItemsEditor<T extends Record<string, string>>({
  items,
  fields,
  onChange,
  make,
  noun,
}: {
  items: T[];
  fields: { key: keyof T & string; label: string; multiline?: boolean }[];
  onChange: (items: T[]) => void;
  make: () => T;
  noun: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-[#ececec] p-2.5">
          <div className="flex items-center justify-between text-[12px] text-[#6b6b6b]">
            {noun} {i + 1}
            <span className="flex gap-1">
              <button type="button" aria-label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }} className="px-1 disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="px-1 hover:text-[#c2331d]">✕</button>
            </span>
          </div>
          {fields.map((f) =>
            f.multiline ? (
              <textarea key={f.key} aria-label={`${noun} ${i + 1} ${f.label}`} rows={2} className={tf.input} placeholder={f.label} value={it[f.key] ?? ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ) : (
              <input key={f.key} aria-label={`${noun} ${i + 1} ${f.label}`} className={tf.input} placeholder={f.label} value={it[f.key] ?? ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ),
          )}
        </div>
      ))}
      <button type="button" className={cn(tf.btnOutline, "w-full py-1.5 text-[13px]")} onClick={() => onChange([...items, make()])}>+ Add {noun.toLowerCase()}</button>
    </div>
  );
}

function BlockFields({ b, set, forms, onDuplicate, onDelete }: { b: Block; set: (p: Partial<Block>) => void; forms: FormRef[]; onDuplicate: () => void; onDelete: () => void }) {
  const text = (k: string, l: string, multiline = false, placeholder = "") => {
    const v = String((b as unknown as Record<string, unknown>)[k] ?? "");
    const idf = `blk-${b.id}-${k}`;
    return (
      <div>
        {label(l, idf)}
        {multiline ? (
          <textarea id={idf} rows={4} className={tf.input} value={v} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value } as Partial<Block>)} />
        ) : (
          <input id={idf} className={tf.input} value={v} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value } as Partial<Block>)} />
        )}
      </div>
    );
  };
  const select = (k: string, l: string, opts: [string, string][], def: string) => {
    const idf = `blk-${b.id}-${k}`;
    return (
      <div>
        {label(l, idf)}
        <select id={idf} className={cn(tf.select, "w-full")} value={String((b as unknown as Record<string, unknown>)[k] ?? def)} onChange={(e) => set({ [k]: e.target.value } as Partial<Block>)}>
          {opts.map(([v, t]) => (<option key={v} value={v}>{t}</option>))}
        </select>
      </div>
    );
  };
  const marks = <p className="text-[12px] text-[#6b6b6b]">**bold** · ==accent== · [[highlight bar]] · [link](https://...)</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">{BLOCK_LABELS[b.type]}</p>
        <span className="flex gap-1">
          <button type="button" className={cn(tf.btnGhost, "px-2 py-1 text-[13px]")} onClick={onDuplicate}>Duplicate</button>
          <button type="button" className={cn(tf.btnGhost, "px-2 py-1 text-[13px] text-[#c2331d]")} onClick={onDelete}>Delete</button>
        </span>
      </div>

      {b.type === "hero" && (<>{text("eyebrow", "Small text above (optional)")}{text("title", "Headline", true)}{text("subtitle", "Sub-headline", true)}{marks}</>)}
      {b.type === "heading" && (<>{text("text", "Heading", true)}{select("style", "Style", [["plain", "Plain"], ["highlight", "Accent bar behind"], ["accent", "Accent colour"]], "plain")}{select("size", "Size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]], "md")}{marks}</>)}
      {b.type === "text" && (<>{text("text", "Text", true)}{select("size", "Size", [["sm", "Small"], ["md", "Normal"], ["lg", "Large"]], "md")}{marks}</>)}
      {b.type === "video" && (<>{text("url", "Video link", false, "https://www.youtube.com/watch?v=...")}<p className="text-[12px] text-[#6b6b6b]">YouTube (unlisted works), Vimeo, Loom, Wistia or a direct .mp4 link.</p>{text("caption", "Caption (optional)")}</>)}
      {b.type === "button" && (<>{text("label", "Button text")}{text("sublabel", "Small text under it (optional)")}{text("url", "Link", false, "https://... or /apply/your-form")}{select("style", "Style", [["solid", "Solid"], ["outline", "Outline"]], "solid")}</>)}
      {b.type === "image" && (<>{text("url", "Image link (https://)")}{text("alt", "Description (for screen readers)")}</>)}
      {b.type === "calendly" && text("url", "Calendly link", false, "https://calendly.com/...")}
      {b.type === "form" && (
        <>
          <div>
            {label("Form", `blk-${b.id}-slug`)}
            <select id={`blk-${b.id}-slug`} className={cn(tf.select, "w-full")} value={b.slug} onChange={(e) => set({ slug: e.target.value } as Partial<Block>)}>
              {forms.map((f) => (<option key={f.slug} value={f.slug}>{f.title}</option>))}
            </select>
          </div>
          <div>
            {label("Height (px)", `blk-${b.id}-h`)}
            <input id={`blk-${b.id}-h`} type="number" min={300} max={2000} className={tf.input} value={b.height ?? 640} onChange={(e) => set({ height: Number(e.target.value) } as Partial<Block>)} />
          </div>
        </>
      )}
      {b.type === "countdown" && (
        <>
          <div>
            {label("Ends at (your time)", `blk-${b.id}-until`)}
            <input id={`blk-${b.id}-until`} type="datetime-local" className={tf.input} value={toLocalInput(b.until)} onChange={(e) => e.target.value && set({ until: new Date(e.target.value).toISOString() } as Partial<Block>)} />
            <p className="mt-1 text-[12px] text-[#6b6b6b]">Everyone sees the same end moment, whatever their time zone.</p>
          </div>
          {text("label", "Text above")}
          {text("expired", "Text when it ends")}
        </>
      )}
      {b.type === "steps" && <ItemsEditor items={b.items as { title: string; text: string }[]} noun="Step" fields={[{ key: "title", label: "Title" }, { key: "text", label: "Text", multiline: true }]} make={() => ({ title: "New step", text: "" })} onChange={(items) => set({ items } as Partial<Block>)} />}
      {b.type === "testimonials" && <ItemsEditor items={b.items as { quote: string; name: string; role: string }[]} noun="Testimonial" fields={[{ key: "quote", label: "Quote", multiline: true }, { key: "name", label: "Name" }, { key: "role", label: "Role or result" }]} make={() => ({ quote: "", name: "", role: "" })} onChange={(items) => set({ items } as Partial<Block>)} />}
      {b.type === "faq" && <ItemsEditor items={b.items} noun="Question" fields={[{ key: "q", label: "Question" }, { key: "a", label: "Answer", multiline: true }]} make={() => ({ q: "", a: "" })} onChange={(items) => set({ items } as Partial<Block>)} />}
      {b.type === "checklist" && (
        <div>
          {label("Items (one per line)", `blk-${b.id}-items`)}
          <textarea id={`blk-${b.id}-items`} rows={6} className={tf.input} value={b.items.join("\n")} onChange={(e) => set({ items: e.target.value.split("\n") } as Partial<Block>)} />
        </div>
      )}
      {b.type === "spacer" && select("size", "Size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]], "md")}

      {b.type !== "divider" && b.type !== "spacer" && (
        <div className="grid grid-cols-2 gap-2 border-t border-[#ececec] pt-3">
          {select("align", "Align", [["center", "Centre"], ["left", "Left"]], "center")}
          {select("width", "Width", [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]], b.type === "video" || b.type === "hero" ? "wide" : "normal")}
        </div>
      )}
    </div>
  );
}
