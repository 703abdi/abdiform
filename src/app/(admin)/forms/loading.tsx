export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4 px-4 py-6 sm:px-8">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
