import { expect, test, request as pwRequest } from "@playwright/test";
import { ADMIN_PASSWORD, BASE, onQuestion, responsesFor } from "./helpers";

test.describe("admin area is locked", () => {
  test("dashboard and admin APIs refuse anonymous visitors", async ({ request, page }) => {
    await page.goto("/forms");
    await expect(page).toHaveURL(/\/login$/);
    for (const path of ["/api/forms/backup", "/api/forms/backup?responses=1", "/api/forms/x/export", "/api/forms/files/abc"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test("wrong password is rejected, right password logs in, logout locks again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Wrong password.")).toBeVisible();
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/forms");
    await expect(page.getByRole("heading", { name: "Leads & Forms" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL("**/login");
    await page.goto("/forms");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a forged or tampered session cookie does not work", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "tf_session", value: "9999999999999.deadbeef", url: BASE }]);
    const page = await ctx.newPage();
    await page.goto("/forms");
    await expect(page).toHaveURL(/\/login$/);
    await ctx.close();
  });
});

test("security headers and crawler rules", async ({ request }) => {
  const login = await request.get("/login");
  expect(login.headers()["x-frame-options"]).toBe("DENY");
  expect(login.headers()["x-content-type-options"]).toBe("nosniff");
  expect(login.headers()["referrer-policy"]).toBeTruthy();
  const form = await request.get("/apply/apply");
  expect(form.headers()["x-frame-options"]).toBeUndefined(); // public forms may be embedded
  expect(await form.text()).toContain('content="noindex');
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /forms");
  expect(robots).toContain("Disallow: /api/");
  const embed = await request.get("/embed.js");
  expect(embed.headers()["content-type"]).toContain("javascript");
  expect(embed.headers()["access-control-allow-origin"]).toBe("*");
  expect(await embed.text()).not.toContain("innerHTML");
});

test.describe("password-protected form", () => {
  test("shows a gate, rejects a wrong password, opens with the right one", async ({ page, request }) => {
    await page.goto("/apply/locked");
    await expect(page.getByText("This form is password protected.")).toBeVisible();
    expect(await page.getByLabel("Name").count()).toBe(0); // the form itself is not rendered
    await page.getByLabel("Password").fill("nope");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("That password isn't right.")).toBeVisible();
    await page.getByLabel("Password").fill("open-sesame");
    await page.getByRole("button", { name: "Unlock" }).click();
    await onQuestion(page, "Name");
    await page.getByLabel("Name").fill("Invited");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /Thanks/ })).toBeVisible();
    // and without the cookie the API refuses
    const anon = await request.post("/api/apply/locked", { data: { rid: "sneaky-session-001", answers: { n: "Sneaky" } } });
    expect(anon.status()).toBe(401);
    expect((await responsesFor("locked")).map((r) => r.answers.n)).toEqual(["Invited"]);
    // the password hash never reaches the browser
    expect(await page.content()).not.toContain("password_hash");
  });
});

test("a form with a response limit closes itself", async ({ page, request }) => {
  await page.goto("/apply/limited");
  await onQuestion(page, "Name");
  await page.getByLabel("Name").fill("First in");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Thanks/ })).toBeVisible();
  await page.goto("/apply/limited");
  await expect(page.getByText("This form is closed")).toBeVisible();
  await expect(page.getByText("All spots are taken.")).toBeVisible();
  const late = await request.post("/api/apply/limited", { data: { rid: "late-session-0001", answers: { n: "Too late" } }, headers: { "x-forwarded-for": "203.0.113.30" } });
  expect(late.status()).toBe(410);
});

test("bots are ignored and hostile payloads never crash the API", async ({ request }) => {
  const h = { "x-forwarded-for": "203.0.113.40" };
  const bot = await request.post("/api/apply/welcome", { data: { rid: "bot-session-0001", hp: "http://spam", answers: { n: "Botty" } }, headers: h });
  expect((await bot.json()).ok).toBe(true); // pretends success…
  expect((await responsesFor("welcome")).some((r) => r.answers.n === "Botty")).toBe(false); // …stores nothing
  for (const body of ['{oops', '', '{"answers":null}', '{"answers":{"__proto__":{"polluted":true}}}', JSON.stringify({ answers: { n: "A".repeat(200_000) } })]) {
    const r = await request.post("/api/apply/welcome", { data: body, headers: { ...h, "content-type": "application/json", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 41}` } });
    expect(r.status(), body.slice(0, 20)).toBeLessThan(500);
  }
});

test("submitting too fast from one address is rate limited", async () => {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.99" } });
  const codes: number[] = [];
  for (let i = 0; i < 11; i++) {
    codes.push((await ctx.post("/api/apply/welcome", { data: { rid: `rl-session-${String(i).padStart(4, "0")}`, answers: { n: "x" } } })).status());
  }
  expect(codes.slice(0, 8), `statuses: ${codes.join(",")}`).toEqual(Array(8).fill(200));
  expect(codes.slice(8).every((c) => c === 429)).toBe(true);
  await ctx.dispose();
});
