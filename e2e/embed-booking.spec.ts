import { expect, test } from "@playwright/test";
import { answerChoice, fillContact, onQuestion, passCode, ownAddress } from "./helpers";

test.beforeEach(async ({ page }, info) => ownAddress(page, info.titlePath.join(" ")));

test("after booking through Calendly the page switches to the confirmation message", async ({ page }) => {
  await page.goto("/apply/apply");
  await onQuestion(page, "Are you finally ready");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "a", "main obstacle");
  await answerChoice(page, "a", "reach out");
  await fillContact(page, { fn: "Book", ln: "Er", phone: "4155550177", email: "booker@e2e.test" });
  await page.getByRole("button", { name: "OK" }).click();
  await passCode(page, "booker@e2e.test");
  await answerChoice(page, "b", "set aside");
  await answerChoice(page, "e", "ready to move forward today");
  await page.keyboard.press("a");
  await expect(page.locator(".tfr-title")).toContainText("Schedule your 1-1 call");
  await expect(page.locator("iframe.tfr-calendly")).toBeVisible();

  // a message from some other origin must be ignored
  await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { event: "calendly.event_scheduled" } })));
  await expect(page.locator(".tfr-title")).toContainText("Schedule your 1-1 call");

  // the real Calendly event swaps in the confirmation and removes the calendar
  await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://calendly.com", data: { event: "calendly.event_scheduled" } })));
  await expect(page.locator(".tfr-title")).toContainText("Thank you!");
  await expect(page.getByText("We'll be in touch.")).toBeVisible();
  await expect(page.locator("iframe.tfr-calendly")).toHaveCount(0);
});

test.describe("embed script", () => {
  const load = async (page: import("@playwright/test").Page, mode: string, extra = "") => {
    await page.goto("/login"); // any page on the site: the script is origin-agnostic
    await page.evaluate(
      ({ mode, extra }) =>
        new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "/embed.js";
          s.setAttribute("data-form", "welcome");
          s.setAttribute("data-mode", mode);
          s.setAttribute("data-label", "Apply <b>now</b>");
          if (extra) s.setAttribute("data-color", extra);
          s.onload = () => resolve();
          document.body.appendChild(s);
        }),
      { mode, extra },
    );
  };

  test("popup: a button opens the form in a modal; Escape and the X close it", async ({ page }) => {
    await load(page, "popup", "#ff0066");
    const btn = page.getByRole("button", { name: "Apply <b>now</b>" }); // label is text, never HTML
    await expect(btn).toBeVisible();
    await expect(btn).toHaveCSS("background-color", "rgb(255, 0, 102)");
    await btn.click();
    const frame = page.frameLocator("iframe[title=Form]");
    await expect(frame.getByRole("heading", { name: "Join us" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("iframe[title=Form]")).toHaveCount(0);
    await btn.click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("iframe[title=Form]")).toHaveCount(0);
  });

  test("slider, side tab, popover and full page modes", async ({ page }) => {
    await load(page, "slider");
    await page.getByRole("button", { name: /Apply/ }).click();
    await expect(page.frameLocator("iframe[title=Form]").getByRole("heading", { name: "Join us" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await load(page, "sidetab");
    await expect(page.getByRole("button", { name: /Apply/ }).last()).toBeVisible();

    await load(page, "popover");
    await page.getByRole("button", { name: /Apply/ }).last().click();
    await expect(page.locator("iframe[title=Form]")).toBeVisible();

    await load(page, "fullpage");
    await expect(page.locator("iframe[title=Form]").last()).toHaveCSS("position", "fixed");
  });

  test("an invalid form name is ignored instead of injecting anything", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.src = "/embed.js";
      s.setAttribute("data-form", '"><img src=x onerror=alert(1)>');
      s.setAttribute("data-mode", "popup");
      document.body.appendChild(s);
    });
    await page.waitForTimeout(300);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("img[src=x]")).toHaveCount(0);
  });
});
