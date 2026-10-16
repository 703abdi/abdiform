// Password-protected forms. The password is stored only as a scrypt hash; a
// successful unlock sets a cookie holding a token derived from that hash.

import crypto from "node:crypto";
import type { Form } from "@/forms/types";

export function hashPassword(password: string, formId: string): string {
  return crypto.scryptSync(password, `form:${formId}`, 32).toString("hex");
}

export function passwordOk(password: string, form: Pick<Form, "id" | "settings">): boolean {
  const want = form.settings.password_hash;
  if (!want) return true;
  const got = hashPassword(password, form.id);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-secret";

export function unlockToken(form: Pick<Form, "id" | "settings">): string {
  return crypto.createHmac("sha256", secret()).update(`${form.id}:${form.settings.password_hash ?? ""}`).digest("hex");
}

export const unlockCookie = (formId: string) => `tf_pw_${formId.slice(0, 8)}`;

/** True when the form has no password, or the request carries a valid unlock cookie. */
export function isUnlocked(form: Pick<Form, "id" | "settings">, cookieValue: string | undefined): boolean {
  if (!form.settings.password_hash) return true;
  return !!cookieValue && cookieValue === unlockToken(form);
}

/** Settings safe to send to a browser (never the password hash). */
export function publicSettings<T extends Form["settings"]>(s: T): T {
  const { password_hash, access_password, ...rest } = s;
  void password_hash;
  void access_password;
  return { ...rest, has_password: !!s.password_hash } as T;
}

/** What the public form needs to run, and nothing else: no alert emails, webhooks or internal stats. */
export function respondentSettings<T extends Form["settings"]>(s: T): T {
  const { password_hash, access_password, notify_email, webhook_url, typeform_form_id, history, ...rest } = s;
  void password_hash;
  void access_password;
  void notify_email;
  void webhook_url;
  void typeform_form_id;
  void history;
  return { ...rest, notify_email: "", webhook_url: "", has_password: !!s.password_hash } as T;
}
