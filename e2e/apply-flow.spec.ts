import { expect, test } from "@playwright/test";
import { answerChoice, fillContact, onQuestion, responsesFor } from "./helpers";

async function toBudget(page: import("@playwright/test").Page, who: { fn: string; ln: string; phone: string; email: string }) {
  await page.goto("/apply/apply");
  await onQuestion(page, "Are you finally ready");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "a", "main obstacle");
  await answerChoice(page, "a", "reach out");
  await fillContact(page, who);
  await page.getByRole("button", { name: "OK" }).click();
  await onQuestion(page, "what would success look like");
  await answerChoice(page, "b", "How much can you set aside");
}

const row = async (email: string) => (await responsesFor("apply")).find((r) => r.answers.em === email)!;

test("low budget goes to the Trading Room ending and skips the last question", async ({ page }) => {
  await toBudget(page, { fn: "Lena", ln: "Okafor", phone: "8012345678", email: "lena@e2e.test" });
  await onQuestion(page, "set aside, Lena"); // recall of the first name works
  await page.keyboard.press("a"); // Under $500
  await expect(page.locator(".tfr-title")).toContainText("needs more capital");
  await expect(page.getByRole("link", { name: "See what's inside." })).toHaveAttribute("href", "https://whop.com/example/");
  const r = await row("lena@e2e.test");
  expect(r.answers.hours).toBeUndefined(); // skipped question is not stored
  expect(r.meta.ending).toBe("lowbudget");
  expect(r.meta.partial).toBe(false);
  expect(r.answers.ph).toBe("+18012345678");
});

test("budget but no time still reaches the booking page with Calendly prefilled", async ({ page }) => {
  await toBudget(page, { fn: "Omar", ln: "Hassan", phone: "4155550199", email: "omar@e2e.test" });
  await page.keyboard.press("e"); // $5k+
  await onQuestion(page, "can you commit");
  await page.keyboard.press("b"); // No time
  await expect(page.locator(".tfr-title")).toContainText("Schedule your 1-1 call");
  const src = await page.locator("iframe.tfr-calendly").getAttribute("src");
  expect(src).toContain("https://calendly.com/abdiyassin/1on1");
  expect(src).toContain("name=Omar");
  expect(src).toContain("email=omar%40e2e.test");
  // rich text in the ending: a real link, not raw markdown
  await expect(page.getByRole("link", { name: "DM me" })).toHaveAttribute("href", "https://instagram.com/x");
  const r = await row("omar@e2e.test");
  expect(r.meta.ending).toBe("default");
  expect(r.answers.hours).toContain("No, I don't");
  expect(typeof r.meta.duration_s).toBe("number");
  expect(r.meta.device).toBe("desktop");
});

test("required fields and formats are enforced with friendly messages", async ({ page }) => {
  await page.goto("/apply/apply");
  await page.getByRole("button", { name: "OK" }).click(); // nothing chosen
  await expect(page.locator(".tfr-err")).toContainText("Please fill this in");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "a", "main obstacle");
  await answerChoice(page, "a", "reach out");
  await page.getByRole("button", { name: "OK" }).click(); // empty contact group
  await expect(page.locator(".tfr-err").first()).toBeVisible();
  await fillContact(page, { fn: "A", ln: "B", phone: "123", email: "not-an-email" });
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tfr-err").first()).toContainText(/phone number doesn't look right/);
  await page.getByLabel("Phone number", { exact: true }).fill("4155550199");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tfr-err").first()).toContainText(/email doesn't look right/);
});

test("Back keeps the earlier answers and follows the same path", async ({ page }) => {
  await page.goto("/apply/apply");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "b", "main obstacle");
  await page.getByRole("button", { name: "Previous question" }).click();
  await onQuestion(page, "Which best describes");
  await expect(page.getByRole("radio", { name: "I've been learning" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Previous question" }).click();
  await onQuestion(page, "Are you finally ready");
  await expect(page.getByRole("button", { name: "Previous question" })).toBeDisabled();
});

test("refreshing mid-form resumes where the applicant left off", async ({ page }) => {
  await page.goto("/apply/apply");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "c", "main obstacle");
  await page.reload();
  await onQuestion(page, "main obstacle");
  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(page.getByRole("radio", { name: "I've taken trades before" })).toHaveAttribute("aria-checked", "true");
});

test("an applicant who quits halfway is still captured as an incomplete lead", async ({ page }) => {
  await page.goto("/apply/apply");
  await answerChoice(page, "a", "Which best describes");
  await answerChoice(page, "a", "main obstacle");
  await answerChoice(page, "a", "reach out");
  await fillContact(page, { fn: "Quitter", ln: "Q", phone: "4155550100", email: "quitter@e2e.test" });
  await page.getByRole("button", { name: "OK" }).click();
  await onQuestion(page, "what would success look like");
  // simulate closing the tab: the page reports it is hidden
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await row("quitter@e2e.test"))?.meta?.partial, { timeout: 8000 }).toBe(true);
  const r = await row("quitter@e2e.test");
  expect(r.answers.fn).toBe("Quitter");
});

test("a draft form is not reachable and an unknown form is a 404", async ({ page }) => {
  await page.goto("/apply/draft");
  await expect(page.getByText("This form isn't live yet")).toBeVisible();
  expect((await page.goto("/apply/does-not-exist"))?.status()).toBe(404);
});

test("the welcome screen shows the time estimate and starts on Enter", async ({ page }) => {
  await page.goto("/apply/welcome");
  await expect(page.getByRole("heading", { name: "Join us" })).toBeVisible();
  await expect(page.getByText("Takes 1 minute")).toBeVisible();
  await page.keyboard.press("Enter");
  await onQuestion(page, "What is your name?");
});

test("UTM parameters from the link are saved with the response", async ({ page }) => {
  await page.goto("/apply/welcome?utm_source=instagram&utm_campaign=autumn&evil=<b>x</b>");
  await page.keyboard.press("Enter");
  await page.getByLabel("What is your name?").fill("Utm Person");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Thanks/ })).toBeVisible();
  const r = (await responsesFor("welcome")).find((x) => x.answers.n === "Utm Person")!;
  expect(r.meta.utm).toEqual({ utm_source: "instagram", utm_campaign: "autumn" });
});
