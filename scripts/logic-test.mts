import assert from "node:assert/strict";
import { resolvePath, nextTarget, pipe, evalCondition } from "../src/forms/logic.ts";
import { validateSubmission } from "../src/forms/validate.ts";
import type { Field } from "../src/forms/types.ts";

const fields: Field[] = [
  { id: "name", type: "short_text", title: "First name", required: true },
  { id: "budget", type: "multiple_choice", title: "Budget?", required: true,
    choices: ["Under $500", "$500-$1k", "$1k-2k", "$5k+"],
    rules: [{ id: "r1", match: "any", goto: "end:lowbudget",
      conditions: [{ field: "budget", op: "any_of", value: ["Under $500", "$500-$1k"] }] }] },
  { id: "hours", type: "multiple_choice", title: "Hi {{field:name}}, hours?", required: true, choices: ["Yes", "No"] },
];

// high budget goes through every question to the default ending
let p = resolvePath(fields, { name: "Ana", budget: "$5k+", hours: "Yes" });
assert.deepEqual(p.visited.map((f) => f.id), ["name", "budget", "hours"]);
assert.equal(p.ending, "default");

// low budget jumps to its own ending and skips "hours"
p = resolvePath(fields, { name: "Ana", budget: "Under $500" });
assert.deepEqual(p.visited.map((f) => f.id), ["name", "budget"]);
assert.equal(p.ending, "lowbudget");

// server validation: skipped required question is NOT an error, and routes to the ending
let v = validateSubmission(fields, { name: "Ana", budget: "$500-$1k" });
assert.ok(v.ok && v.ending === "lowbudget", JSON.stringify(v));
// but a required question on the visited path still is
v = validateSubmission(fields, { name: "Ana", budget: "$5k+" });
assert.ok(!v.ok && "hours" in v.errors);
// answers to skipped questions are dropped (not stored)
v = validateSubmission(fields, { name: "Ana", budget: "Under $500", hours: "Yes" });
assert.ok(v.ok && !("hours" in v.answers));

// partial save keeps valid answers and ignores missing required ones
v = validateSubmission(fields, { name: "Ana", budget: "bogus-choice" }, { partial: true });
assert.ok(v.ok && v.answers.name === "Ana" && !("budget" in v.answers));

// "otherwise" and ordering
const f2: Field[] = [
  { id: "a", type: "yes_no", title: "A", required: false, otherwise: "c" },
  { id: "b", type: "short_text", title: "B", required: false },
  { id: "c", type: "short_text", title: "C", required: false },
];
assert.deepEqual(resolvePath(f2, {}).visited.map((f) => f.id), ["a", "c"]);
assert.equal(nextTarget(f2[2], f2, {}), "end:default");

// backward jump cannot loop forever
const loop: Field[] = [
  { id: "a", type: "short_text", title: "A", required: false },
  { id: "b", type: "short_text", title: "B", required: false, otherwise: "a" },
];
assert.deepEqual(resolvePath(loop, {}).visited.map((f) => f.id), ["a", "b"]);

// conditions
assert.ok(evalCondition({ field: "x", op: "is", value: "Yes" }, { x: true } as never) === false);
assert.ok(evalCondition({ field: "x", op: "contains", value: "tra" }, { x: ["Extra", "y"] }));
assert.ok(evalCondition({ field: "x", op: "gt", value: 7 }, { x: 9 }));
assert.ok(evalCondition({ field: "x", op: "lt", value: 7 }, { x: 0 }));
assert.ok(evalCondition({ field: "x", op: "not_answered" }, {}));
assert.ok(evalCondition({ field: "x", op: "none_of", value: ["a"] }, { x: "b" }));

// recall
assert.equal(pipe(fields[2].title, fields, { name: "Ana" }), "Hi Ana, hours?");
assert.equal(pipe(fields[2].title, fields, {}), "Hi , hours?");
console.log("logic: all assertions passed");
