// Throws hostile and malformed input at the public API. Nothing may crash (5xx) or store garbage.
//   node scripts/fuzz-api.mjs http://localhost:3000 <published-slug>
const [base, slug] = process.argv.slice(2);
let n = 0;
const post = async (path, body, headers = {}) => {
  // a different client address per request, so the per-IP rate limiter doesn't mask the case being tested
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(++n / 250)}.${n % 250}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
};
const cases = [
  ["not json", "{oops", 400],
  ["empty body", "", 400],
  ["answers null", { answers: null }, [200, 422]],
  ["answers array", { answers: [1, 2, 3] }, [200, 422]],
  ["answers string", { answers: "x" }, [200, 422]],
  ["__proto__ key", '{"answers":{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}}', [200, 422]],
  ["huge string answer", { answers: { zzz: "A".repeat(50_000) } }, [200, 422]],
  ["body over 100KB", { answers: { zzz: "A".repeat(150_000) } }, 413],
  ["nested objects", { answers: { a: { b: { c: [1, { d: 2 }] } } } }, [200, 422]],
  ["numeric/boolean/null mix", { answers: { a: 1, b: true, c: null, d: [null, 2, {}] } }, [200, 422]],
  ["bad rid", { rid: "../../etc/passwd", answers: {} }, [200, 422]],
  ["unicode + control chars", { answers: { a: "\u0000‮😀<script>alert(1)</script>" } }, [200, 422]],
  ["unknown ids only", { answers: { nope: "x" } }, [200, 422]],
  ["utm injection", { answers: {}, meta: { utm: { "bad key!": "x", utm_source: "y".repeat(5000) } } }, [200, 422]],
  ["duration garbage", { answers: {}, meta: { duration_s: "NaN" } }, [200, 422]],
];
let bad = 0;
for (const [name, body, want] of cases) {
  const r = await post(`/api/apply/${slug}`, body);
  const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  if (r.status >= 500 || !ok) { bad++; console.log("FAIL", name, r.status, r.text.slice(0, 120)); } else console.log("ok  ", name, r.status);
}
for (const ev of ["view", "start", "progress", "weird", ""]) {
  const r = await post(`/api/apply/${slug}?event=${ev}`, { rid: "fuzz-session-0001", answers: { x: 1 } });
  if (r.status >= 500) { bad++; console.log("FAIL event", ev, r.status); } else console.log("ok   event", JSON.stringify(ev), r.status);
}
for (const [path, method] of [[`/api/apply/does-not-exist`, "POST"], [`/api/apply/${slug}/upload`, "POST"], [`/api/forms/x/export`, "GET"], [`/api/forms/files/abc`, "GET"], [`/forms`, "GET"]]) {
  const res = await fetch(base + path, { method, body: method === "POST" ? "{}" : undefined, headers: { "content-type": "application/json" }, redirect: "manual" });
  console.log("probe", method, path, res.status);
  if (res.status >= 500) bad++;
}
console.log(bad === 0 ? "FUZZ: no server errors" : `FUZZ: ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
