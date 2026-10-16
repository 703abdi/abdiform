import { expect, request, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, seedLeads } from "./helpers";

test.use({ storageState: "e2e/.auth.json" });
test.beforeEach(async () => {
  await seedLeads();
});

const OUTBOX = path.resolve(".e2e-outbox.jsonl");
const outbox = () =>
  (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean) : []).map(
    (l) => JSON.parse(l) as { to: string[]; subject: string; text: string; tag?: string },
  );

test("pages: create the pre-call page, edit it, publish it, visitors see it and clicks are counted", async ({ page, browser }) => {
  await page.goto("/pages");
  await page.getByRole("button", { name: "+ Create page" }).click();
  await page.getByLabel("Page name", { exact: true }).fill("E2E Precall");
  await page.locator("label", { hasText: "Pre-call page" }).click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await page.waitForURL(/\/pages\/[0-9a-f-]{36}$/);

  // the template is there, in the live preview
  const preview = page.locator(".pv");
  await expect(preview.locator("h1")).toContainText("Your Call");
  await expect(preview.locator(".pv-accent").first()).toContainText("Is Not Confirmed");

  // click the headline in the preview -> its settings open; edit it
  await preview.locator("h1").click();
  await page.getByLabel("Headline", { exact: true }).fill("Your Call Is ==Almost Confirmed==");
  await expect(preview.locator("h1")).toContainText("Almost Confirmed");
  // add a video block with a YouTube link
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("menuitem", { name: /^Video/ }).click();
  await page.getByLabel("Video link", { exact: true }).fill("https://youtu.be/dQw4w9WgXcQ");
  await expect(preview.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1);
  await page.getByLabel("Page title", { exact: true }).fill("E2E Precall");
  await page.getByRole("button", { name: "Page & design" }).click();
  await page.getByLabel("Link", { exact: true }).fill("e2e-precall");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Live" })).toBeVisible();

  // a visitor sees the published page, with the brand theme
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const v = await anon.newPage();
  await v.goto("/p/e2e-precall");
  await expect(v.locator("h1")).toContainText("Almost Confirmed");
  await expect(v.locator(".pv")).toHaveCSS("background-color", "rgb(5, 8, 10)");
  const btn = v.locator(".pv-btn").first();
  await expect(btn).toBeVisible();
  await btn.evaluate((a) => a.setAttribute("target", "")); // stay on the page
  await btn.evaluate((a) => a.setAttribute("href", "#"));
  await btn.click();
  // views and clicks show up in the Pages list
  await expect
    .poll(async () => {
      await page.goto("/pages");
      return page.locator("tr", { hasText: "E2E Precall" }).locator("td").nth(3).innerText();
    }, { timeout: 15_000 })
    .toBe("1");
  await anon.close();
});

test("pages: drafts are hidden from visitors, admins can preview them", async ({ page, browser }) => {
  await page.goto("/pages");
  await page.getByRole("button", { name: "+ Create page" }).click();
  await page.getByLabel("Page name", { exact: true }).fill("E2E Draft Page");
  await page.locator("label", { hasText: "Blank page" }).click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await page.waitForURL(/\/pages\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Page & design" }).click();
  const slug = await page.getByLabel("Link", { exact: true }).inputValue();
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anon.request.get(`/p/${slug}`)).status()).toBe(404);
  expect((await anon.request.get(`/p/${slug}?preview=1`)).status()).toBe(404);
  await anon.close();
  await page.goto(`/p/${slug}?preview=1`);
  await expect(page.locator(".pv h1")).toBeVisible();
});

test("blasts: write, pick an audience by tag, test, send; unsubscribed people are skipped and the link works", async ({ page }) => {
  // make one Low budget contact unsubscribe first
  await page.goto("/contacts");
  await page.locator("tbody tr", { hasText: "lena@e2e.test" }).getByRole("button").first().click();
  const drawer = page.getByRole("dialog", { name: "Contact lena@e2e.test" });
  await drawer.getByLabel("Subscribed to emails").uncheck();
  await expect(page.getByText("Unsubscribed", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/blasts");
  await page.getByRole("button", { name: "+ New blast" }).click();
  await page.waitForURL(/\/blasts\/[0-9a-f-]{36}$/);
  await page.getByLabel("Blast name", { exact: true }).fill("E2E Blast");
  await page.getByLabel("Subject", { exact: true }).fill("Hey {{first_name}}, a quick one");
  await page.getByLabel("Message", { exact: true }).fill("Hi {{first_name}},\n\nThe **Trading Room** is open.\n\n[[See what's inside|https://whop.com/example/]]");
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText("See what's inside")).toBeVisible();

  // audience: everyone tagged "Mentorship application" (Lena, Omar, Quitter...) minus unsubscribed Lena
  await page.getByRole("radio", { name: /Contacts who match/ }).check();
  await page.getByLabel("Condition 1 value").selectOption("Mentorship application");
  await expect(page.getByTestId("audience-count")).toContainText(/\d+ (people|person) will get this/);

  // test email
  await page.getByLabel("Send a test to").fill("me@e2e.test");
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText("Test sent to me@e2e.test")).toBeVisible();
  expect(outbox().some((m) => m.to.includes("me@e2e.test") && m.subject.startsWith("[Test] Hey"))).toBe(true);

  // send for real
  await page.getByRole("button", { name: "Send now" }).click();
  await page.getByRole("dialog", { name: "Send this blast now?" }).getByRole("button", { name: "Send now" }).click();
  await expect(page.getByText(/Sent to \d+ people/)).toBeVisible({ timeout: 20_000 });
  const sent = outbox().filter((m) => m.subject === "Hey Omar, a quick one" || m.subject.endsWith(", a quick one"));
  expect(sent.some((m) => m.to.includes("omar@e2e.test"))).toBe(true);
  expect(sent.some((m) => m.to.includes("lena@e2e.test"))).toBe(false); // unsubscribed
  await page.reload();
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("omar@e2e.test")).toBeVisible();

  // the unsubscribe link in the email works
  const omarMail = sent.find((m) => m.to.includes("omar@e2e.test"))!;
  const unsub = /href="([^"]*\/u\/[^"]+)"/.exec(omarMail.text)?.[1];
  expect(unsub).toBeTruthy();
  const ctx = await request.newContext({ baseURL: BASE });
  const res = await ctx.get(new URL(unsub!.replace(/&amp;/g, "&")).pathname);
  expect(await res.text()).toContain("unsubscribed");
  await ctx.dispose();
});

test("forms: the Tawakkul theme gives the form the brand look", async ({ page }) => {
  await page.goto("/forms");
  await page.getByRole("button", { name: "Create a new form" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new form" });
  await dialog.getByLabel("Form name").fill("E2E Brand Form");
  await dialog.getByRole("button", { name: "Create form" }).click();
  await page.waitForURL(/\/create$/);
  await page.getByRole("button", { name: "Design" }).click();
  await page.getByRole("button", { name: /Tawakkul/ }).click();
  await expect(page.locator(".tfr.emb")).toHaveCSS("background-color", "rgb(5, 8, 10)");
});
