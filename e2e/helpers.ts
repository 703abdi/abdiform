import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";

export const BASE = "http://localhost:3100";
export const ADMIN_PASSWORD = "e2e-admin-pass";

export interface Resp {
  id: string;
  form_id: string;
  answers: Record<string, unknown>;
  meta: Record<string, unknown> & { partial?: boolean; ending?: string; device?: string; duration_s?: number; utm?: Record<string, string> };
  status: string;
  notes: string;
  source: string;
  external_id: string | null;
}
export interface FormRow { id: string; slug: string; status: string; views: number; starts: number; fields: unknown[]; settings: Record<string, unknown> }

/** Reads everything through the admin backup API (black-box, same as a real admin). */
export async function backup(): Promise<{ forms: FormRow[]; responses: Resp[] }> {
  const ctx = await request.newContext({ baseURL: BASE, storageState: "e2e/.auth.json" });
  const res = await ctx.get("/api/forms/backup?responses=1");
  if (!res.ok()) throw new Error(`backup failed ${res.status()}`);
  const json = await res.json();
  await ctx.dispose();
  return json;
}

export async function responsesFor(slug: string): Promise<Resp[]> {
  const b = await backup();
  const f = b.forms.find((x) => x.slug === slug);
  return f ? b.responses.filter((r) => r.form_id === f.id) : [];
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/forms");
}

const OUTBOX = path.resolve(".e2e-outbox.jsonl");

/** The newest verification code emailed to `email` (the test server writes emails to a file). */
export async function latestCode(email: string, after = 0): Promise<string> {
  let code = "";
  await expect
    .poll(() => {
      const lines = fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean) : [];
      const hits = lines.map((l) => JSON.parse(l) as { to: string[]; subject: string }).filter((m) => m.to?.includes(email.toLowerCase()) && /verification code/.test(m.subject));
      if (hits.length <= after) return "";
      code = hits[hits.length - 1].subject.slice(0, 6);
      return code;
    }, { timeout: 10_000 })
    .not.toBe("");
  return code;
}
export const codeCount = (email: string) =>
  (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean) : [])
    .map((l) => JSON.parse(l) as { to: string[]; subject: string })
    .filter((m) => m.to?.includes(email.toLowerCase()) && /verification code/.test(m.subject)).length;

/** On the "Check your email" screen: types the emailed code and continues. */
export async function passCode(page: Page, email: string) {
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify" })).toBeEnabled(); // the code has been sent
  await page.getByLabel("Verification code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
}

/** Verification token through the public API (for submissions made without the browser). */
export async function apiToken(ctx: APIRequestContext, email: string, slug = "apply"): Promise<string> {
  const before = codeCount(email);
  const s = await ctx.post(`/api/apply/${slug}/verify`, { data: { action: "send", email } });
  if (!s.ok()) throw new Error(`send code failed ${s.status()}`);
  const c = await ctx.post(`/api/apply/${slug}/verify`, { data: { action: "check", email, code: await latestCode(email, before) } });
  const j = await c.json();
  if (!j.token) throw new Error(`check code failed ${JSON.stringify(j)}`);
  return j.token;
}

/** Waits for the current question's heading to contain `text`. */
export const onQuestion = (page: Page, text: string | RegExp) =>
  expect(page.locator(".tfr-title").first()).toContainText(text);

export async function answerChoice(page: Page, key: string, next: string | RegExp) {
  await page.keyboard.press(key);
  await onQuestion(page, next);
}

export async function fillContact(page: Page, v: { fn: string; ln: string; phone: string; email: string }) {
  await page.getByLabel("First name").fill(v.fn);
  await page.getByLabel("Last name").fill(v.ln);
  await page.getByLabel("Phone number", { exact: true }).fill(v.phone);
  await page.getByLabel("Email").fill(v.email);
}

/** Creates three leads on the "apply" form through the public API (two finished, one quit-early). Idempotent. */
export async function seedLeads() {
  const have = await responsesFor("apply");
  if (have.some((r) => r.answers.em === "lena@e2e.test")) return;
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.150" } });
  const base = { ready: "Yes, 100%. I'm ready.", exp: "I've been learning", obstacle: "Strategy", success: "Build a consistent strategy" };
  const lead = (fn: string, em: string, ph: string, budget: string, extra: Record<string, string> = {}) => ({
    ...base, fn, ln: "E2E", ph, em, budget, ...extra,
  });
  const ok = async (rid: string, answers: Record<string, string>) => {
    const verification = await apiToken(ctx, answers.em);
    const r = await ctx.post("/api/apply/apply", { data: { rid, answers, verification, meta: { duration_s: 42 } } });
    if (!r.ok()) throw new Error(`seed failed ${r.status()} ${await r.text()}`);
  };
  await ok("seed-lena-000001", lead("Lena", "lena@e2e.test", "+18012345678", "Under $500 USD"));
  await ok("seed-omar-000001", lead("Omar", "omar@e2e.test", "+14155550199", "$5k+ USD", { hours: "Yes, I'm ready to move forward today" }));
  await ctx.post("/api/apply/apply?event=progress", { data: { rid: "seed-quit-000001", answers: { ...base, fn: "Quitter", ln: "Q", ph: "+14155550100", em: "quitter@e2e.test" } } });
  await ctx.dispose();
}

/** Each browser test gets its own client address, so the per-address submit limit doesn't leak between tests. */
export async function ownAddress(page: Page, title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${(h >> 8) % 250}.${h % 250}` });
}
