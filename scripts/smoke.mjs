// Safe production smoke test: reads and probes only, never creates leads.
//   node scripts/smoke.mjs https://your-site.vercel.app <published-form-slug> [admin-password]
// With the admin password it also logs in and checks the dashboard and backup.
const [base, slug, pwArg] = process.argv.slice(2);
const password = pwArg === "--env" ? process.env.ADMIN_PASSWORD : pwArg; // "--env" reads ADMIN_PASSWORD from the environment
if (!base || !slug) {
  console.error("usage: node scripts/smoke.mjs <base-url> <slug> [admin-password]");
  process.exit(2);
}
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  " + detail}`);
  if (!ok) failed++;
};
const get = (p, init = {}) => fetch(base + p, { redirect: "manual", ...init });

const login = await get("/login");
check("login page is up", login.status === 200, `HTTP ${login.status}`);
check("login cannot be framed", login.headers.get("x-frame-options") === "DENY");
check("nosniff header", login.headers.get("x-content-type-options") === "nosniff");

const form = await get(`/apply/${slug}`);
const html = await form.text();
check(`public form /apply/${slug} loads`, form.status === 200 && !html.includes("isn't live yet"), `HTTP ${form.status}${html.includes("isn't live yet") ? " (still a draft: publish it)" : ""}`);
check("form is noindex by default", /name="robots" content="noindex/.test(html));
check("password hash is not exposed", !html.includes("password_hash"));

const d = await get("/forms");
check("dashboard redirects anonymous visitors to login", d.status === 307 && (d.headers.get("location") ?? "").includes("/login"), `HTTP ${d.status}`);
for (const p of ["/api/forms/backup", "/api/forms/x/export", "/api/forms/files/abc"]) {
  const r = await get(p);
  check(`admin API ${p} hidden from anonymous visitors`, r.status === 404, `HTTP ${r.status}`);
}
const bad = await get(`/api/apply/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: {} }) });
check("an empty submission is rejected with a validation error (not stored)", bad.status === 422, `HTTP ${bad.status}`);
const junk = await get(`/api/apply/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
check("malformed JSON gets a clean 400", junk.status === 400, `HTTP ${junk.status}`);
check("unknown form is a 404", (await get("/apply/this-form-does-not-exist")).status === 404);
const robots = await (await get("/robots.txt")).text();
check("robots.txt keeps crawlers out of the admin", robots.includes("Disallow: /forms"), robots.slice(0, 60));
const embed = await get("/embed.js");
check("embed.js is served as JavaScript", (embed.headers.get("content-type") ?? "").includes("javascript"));

if (password) {
  const page = await (await get("/login")).text();
  const fd = new FormData();
  for (const [, n, v] of page.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.append(n, (v ?? "").replace(/&quot;/g, '"'));
  fd.append("password", password);
  const res = await get("/login", { method: "POST", body: fd });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  check("admin login works", res.status === 303 && cookie.startsWith("tf_session="), `HTTP ${res.status}`);
  const t = Date.now();
  const dash = await get("/forms", { headers: { cookie }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  check("dashboard loads quickly after login (database reachable)", !!dash && dash.status === 200 && Date.now() - t < 8000, dash ? `HTTP ${dash.status} in ${Date.now() - t}ms` : "timed out");
  const bk = await get("/api/forms/backup", { headers: { cookie } });
  const json = bk.ok ? await bk.json() : null;
  check("backup works and lists your forms", !!json && Array.isArray(json.forms), `HTTP ${bk.status}`);
  check("backup never contains password hashes", !!json && !JSON.stringify(json).includes("password_hash"));
}

console.log(failed === 0 ? "\nSMOKE TEST PASSED" : `\nSMOKE TEST: ${failed} problem(s)`);
process.exit(failed === 0 ? 0 : 1);
