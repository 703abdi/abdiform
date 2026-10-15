// Typeform-style inline formatting: *bold* (or **bold**), _italic_, [label](https://link).
// Rendered as React nodes (never innerHTML), links limited to http(s)/mailto.

import * as React from "react";

const TOKEN =
  /(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*?\*)|((?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))/g;

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${keyBase}-${i++}`;
    const tok = m[0];
    if (m[1]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(
        <a key={k} href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--a)", textDecoration: "underline" }}>
          {label}
        </a>,
      );
    } else if (m[2]) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<strong key={k}>{tok.slice(1, -1)}</strong>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {inline(line, `l${i}`)}
        </React.Fragment>
      ))}
    </>
  );
}
