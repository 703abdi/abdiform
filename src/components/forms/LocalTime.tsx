"use client";

/** Shows a timestamp in the viewer's own time zone (server renders UTC; the browser corrects it). */
export function LocalTime({ iso, long = false }: { iso: string; long?: boolean }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {d.toLocaleString(undefined, long ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
