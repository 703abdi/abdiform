import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { listForms, listResponses } from "@/forms/repo";
import { overview, perFormStats, timeline } from "@/forms/metrics";

export const dynamic = "force-dynamic";

function bearerMatches(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length).trim());
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Aggregate metrics only: no response answers, contact details or emails. */
export async function GET(request: Request) {
  if (!bearerMatches(request)) return new NextResponse(null, { status: 404 });
  const [forms, responses] = await Promise.all([listForms(), listResponses()]);
  return NextResponse.json({
    generated_at: new Date().toISOString(),
    overview: overview(forms, responses),
    timeline: timeline(responses, 30),
    forms: forms.map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      views: f.views,
      starts: f.starts,
      ...perFormStats(f, responses),
    })),
  });
}
