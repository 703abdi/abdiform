"use client";

import { useEffect } from "react";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center text-slate-700">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 max-w-md text-slate-500">
        Please try again. If it keeps happening, reload the page in a minute.
        {error.digest && <span className="mt-2 block text-xs text-slate-400">Reference: {error.digest}</span>}
      </p>
      <button onClick={reset} className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        Try again
      </button>
    </div>
  );
}
