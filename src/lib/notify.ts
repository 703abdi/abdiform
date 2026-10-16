// Outgoing email: new-application alerts and automation emails.
// Two ways to send, whichever is set up on the server:
//   1. Gmail: GMAIL_USER + GMAIL_APP_PASSWORD (a Google "app password"). Simplest: alerts land in
//      your own inbox and automation emails go out from your Gmail address.
//   2. Brevo: BREVO_API_KEY + NOTIFY_FROM_EMAIL (for higher volume / a branded sender).
// Never throws; failures never block a submission.

import nodemailer from "nodemailer";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const emailConfigured = () =>
  !!process.env.EMAIL_OUTBOX_FILE ||
  !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || !!(process.env.BREVO_API_KEY && process.env.NOTIFY_FROM_EMAIL);

/** Where new-application alerts go when a form has no address set: your Gmail. */
export const defaultAlertTo = () => process.env.NOTIFY_TO || process.env.GMAIL_USER || "";

const SENDER_NAME = () => process.env.NOTIFY_FROM_NAME || "Tawakkul Trading";

async function deliver(m: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: { email: string; name?: string };
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  if (m.to.length === 0) return { ok: false, error: "No recipient." };
  // automated tests only: write the email to a file instead of sending it
  if (process.env.EMAIL_OUTBOX_FILE) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.EMAIL_OUTBOX_FILE, JSON.stringify({ to: m.to, subject: m.subject, text: m.text }) + "\n");
    return { ok: true };
  }
  const gUser = process.env.GMAIL_USER;
  const gPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (gUser && gPass) {
    try {
      const t = nodemailer.createTransport({ service: "gmail", auth: { user: gUser, pass: gPass }, connectionTimeout: 8000, socketTimeout: 10000 });
      await t.sendMail({
        from: { name: SENDER_NAME(), address: gUser },
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
        replyTo: m.replyTo ? { name: m.replyTo.name ?? "", address: m.replyTo.email } : undefined,
        headers: m.headers,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      console.error("gmail send failed", msg.slice(0, 200));
      return {
        ok: false,
        error: /Invalid login|BadCredentials|535/i.test(msg)
          ? "Gmail rejected the login. Use a Google app password (not your normal password) in GMAIL_APP_PASSWORD."
          : "Couldn't send through Gmail.",
      };
    }
  }
  const key = process.env.BREVO_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "Email isn't set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel." };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: SENDER_NAME() },
        to: m.to.map((email) => ({ email })),
        replyTo: m.replyTo,
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        headers: m.headers,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    console.error("Brevo rejected the email", res.status, detail.slice(0, 300));
    return {
      ok: false,
      error:
        res.status === 401
          ? "Brevo rejected the API key."
          : res.status === 400 && /sender/i.test(detail)
            ? "Brevo doesn't know that sender address. Verify NOTIFY_FROM_EMAIL in Brevo (Senders & IP)."
            : `Brevo answered ${res.status}.`,
    };
  } catch {
    return { ok: false, error: "Couldn't reach the email service." };
  }
}

export async function sendLeadEmail(opts: {
  to: string[];
  formTitle: string;
  lead: { name: string; email: string; phone: string };
  lines: [string, string][];
  dashboardUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const who = opts.lead.name || opts.lead.email || "Someone";
  const rows = opts.lines
    .filter(([, v]) => v)
    .map(
      ([q, a]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top">${esc(q)}</td><td style="padding:6px 0;color:#0f172a;white-space:pre-wrap">${esc(a)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 4px">New application: ${esc(who)}</h2>
<p style="margin:0 0 16px;color:#64748b">${esc(opts.formTitle)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>
<p style="margin-top:20px"><a href="${esc(opts.dashboardUrl)}">Open in dashboard</a></p></div>`;
  const text = `New application: ${who}\n${opts.formTitle}\n\n${opts.lines
    .filter(([, v]) => v)
    .map(([q, a]) => `${q}: ${a}`)
    .join("\n")}\n\n${opts.dashboardUrl}`;
  return deliver({
    to: opts.to,
    subject: `New application: ${who}`,
    html,
    text,
    replyTo: opts.lead.email ? { email: opts.lead.email, name: opts.lead.name || undefined } : undefined,
  });
}

/** Plain email (automations). */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  return deliver({ to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text, headers: opts.headers });
}

export const escapeHtml = esc;
