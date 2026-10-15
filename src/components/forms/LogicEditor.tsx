"use client";

import { Button, Input, Select } from "@/components/ui";
import { newId } from "@/forms/lib";
import { endTarget } from "@/forms/logic";
import type { Condition, Ending, Field, Op, Rule } from "@/forms/types";
import { hasChoices } from "@/forms/types";

const OP_LABEL: Record<Op, string> = {
  is: "is",
  is_not: "is not",
  any_of: "is any of",
  none_of: "is none of",
  contains: "contains",
  gt: "is greater than",
  lt: "is less than",
  answered: "is answered",
  not_answered: "is not answered",
};

function opsFor(f: Field | undefined): Op[] {
  if (!f) return ["is"];
  if (hasChoices(f.type)) return ["any_of", "none_of", "is", "is_not", "answered", "not_answered"];
  if (f.type === "yes_no") return ["is", "is_not", "answered", "not_answered"];
  if (f.type === "number" || f.type === "rating" || f.type === "scale")
    return ["gt", "lt", "is", "is_not", "answered", "not_answered"];
  return ["contains", "is", "is_not", "answered", "not_answered"];
}

function ValueInput({ f, c, onChange }: { f: Field | undefined; c: Condition; onChange: (v: Condition["value"]) => void }) {
  if (c.op === "answered" || c.op === "not_answered") return null;
  if (f && hasChoices(f.type) && (c.op === "any_of" || c.op === "none_of")) {
    const sel = Array.isArray(c.value) ? c.value : [];
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(f.choices ?? []).map((ch) => (
          <label key={ch} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sel.includes(ch)}
              onChange={(e) => onChange(e.target.checked ? [...sel, ch] : sel.filter((x) => x !== ch))}
            />
            {ch}
          </label>
        ))}
      </div>
    );
  }
  if (f && hasChoices(f.type))
    return (
      <Select value={typeof c.value === "string" ? c.value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an answer...</option>
        {(f.choices ?? []).map((ch) => (
          <option key={ch} value={ch}>{ch}</option>
        ))}
      </Select>
    );
  if (f?.type === "yes_no")
    return (
      <Select value={String(c.value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose...</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  const numeric = f && (f.type === "number" || f.type === "rating" || f.type === "scale");
  return (
    <Input
      type={numeric ? "number" : "text"}
      value={typeof c.value === "string" || typeof c.value === "number" ? c.value : ""}
      onChange={(e) => onChange(numeric && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
      placeholder="Value"
    />
  );
}

export function LogicEditor({
  field,
  fields,
  endings,
  onChange,
}: {
  field: Field;
  fields: Field[];
  endings: Ending[];
  onChange: (p: Partial<Field>) => void;
}) {
  const rules = field.rules ?? [];
  const labelOf = (f: Field) => (f.title.trim() || "Untitled question").slice(0, 60);
  const setRules = (r: Rule[]) => onChange({ rules: r });
  const patchRule = (id: string, p: Partial<Rule>) => setRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const destinations = (
    <>
      {fields
        .filter((f) => f.id !== field.id)
        .map((f) => (
          <option key={f.id} value={f.id}>Question: {labelOf(f)}</option>
        ))}
      {endings.map((e, i) => (
        <option key={e.id} value={endTarget(e.id)}>
          {i === 0 ? "Default ending" : `Ending: ${e.title.slice(0, 40) || e.id}`}
        </option>
      ))}
    </>
  );

  function patchCond(r: Rule, idx: number, p: Partial<Condition>) {
    patchRule(r.id, { conditions: r.conditions.map((c, i) => (i === idx ? { ...c, ...p } : c)) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        After this question, the first rule that matches decides where the applicant goes next. If none match, they
        continue as set below.
      </p>
      {rules.map((r, ri) => (
        <div key={r.id} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-700">Rule {ri + 1}: if</span>
            <Select value={r.match} onChange={(e) => patchRule(r.id, { match: e.target.value as "all" | "any" })} className="w-28">
              <option value="all">all of</option>
              <option value="any">any of</option>
            </Select>
            <span className="text-slate-500">these are true</span>
            <Button variant="ghost" className="ml-auto" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}>
              Remove rule
            </Button>
          </div>
          {r.conditions.map((c, ci) => {
            const target = fields.find((f) => f.id === c.field);
            return (
              <div key={ci} className="space-y-1.5 rounded border border-slate-100 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={c.field}
                    className="min-w-0 flex-1"
                    onChange={(e) => {
                      const nf = fields.find((f) => f.id === e.target.value);
                      patchCond(r, ci, { field: e.target.value, op: opsFor(nf)[0], value: undefined });
                    }}
                  >
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>{labelOf(f)}</option>
                    ))}
                  </Select>
                  <Select value={c.op} className="w-44" onChange={(e) => patchCond(r, ci, { op: e.target.value as Op, value: undefined })}>
                    {opsFor(target).map((o) => (
                      <option key={o} value={o}>{OP_LABEL[o]}</option>
                    ))}
                  </Select>
                  {r.conditions.length > 1 && (
                    <Button variant="ghost" onClick={() => patchRule(r.id, { conditions: r.conditions.filter((_, i) => i !== ci) })}>
                      Remove
                    </Button>
                  )}
                </div>
                <ValueInput f={target} c={c} onChange={(v) => patchCond(r, ci, { value: v })} />
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                patchRule(r.id, { conditions: [...r.conditions, { field: field.id, op: opsFor(field)[0] }] })
              }
            >
              + Add condition
            </Button>
            <span className="text-sm font-semibold text-slate-700">then go to</span>
            <Select value={r.goto} onChange={(e) => patchRule(r.id, { goto: e.target.value })} className="min-w-0 flex-1">
              {destinations}
            </Select>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          setRules([
            ...rules,
            {
              id: newId("r"),
              match: "any",
              conditions: [{ field: field.id, op: opsFor(field)[0] }],
              goto: endTarget("default"),
            },
          ])
        }
      >
        + Add rule
      </Button>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-700">Otherwise go to</span>
        <Select value={field.otherwise ?? ""} onChange={(e) => onChange({ otherwise: e.target.value || undefined })} className="min-w-0 flex-1">
          <option value="">Next question (default)</option>
          {destinations}
        </Select>
      </div>
    </div>
  );
}
