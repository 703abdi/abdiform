import { expect, type Page } from "@playwright/test";
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
    const r = await ctx.post("/api/apply/apply", { data: { rid, answers, meta: { duration_s: 42 } } });
    if (!r.ok()) throw new Error(`seed failed ${r.status()} ${await r.text()}`);
  };
  await ok("seed-lena-000001", lead("Lena", "lena@e2e.test", "+18012345678", "Under $500 USD"));
  await ok("seed-omar-000001", lead("Omar", "omar@e2e.test", "+14155550199", "$5k+ USD", { hours: "No, I don't have that kind of time right now" }));
  await ctx.post("/api/apply/apply?event=progress", { data: { rid: "seed-quit-000001", answers: { ...base, fn: "Quitter", ln: "Q", ph: "+14155550100", em: "quitter@e2e.test" } } });
  await ctx.dispose();
}
