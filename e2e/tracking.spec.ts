import { expect, test } from "@playwright/test";
import { ownAddress } from "./helpers";

test("ad pixel and tag manager get view, start and Lead events; responses show the lead score", async ({ page, browser }, info) => {
  await ownAddress(page, info.titlePath.join(" "));
  // never reach the real ad networks from tests
  await page.route(/connect\.facebook\.net|googletagmanager\.com/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("/apply/scored");
  await expect(page.getByRole("region", { name: "Cookie notice" })).toContainText("measure our ads");
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { fbq: { queue: unknown[] } }).fbq.queue))).toContain("PageView");
  // answer points are not sent to the browser
  expect(await page.content()).not.toContain("lead_score");

  await page.getByRole("radio", { name: "Big" }).click();
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByLabel("Email").fill("hot@e2e.test");
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.locator(".tfr-title").first()).toContainText("Thanks!");

  const fb = await page.evaluate(() => JSON.stringify((window as unknown as { fbq: { queue: unknown[] } }).fbq.queue));
  expect(fb).toContain("StartApplication");
  expect(fb).toContain('"Lead"');
  const dl = await page.evaluate(() => (window as unknown as { dataLayer: { event?: string }[] }).dataLayer.map((e) => e.event));
  expect(dl).toEqual(expect.arrayContaining(["form_view", "form_start", "form_submit"]));

  const admin = await browser.newPage({ storageState: "e2e/.auth.json" });
  await admin.goto("/forms");
  await admin.getByRole("link", { name: "Scored application" }).first().click();
  await admin.getByRole("link", { name: /Results/ }).first().click();
  await admin.getByRole("link", { name: /Responses/ }).click();
  await expect(admin.locator("tbody tr", { hasText: "hot@e2e.test" })).toContainText("Hot · 11");
  await admin.getByLabel("Lead score").selectOption("cold");
  await expect(admin.locator("tbody tr", { hasText: "hot@e2e.test" })).toHaveCount(0);
  await admin.getByLabel("Lead score").selectOption("hot");
  await expect(admin.locator("tbody tr", { hasText: "hot@e2e.test" })).toBeVisible();
  await admin.close();
});
