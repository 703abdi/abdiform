// Turns a blast body into email HTML + plain text, personalised for one contact.

import type { Contact } from "@/contacts/types";
import { renderTemplate } from "@/automations/template";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)[^\s"<>]+$/i.test(u) ? u : null);

export interface EmailBrand {
  name: string;
  accent: string;
  accentText: string;
}

export const DEFAULT_BRAND: EmailBrand = { name: "Tawakkul Trading", accent: "#1ed6b4", accentText: "#04120f" };

function inlineHtml(line: string, brand: EmailBrand): string {
  // escape first, then re-introduce the small set of marks
  let s = esc(line);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    const u = safeUrl(href.replace(/&amp;/g, "&"));
    return u ? `<a href="${esc(u)}" style="color:${brand.accent};text-decoration:underline">${label}</a>` : m;
  });
  return s;
}

/** Body → HTML blocks. A line "[[Label|https://url]]" becomes a button; blank lines split paragraphs. */
export function bodyToHtml(body: string, brand: EmailBrand = DEFAULT_BRAND): string {
  const paras = body.replace(/\r/g, "").split(/\n{2,}/);
  return paras
    .map((p) => {
      const btn = /^\s*\[\[([^|\]]+)\|([^\]]+)\]\]\s*$/.exec(p);
      if (btn) {
        const u = safeUrl(btn[2].trim());
        if (u)
          return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:10px;background:${brand.accent}"><a href="${esc(u)}" style="display:inline-block;padding:14px 26px;font-weight:700;font-size:16px;color:${brand.accentText};text-decoration:none">${esc(btn[1].trim())}</a></td></tr></table>`;
      }
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${p.split("\n").map((l) => inlineHtml(l, brand)).join("<br>")}</p>`;
    })
    .join("");
}

export function bodyToText(body: string): string {
  return body
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$1: $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

export function renderBlastEmail(
  b: { subject: string; preheader: string; body: string },
  c: Contact,
  unsubscribeUrl: string | null,
  brand: EmailBrand = DEFAULT_BRAND,
): { subject: string; html: string; text: string } {
  // merge tags are filled first, then the whole thing is escaped by the HTML step
  const body = renderTemplate(b.body, c);
  const subject = renderTemplate(b.subject, c).slice(0, 200);
  const pre = renderTemplate(b.preheader, c);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f4f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f5"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#05080a;padding:18px 28px;color:#fff;font-weight:800;font-size:15px;letter-spacing:.02em"><span style="color:${brand.accent}">&#9679;</span> ${esc(brand.name)}</td></tr>
<tr><td style="padding:30px 28px 14px">${bodyToHtml(body, brand)}</td></tr>
</table>
<p style="max-width:580px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#8a8f8e">You're getting this because you applied or signed up with ${esc(brand.name)}.${
    unsubscribeUrl ? ` <a href="${esc(unsubscribeUrl)}" style="color:#8a8f8e">Unsubscribe</a>` : ""
  }</p>
</td></tr></table></body></html>`;
  const text = `${bodyToText(body)}\n\n--\n${brand.name}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}`;
  return { subject, html, text };
}
