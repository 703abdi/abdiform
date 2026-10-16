// Email verification: a 6-digit code is emailed to the applicant; entering it returns a signed
// token that the final submission must carry for that exact email address.

import crypto from "node:crypto";
import { q } from "@/lib/db";
import { signValue, verifySignedValue } from "@/lib/session";
import { emailConfigured, escapeHtml, sendEmail } from "@/lib/notify";
import { flattenFields } from "@/forms/lib";
import type { Form } from "@/forms/types";

const TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

const norm = (e: string) => e.trim().toLowerCase();
const hash = (formId: string, email: string, code: string) =>
  crypto.createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${formId}:${norm(email)}:${code}`).digest("hex");

/** The email field that must be verified, if the form asks for it. */
export const verifiedEmailField = (form: Pick<Form, "fields">) => flattenFields(form.fields).find((f) => f.type === "email" && f.verify);

/** Verification only runs when the server can actually send email; otherwise the form never gets stuck. */
export const verificationActive = (form: Pick<Form, "fields">) => !!verifiedEmailField(form) && emailConfigured();

export async function sendCode(form: Pick<Form, "id" | "title" | "settings">, email: string): Promise<{ ok: boolean; error?: string }> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q(
    `insert into email_codes (form_id, email, code_hash, attempts, expires_at) values ($1, $2, $3, 0, now() + interval '${TTL_MIN} minutes')
     on conflict (form_id, email) do update set code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now()`,
    [form.id, norm(email), hash(form.id, email, code)],
  );
  const brand = form.settings.brand_name || form.title;
  const r = await sendEmail({
    to: norm(email),
    subject: `${code} is your verification code`,
    text: `Your code for ${brand} is ${code}\n\nIt expires in ${TTL_MIN} minutes. If you didn't request this, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><p style="color:#475569;margin:0 0 8px">${escapeHtml(brand)}</p><p style="font-size:15px;margin:0 0 16px">Your verification code is</p><p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${code}</p><p style="color:#64748b;font-size:13px">It expires in ${TTL_MIN} minutes. If you didn't request this, ignore this email.</p></div>`,
  });
  return r.ok ? { ok: true } : { ok: false, error: "We couldn't send the code. Check the email address and try again." };
}

export async function checkCode(formId: string, email: string, code: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const [row] = await q(`select code_hash, attempts, expires_at > now() as fresh from email_codes where form_id = $1 and email = $2`, [formId, norm(email)]);
  if (!row) return { ok: false, error: "Send a code first." };
  if (!row.fresh) return { ok: false, error: "That code expired. Tap \"Resend code\"." };
  if (Number(row.attempts) >= MAX_ATTEMPTS) return { ok: false, error: "Too many tries. Tap \"Resend code\" for a new one." };
  const good = crypto.timingSafeEqual(Buffer.from(String(row.code_hash)), Buffer.from(hash(formId, email, code.replace(/\D/g, ""))));
  if (!good) {
    await q(`update email_codes set attempts = attempts + 1 where form_id = $1 and email = $2`, [formId, norm(email)]);
    return { ok: false, error: "That code isn't right. Check the email and try again." };
  }
  await q(`delete from email_codes where form_id = $1 and email = $2`, [formId, norm(email)]);
  const token = await signValue(`ev:${formId}:${norm(email)}`);
  if (!token) return { ok: false, error: "Verification isn't available right now." };
  return { ok: true, token };
}

export async function tokenValid(formId: string, email: string, token: unknown): Promise<boolean> {
  return typeof token === "string" && /^[0-9a-f]{32}$/.test(token) && verifySignedValue(`ev:${formId}:${norm(email)}`, token);
}
