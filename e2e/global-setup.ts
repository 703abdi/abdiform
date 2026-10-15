import { chromium, type FullConfig } from "@playwright/test";
import { ADMIN_PASSWORD } from "./helpers";

// Logs in once and stores the session so API-level checks can read data as the admin.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/forms");
  await page.context().storageState({ path: "e2e/.auth.json" });
  await browser.close();
}
