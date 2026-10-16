// Contact filter logic, shared by the Contacts page, smart lists and automations.

import type { Contact, ContactFilter, FilterField, FilterOp, FilterRule } from "@/contacts/types";

const DAY = 86_400_000;

const lc = (s: string | undefined | null) => (s ?? "").toString().trim().toLowerCase();

function textOp(actual: string, op: FilterOp, want: string): boolean {
  const a = lc(actual);
  const w = lc(want);
  switch (op) {
    case "contains":
      return w === "" ? true : a.includes(w);
    case "not_contains":
      return w === "" ? true : !a.includes(w);
    case "is":
      return a === w;
    case "is_not":
      return a !== w;
    case "is_empty":
      return a === "";
    case "is_not_empty":
      return a !== "";
    default:
      return false;
  }
}

function dateOp(actualIso: string, op: FilterOp, want: string, now: number): boolean {
  const t = Date.parse(actualIso);
  if (!Number.isFinite(t)) return false;
  if (op === "in_last_days") {
    const n = Number(want);
    return Number.isFinite(n) && now - t <= n * DAY;
  }
  const w = Date.parse(want.length === 10 ? `${want}T00:00:00Z` : want);
  if (!Number.isFinite(w)) return true; // incomplete rule: don't filter anything out yet
  if (op === "before") return t < w;
  if (op === "after") return t >= w + (want.length === 10 ? DAY : 0);
  if (op === "is") return actualIso.slice(0, 10) === want.slice(0, 10);
  return false;
}

export function ruleMatches(c: Contact, r: FilterRule, now = Date.now()): boolean {
  const v = r.value ?? "";
  const field: FilterField = r.field;
  if (field.startsWith("property:")) return textOp(c.properties[field.slice(9)] ?? "", r.op, v);
  switch (field) {
    case "name":
      return textOp(`${c.first_name} ${c.last_name}`.trim(), r.op, v);
    case "email":
      return textOp(c.email, r.op, v);
    case "phone":
      return textOp(c.phone, r.op, v);
    case "tag": {
      const has = c.tags.some((t) => lc(t) === lc(v));
      if (r.op === "is_empty") return c.tags.length === 0;
      if (r.op === "is_not_empty") return c.tags.length > 0;
      return r.op === "has_not" ? !has : has;
    }
    case "list": {
      const has = c.list_ids.includes(v);
      return r.op === "has_not" ? !has : has;
    }
    case "subscribed":
      return (v === "yes") === c.subscribed;
    case "source_form":
      return r.op === "is_not" ? c.source_form_id !== v : c.source_form_id === v;
    case "created_at":
      return dateOp(c.created_at, r.op, v, now);
    case "last_activity_at":
      return dateOp(c.last_activity_at, r.op, v, now);
    case "responses": {
      const n = Number(v);
      if (!Number.isFinite(n)) return true;
      if (r.op === "gt") return c.response_count > n;
      if (r.op === "lt") return c.response_count < n;
      return c.response_count === n;
    }
  }
  return true;
}

export function matchesFilter(c: Contact, f: ContactFilter | null | undefined, now = Date.now()): boolean {
  if (!f || f.rules.length === 0) return true;
  return f.match === "any" ? f.rules.some((r) => ruleMatches(c, r, now)) : f.rules.every((r) => ruleMatches(c, r, now));
}

/** Which operators make sense for each field (drives the filter editor). */
export function opsFor(field: FilterField): FilterOp[] {
  if (field.startsWith("property:")) return ["contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty"];
  switch (field) {
    case "tag":
      return ["has", "has_not", "is_empty", "is_not_empty"];
    case "list":
      return ["has", "has_not"];
    case "subscribed":
      return ["is"];
    case "source_form":
      return ["is", "is_not"];
    case "created_at":
    case "last_activity_at":
      return ["in_last_days", "before", "after", "is"];
    case "responses":
      return ["gt", "lt", "is"];
    default:
      return ["contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty"];
  }
}

export const OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  not_contains: "doesn't contain",
  is: "is",
  is_not: "is not",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  has: "has",
  has_not: "doesn't have",
  before: "is before",
  after: "is after",
  in_last_days: "is in the last (days)",
  gt: "is more than",
  lt: "is less than",
};

export const needsValue = (op: FilterOp) => op !== "is_empty" && op !== "is_not_empty";
