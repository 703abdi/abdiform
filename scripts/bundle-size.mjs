// Measures what an applicant downloads for the public form (JS + CSS, gzip), via a real browser.
import { chromium } from "@playwright/test";
import zlib from "node:zlib";
const base = process.argv[2] ?? "http://localhost:3100";
const path = process.argv[3] ?? "/apply/apply";
const browser = await chromium.launch();
const page = await browser.newPage();
let js = 0, css = 0, files = 0;
page.on("response", async (r) => {
  const t = r.headers()["content-type"] ?? "";
  if (!/javascript|css/.test(t)) return;
  const body = await r.body().catch(() => null);
  if (!body) return;
  const gz = zlib.gzipSync(body).length;
  files++;
  if (/css/.test(t)) css += gz; else js += gz;
});
const t0 = Date.now();
await page.goto(base + path, { waitUntil: "networkidle" });
await page.locator(".tfr-title, h1").first().waitFor();
console.log(`${path}: ${files} files, JS ${(js / 1024).toFixed(0)} KB + CSS ${(css / 1024).toFixed(0)} KB (gzip), interactive in ${Date.now() - t0} ms (local)`);
await browser.close();
