import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { backup, onQuestion, ownAddress } from "./helpers";

test.beforeEach(async ({ page }, info) => ownAddress(page, info.titlePath.join(" ")));

test("lead magnet: name, email, phone, then one click emails the resource", async ({ page }) => {
  await page.goto("/apply/magnet");
  await onQuestion(page, "Where should we send it?");
  await page.getByLabel("Name").fill("Mia Magnet");
  await page.getByLabel("Email").fill("mia@e2e.test");
  await page.getByLabel("Phone number", { exact: true }).fill("8012345678");
  await page.getByRole("button", { name: /Submit|OK/ }).first().click();
  await expect(page.locator(".tfr-title")).toContainText("You're in!");
  await page.getByRole("button", { name: "Email me the resource" }).click();
  await expect(page.getByRole("status")).toContainText("Sent! Check mia@e2e.test");

  const OUTBOX = path.resolve(".e2e-outbox.jsonl");
  const mail = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to?: string[]; subject?: string; text?: string })
    .find((m) => m.to?.includes("mia@e2e.test") && m.subject === "Here's The Trading Checklist");
  expect(mail?.text).toContain("https://example.com/checklist.pdf");

  // the lead is a contact, tagged with the form and the resource
  await expect.poll(async () => {
    const b = (await backup()) as unknown as { contacts: { email: string; tags: string[]; first_name: string }[] };
    const c = b.contacts.find((x) => x.email === "mia@e2e.test");
    return [c?.first_name, c?.tags.includes("Lead magnet"), c?.tags.includes("Got: The Trading Checklist")];
  }).toEqual(["Mia", true, true]);
});
