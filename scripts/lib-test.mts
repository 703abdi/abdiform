import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { plainText, isPublicHttpsUrl, formatAnswer, leadIdentity, allEndings, resolveDesign, CLASSIC_BLUE, scaleRange } from "../src/forms/lib.ts";
import { RichText } from "../src/components/forms/RichText.tsx";
import { splitPhone, flag, COUNTRIES } from "../src/forms/countries.ts";
import { seededShuffle } from "../src/components/forms/inputs.tsx";
import { fileAllowed, safeFileName, parseFileAnswer, fileAnswer, MAX_FILE_BYTES } from "../src/forms/files.ts";
import { hashPassword, passwordOk, unlockToken, isUnlocked, publicSettings } from "../src/forms/access.ts";
import { createToken, verifyToken } from "../src/lib/session.ts";
import { insights, timelineAuto, formatDuration, perFormStats, overview } from "../src/forms/metrics.ts";
import type { Form, FormResponse } from "../src/forms/types.ts";
import { DEFAULT_SETTINGS } from "../src/forms/types.ts";

// ---------------- plainText
assert.equal(plainText("*Are you ready?* Hi _there_ {{field:abc}} [DM me](https://x.com)"), "Are you ready? Hi there … DM me");
assert.equal(plainText("snake_case_word stays"), "snake_case_word stays");
assert.equal(plainText("  spaced \n out "), "spaced out");

// ---------------- rich text: formatting works, nothing executable gets through
const html = renderToStaticMarkup(
  React.createElement(RichText, { text: "<script>alert(1)</script> *bold* _it_ [ok](https://a.com/x) [bad](javascript:alert(1)) [mail](mailto:a@b.co)\nline2" }),
);
assert.ok(!html.includes("<script"), "script tags are escaped, not rendered");
assert.ok(html.includes("<strong>bold</strong>") && html.includes("<em>it</em>"));
assert.ok(html.includes('href="https://a.com/x"') && html.includes('rel="noopener noreferrer"'));
assert.ok(!/href="javascript:/i.test(html), "javascript: links are never rendered as links");
assert.ok(html.includes('href="mailto:a@b.co"') && html.includes("<br/>"));

// ---------------- phone parsing
assert.deepEqual(splitPhone("+61478545589"), { iso: "AU", national: "478545589" });
assert.deepEqual(splitPhone("+14155550199"), { iso: "US", national: "4155550199" });
assert.equal(splitPhone("+447911123456")?.iso, "GB");
assert.equal(splitPhone("+18765551234")?.iso, "JM", "longest dial code wins (+1876 is Jamaica, not US)");
assert.equal(splitPhone("0478545589"), null);
assert.equal(flag("US").codePointAt(0)?.toString(16), "1f1fa");
assert.ok(COUNTRIES.length > 60 && new Set(COUNTRIES.map((c) => c.iso)).size === COUNTRIES.length);

// ---------------- shuffle: deterministic per seed, never loses or duplicates items
const items = ["a", "b", "c", "d", "e", "f"];
assert.deepEqual(seededShuffle(items, "s1"), seededShuffle(items, "s1"));
assert.deepEqual([...seededShuffle(items, "s1")].sort(), items);
assert.ok(new Set(Array.from({ length: 30 }, (_, i) => seededShuffle(items, "x" + i).join())).size > 5, "different seeds give different orders");

// ---------------- files
assert.ok(fileAllowed("id.png", "image/png") && fileAllowed("cv.pdf", "application/pdf") && fileAllowed("a.docx", ""));
assert.ok(!fileAllowed("evil.exe", "application/octet-stream") && !fileAllowed("x.svg", "image/svg+xml") && !fileAllowed("x.html", "text/html"));
assert.ok(!fileAllowed("fake.png", "text/html"), "type must agree with the extension");
assert.equal(safeFileName("../../etc/passwd"), "passwd");
assert.equal(safeFileName("C:\\Users\\me\\résumé (1).pdf"), "r_sum_ (1).pdf");
assert.ok(MAX_FILE_BYTES <= 4.5 * 1024 * 1024);
const ans = fileAnswer("0f4fe3e0-d99c-4e33-81c2-02476957f6bb", "t.png");
assert.deepEqual(parseFileAnswer(ans), { id: "0f4fe3e0-d99c-4e33-81c2-02476957f6bb", name: "t.png" });
assert.equal(parseFileAnswer("file:../../x:evil"), null);
assert.equal(parseFileAnswer(42), null);

// ---------------- URL safety (webhooks)
for (const bad of ["http://hooks.zapier.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://169.254.169.254/latest", "https://172.20.1.1/x", "https://intranet/x", "javascript:alert(1)", "nope"])
  assert.equal(isPublicHttpsUrl(bad), false, bad);
for (const good of ["https://hooks.zapier.com/hooks/catch/1/2", "https://discord.com/api/webhooks/1/x"]) assert.equal(isPublicHttpsUrl(good), true, good);

// ---------------- password gate
const form = { id: "11111111-1111-1111-1111-111111111111", settings: { ...DEFAULT_SETTINGS } } as unknown as Form;
assert.ok(passwordOk("anything", form) && isUnlocked(form, undefined), "no password set means open");
form.settings.password_hash = hashPassword("open-sesame", form.id);
assert.ok(passwordOk("open-sesame", form) && !passwordOk("Open-sesame", form) && !passwordOk("", form));
assert.notEqual(hashPassword("open-sesame", form.id), hashPassword("open-sesame", "22222222-2222-2222-2222-222222222222"), "hash is salted per form");
assert.ok(!isUnlocked(form, undefined) && !isUnlocked(form, "forged") && isUnlocked(form, unlockToken(form)));
const pub = publicSettings({ ...form.settings, access_password: "secret" });
assert.ok(!("password_hash" in pub) && !("access_password" in pub) && pub.has_password === true, "hash never reaches browsers");

// ---------------- admin session token
process.env.ADMIN_PASSWORD = "unit-test-password";
process.env.SESSION_SECRET = "unit-test-secret";
const tok = await createToken();
assert.equal(await verifyToken(tok), true);
assert.equal(await verifyToken(tok + "x"), false, "tampered signature");
assert.equal(await verifyToken("9999999999999." + tok.split(".")[1]), false, "forged expiry");
assert.equal(await verifyToken(`${Date.now() - 1000}.${tok.split(".")[1]}`), false, "expired / mismatched");
assert.equal(await verifyToken(undefined), false);
assert.equal(await verifyToken(""), false);

// ---------------- design + scale defaults
assert.deepEqual(resolveDesign({ ...DEFAULT_SETTINGS, design: {} }), CLASSIC_BLUE);
assert.equal(resolveDesign({ ...DEFAULT_SETTINGS, design: { answer: "#111111" } }).answer, "#111111");
assert.deepEqual(scaleRange({}), { lo: 0, hi: 10 });
assert.deepEqual(scaleRange({ steps: 5, start_at_one: true }), { lo: 1, hi: 5 });
assert.deepEqual(scaleRange({ steps: 99 }), { lo: 0, hi: 10 }, "steps are clamped to 5..11");

// ---------------- answers + identity
const fields = [
  { id: "g", type: "group", title: "Details", required: false, fields: [
    { id: "fn", type: "short_text", title: "First name", required: true },
    { id: "ln", type: "short_text", title: "Last name", required: true },
    { id: "ph", type: "phone", title: "Phone", required: true },
    { id: "em", type: "email", title: "Email", required: true } ] },
  { id: "lg", type: "legal", title: "OK?", required: true },
  { id: "mx", type: "matrix", title: "M", required: false, rows: ["r"], choices: ["c"] },
] as Form["fields"];
assert.deepEqual(leadIdentity({ fields }, { answers: { fn: "Ana", ln: "Lee", ph: "+15551234567", em: "ana@x.com" } }), { name: "Ana", email: "ana@x.com", phone: "+15551234567" });
assert.equal(formatAnswer(fields[1], true), "Accepted");
assert.equal(formatAnswer(fields[2], ["r::c"]), "r: c");
assert.equal(allEndings({ ...DEFAULT_SETTINGS, endings: [{ id: "x", title: "T", message: "" }] }).map((e) => e.id).join(), "default,x");

// ---------------- metrics
const day = 86_400_000;
const mk = (n: number, daysAgo: number, extra: Partial<FormResponse> = {}): FormResponse => ({
  id: "r" + n, form_id: "f", answers: { fn: "x" }, submitted_at: new Date(Date.now() - daysAgo * day).toISOString(),
  source: "web", external_id: null, status: "new", notes: "", meta: { device: "mobile", duration_s: 60, ending: "default" }, ...extra,
});
const F = { id: "f", fields, settings: DEFAULT_SETTINGS, views: 10 } as unknown as Form;
const all = [mk(1, 1), mk(2, 2), mk(3, 3, { meta: { partial: true } }), mk(4, 5, { meta: { device: "desktop", duration_s: 120, ending: "default", utm: { utm_source: "ig" } } })];
const ov = overview([F], all);
assert.equal(ov.total, 3, "partials are not counted as leads");
assert.equal(ov.partials, 1);
const ps = perFormStats(F, all);
assert.equal(ps.count, 3);
assert.equal(ps.partials, 1);
const ins = insights(F, all);
assert.equal(ins.avgSeconds, 80, "average of the three completed responses (60+60+120)/3");
assert.deepEqual(ins.devices.map((d) => d[0]).sort(), ["desktop", "mobile"]);
assert.deepEqual(ins.sources, [["ig", 1]]);
assert.equal(ins.funnel[0].answered, 4, "funnel counts people who answered each screen, including partials");
assert.equal(timelineAuto(all).title, "Leads, last 30 days");
assert.equal(timelineAuto(all).data.reduce((a, d) => a + d.count, 0), 3);
const old = [mk(5, 100), mk(6, 100), mk(7, 150)];
const oldTl = timelineAuto(old);
assert.equal(oldTl.title, "Leads per week");
assert.equal(oldTl.data.reduce((a, d) => a + d.count, 0), 3, "weekly chart keeps every lead");
assert.equal(timelineAuto([]).data.length, 30);
assert.equal(formatDuration(null), "n/a");
assert.equal(formatDuration(45), "45s");
assert.equal(formatDuration(125), "2m 5s");

console.log("lib: all assertions passed");

// ---------------- real phone validation
{
  const { normalizePhone } = await import("../src/forms/phone.ts");
  assert.equal(normalizePhone("+18012345678"), "+18012345678");
  assert.equal(normalizePhone("+4407911123456"), "+447911123456"); // UK number typed with its leading 0
  assert.equal(normalizePhone("+610478545589"), "+61478545589");
  assert.equal(normalizePhone("+11111111111"), null);
  assert.equal(normalizePhone("+1234"), null);
  assert.equal(normalizePhone("+1 (801) 234-5678"), "+18012345678");
  assert.equal(normalizePhone("call me"), null);
  console.log("phone: all assertions passed");
}

{
  const { leadTier } = await import("../src/forms/logic.ts");
  const { respondentFields, respondentSettings } = await import("../src/forms/access.ts");
  const fields = [
    { id: "b", type: "multiple_choice", title: "B", required: true, choices: ["S", "L"], points: { S: 0, L: 8 } },
    { id: "t", type: "multiple_choice", title: "T", required: true, choices: ["Y", "N"], points: { Y: 3, N: 0 } },
  ] as never;
  const form = { fields, settings: { lead_score: { hot: 10, warm: 6 } } };
  assert.deepEqual(leadTier(form, { b: "L", t: "Y" }), { tier: "hot", score: 11 });
  assert.deepEqual(leadTier(form, { b: "L", t: "N" }), { tier: "warm", score: 8 });
  assert.deepEqual(leadTier(form, { b: "S", t: "Y" }), { tier: "cold", score: 3 });
  assert.equal(leadTier({ fields, settings: {} }, { b: "L" }), null);
  // the public form never sees answer points or thresholds
  assert.equal((respondentFields(fields) as { points?: unknown }[])[0].points, undefined);
  assert.equal((respondentSettings({ lead_score: { hot: 1, warm: 0 }, notify_email: "", webhook_url: "" } as never) as { lead_score?: unknown }).lead_score, undefined);
  console.log("lead score: all assertions passed");
}
