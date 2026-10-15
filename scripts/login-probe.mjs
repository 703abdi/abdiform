// Logs in to a deployed instance using ADMIN_PASSWORD from the env, then times the dashboard.
// Prints statuses/timings only, never secrets.   node --env-file=.env.local scripts/login-probe.mjs https://site
const base = process.argv[2];
const t0 = Date.now();
const page = await (await fetch(`${base}/login`)).text();
const hidden = [...page.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)];
const fd = new FormData();
for (const [, name, value] of hidden) fd.append(name, (value ?? "").replace(/&quot;/g, '"'));
fd.append("password", process.env.ADMIN_PASSWORD);
const res = await fetch(`${base}/login`, { method: "POST", body: fd, redirect: "manual", signal: AbortSignal.timeout(30000) });
const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
console.log("login POST:", res.status, "cookie set:", cookie.startsWith("tf_session="), `(${Date.now() - t0}ms)`);
console.log("redirect header:", res.headers.get("x-action-redirect") ?? res.headers.get("location"));
for (const path of ["/forms", "/forms/import"]) {
  const t = Date.now();
  try {
    const r = await fetch(base + path, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    const body = await r.text();
    const err = body.match(/Application error[^<]*|digest[^<]{0,80}|Error:[^<]{0,160}/)?.[0];
    console.log(path, "->", r.status, `${Date.now() - t}ms`, err ? `ERROR: ${err}` : "ok", "| title:", (body.match(/<title>([^<]*)/) || [])[1]);
  } catch (e) {
    console.log(path, "-> FAILED", e.name, `${Date.now() - t}ms`);
  }
}
