"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { TEMPLATES } from "@/forms/templates";
import { createBlankFormAction } from "@/forms/actions";

export function NewFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <Button onClick={() => setOpen(true)}>+ New form</Button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createBlankFormAction(title, tpl);
          if (r.ok) router.push(`/forms/${r.data.id}?tab=build`);
          else setErr(r.error);
        });
      }}
    >
      <Select value={tpl} onChange={(e) => setTpl(e.target.value)} className="w-56" aria-label="Template">
        {TEMPLATES.map((t) => (<option key={t.key} value={t.key}>{t.name}</option>))}
      </Select>
      <Input autoFocus placeholder="Form name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} className="w-64" />
      <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </form>
  );
}
