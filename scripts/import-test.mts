import assert from "node:assert/strict";
import { parseCsv, fieldsFromCsv, rowsToResponses, mapDefinition, mapItem, parseFormId } from "../src/forms/typeform.ts";

// --- CSV (Typeform "Download responses" shape)
const csv =
  '#,Full name,Email,What do you trade?,Start Date (UTC),Submit Date (UTC),Network ID,Token\n' +
  '1,Ana Lee,ana@x.com,"Forex, Gold",2026-01-01 10:00:00,2026-01-01 10:02:00,abc,tok1\n' +
  '2,Bo,bo@x.com,Stocks,2026-01-02 10:00:00,2026-01-02 10:03:00,def,tok2\n';
const { headers, rows } = parseCsv(csv);
const fields = fieldsFromCsv(headers, rows);
assert.deepEqual(fields.map((f) => `${f.type}:${f.title}`), ["short_text:Full name", "email:Email", "short_text:What do you trade?"]);
const resp = rowsToResponses(rows, fields);
assert.equal(resp.length, 2);
assert.equal(resp[0].external_id, "tok1");
assert.equal(resp[0].submitted_at, "2026-01-01T10:02:00.000Z");
assert.equal(Object.values(resp[0].answers)[2], "Forex, Gold");

// --- API definition + response
const def = {
  id: "x", title: "T",
  fields: [
    { id: "a", type: "short_text", title: "Name", validations: { required: true } },
    { id: "g", type: "group", properties: { fields: [
      { id: "b", type: "multiple_choice", title: "Pick", properties: { allow_multiple_selection: true, choices: [{ label: "X" }, { label: "Y" }] } },
      { id: "n", type: "opinion_scale", title: "Score" },
    ] } },
    { id: "c", type: "phone_number", title: "Phone" },
    { id: "ci", type: "contact_info", title: "Contact", properties: { fields: [
      { id: "fn", type: "short_text", title: "First name" },
      { id: "em", type: "email", title: "Email" },
    ] } },
    { id: "cal", type: "calendly", title: "Schedule your call" },
    { id: "bold", type: "short_text", title: "*Which best describes you?*" },
    { id: "d", type: "multiple_choice", title: "Exp", properties: { allow_other_choice: true, choices: [{ label: "New" }] } },
  ],
};
const f = mapDefinition(def as never);
assert.deepEqual(f.map((x) => x.type), ["short_text", "checkboxes", "scale", "phone", "short_text", "email", "short_text", "multiple_choice"]);
assert.ok(!f.some((x) => x.title.includes("Schedule")), "calendly embed skipped");
assert.equal(f.find((x) => x.id === "bold")?.title, "Which best describes you?");
assert.equal(f[0].required, true);
assert.equal(f.find((x) => x.id === "d")?.allow_other, true);
const item = mapItem({
  token: "T1", submitted_at: "2026-01-01T00:00:00Z",
  calculated: { score: 7 },
  metadata: { user_agent: "UA", referer: "https://ig.com" }, hidden: { utm_source: "ig" },
  answers: [
    { field: { id: "a" }, type: "text", text: "Ana" },
    { field: { id: "b" }, type: "choices", choices: { labels: ["X"], other: "Z" } },
    { field: { id: "n" }, type: "number", number: 9 },
    { field: { id: "c" }, type: "phone_number", phone_number: "+15551234567" },
    { field: { id: "d" }, type: "choice", choice: { other: "Pro" } },
    { field: { id: "zzz" }, type: "text", text: "ignored (unknown field)" },
  ],
}, f)!;
assert.deepEqual(item.answers, { a: "Ana", b: ["X", "Z"], n: 9, c: "+15551234567", d: "Pro" });
assert.equal(item.external_id, "T1");
assert.equal(item.meta?.score, 7);
assert.equal(item.meta?.referrer, "https://ig.com");
assert.deepEqual(item.meta?.utm, { utm_source: "ig" });

assert.equal(parseFormId("https://form.typeform.com/to/BdLm6Q9g"), "BdLm6Q9g");
assert.equal(parseFormId("https://yourname.typeform.com/to/BdLm6Q9g?typeform-source=x"), "BdLm6Q9g");
assert.equal(parseFormId("BdLm6Q9g"), "BdLm6Q9g");
console.log("typeform import mapping: all assertions passed");
