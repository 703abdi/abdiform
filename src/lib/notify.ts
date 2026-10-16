// Email alert for a new application, sent through Brevo's transactional API.
// Needs BREVO_API_KEY and NOTIFY_FROM_EMAIL (a sender verified in Brevo).
// Silently skipped when not configured; failures never block a submission.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendLeadEmail(opts: {
  to: string[];
  formTitle: string;
  lead: { name: string; email: string; phone: string };
  lines: [string, string][];
  dashboardUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "BREVO_API_KEY and NOTIFY_FROM_EMAIL are not set on the server." };
  if (opts.to.length === 0) return { ok: false, error: "No recipient." };

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

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: "Tawakkul Forms" },
        to: opts.to.map((email) => ({ email })),
        replyTo: opts.lead.email ? { email: opts.lead.email, name: opts.lead.name || undefined } : undefined,
        subject: `New application: ${who}`,
        htmlContent: html,
        textContent: text,
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
  } catch (e) {
    console.error("email send failed", e);
    return { ok: false, error: "Couldn't reach Brevo." };
  }
}

/** Plain transactional email through Brevo (used by automations). */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "Email isn't set up yet (BREVO_API_KEY and NOTIFY_FROM_EMAIL)." };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: process.env.NOTIFY_FROM_NAME || "Tawakkul" },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: opts.text,
        headers: opts.headers,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 401 ? "Brevo rejected the API key." : `Brevo answered ${res.status}.` };
  } catch {
    return { ok: false, error: "Couldn't reach Brevo." };
  }
}

export const escapeHtml = esc;
