// Exercises every function in pg-repo against a real Postgres (DATABASE_URL).
import assert from "node:assert/strict";
import * as repo from "../src/forms/pg-repo.ts";

const form = await repo.createForm({
  slug: "t-" + Date.now(),
  title: "PG test",
  fields: [{ id: "a", type: "short_text", title: "Name", required: true }],
  settings: { accent: "#ff0000" },
});
assert.equal(form.settings.accent, "#ff0000");
assert.equal(form.settings.start_label, "Start", "defaults merged");
assert.equal((await repo.getForm(form.id))?.title, "PG test");
assert.equal((await repo.getFormBySlug(form.slug))?.id, form.id);
assert.equal(await repo.getForm("not-a-uuid"), null);

const upd = await repo.updateForm(form.id, { title: "Renamed", status: "published" });
assert.equal(upd?.title, "Renamed");
assert.equal(upd?.status, "published");

await repo.bumpCounter(form.id, "views");
await repo.bumpCounter(form.id, "views");
await repo.bumpCounter(form.id, "starts");
const f2 = await repo.getForm(form.id);
assert.equal(f2?.views, 2);
assert.equal(f2?.starts, 1);

const r1 = await repo.addResponses(form.id, [
  { answers: { a: "x" }, source: "web" },
  { answers: { a: "y" }, source: "typeform", external_id: "tok1", submitted_at: "2026-01-01T00:00:00Z" },
  { answers: { a: "z" }, source: "typeform", external_id: "tok2" },
]);
assert.deepEqual(r1, { inserted: 3, skipped: 0 });
const r2 = await repo.addResponses(form.id, [
  { answers: { a: "y" }, source: "typeform", external_id: "tok1" },
  { answers: { a: "w" }, source: "typeform", external_id: "tok3" },
]);
assert.deepEqual(r2, { inserted: 1, skipped: 1 }, "re-import dedupes by external_id");

const list = await repo.listResponses(form.id);
assert.equal(list.length, 4);
assert.equal(list.at(-1)?.submitted_at.slice(0, 4), "2026");
assert.equal(typeof list[0].submitted_at, "string");

await repo.updateResponse(list[0].id, { status: "contacted", notes: "called" });
const again = (await repo.listResponses(form.id)).find((r) => r.id === list[0].id)!;
assert.equal(again.status, "contacted");
assert.equal(again.notes, "called");

await repo.deleteResponse(list[1].id);
assert.equal((await repo.listResponses(form.id)).length, 3);
assert.ok((await repo.listResponses()).length >= 3);

await repo.deleteForm(form.id);
assert.equal(await repo.getForm(form.id), null);
assert.equal((await repo.listResponses(form.id)).length, 0, "cascade delete");
console.log("pg-repo: all assertions passed");
process.exit(0);
