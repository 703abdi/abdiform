"use client";

// Renders a block page. Used for the public page (/p/[slug]) and the live preview in the editor.

import * as React from "react";
import { useEffect, useState } from "react";
import type { Block, PageTheme } from "@/sitepages/types";
import { videoEmbed } from "@/sitepages/video";
import { YouTubeTracked } from "@/components/sitepages/YouTubeTracked";

/** Set on public pages: reports video progress for one block/video key. */
const WatchCtx = React.createContext<{ origin: string; report: (key: string, pct: number, secs: number) => void } | null>(null);

const FONTS: Record<PageTheme["font"], { css: string; google: string }> = {
  montserrat: { css: "'Montserrat', system-ui, sans-serif", google: "Montserrat:wght@400;500;600;700;800;900" },
  inter: { css: "'Inter', system-ui, sans-serif", google: "Inter:wght@400;500;600;700;800" },
  poppins: { css: "'Poppins', system-ui, sans-serif", google: "Poppins:wght@400;500;600;700;800" },
  "dm-sans": { css: "'DM Sans', system-ui, sans-serif", google: "DM+Sans:wght@400;500;700;800" },
  playfair: { css: "'Playfair Display', Georgia, serif", google: "Playfair+Display:wght@400;600;700;800" },
};

const MARK = /(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))|(\*\*[^*\n]+\*\*)|(==[^=\n]+==)|(\[\[[^\]\n]+\]\])/g;

/** Inline marks: **bold**, ==accent==, [[highlight bar]], [label](https://link). Never HTML. */
export function Marked({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const out: React.ReactNode[] = [];
        let last = 0;
        let i = 0;
        for (const m of line.matchAll(MARK)) {
          const idx = m.index ?? 0;
          if (idx > last) out.push(line.slice(last, idx));
          const k = `${li}-${i++}`;
          const t = m[0];
          if (m[1]) {
            const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
            out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="pv-link">{label}</a>);
          } else if (m[2]) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
          else if (m[3]) out.push(<span key={k} className="pv-accent">{t.slice(2, -2)}</span>);
          else out.push(<span key={k} className="pv-hl">{t.slice(2, -2)}</span>);
          last = idx + t.length;
        }
        if (last < line.length) out.push(line.slice(last));
        return (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {out}
          </React.Fragment>
        );
      })}
    </>
  );
}

const CSS = `
.pv{min-height:100%;background:var(--bg);color:var(--fg);font-family:var(--font);position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
.pv-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(1200px 600px at 0% 100%,var(--bg2),transparent 60%),radial-gradient(900px 500px at 100% 0%,color-mix(in srgb,var(--bg2) 60%,transparent),transparent 60%)}
.pv-in{position:relative;max-width:1080px;margin:0 auto;padding:56px 20px 72px}
.pv-brand{display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:36px;font-weight:800;letter-spacing:.02em;font-size:15px;color:var(--fg);text-decoration:none}
.pv-brand img{height:34px;width:auto}
.pv-b{margin:0 auto 28px}
.pv-narrow{max-width:640px}.pv-normal{max-width:820px}.pv-wide{max-width:1000px}
.pv-center{text-align:center}.pv-left{text-align:left}
.pv-hero h1{font-size:clamp(38px,7vw,84px);line-height:1.04;font-weight:800;letter-spacing:-.02em;margin:0}
.pv-hero .pv-eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--a);margin-bottom:18px}
.pv-hero p{font-size:clamp(18px,2.4vw,26px);font-weight:700;line-height:1.35;margin:26px auto 0;max-width:760px}
.pv-h{font-weight:800;line-height:1.18;margin:0;letter-spacing:-.01em}
.pv-h.sm{font-size:clamp(20px,2.6vw,26px)}.pv-h.md{font-size:clamp(24px,3.6vw,38px)}.pv-h.lg{font-size:clamp(30px,5vw,56px)}
.pv-h.accent{color:var(--a)}
.pv-h.highlight span.pv-hlwrap{background:var(--a);color:var(--at);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:2px 10px}
.pv-t{line-height:1.65;color:var(--fg)}.pv-t.sm{font-size:15px}.pv-t.md{font-size:18px}.pv-t.lg{font-size:22px;font-weight:600}
.pv-accent{color:var(--a);text-decoration:underline;text-decoration-thickness:.08em;text-underline-offset:.12em}
.pv-hl{background:var(--a);color:var(--at);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 .2em}
.pv-link{color:var(--a);text-decoration:underline;text-underline-offset:3px}
.pv-video{position:relative;aspect-ratio:16/9;border-radius:var(--r);overflow:hidden;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.pv-video iframe,.pv-video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.pv-cap{margin-top:10px;font-size:14px;color:var(--muted)}
.pv-btn{position:relative;overflow:hidden;display:inline-flex;flex-direction:column;align-items:center;gap:3px;padding:19px 38px;border-radius:var(--r);font-weight:800;font-size:20px;letter-spacing:.01em;text-decoration:none;transition:transform .2s,box-shadow .2s,filter .2s;cursor:pointer}
.pv-btn .pv-btnrow{display:inline-flex;align-items:center;gap:10px}
.pv-btn svg{transition:transform .2s}
.pv-btn:hover svg{transform:translateX(4px)}
.pv-btn.solid{background:var(--cta);color:var(--ctat);box-shadow:0 12px 34px color-mix(in srgb,var(--cta) 40%,transparent),inset 0 -3px 0 rgba(0,0,0,.18)}
.pv-btn.solid::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:pv-shine 3.6s ease-in-out infinite}
@keyframes pv-shine{0%,62%{left:-60%}100%{left:130%}}
.pv-btn.outline{border:2px solid var(--cta);color:var(--cta)}
.pv-btn:hover{transform:translateY(-2px);filter:brightness(1.05)}
.pv-btn:focus-visible{outline:3px solid var(--fg);outline-offset:3px}
.pv-btn small{font-weight:600;font-size:13px;opacity:.8}
.pv-note{margin-top:12px;font-size:13px;color:var(--muted);display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.pv-vrow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;text-align:left}
.pv-vrow h3{font-size:clamp(17px,2vw,22px);font-weight:800;margin:0 0 12px;line-height:1.25}
.pv-arrow{display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:800;font-size:clamp(18px,2.4vw,24px)}
.pv-arrow svg{color:var(--a);animation:pv-bob 1.6s ease-in-out infinite}
@keyframes pv-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
.pv-sticky{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:center;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,color-mix(in srgb,var(--bg) 92%,transparent) 30%);transform:translateY(110%);transition:transform .3s}
.pv-sticky.on{transform:none}
.pv-sticky .pv-btn{padding:14px 28px;font-size:17px}
@media (max-width:720px){.pv-vrow{grid-template-columns:1fr}}
.pv-steps{display:grid;gap:14px;text-align:left}
.pv-step{display:flex;gap:16px;align-items:flex-start;background:var(--card);border:1px solid color-mix(in srgb,var(--fg) 8%,transparent);border-radius:var(--r);padding:18px 20px}
.pv-step b.n{flex:none;width:36px;height:36px;border-radius:999px;background:var(--a);color:var(--at);display:flex;align-items:center;justify-content:center;font-weight:800}
.pv-step h3{margin:4px 0 4px;font-size:19px;font-weight:800}.pv-step p{margin:0;color:var(--muted);line-height:1.55}
.pv-img{display:block;max-width:100%;height:auto;margin:0 auto}
.pv-img.r{border-radius:var(--r)}
.pv-frame{width:100%;border:0;border-radius:var(--r);background:#fff}
.pv-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));text-align:left}
.pv-card{background:var(--card);border:1px solid color-mix(in srgb,var(--fg) 8%,transparent);border-radius:var(--r);padding:22px}
.pv-card q{display:block;font-size:17px;line-height:1.55;quotes:none}
.pv-card .who{margin-top:14px;font-weight:700}.pv-card .role{color:var(--muted);font-size:14px}
.pv-faq{text-align:left;display:grid;gap:10px}
.pv-faq details{background:var(--card);border-radius:var(--r);padding:16px 20px;border:1px solid color-mix(in srgb,var(--fg) 8%,transparent)}
.pv-faq summary{cursor:pointer;font-weight:700;font-size:17px}
.pv-faq p{margin:10px 0 0;color:var(--muted);line-height:1.6}
.pv-count{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.pv-count div{background:var(--card);border-radius:var(--r);padding:14px 18px;min-width:84px;border:1px solid color-mix(in srgb,var(--a) 30%,transparent)}
.pv-count b{display:block;font-size:34px;font-weight:800;color:var(--a);font-variant-numeric:tabular-nums}
.pv-count span{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.pv-check{list-style:none;padding:0;margin:0;display:grid;gap:12px;text-align:left}
.pv-check li{display:flex;gap:12px;align-items:flex-start;font-size:18px;line-height:1.5}
.pv-check svg{flex:none;margin-top:4px;color:var(--a)}
.pv-hr{border:0;border-top:1px solid color-mix(in srgb,var(--fg) 14%,transparent)}
.pv-sp.sm{height:16px}.pv-sp.md{height:40px}.pv-sp.lg{height:80px}
.pv-sel{outline:2px dashed var(--a);outline-offset:8px;border-radius:4px}
@media (max-width:640px){.pv-in{padding:36px 16px 56px}.pv-btn{width:100%;padding:16px 20px}}
@media (prefers-reduced-motion:reduce){.pv-btn,.pv-btn svg,.pv-sticky{transition:none}.pv-btn.solid::after,.pv-arrow svg{animation:none;display:none}}
`;

function Countdown({ until, label, expired }: { until: string; label?: string; expired?: string }) {
  const target = Date.parse(until);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  if (!Number.isFinite(target)) return null;
  if (now !== null && now >= target) return <p className="pv-t md">{expired || "This offer has ended."}</p>;
  const left = Math.max(0, target - (now ?? target));
  const parts: [string, number][] = [
    ["days", Math.floor(left / 86_400_000)],
    ["hours", Math.floor(left / 3_600_000) % 24],
    ["min", Math.floor(left / 60_000) % 60],
    ["sec", Math.floor(left / 1000) % 60],
  ];
  return (
    <div>
      {label && <p className="pv-t md" style={{ marginTop: 0, fontWeight: 700 }}>{label}</p>}
      <div className="pv-count" role="timer" aria-live="off">
        {parts.map(([k, v]) => (
          <div key={k}>
            <b suppressHydrationWarning>{now === null ? "--" : String(v).padStart(2, "0")}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="10" fill="currentColor" opacity=".18" />
    <path d="M6 10.5l2.6 2.6L14 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const safeHttps = (u: string) => (/^https:\/\/[^\s"]+$/i.test(u.trim()) ? u.trim() : null);
const safeLink = (u: string) => (/^(https?:\/\/|mailto:|#|\/)[^\s"]*$/i.test(u.trim()) ? u.trim() : null);

const ArrowRight = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path d="M4 10h11m-4.5-5L15 10l-4.5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function VideoBox({ url, title, editing, trackKey }: { url: string; title: string; editing: boolean; trackKey?: string }) {
  const watch = React.useContext(WatchCtx);
  const v = videoEmbed(url);
  if (!v && !editing) return null;
  const yt = v?.kind === "iframe" && v.src.includes("youtube-nocookie.com/embed/");
  return (
    <div className="pv-video">
      {v?.kind === "iframe" && yt && watch && trackKey && watch.origin ? (
        <YouTubeTracked
          src={`${v.src}&enablejsapi=1&origin=${encodeURIComponent(watch.origin)}`}
          title={title || "Video"}
          onProgress={(pct, secs) => watch.report(trackKey, pct, secs)}
        />
      ) : (
        v?.kind === "iframe" && <iframe src={v.src} title={title || "Video"} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen loading="lazy" />
      )}
      {v?.kind === "file" && <video src={v.src} controls playsInline preload="metadata" />}
      {!v && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 15, textAlign: "center", padding: 16 }}>
          Paste a YouTube, Vimeo, Loom or Wistia link (hidden from visitors until you do)
        </div>
      )}
    </div>
  );
}

function BlockView({ b, onClick, origin, editing }: { b: Block; onClick?: (target: string) => void; origin: string; editing: boolean }) {
  switch (b.type) {
    case "hero":
      return (
        <div className="pv-hero">
          {b.eyebrow && <span className="pv-eyebrow"><Marked text={b.eyebrow} /></span>}
          <h1><Marked text={b.title} /></h1>
          {b.subtitle && <p><Marked text={b.subtitle} /></p>}
        </div>
      );
    case "heading": {
      const style = b.style ?? "plain";
      return (
        <h2 className={`pv-h ${b.size ?? "md"} ${style}`}>
          {style === "highlight" ? <span className="pv-hlwrap"><Marked text={b.text} /></span> : <Marked text={b.text} />}
        </h2>
      );
    }
    case "text":
      return <p className={`pv-t ${b.size ?? "md"}`} style={{ margin: 0 }}><Marked text={b.text} /></p>;
    case "video":
      if (!videoEmbed(b.url) && !editing) return null;
      return (
        <figure style={{ margin: 0 }}>
          <VideoBox url={b.url} title={b.caption || "Video"} editing={editing} trackKey={b.id} />
          {b.caption && <figcaption className="pv-cap"><Marked text={b.caption} /></figcaption>}
        </figure>
      );
    case "videos": {
      const items = editing ? b.items : b.items.filter((it) => videoEmbed(it.url));
      if (!items.length) return null;
      return (
        <div className="pv-vrow" style={items.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
          {items.map((it, i) => (
            <div key={i}>
              {it.title && <h3><Marked text={it.title} /></h3>}
              <VideoBox url={it.url} title={it.title} editing={editing} trackKey={`${b.id}-${b.items.indexOf(it)}`} />
            </div>
          ))}
        </div>
      );
    }
    case "arrow":
      return (
        <div className="pv-arrow">
          {b.text && <span><Marked text={b.text} /></span>}
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 4v15m-6.5-6.5L12 19l6.5-6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    case "button": {
      const href = safeLink(b.url);
      return (
        <a
          className={`pv-btn ${b.style ?? "solid"}`}
          href={href ?? "#"}
          onClick={() => onClick?.(b.id)}
          target={href?.startsWith("http") ? "_blank" : undefined}
          rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          <span className="pv-btnrow">{b.label}<ArrowRight /></span>
          {b.sublabel && <small>{b.sublabel}</small>}
        </a>
      );
    }
    case "steps":
      return (
        <div className="pv-steps">
          {b.items.map((s, i) => (
            <div key={i} className="pv-step">
              <b className="n">{i + 1}</b>
              <div>
                <h3><Marked text={s.title} /></h3>
                {s.text && <p><Marked text={s.text} /></p>}
              </div>
            </div>
          ))}
        </div>
      );
    case "image": {
      const src = safeHttps(b.url);
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img className={`pv-img ${b.rounded !== false ? "r" : ""}`} src={src} alt={b.alt ?? ""} loading="lazy" /> : null;
    }
    case "calendly": {
      const src = safeHttps(b.url);
      if (!src || !/^https:\/\/calendly\.com\//.test(src)) return <p className="pv-cap">Add a calendly.com link</p>;
      const u = new URL(src);
      u.searchParams.set("hide_gdpr_banner", "1");
      return <iframe className="pv-frame" src={u.toString()} title="Book a call" style={{ height: 720 }} loading="lazy" />;
    }
    case "form":
      return /^[a-z0-9-]{1,80}$/.test(b.slug) ? (
        <iframe className="pv-frame" src={`${origin}/apply/${b.slug}`} title="Application form" style={{ height: b.height ?? 640 }} loading="lazy" />
      ) : null;
    case "testimonials": {
      const items = editing ? b.items : b.items.filter((t) => t.quote.trim());
      if (!items.length) return null;
      return (
        <div className="pv-cards">
          {items.map((t, i) => (
            <figure key={i} className="pv-card" style={{ margin: 0 }}>
              {t.quote.trim() ? <q><Marked text={t.quote} /></q> : <p style={{ margin: 0, color: "var(--muted)" }}>Add a real student quote here (hidden from visitors until you do)</p>}
              <figcaption>
                <div className="who">{t.name}</div>
                {t.role && <div className="role">{t.role}</div>}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    }
    case "faq":
      return (
        <div className="pv-faq">
          {b.items.map((f, i) => (
            <details key={i}>
              <summary>{f.q}</summary>
              <p><Marked text={f.a} /></p>
            </details>
          ))}
        </div>
      );
    case "countdown":
      return <Countdown until={b.until} label={b.label} expired={b.expired} />;
    case "checklist":
      return (
        <ul className="pv-check">
          {b.items.filter((t) => t.trim()).map((t, i) => (
            <li key={i}><Check /><span><Marked text={t} /></span></li>
          ))}
        </ul>
      );
    case "divider":
      return <hr className="pv-hr" />;
    case "spacer":
      return <div className={`pv-sp ${b.size ?? "md"}`} aria-hidden />;
  }
}

const defaultWidth = (b: Block) =>
  b.type === "video" || b.type === "calendly" || b.type === "form" || b.type === "testimonials" ? "wide" : b.type === "hero" ? "wide" : "normal";

export function PageView({
  blocks,
  theme,
  slug,
  track = false,
  selectedId,
  onSelect,
  origin = "",
  viewer = null,
}: {
  blocks: Block[];
  theme: PageTheme;
  slug?: string;
  track?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  origin?: string;
  viewer?: string | null; // signed contact code: ties video progress to a lead
}) {
  const font = FONTS[theme.font] ?? FONTS.inter;
  const r = theme.radius === "none" ? "0px" : theme.radius === "large" ? "18px" : "8px";
  const vars = {
    "--bg": theme.background,
    "--bg2": theme.background2 || theme.background,
    "--fg": theme.text,
    "--muted": theme.muted,
    "--a": theme.accent,
    "--at": theme.accent_text,
    "--card": theme.card,
    "--cta": theme.cta || theme.accent,
    "--ctat": theme.cta_text || theme.accent_text,
    "--font": font.css,
    "--r": r,
  } as React.CSSProperties;

  const vid = React.useRef<string | null>(null); // one id per page visit, made on first use
  const send = React.useCallback(
    (kind: "view" | "click" | "watch", target = "", extra: { pct?: number; secs?: number } = {}) => {
      if (!track || !slug) return;
      vid.current ??= "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const body = JSON.stringify({ vid: vid.current, kind, target, ...extra, c: viewer ?? undefined });
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/p/${slug}/event`, new Blob([body], { type: "application/json" }));
      else fetch(`/api/p/${slug}/event`, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    },
    [track, slug, viewer],
  );
  useEffect(() => send("view"), [send]);

  const logo = theme.logo ? safeHttps(theme.logo) : null;
  const watchCtx = React.useMemo(
    () => (track && !onSelect ? { origin, report: (key: string, pct: number, secs: number) => send("watch", key, { pct, secs }) } : null),
    [track, onSelect, origin, send],
  );
  return (
    <WatchCtx.Provider value={watchCtx}>
    <div className="pv" style={vars}>
      <style>{CSS}</style>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font.google}&display=swap`} />
      {theme.background2 && <div className="pv-glow" aria-hidden />}
      <main className="pv-in">
        {(logo || theme.logo_text) && (
          <div className="pv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt={theme.logo_text || "Logo"} />}
            {!logo && theme.logo_text && <span>{theme.logo_text}</span>}
          </div>
        )}
        {blocks.map((b) => (
          <section
            key={b.id}
            data-block={b.id}
            className={`pv-b pv-${b.width ?? defaultWidth(b)} pv-${b.align ?? "center"} ${selectedId === b.id ? "pv-sel" : ""}`}
            onClickCapture={
              onSelect
                ? (e) => {
                    e.preventDefault();
                    onSelect(b.id);
                  }
                : undefined
            }
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <BlockView b={b} onClick={(t) => send("click", t)} origin={origin} editing={!!onSelect} />
          </section>
        ))}
      </main>
      {!onSelect && theme.sticky_label && safeLink(theme.sticky_url ?? "") && (
        <StickyCta label={theme.sticky_label} href={safeLink(theme.sticky_url ?? "")!} onClick={() => send("click", "sticky")} />
      )}
    </div>
    </WatchCtx.Provider>
  );
}

/** Apply button that slides in after the visitor scrolls past the top of the page. */
function StickyCta({ label, href, onClick }: { label: string; href: string; onClick: () => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(window.scrollY > 700 && window.innerHeight + window.scrollY < document.body.scrollHeight - 300);
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return (
    <div className={`pv-sticky${on ? " on" : ""}`} aria-hidden={!on}>
      <a className="pv-btn solid" href={href} onClick={onClick} tabIndex={on ? 0 : -1}>
        <span className="pv-btnrow">{label}<ArrowRight /></span>
      </a>
    </div>
  );
}
