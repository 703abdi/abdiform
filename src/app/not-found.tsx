import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center text-slate-700">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-900">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-md text-slate-500">The link may be wrong, or the form may have been removed.</p>
      <Link href="/forms" className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        Go to the dashboard
      </Link>
    </div>
  );
}
