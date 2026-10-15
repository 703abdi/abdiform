const base = process.argv[2];
const page = await (await fetch(`${base}/login`)).text();
const fd = new FormData();
for (const [, n, v] of page.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.append(n, (v ?? "").replace(/&quot;/g, '"'));
fd.append("password", process.env.ADMIN_PASSWORD);
const res = await fetch(`${base}/login`, { method: "POST", body: fd, redirect: "manual" });
const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
for (const path of ["/api/forms/00000000-0000-0000-0000-000000000000/export", "/apply/nope", "/forms/00000000-0000-0000-0000-000000000000"]) {
  const t = Date.now();
  try {
    const r = await fetch(base + path, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    await r.text();
    console.log(path, "->", r.status, `${Date.now() - t}ms`);
  } catch (e) { console.log(path, "-> FAILED", e.name, `${Date.now() - t}ms`); }
}
