import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { backup, responsesFor, seedLeads } from "./helpers";

// one login for the whole file (stored by global-setup); the login screen itself is covered in security.spec
test.use({ storageState: "e2e/.auth.json" });
test.beforeEach(async ({ page }) => {
  await seedLeads();
  await page.goto("/forms");
});

const formId = async (slug: string) => (await backup()).forms.find((f) => f.slug === slug)!.id;

async function createFromTemplate(page: Page, template: string, name: string) {
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Template").selectOption({ label: template });
  await page.getByPlaceholder("Form name (optional)").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/forms\/[0-9a-f-]{36}\?tab=build/);
}

test("overview lists forms, totals and pipeline", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Leads & Forms" })).toBeVisible();
  await expect(page.locator("tr").getByRole("link", { name: "Mentorship application" })).toBeVisible();
  await expect(page.getByText("Total leads")).toBeVisible();
  await expect(page.getByText("Pipeline")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download backup" })).toBeVisible();
});

test("build a form from a template: edit, preview updates live, unsaved warning, save, persists", async ({ page }) => {
  await createFromTemplate(page, "Lead capture", "E2E Lead Form");
  await expect(page.getByRole("heading", { name: "E2E Lead Form" })).toBeVisible();
  // the left list shows the template's screens; the first is selected and shown in the live preview
  const preview = page.locator(".tfr.emb");
  await expect(preview).toBeVisible();
  // edit the question text: the live preview follows as you type
  const q = page.getByPlaceholder("Your question");
  await q.fill("What should we call you?");
  await expect(preview.locator(".tfr-title").first()).toContainText("What should we call you?");
  await expect(page.getByText(/Unsaved changes/)).toBeVisible();
  // add a question through the picker
  await page.getByRole("button", { name: "+ Add question" }).click();
  await page.getByRole("button", { name: /Short text/ }).click();
  await page.getByPlaceholder("Your question").fill("Anything else?");
  // theme change restyles the preview instantly
  await page.getByRole("button", { name: "Design" }).click();
  await page.getByRole("button", { name: /Midnight/ }).click();
  await expect(preview).toHaveCSS("background-color", "rgb(11, 18, 32)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(/Unsaved changes/)).toHaveCount(0);
  // reload: everything persisted
  await page.reload();
  await expect(page.locator(".tfr.emb")).toHaveCSS("background-color", "rgb(11, 18, 32)");
  await expect(page.getByText("What should we call you?").first()).toBeVisible();
  await expect(page.getByText("Anything else?").first()).toBeVisible();
});

test("publishing a form makes it live; closing it takes it down", async ({ page, browser }) => {
  await createFromTemplate(page, "NPS survey", "E2E Publish Test");
  const slug = (await backup()).forms.find((f) => f.slug.startsWith("e2e-publish-test"))!.slug;
  const anon = await browser.newPage();
  await anon.goto(`/apply/${slug}`);
  await expect(anon.getByText("This form isn't live yet")).toBeVisible();
  await page.getByLabel("Status").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await anon.goto(`/apply/${slug}`);
  await anon.keyboard.press("Enter"); // template starts with a welcome screen
  await expect(anon.locator(".tfr-title").first()).toContainText("How likely are you to recommend");
  await page.getByLabel("Status").selectOption("closed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await anon.goto(`/apply/${slug}`);
  await expect(anon.getByText("This form is closed")).toBeVisible();
  await anon.close();
});

test("settings: a password can be added and the public form then asks for it", async ({ page, browser }) => {
  await createFromTemplate(page, "Blank form", "E2E Secret Form");
  const slug = (await backup()).forms.find((f) => f.slug.startsWith("e2e-secret-form"))!.slug;
  await page.getByLabel("Status").selectOption("published");
  await page.getByRole("button", { name: "Settings & share" }).click();
  await page.getByPlaceholder("No password").fill("hunter2-e2e");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("(a password is set)")).toBeVisible();
  const anon = await browser.newPage();
  await anon.goto(`/apply/${slug}`);
  await expect(anon.getByText("This form is password protected.")).toBeVisible();
  await anon.close();
  // the stored form never contains the plain password and the backup omits the hash
  const b = JSON.stringify(await backup());
  expect(b).not.toContain("hunter2-e2e");
  expect(b).not.toContain("password_hash");
});

test("responses: search, incomplete filter, bulk status change, CSV export", async ({ page }) => {
  const id = await formId("apply");
  await page.goto(`/forms/${id}?tab=responses`);
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(2); // lena + omar (the quit-early lead is hidden under "Completed")
  await page.getByPlaceholder("Search answers and notes...").fill("lena@e2e.test");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Lena");
  // bulk: mark the filtered lead as contacted
  await page.getByLabel("Select all on this page").check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByLabel("Change status of selected").selectOption("contacted");
  await expect(rows.first()).toContainText("contacted");
  await expect.poll(async () => (await responsesFor("apply")).find((r) => r.answers.em === "lena@e2e.test")?.status).toBe("contacted");
  // incomplete (quit-early) filter
  await page.getByPlaceholder("Search answers and notes...").fill("");
  await page.locator("select").filter({ hasText: "Incomplete (quit early)" }).selectOption("partial");
  await expect(page.locator("tbody")).toContainText("Quitter");
  // open a lead: details + notes
  await page.locator("tbody tr", { hasText: "Quitter" }).click();
  await expect(page.getByRole("dialog", { name: "Lead details" })).toContainText("quitter@e2e.test");
  await page.getByPlaceholder("Call notes, objections, next step...").fill("Called, no answer");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect.poll(async () => (await responsesFor("apply")).find((r) => r.answers.em === "quitter@e2e.test")?.notes).toBe("Called, no answer");
  await page.getByRole("button", { name: "Close" }).click();
  // CSV export (completed + status column, bold markup stripped from the headers)
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  const csv = fs.readFileSync((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toBe("apply-responses.csv");
  expect(csv.split("\n")[0]).toContain("Are you finally ready to become a profitable trader?");
  expect(csv.split("\n")[0]).not.toContain("*");
  expect(csv).toContain("lena@e2e.test");
  expect(csv).toContain("+18012345678");
});

test("summary shows insights computed from real responses", async ({ page }) => {
  const id = await formId("apply");
  await page.goto(`/forms/${id}?tab=summary`);
  await expect(page.getByText("Where people drop off")).toBeVisible();
  await expect(page.getByText("Devices")).toBeVisible();
  await expect(page.getByText("Endings reached")).toBeVisible();
  await expect(page.getByText("Time to complete")).toBeVisible();
});

test("duplicate and delete a form", async ({ page }) => {
  await page.goto("/forms");
  const row = page.locator("tr", { hasText: "Welcome form" });
  await row.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForURL(/\/forms\/[0-9a-f-]{36}\?tab=build/);
  await expect(page.getByRole("heading", { name: "Welcome form (copy)" })).toBeVisible();
  // the copy is an independent draft
  expect((await backup()).forms.find((f) => f.slug.startsWith("welcome-copy"))!.status).toBe("draft");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Settings & share" }).click();
  await page.getByRole("button", { name: "Delete form" }).click();
  await page.waitForURL("**/forms");
  await expect(page.getByRole("link", { name: "Welcome form (copy)" })).toHaveCount(0);
});

test("import a Typeform CSV export into a new form", async ({ page }) => {
  await page.goto("/forms/import");
  const csv = [
    "#,First name,Email,What do you trade?,Start Date (UTC),Submit Date (UTC),Network ID,Token",
    '1,Ana,ana@csv.test,"Forex, Gold",2026-01-01 10:00:00,2026-01-01 10:02:00,n1,tok-e2e-1',
    "2,Bo,bo@csv.test,Stocks,2026-01-02 10:00:00,2026-01-02 10:03:00,n2,tok-e2e-2",
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "typeform.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByPlaceholder("Mentorship application").fill("E2E CSV Import");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByText(/Imported 2 responses/)).toBeVisible();
  const rs = await responsesFor((await backup()).forms.find((f) => f.slug.startsWith("e2e-csv-import"))!.slug);
  expect(rs).toHaveLength(2);
  expect(rs.every((r) => r.source === "csv")).toBe(true);
  // importing the same file again adds nothing (dedupe by Typeform token)
  await page.locator('input[type="file"]').setInputFiles({ name: "typeform.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator("select[name=target]").selectOption({ label: "E2E CSV Import" });
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByText(/Imported 0 responses/)).toBeVisible();
});

test("typeform API import explains a bad token instead of crashing", async ({ page }) => {
  await page.goto("/forms/import");
  await page.getByPlaceholder("tfp_...").fill("tfp_invalid_token");
  await page.getByPlaceholder("https://.../to/AbC123").fill("https://form.typeform.com/to/DoesNotExist");
  await page.getByRole("button", { name: "Import from Typeform" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
});

test("backup download is valid JSON without secrets", async ({ page }) => {
  await page.goto("/forms");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Backup with responses" }).click()]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, "utf8"));
  expect(download.suggestedFilename()).toMatch(/^tawakkul-forms-backup-\d{4}-\d{2}-\d{2}-with-responses\.json$/);
  expect(Array.isArray(json.forms) && Array.isArray(json.responses)).toBe(true);
  expect(JSON.stringify(json)).not.toContain("password_hash");
});
