"use client";

// Input widgets for the public form that need their own state: segmented date,
// searchable dropdown and matrix. They use the .tfr-* styles from FormRunner.

import { useEffect, useId, useRef, useState } from "react";
import type { Field } from "@/forms/types";

/* ------------------------------- date ------------------------------- */
const ORDER: Record<NonNullable<Field["date_format"]>, ("MM" | "DD" | "YYYY")[]> = {
  "MM/DD/YYYY": ["MM", "DD", "YYYY"],
  "DD/MM/YYYY": ["DD", "MM", "YYYY"],
  "YYYY/MM/DD": ["YYYY", "MM", "DD"],
};

export function DateInput({
  value,
  onChange,
  format = "MM/DD/YYYY",
  label,
  autoFocus,
  gprops,
}: {
  value: string; // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  format?: NonNullable<Field["date_format"]>;
  label: string;
  autoFocus?: boolean;
  gprops?: Record<string, unknown>;
}) {
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [parts, setParts] = useState({ YYYY: y0 ?? "", MM: m0 ?? "", DD: d0 ?? "" });
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const order = ORDER[format];

  const emit = (p: typeof parts) => {
    const ok = p.YYYY.length === 4 && p.MM.length >= 1 && p.DD.length >= 1;
    if (!ok) return onChange("");
    const mm = p.MM.padStart(2, "0");
    const dd = p.DD.padStart(2, "0");
    const iso = `${p.YYYY}-${mm}-${dd}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    const valid = !Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === Number(p.YYYY) && dt.getUTCMonth() + 1 === Number(mm) && dt.getUTCDate() === Number(dd);
    onChange(valid ? iso : "");
  };

  return (
    <div className="tfr-date" role="group" aria-label={label}>
      {order.map((k, i) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "flex-end", gap: 10 }}>
          {i > 0 && <span className="tfr-datesep">/</span>}
          <input
            {...(gprops ?? {})}
            ref={(el) => {
              refs.current[k] = el;
            }}
            className="tfr-input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus && i === 0}
            aria-label={`${label} ${k === "MM" ? "month" : k === "DD" ? "day" : "year"}`}
            placeholder={k}
            style={{ width: k === "YYYY" ? "4.6ch" : "2.6ch", textAlign: "center" }}
            value={parts[k]}
            onChange={(e) => {
              // Spread what was typed/pasted across this and the following segments.
              let rest = e.target.value.replace(/\D/g, "");
              const next = { ...parts };
              let focusIdx = i;
              for (let j = i; j < order.length && rest.length > 0; j++) {
                const seg = order[j];
                const len = seg === "YYYY" ? 4 : 2;
                next[seg] = rest.slice(0, len);
                rest = rest.slice(len);
                focusIdx = next[seg].length === len && order[j + 1] ? j + 1 : j;
              }
              if (e.target.value === "") next[k] = "";
              setParts(next);
              emit(next);
              if (focusIdx !== i) refs.current[order[focusIdx]]?.focus();
            }}
          />
        </span>
      ))}
    </div>
  );
}

/* ----------------------------- dropdown ----------------------------- */
export function Combobox({
  choices,
  value,
  onChange,
  label,
  autoFocus,
  gprops,
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  gprops?: Record<string, unknown>;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const filtered = choices.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (c: string) => {
    onChange(c);
    setQ(c);
    setOpen(false);
  };

  return (
    <div className="tfr-combo" ref={box}>
      <input
        {...(gprops ?? {})}
        className="tfr-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Type or select an option"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
          if (value) onChange(""); // typing invalidates the earlier pick
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && filtered[active]) {
            e.preventDefault();
            e.stopPropagation();
            pick(filtered[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <ul id={listId} className="tfr-list" role="listbox">
          {filtered.map((c, i) => (
            <li key={c} role="option" aria-selected={c === value} className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ matrix ------------------------------ */
export function MatrixInput({
  rows,
  cols,
  value,
  onChange,
  label,
}: {
  rows: string[];
  cols: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const picked = new Map(value.map((x) => x.split("::") as [string, string]));
  const set = (r: string, c: string) => {
    const next = new Map(picked);
    next.set(r, c);
    onChange(rows.filter((x) => next.has(x)).map((x) => `${x}::${next.get(x)}`));
  };
  return (
    <div className="tfr-matrix" role="group" aria-label={label}>
      <table>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row">{r}</th>
              {cols.map((c) => (
                <td key={c}>
                  <button type="button" role="radio" aria-checked={picked.get(r) === c} aria-label={`${r}: ${c}`} onClick={() => set(r, c)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- seeded shuffle --------------------------- */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
