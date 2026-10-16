import { expect, request, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { BASE, apiToken, backup, responsesFor, seedLeads } from "./helpers";

// one login for the whole file (stored by global-setup); the login screen itself is covered in security.spec
test.use({ storageState: "e2e/.auth.json" });
test.beforeEach(async ({ page }) => {
  await seedLeads();
  await page.goto("/forms");
});

const formId = async (slug: string) => (await backup()).forms.find((f) => f.slug === slug)!.id;
const row = (page: Page, title: string) => page.locator("tbody tr", { hasText: title });

interface ContactRow { id: string; email: string; tags: string[]; list_ids: string[]; first_name: string; subscribed: boolean }
async function contacts(): Promise<ContactRow[]> {
  return ((await backup()) as unknown as { contacts: ContactRow[] }).contacts ?? [];
}
const contact = async (email: string) => (await contacts()).find((c) => c.email === email);

async function createFromTemplate(page: Page, template: string, name: string) {
  await page.getByRole("button", { name: "Create a new form" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new form" });
  await dialog.getByLabel("Form name").fill(name);
  await dialog.locator("label", { hasText: template }).click();
  await dialog.getByRole("button", { name: "Create form" }).click();
  await page.waitForURL(/\/forms\/[0-9a-f-]{36}\/create$/);
}

test("forms home looks like a Typeform workspace", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "My workspace" })).toBeVisible();
  for (const tab of ["Forms", "Contacts", "Automations", "Insights"]) {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab })).toBeVisible();
  }
  for (const col of ["Responses", "Completed", "Updated", "Integrations"]) {
    await expect(page.getByRole("columnheader", { name: col })).toBeVisible();
  }
  const r = row(page, "Mentorship application");
  await expect(r).toBeVisible();
  await expect(r.getByTitle("Calendly")).toBeVisible();
  await r.getByRole("button", { name: "Actions for Mentorship application" }).click();
  for (const item of ["Copy link", "Content", "Workflow", "Connect", "Share", "Results", "Rename", "Duplicate", "Copy to", "Move to", "Delete"]) {
    await expect(page.getByRole("menuitem", { name: item, exact: true })).toBeVisible();
  }
  await page.getByRole("menuitem", { name: "Results" }).click();
  await page.waitForURL(/\/results$/);
  await expect(page.getByRole("heading", { name: "Form performance" })).toBeVisible();
  // sort + grid view
  await page.goto("/forms");
  await page.getByLabel("Sort forms").selectOption("name");
  await page.getByRole("button", { name: "grid" }).click();
  await expect(page.getByText("Mentorship application").first()).toBeVisible();
});

test("build a form from a template: edit, preview updates live, unsaved warning, save, persists", async ({ page }) => {
  await createFromTemplate(page, "Lead capture", "E2E Lead Form");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("E2E Lead Form");
  const preview = page.locator(".tfr.emb");
  await expect(preview).toBeVisible();
  const q = page.getByPlaceholder("Your question");
  await q.fill("What should we call you?");
  await expect(preview.locator(".tfr-title").first()).toContainText("What should we call you?");
  await expect(page.getByText(/Unsaved changes/)).toBeVisible();
  await page.getByRole("button", { name: "+ Add question" }).click();
  await page.getByRole("button", { name: /Short text/ }).click();
  await page.getByPlaceholder("Your question").fill("Anything else?");
  await page.getByRole("button", { name: "Design" }).click();
  await page.getByRole("button", { name: /Midnight/ }).click();
  await expect(preview).toHaveCSS("background-color", "rgb(11, 18, 32)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(/Unsaved changes/)).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tfr.emb")).toHaveCSS("background-color", "rgb(11, 18, 32)");
  await expect(page.getByText("What should we call you?").first()).toBeVisible();
  await expect(page.getByText("Anything else?").first()).toBeVisible();
});

test("Publish button makes a form live; closing it takes it down", async ({ page, browser }) => {
  await createFromTemplate(page, "NPS survey", "E2E Publish Test");
  const slug = (await backup()).forms.find((f) => f.slug.startsWith("e2e-publish-test"))!.slug;
  const anon = await browser.newPage();
  await anon.goto(`/apply/${slug}`);
  await expect(anon.getByText("This form isn't live yet")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Live" })).toBeVisible();
  // the editor follows the new status, so saving the builder doesn't undo it
  await expect(page.getByLabel("Status")).toHaveValue("published");
  await anon.goto(`/apply/${slug}`);
  await anon.keyboard.press("Enter");
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
  const b = JSON.stringify(await backup());
  expect(b).not.toContain("hunter2-e2e");
  expect(b).not.toContain("password_hash");
});

test("results > responses: search, incomplete filter, bulk status change, CSV export", async ({ page }) => {
  const id = await formId("apply");
  await page.goto(`/forms/${id}/results/responses`);
  await expect(page.getByRole("navigation", { name: "Results" }).getByRole("link", { name: /Responses \(\d+\)/ })).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  await page.getByPlaceholder("Search answers and notes...").fill("lena@e2e.test");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Lena");
  await page.getByLabel("Select all on this page").check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByLabel("Change status of selected").selectOption("contacted");
  await expect(rows.first()).toContainText("contacted");
  await expect.poll(async () => (await responsesFor("apply")).find((r) => r.answers.em === "lena@e2e.test")?.status).toBe("contacted");
  await page.getByPlaceholder("Search answers and notes...").fill("");
  await page.locator("select").filter({ hasText: "Incomplete (quit early)" }).selectOption("partial");
  await expect(page.locator("tbody")).toContainText("Quitter");
  await page.locator("tbody tr", { hasText: "Quitter" }).click();
  await expect(page.getByRole("dialog", { name: "Lead details" })).toContainText("quitter@e2e.test");
  await page.getByPlaceholder("Call notes, objections, next step...").fill("Called, no answer");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect.poll(async () => (await responsesFor("apply")).find((r) => r.answers.em === "quitter@e2e.test")?.notes).toBe("Called, no answer");
  await page.getByRole("button", { name: "Close" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  const csv = fs.readFileSync((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toBe("apply-responses.csv");
  expect(csv.split("\n")[0]).toContain("Are you finally ready to become a profitable trader?");
  expect(csv.split("\n")[0]).not.toContain("*");
  expect(csv).toContain("lena@e2e.test");
  expect(csv).toContain("+18012345678");
  // old links still work
  await page.goto(`/forms/${id}?tab=responses`);
  await page.waitForURL(/\/results\/responses$/);
});

test("results > summary shows insights computed from real responses", async ({ page }) => {
  const id = await formId("apply");
  await page.goto(`/forms/${id}/results/summary`);
  await expect(page.getByText("Answers per question")).toBeVisible();
  await expect(page.getByText("Devices")).toBeVisible();
  await expect(page.getByText("Endings reached")).toBeVisible();
  await expect(page.getByText("Time to complete")).toBeVisible();
});

test("results > performance: at a glance + where people drop off", async ({ page }) => {
  const id = await formId("apply");
  // a visitor who opens the form, answers two questions and leaves on the third
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" } });
  const rid = `dropper-${Date.now()}`;
  for (const ev of ["view", "start"]) await ctx.post(`/api/apply/apply?event=${ev}&rid=${rid}`);
  for (const s of ["ready", "exp", "obstacle"]) await ctx.post(`/api/apply/apply?event=screen&s=${s}&rid=${rid}`);
  await ctx.dispose();

  await page.goto(`/forms/${id}/results`);
  await expect(page.getByRole("heading", { name: "Form performance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
  for (const m of ["Views", "Starts", "Submissions", "Completion rate", "Time to complete"]) {
    await expect(page.locator(`[data-metric="${m}"]`)).toBeVisible();
  }
  expect(Number((await page.locator('[data-metric="Submissions"]').innerText()).replace(/,/g, ""))).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("heading", { name: "See where users drop off" })).toBeVisible();
  const obstacle = page.locator('tr[data-question="obstacle"]');
  await expect(obstacle).toBeVisible();
  expect(Number(await obstacle.locator('[data-cell="dropoffs"]').innerText())).toBeGreaterThanOrEqual(1);
  expect(Number(await page.locator('tr[data-question="ready"] [data-cell="views"]').innerText())).toBeGreaterThanOrEqual(1);
  // filters
  await page.getByLabel("Device").selectOption("mobile");
  await page.waitForURL(/device=mobile/);
  await page.getByLabel("Date range").selectOption("7d");
  await page.waitForURL(/range=7d/);
  await expect(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
});

test("workflow, connect and share tabs", async ({ page }) => {
  const id = await formId("apply");
  await page.goto(`/forms/${id}/workflow`);
  await expect(page.getByRole("heading", { name: "Logic" })).toBeVisible();
  await expect(page.getByText(/go to/).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Low budget" })).toBeVisible();
  await page.getByRole("navigation", { name: "Form" }).getByRole("link", { name: "Connect" }).click();
  await expect(page.getByRole("heading", { name: "Calendly" })).toBeVisible();
  await page.getByLabel("Endpoint URL").fill("http://localhost/hook");
  await page.getByRole("button", { name: "Save webhook" }).click();
  await expect(page.getByText("public https:// address")).toBeVisible();
  await page.getByRole("navigation", { name: "Form" }).getByRole("link", { name: "Share" }).click();
  await expect(page.getByLabel("Your form link")).toHaveValue(/\/apply\/apply$/);
  await page.getByRole("radio", { name: /Popup/ }).click();
  await expect(page.getByLabel("Paste this code into your website")).toHaveValue(/data-mode="popup"/);
});

test("forms menu: rename, duplicate, move to a new workspace, delete", async ({ page }) => {
  await row(page, "Welcome form").getByRole("button", { name: "Actions for Welcome form" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(row(page, "Welcome form (copy)")).toBeVisible();
  expect((await backup()).forms.find((f) => f.slug.startsWith("welcome-copy"))!.status).toBe("draft");

  await row(page, "Welcome form (copy)").getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog", { name: "Rename form" }).getByLabel("Name").fill("Renamed copy");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "Renamed copy")).toBeVisible();

  await page.getByRole("button", { name: "New workspace" }).click();
  await page.getByLabel("Workspace name").fill("Archive");
  await page.getByLabel("Workspace name").press("Enter");
  await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
  await page.getByRole("link", { name: /My workspace/ }).click();
  await row(page, "Renamed copy").getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Move to" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(row(page, "Renamed copy")).toHaveCount(0);
  await page.getByRole("link", { name: /Archive/ }).click();
  await expect(row(page, "Renamed copy")).toBeVisible();

  await row(page, "Renamed copy").getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete form" }).click();
  await expect(row(page, "Renamed copy")).toHaveCount(0);
  expect((await backup()).forms.some((f) => f.slug.startsWith("welcome-copy"))).toBe(false);
});

test("contacts: every submission becomes a tagged contact; search, filter, bulk tag, lists", async ({ page }) => {
  await expect.poll(async () => (await contact("lena@e2e.test"))?.tags ?? []).toEqual(expect.arrayContaining(["Mentorship application", "Completed", "Low budget"]));
  await expect.poll(async () => (await contact("omar@e2e.test"))?.tags ?? []).toEqual(expect.arrayContaining(["Completed", "Qualified"]));
  await expect.poll(async () => (await contact("quitter@e2e.test"))?.tags ?? []).toContain("Incomplete");
  expect((await contact("lena@e2e.test"))!.first_name).toBe("Lena");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "All contacts" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "lena@e2e.test", exact: true })).toBeVisible();

  // search
  await page.getByLabel("Search contacts").fill("omar");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Search contacts").fill("");

  // filter: tag has "Low budget" -> only Lena
  await page.getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("button", { name: "+ Add condition" }).click();
  await page.getByLabel("Condition 1 field").selectOption("tag");
  await page.getByLabel("Condition 1 value").selectOption("Low budget");
  await expect(page.getByRole("cell", { name: "lena@e2e.test", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "omar@e2e.test", exact: true })).toHaveCount(0);
  // OR logic: add "tag has Qualified" with match any -> Lena and Omar
  await page.getByRole("button", { name: "+ Add condition" }).click();
  await page.getByLabel("Condition 2 field").selectOption("tag");
  await page.getByLabel("Condition 2 value").selectOption("Qualified");
  await expect(page.locator("tbody tr", { hasText: "@e2e.test" })).toHaveCount(0);
  await page.getByLabel("Match").selectOption("any");
  await expect(page.getByRole("cell", { name: "omar@e2e.test", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "lena@e2e.test", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  // bulk: select Lena, add a tag
  await page.getByLabel("Select lena@e2e.test").check();
  await page.getByRole("button", { name: /Actions/ }).click();
  await page.getByRole("menuitem", { name: "Add tag" }).click();
  await page.getByLabel("Tag", { exact: true }).fill("Follow up");
  await page.getByRole("button", { name: "Add tag" }).click();
  await expect.poll(async () => (await contact("lena@e2e.test"))?.tags ?? []).toContain("Follow up");

  // lists: create a static list and add Lena to it
  await page.getByRole("button", { name: "New contact list" }).click();
  await page.getByLabel("List name").fill("Hot leads");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: "Hot leads" })).toBeVisible();
  await page.getByRole("button", { name: /^All contacts/ }).click();
  await page.getByLabel("Select lena@e2e.test").check();
  await page.getByRole("button", { name: /Actions/ }).click();
  await page.getByRole("menuitem", { name: "Add to list" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect.poll(async () => (await contact("lena@e2e.test"))?.list_ids.length ?? 0).toBe(1);

  // contact drawer
  await page.locator("tbody tr", { hasText: "lena@e2e.test" }).getByRole("button").first().click();
  const drawer = page.getByRole("dialog", { name: "Contact lena@e2e.test" });
  await expect(drawer).toContainText("Submitted Mentorship application");
  await expect(drawer.getByLabel("Hot leads")).toBeChecked();
});

test("automations: a live automation tags new applicants", async ({ page }) => {
  await page.goto("/automations");
  await page.getByRole("link", { name: "+ Create automation" }).click();
  await page.getByLabel("Form", { exact: true }).selectOption({ label: "Mentorship application" });
  await page.getByRole("radio", { name: /Start from scratch/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/);
  await page.getByLabel("Automation name").fill("Tag VIPs");
  await page.getByRole("button", { name: "Add step" }).first().click();
  await page.getByRole("menuitem", { name: "Add tag" }).click();
  await page.getByLabel("Tag", { exact: true }).fill("Automated VIP");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Saved and turned on")).toBeVisible();

  // a brand-new applicant submits the form
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.88" } });
  const r = await ctx.post("/api/apply/apply", {
    data: {
      rid: `auto-${Date.now()}`,
      answers: { ready: "Yes, 100%. I'm ready.", exp: "I've been learning", obstacle: "Strategy", fn: "Auto", ln: "Mation", ph: "+14155550111", em: "auto@e2e.test", success: "Replace my income", budget: "$5k+ USD", hours: "Yes, I'm ready to move forward today" },
      verification: await apiToken(ctx, "auto@e2e.test"),
    },
  });
  expect(r.ok()).toBe(true);
  await ctx.dispose();
  await expect.poll(async () => (await contact("auto@e2e.test"))?.tags ?? [], { timeout: 15_000 }).toEqual(expect.arrayContaining(["Automated VIP", "Qualified"]));
  await page.reload();
  await expect(page.getByText("auto@e2e.test")).toBeVisible();
  await page.goto("/automations");
  await expect(page.getByRole("link", { name: "Tag VIPs" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Turn off" })).toBeVisible();
});

test("insights page totals every form", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mentorship application" })).toBeVisible();
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
  // imported people become contacts
  await expect.poll(async () => (await contact("ana@csv.test"))?.first_name).toBe("Ana");
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
  const [download] = await Promise.all([page.waitForEvent("download"), page.goto("/api/forms/backup?responses=1").catch(() => null)]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, "utf8"));
  expect(download.suggestedFilename()).toMatch(/^tawakkul-forms-backup-\d{4}-\d{2}-\d{2}-with-responses\.json$/);
  expect(Array.isArray(json.forms) && Array.isArray(json.responses) && Array.isArray(json.contacts)).toBe(true);
  expect(JSON.stringify(json)).not.toContain("password_hash");
});
