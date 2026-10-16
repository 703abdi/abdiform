// Public: page view / button click tracking for /p/[slug].

import { NextResponse } from "next/server";
import { getPageBySlug, recordPageEvent } from "@/sitepages/repo";
import { rateLimited } from "@/forms/repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await getPageBySlug(slug);
  if (!p || p.status !== "published") return new NextResponse(null, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (await rateLimited("pg-ev", ip, 120, 60)) return NextResponse.json({ ok: true });
  let body: { vid?: string; kind?: string; target?: string };
  try {
    body = JSON.parse((await request.text()).slice(0, 500));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const vid = String(body.vid ?? "");
  const kind = body.kind === "click" ? "click" : body.kind === "view" ? "view" : null;
  if (!kind || !/^[A-Za-z0-9._-]{6,64}$/.test(vid)) return NextResponse.json({ ok: false }, { status: 400 });
  await recordPageEvent(p.id, vid, kind, kind === "click" ? String(body.target ?? "").replace(/[^A-Za-z0-9_-]/g, "") : "");
  return NextResponse.json({ ok: true });
}
