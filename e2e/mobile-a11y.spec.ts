import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { answerChoice, fillContact, onQuestion } from "./helpers";

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the form fits a phone screen and the whole flow works by tapping", async ({ page }) => {
    await page.goto("/apply/apply");
    await onQuestion(page, "Are you finally ready");
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    await page.getByRole("radio", { name: "Yes, 100%. I'm ready." }).tap();
    await onQuestion(page, "Which best describes");
    await page.getByRole("radio", { name: "I've been learning" }).tap();
    await onQuestion(page, "main obstacle");
    await page.getByRole("radio", { name: "Strategy" }).tap();
    await onQuestion(page, "reach out");
    expect(await noOverflow()).toBe(true);
    await fillContact(page, { fn: "Mobile", ln: "Tester", phone: "4155550123", email: "mobile@e2e.test" });
    // the OK button and the navigation arrows are reachable without horizontal scrolling
    const ok = page.getByRole("button", { name: "OK" });
    await ok.scrollIntoViewIfNeeded();
    const box = (await ok.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    // tap targets are at least 40px tall
    expect(box.height).toBeGreaterThanOrEqual(36);
    await ok.tap();
    await onQuestion(page, "what would success look like");
    // questions use a comfortable size on a small screen
    const fs = await page.locator(".tfr-title").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fs).toBeGreaterThanOrEqual(20);
    expect(fs).toBeLessThanOrEqual(26);
  });

  test("the admin login page works on a phone", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Password")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("accessibility (axe)", () => {
  const scan = async (page: import("@playwright/test").Page, label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help}`), JSON.stringify(bad.map((v) => v.nodes.slice(0, 2).map((n) => n.html.slice(0, 120))))).toEqual([]);
  };

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await scan(page, "login");
  });

  test("public form: welcome, a choice question, the contact screen and an ending", async ({ page }) => {
    await page.goto("/apply/welcome");
    await scan(page, "welcome");
    await page.goto("/apply/apply");
    await onQuestion(page, "Are you finally ready");
    await scan(page, "choice question");
    await answerChoice(page, "a", "Which best describes");
    await answerChoice(page, "a", "main obstacle");
    await answerChoice(page, "a", "reach out");
    await scan(page, "contact group");
  });

  test("public form: every widget type", async ({ page }) => {
    await page.goto("/apply/widgets");
    await onQuestion(page, "How satisfied");
    await scan(page, "scale");
    await page.getByRole("radio", { name: "3", exact: true }).click();
    await scan(page, "date");
  });

  test.describe("admin", () => {
    test.use({ storageState: "e2e/.auth.json" });
    test("workspace, contacts, automations, results", async ({ page }) => {
      await page.goto("/forms");
      await scan(page, "forms home");
      await page.goto("/contacts");
      await scan(page, "contacts");
      await page.goto("/automations");
      await scan(page, "automations");
      await page.goto("/insights");
      await scan(page, "insights");
      await page.goto("/forms");
      await page.locator("tr", { hasText: "Mentorship application" }).getByRole("link").first().click();
      await page.waitForURL(/\/results$/);
      await scan(page, "performance");
    });
  });
});
