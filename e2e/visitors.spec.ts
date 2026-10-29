import { expect, test } from "@playwright/test";
import { backup, onQuestion, ownAddress } from "./helpers";

test("visitor tracking: source, cookie notice, time per question and the Visitors tab", async ({ page, browser }, info) => {
  await ownAddress(page, info.titlePath.join(" "));
  // the magnet form may already be renamed to free-strat; the old link redirects either way
  await page.goto("/apply/magnet?utm_source=ig&utm_campaign=bio");
  await onQuestion(page, "Where should we send it?");

  const notice = page.getByRole("region", { name: "Cookie notice" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toBeHidden();

  await page.getByLabel("Name").fill("Vic Visitor");
  await page.getByLabel("Email").fill("vic@e2e.test");
  await page.getByLabel("Phone number", { exact: true }).fill("8012345679");
  await page.getByRole("button", { name: /Submit|OK/ }).first().click();
  await expect(page.locator(".tfr-title")).toContainText("You're in!");

  // dismissed notice stays dismissed, and the visit cookie was set
  await page.reload();
  await expect(page.locator(".tfr-title").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Cookie notice" })).toHaveCount(0);
  expect((await page.context().cookies()).some((c) => c.name === "tf_vid")).toBe(true);

  const form = (await backup()).forms.find((f) => f.slug === "magnet" || f.slug === "free-strat");
  const admin = await browser.newPage({ storageState: "e2e/.auth.json" });
  await admin.goto(`/forms/${form!.id}/results/visitors`);
  await expect(admin.getByRole("heading", { name: "Visitors" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Where they came from" }).locator("..")).toContainText("Instagram");
  // the first visit finished; the reload counts as a second, returning visit
  const row = admin.locator("tbody tr", { hasText: "Instagram · bio" }).filter({ hasText: "Finished" }).first();
  await expect(row).toBeVisible();
  await expect(admin.locator("tbody tr", { hasText: "Only looked" }).first()).toContainText("returning");
  await expect(row.getByRole("link", { name: "Answers" })).toBeVisible();

  await admin.getByRole("link", { name: "Performance" }).click();
  await expect(admin.getByRole("columnheader", { name: "Avg time" })).toBeVisible();
  await admin.close();
});
