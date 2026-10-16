"use client";

import { useEffect } from "react";
import { Button, Card, CardBody } from "@/components/ui";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card>
      <CardBody className="space-y-3 py-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Couldn&apos;t load this page</h2>
        <p className="mx-auto max-w-md text-sm text-slate-500">
          This is usually a short database hiccup. Try again; if it persists, check that <code>DATABASE_URL</code> is correct in your hosting settings.
        </p>
        {error.digest && <p className="text-xs text-slate-400">Reference: {error.digest}</p>}
        <Button onClick={reset}>Try again</Button>
      </CardBody>
    </Card>
  );
}
