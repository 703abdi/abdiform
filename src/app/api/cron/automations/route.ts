// Vercel Cron: continues automation runs whose Wait step is over.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token).

import { NextResponse } from "next/server";
import { processDue } from "@/automations/engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 404 });
  }
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const n = await processDue(50);
    total += n;
    if (n < 50) break;
  }
  return NextResponse.json({ ok: true, processed: total });
}
