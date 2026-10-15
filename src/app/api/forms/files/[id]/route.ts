// Admin-only download of an uploaded file. Always served as an attachment with
// nosniff + a sandboxing CSP so an uploaded file can never run in your origin.

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getFile } from "@/forms/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse(null, { status: 404 });
  const { id } = await ctx.params;
  const f = await getFile(id);
  if (!f) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}
