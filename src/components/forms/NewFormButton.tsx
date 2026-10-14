"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createBlankFormAction } from "@/forms/actions";

export function NewFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <Button onClick={() => setOpen(true)}>+ New form</Button>;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createBlankFormAction(title);
          if (r.ok) router.push(`/forms/${r.data.id}?tab=build`);
          else setErr(r.error);
        });
      }}
    >
      <Input autoFocus placeholder="Form name, e.g. Mentorship application" value={title} onChange={(e) => setTitle(e.target.value)} className="w-72" />
      <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </form>
  );
}
