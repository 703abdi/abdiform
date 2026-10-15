import { expect, test } from "@playwright/test";
import { onQuestion, responsesFor } from "./helpers";

// A tiny valid PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("every question type works end to end and is stored correctly", async ({ page }) => {
  await page.goto("/apply/widgets");

  // opinion scale 1-5 with labels
  await onQuestion(page, "How satisfied");
  await expect(page.getByRole("radio")).toHaveCount(5);
  await expect(page.getByText("Very")).toBeVisible();
  await page.getByRole("radio", { name: "3", exact: true }).click();

  // segmented date (DD / MM / YYYY): fast typing spills into the next segments
  await onQuestion(page, "When did you start");
  await page.getByPlaceholder("DD").pressSequentially("15032023");
  await expect(page.getByPlaceholder("MM")).toHaveValue("03");
  await expect(page.getByPlaceholder("YYYY")).toHaveValue("2023");
  await page.keyboard.press("Enter");

  // searchable dropdown
  await onQuestion(page, "Which country");
  await page.getByRole("combobox").fill("un");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // picks "United States"
  await expect(page.getByRole("combobox")).toHaveValue("United States");
  await page.getByRole("button", { name: "OK" }).click();

  // checkboxes: max 2, "None of the above" is exclusive
  await onQuestion(page, "Which markets");
  await page.keyboard.press("a");
  await page.keyboard.press("b");
  await page.keyboard.press("c"); // a third pick is refused
  await expect(page.locator('.tfr-ch[aria-pressed="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "None of the above" }).click();
  await expect(page.locator('.tfr-ch[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Forex" }).click();
  await expect(page.locator('.tfr-ch[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Gold" }).click();
  await page.getByRole("button", { name: "OK" }).click();

  // matrix: every row required
  await onQuestion(page, "Rate each area");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tfr-err")).toBeVisible();
  await page.getByRole("radio", { name: "Strategy: Weak" }).click();
  await page.getByRole("radio", { name: "Discipline: Strong" }).click();
  await page.getByRole("button", { name: "OK" }).click();

  // number: range enforced
  await onQuestion(page, "How old are you");
  await page.getByLabel("How old are you?").fill("17");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tfr-err")).toContainText("at least 18");
  await page.getByLabel("How old are you?").fill("30");
  await page.getByRole("button", { name: "OK" }).click();

  // ranking: reorder with the arrows
  await onQuestion(page, "Rank these");
  await page.getByRole("button", { name: "Move Three up" }).click();
  await page.getByRole("button", { name: "Move Three up" }).click();
  await page.getByRole("button", { name: "OK" }).click();

  // rating auto-advances
  await onQuestion(page, "Rate us");
  await page.getByRole("radio", { name: "4 of 5" }).click();

  // legal consent: declining does not advance, accepting does
  await onQuestion(page, "I agree to be contacted");
  await page.getByRole("radio", { name: "I don't accept" }).click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tfr-err")).toBeVisible();
  await page.keyboard.press("y");

  // file upload
  await onQuestion(page, "Upload your ID");
  await page.locator('input[type="file"]').setInputFiles({ name: "id-card.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("id-card.png")).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();

  // long text with a character limit, optional, then submit
  await onQuestion(page, "Tell us more");
  await page.getByLabel("Tell us more").fill("x".repeat(41));
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".tfr-err")).toContainText("under 40");
  await page.getByLabel("Tell us more").fill("All good");
  await expect(page.getByText("8 / 40")).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: /Thanks/ })).toBeVisible();

  const [r] = await responsesFor("widgets");
  expect(r.answers.scale).toBe(3);
  expect(r.answers.date).toBe("2023-03-15");
  expect(r.answers.country).toBe("United States");
  expect(r.answers.markets).toEqual(["Forex", "Gold"]); // "None of the above" was cleared by picking real options
  expect(r.answers.matrix).toEqual(["Strategy::Weak", "Discipline::Strong"]);
  expect(r.answers.age).toBe(30);
  expect(r.answers.rank).toEqual(["Three", "One", "Two"]);
  expect(r.answers.stars).toBe(4);
  expect(r.answers.legal).toBe(true);
  expect(String(r.answers.file)).toMatch(/^file:[0-9a-f-]{36}:id-card\.png$/);
  expect(r.answers.more).toBe("All good");
  expect(r.meta.partial).toBe(false);
});

test("an uploaded file is downloadable by the admin and identical to what was sent", async ({ request }) => {
  const [r] = await responsesFor("widgets");
  const id = String(r.answers.file).split(":")[1];
  const authed = await (await import("@playwright/test")).request.newContext({ baseURL: "http://localhost:3100", storageState: "e2e/.auth.json" });
  const res = await authed.get(`/api/forms/files/${id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["content-security-policy"]).toContain("sandbox");
  expect(Buffer.from(await res.body()).equals(PNG)).toBe(true);
  // anonymous visitors cannot see it
  expect((await request.get(`/api/forms/files/${id}`)).status()).toBe(404);
});

test("uploads reject dangerous files and oversized files", async ({ request }) => {
  const evil = await request.post("/api/apply/widgets/upload", { multipart: { file: { name: "evil.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } }, headers: { "x-forwarded-for": "203.0.113.20" } });
  expect(evil.status()).toBe(415);
  const html = await request.post("/api/apply/widgets/upload", { multipart: { file: { name: "x.html", mimeType: "text/html", buffer: Buffer.from("<script>1</script>") } }, headers: { "x-forwarded-for": "203.0.113.20" } });
  expect(html.status()).toBe(415);
  const big = await request.post("/api/apply/widgets/upload", { multipart: { file: { name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4.3 * 1024 * 1024) } }, headers: { "x-forwarded-for": "203.0.113.20" } });
  expect(big.status()).toBe(413);
  const noFileField = await request.post("/api/apply/apply/upload", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } }, headers: { "x-forwarded-for": "203.0.113.20" } });
  expect(noFileField.status()).toBe(400); // form without a file question
});
