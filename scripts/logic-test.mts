import assert from "node:assert/strict";
import { resolvePath, nextTarget, pipe, evalCondition, computeScore, hasQuiz, SCORE } from "../src/forms/logic.ts";
import { validateSubmission } from "../src/forms/validate.ts";
import { cloneFields, flattenFields } from "../src/forms/lib.ts";
import { TEMPLATES } from "../src/forms/templates.ts";
import { sanitizeLogic } from "../src/forms/logic.ts";
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
// group screens: children validated individually, answers stay flat
const g: Field[] = [
  { id: "g", type: "group", title: "Your details", required: false, fields: [
    { id: "fn", type: "short_text", title: "First name", required: true },
    { id: "em", type: "email", title: "Email", required: true },
    { id: "ph", type: "phone", title: "Phone", required: false },
  ] },
];
let gv = validateSubmission(g, { fn: "Ana" });
assert.ok(!gv.ok && "em" in gv.errors && !("fn" in gv.errors), "group children are validated one by one");
gv = validateSubmission(g, { fn: "Ana", em: "ana@x.com" });
assert.ok(gv.ok && gv.answers.fn === "Ana" && gv.answers.em === "ana@x.com");
// conditions may read an answer inside a group
const g2: Field[] = [
  ...g,
  { id: "q", type: "short_text", title: "Q", required: false },
];
g2[0].rules = [{ id: "r", match: "any", goto: "end:default", conditions: [{ field: "em", op: "contains", value: "@vip.com" }] }];
assert.deepEqual(resolvePath(g2, { em: "a@vip.com" }).visited.map((f) => f.id), ["g"]);
assert.deepEqual(resolvePath(g2, { em: "a@x.com" }).visited.map((f) => f.id), ["g", "q"]);
// new types
const nt: Field[] = [
  { id: "l", type: "legal", title: "Accept?", required: true },
  { id: "pc", type: "picture_choice", title: "Pick", required: true, choices: ["A", "B"] },
  { id: "rk", type: "ranking", title: "Rank", required: true, choices: ["x", "y", "z"] },
];
assert.ok(!validateSubmission(nt, { l: false, pc: "A", rk: ["x", "y", "z"] }).ok, "must accept legal");
assert.ok(validateSubmission(nt, { l: true, pc: "A", rk: ["z", "x", "y"] }).ok);
assert.ok(!validateSubmission(nt, { l: true, pc: "A", rk: ["x", "y"] }).ok, "ranking must include every option");
// quiz scoring + score-based routing
const quiz: Field[] = [
  { id: "q1", type: "multiple_choice", title: "Q1", required: true, choices: ["a", "b"], points: { a: 5, b: 0 } },
  { id: "q2", type: "checkboxes", title: "Q2", required: true, choices: ["x", "y", "z"], points: { x: 2, y: 3, z: 0 },
    rules: [
      { id: "hi", match: "all", goto: "end:high", conditions: [{ field: SCORE, op: "gt", value: 6 }] },
    ] },
];
assert.ok(hasQuiz(quiz) && !hasQuiz(fields));
assert.equal(computeScore(quiz, { q1: "a", q2: ["x", "y"] }), 10);
assert.equal(nextTarget(quiz[1], quiz, { q1: "a", q2: ["x", "y"] }), "end:high");
assert.equal(nextTarget(quiz[1], quiz, { q1: "b", q2: ["x"] }), "end:default");
// duplicating a form keeps its routing working on the new ids
const copy = cloneFields(fields);
assert.ok(copy.every((c, i) => c.id !== fields[i].id), "every question gets a new id");
const cb = copy.find((c) => c.title === "Budget?")!;
assert.equal(cb.rules?.[0].conditions[0].field, cb.id, "conditions follow the new id");
assert.notEqual(cb.rules?.[0].id, fields[1].rules?.[0].id);
assert.equal(resolvePath(copy, { [copy[0].id]: "Ana", [cb.id]: "Under $500" }).ending, "lowbudget");
assert.equal(pipe(copy[2].title, copy, { [copy[0].id]: "Ana" }), "Hi Ana, hours?", "recall follows the new id");
// every template: unique ids, titles filled, logic survives sanitising, path reaches an ending
for (const t of TEMPLATES) {
  const b = t.build();
  const ids = flattenFields(b.fields).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, `${t.key}: unique ids`);
  assert.ok(flattenFields(b.fields).every((f) => f.title.trim()), `${t.key}: titles`);
  const endings = ["default", ...(b.settings.endings ?? []).map((e) => e.id)];
  const clean = sanitizeLogic(b.fields, endings);
  assert.deepEqual(clean.map((f) => f.rules?.length ?? 0), b.fields.map((f) => f.rules?.length ?? 0), `${t.key}: logic kept`);
  assert.ok(resolvePath(clean, {}).visited.length >= 1);
}
const lowApp = TEMPLATES.find((t) => t.key === "application")!.build();
const bud = lowApp.fields.find((f) => f.rules)!;
assert.equal(resolvePath(lowApp.fields, { [bud.id]: "Under $500" }).ending, "lowbudget");
const quizT = TEMPLATES.find((t) => t.key === "quiz")!.build();
const [a1, a2, a3] = quizT.fields;
assert.equal(resolvePath(quizT.fields, { [a1.id]: "Stick to the plan", [a2.id]: "Every week", [a3.id]: "Always" }).ending, "high");
assert.equal(resolvePath(quizT.fields, { [a1.id]: "Revenge trade", [a2.id]: "Never", [a3.id]: "Never" }).ending, "default");
console.log("logic: all assertions passed");
