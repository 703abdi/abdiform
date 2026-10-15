"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { duplicateFormAction } from "@/forms/actions";

export function FormRowActions({ id, slug, published }: { id: string; slug: string; published: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1">
      {published && (
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/apply/${slug}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await duplicateFormAction(id);
            if (r.ok) router.push(`/forms/${r.data.id}?tab=build`);
          })
        }
      >
        {pending ? "Copying..." : "Duplicate"}
      </Button>
    </div>
  );
}
