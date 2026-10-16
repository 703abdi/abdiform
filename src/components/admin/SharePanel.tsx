"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";
import type { FormStatus } from "@/forms/types";

type Mode = "link" | "standard" | "fullpage" | "popup" | "slider" | "popover" | "sidetab";
const MODES: [Mode, string, string][] = [
  ["link", "Share the link", "Send it in DMs, emails, bios and ads"],
  ["standard", "Standard embed", "The form sits inside your page"],
  ["fullpage", "Full page", "The form fills the whole page"],
  ["popup", "Popup", "Opens in a window from a button"],
  ["slider", "Slider", "Slides in from the side"],
  ["popover", "Popover", "Floating button in the corner"],
  ["sidetab", "Side tab", "Tab fixed to the side of the page"],
];

export function SharePanel({ slug, status, title }: { id: string; slug: string; status: FormStatus; title: string }) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [mode, setMode] = useState<Mode>("link");
  const [label, setLabel] = useState("Apply now");
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const link = `${origin}/apply/${slug}`;

  useEffect(() => {
    if (origin) QRCode.toDataURL(`${origin}/apply/${slug}`, { width: 360, margin: 2 }).then(setQr).catch(() => setQr(""));
  }, [origin, slug]);

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };
  const code =
    mode === "standard"
      ? `<iframe src="${link}" title="${title.replace(/"/g, "")}" style="width:100%;height:640px;border:0"></iframe>`
      : `<script src="${origin}/embed.js" data-form="${slug}" data-mode="${mode}" data-label="${label.replace(/"/g, "")}" async></script>`;

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[280px_1fr]">
      <aside>
        <h1 className="mb-3 text-[22px] font-semibold">Share</h1>
        <ul className="space-y-1" role="radiogroup" aria-label="How to share">
          {MODES.map(([k, name, hint]) => (
            <li key={k}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === k}
                onClick={() => setMode(k)}
                className={cn("w-full rounded-md px-3 py-2 text-left", mode === k ? "bg-[#ececec]" : "hover:bg-[#f5f5f5]")}
              >
                <span className="block text-[14px] font-medium">{name}</span>
                <span className="block text-[12px] text-[#5e5e5e]">{hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="space-y-6">
        {status !== "published" && (
          <p className="rounded-md bg-[#fff6e0] px-4 py-3 text-[14px] text-[#7a5300]">
            This form is not live yet. Press <b>Publish</b> at the top right so people can open the link.
          </p>
        )}
        <div>
          <label className={tf.label} htmlFor="share-link">Your form link</label>
          <div className="flex flex-wrap gap-2">
            <input id="share-link" readOnly className={cn(tf.input, "min-w-0 flex-1")} value={link} />
            <button type="button" className={tf.btn} onClick={() => copy(link, "link")}>{copied === "link" ? "Copied" : "Copy link"}</button>
            <a href={`/apply/${slug}`} target="_blank" rel="noreferrer" className={tf.btnOutline}>Open</a>
          </div>
        </div>

        {mode === "link" ? (
          <div className="flex flex-wrap items-start gap-6">
            {qr && (
              <div>
                <p className={tf.label}>QR code</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR code for the form link" className="h-40 w-40 rounded-md border border-[#e3e3e3]" />
                <a href={qr} download={`${slug}-qr.png`} className="mt-2 inline-block text-[13px] underline">Download QR</a>
              </div>
            )}
            <div className="min-w-[220px] flex-1">
              <p className={tf.label}>Share on</p>
              <div className="flex flex-wrap gap-2">
                <a className={tf.btnOutline} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${link}`)}`}>WhatsApp</a>
                <a className={tf.btnOutline} target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(link)}`}>X</a>
                <a className={tf.btnOutline} target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}>LinkedIn</a>
                <a className={tf.btnOutline} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(link)}`}>Email</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mode !== "standard" && mode !== "fullpage" && (
              <div>
                <label className={tf.label} htmlFor="embed-label">Button text</label>
                <input id="embed-label" className={cn(tf.input, "max-w-xs")} value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
            )}
            <div>
              <label className={tf.label} htmlFor="embed-code">Paste this code into your website</label>
              <textarea id="embed-code" readOnly rows={4} className={cn(tf.input, "font-mono text-[12px]")} value={code} />
              <button type="button" className={cn(tf.btn, "mt-2")} onClick={() => copy(code, "code")}>{copied === "code" ? "Copied" : "Copy code"}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
