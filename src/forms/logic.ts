// Branching logic shared by the browser (to navigate) and the server (to know
// which questions were actually shown, so skipped ones aren't "required").

import type { AnswerValue, Answers, Condition, Field, Rule } from "@/forms/types";
import { DEFAULT_ENDING } from "@/forms/types";
import { flattenFields, isEmptyAnswer } from "@/forms/lib";

/** Virtual answer holding the running quiz score, usable in logic conditions. */
export const SCORE = "__score";
export const endTarget = (id: string) => `end:${id}`;
export const isEnd = (t: string) => t.startsWith("end:");
export const endingId = (t: string) => t.slice(4);

function asList(v: AnswerValue | undefined): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (isEmptyAnswer(v)) return [];
  return [String(v)];
}

export function evalCondition(c: Condition, answers: Answers): boolean {
  const v = answers[c.field];
  const have = asList(v);
  const want = Array.isArray(c.value) ? c.value.map(String) : c.value === undefined ? [] : [String(c.value)];
  switch (c.op) {
    case "answered":
      return !isEmptyAnswer(v) || typeof v === "boolean";
    case "not_answered":
      return isEmptyAnswer(v) && typeof v !== "boolean";
    case "is":
      return want.length > 0 && have.length > 0 && have.some((h) => want[0] === h);
    case "is_not":
      return !(want.length > 0 && have.some((h) => want[0] === h));
    case "any_of":
      return have.some((h) => want.includes(h));
    case "none_of":
      return !have.some((h) => want.includes(h));
    case "contains":
      return have.some((h) => h.toLowerCase().includes((want[0] ?? "").toLowerCase()) && want[0] !== "");
    case "gt":
      return typeof v !== "undefined" && Number(v) > Number(want[0]);
    case "lt":
      return typeof v !== "undefined" && v !== null && Number(v) < Number(want[0]);
  }
}

/** Quiz score: the sum of the points of every chosen answer. 0 when no question has points. */
export function computeScore(fields: Field[], answers: Answers): number {
  let total = 0;
  for (const f of flattenFields(fields)) {
    if (!f.points) continue;
    const v = answers[f.id];
    for (const x of Array.isArray(v) ? v : v === undefined || v === null ? [] : [String(v)]) total += f.points[String(x)] ?? 0;
  }
  return total;
}

export const hasQuiz = (fields: Field[]): boolean =>
  flattenFields(fields).some((f) => f.points && Object.values(f.points).some((p) => p !== 0));

export function ruleMatches(r: Rule, answers: Answers): boolean {
  if (r.conditions.length === 0) return false;
  return r.match === "any"
    ? r.conditions.some((c) => evalCondition(c, answers))
    : r.conditions.every((c) => evalCondition(c, answers));
}

/** Where to go after answering `field`: a question id or "end:<id>". */
export function nextTarget(field: Field, fields: Field[], raw: Answers): string {
  const answers: Answers = (field.rules ?? []).some((r) => r.conditions.some((c) => c.field === SCORE))
    ? { ...raw, [SCORE]: computeScore(fields, raw) }
    : raw;
  for (const r of field.rules ?? []) if (ruleMatches(r, answers)) return r.goto;
  if (field.otherwise) return field.otherwise;
  const i = fields.findIndex((f) => f.id === field.id);
  return i >= 0 && i < fields.length - 1 ? fields[i + 1].id : endTarget(DEFAULT_ENDING);
}

/** Walk the form from the first question following the rules. */
export function resolvePath(
  fields: Field[],
  answers: Answers,
): { visited: Field[]; ending: string } {
  const visited: Field[] = [];
  const seen = new Set<string>();
  let cur: Field | undefined = fields[0];
  let ending = DEFAULT_ENDING;
  while (cur) {
    if (seen.has(cur.id)) break; // a backward jump would loop forever
    seen.add(cur.id);
    visited.push(cur);
    const t = nextTarget(cur, fields, answers);
    if (isEnd(t)) {
      ending = endingId(t);
      break;
    }
    cur = fields.find((f) => f.id === t);
    if (!cur) break;
  }
  return { visited, ending };
}

/** Replace {{field:ID}} with the applicant's answer (empty if none yet). */
export function pipe(text: string, fields: Field[], answers: Answers): string {
  return text.replace(/\{\{field:([^}]+)\}\}/g, (_, id: string) => {
    const f = fields.find((x) => x.id === id);
    const v = answers[id];
    if (!f || isEmptyAnswer(v)) return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}

/**
 * Drop logic that points at things that no longer exist (deleted questions or
 * endings) so a saved form can never route an applicant into a dead end.
 */
export function sanitizeLogic(fields: Field[], endingIds: string[]): Field[] {
  const ids = new Set(fields.map((f) => f.id)); // screens you can jump to
  const inputIds = new Set(flattenFields(fields).map((f) => f.id)); // answers conditions can read
  const ends = new Set(endingIds);
  const okTarget = (t: string | undefined) =>
    !!t && (isEnd(t) ? ends.has(endingId(t)) : ids.has(t));
  return fields.map((f) => {
    const rules = (f.rules ?? [])
      .map((r) => ({ ...r, conditions: r.conditions.filter((c) => inputIds.has(c.field) || c.field === SCORE) }))
      .filter((r) => r.conditions.length > 0 && okTarget(r.goto));
    const out: Field = { ...f };
    if (rules.length) out.rules = rules;
    else delete out.rules;
    if (!okTarget(f.otherwise)) delete out.otherwise;
    return out;
  });
}
