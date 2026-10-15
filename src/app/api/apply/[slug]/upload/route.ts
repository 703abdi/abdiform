// Public file upload for "File upload" questions. Same protections as the form
// itself (published, open, unlocked) plus: size cap, extension/type whitelist, rate limit.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { closedReason, getFormBySlug, saveFile } from "@/forms/repo";
import { isUnlocked, unlockCookie } from "@/forms/access";
import { MAX_FILE_BYTES, fileAllowed, fileAnswer, safeFileName } from "@/forms/files";
import { flattenFields } from "@/forms/lib";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const form = await getFormBySlug(slug);
  if (!form || form.status !== "published" || (await closedReason(form))) {
    return NextResponse.json({ ok: false, error: "This form is not accepting responses." }, { status: 404 });
  }
  if (!flattenFields(form.fields).some((f) => f.type === "file_upload")) {
    return NextResponse.json({ ok: false, error: "This form has no file questions." }, { status: 400 });
  }
  if (!isUnlocked(form, (await cookies()).get(unlockCookie(form.id))?.value)) {
    return NextResponse.json({ ok: false, error: "This form is password protected." }, { status: 401 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  if (recent.length > 10) return NextResponse.json({ ok: false, error: "Too many uploads. Try again in a minute." }, { status: 429 });

  let file: File | null = null;
  try {
    const fd = await request.formData();
    const f = fd.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad upload." }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "That file is over 4 MB." }, { status: 413 });
  const name = safeFileName(file.name);
  if (!fileAllowed(name, file.type)) {
    return NextResponse.json({ ok: false, error: "That file type isn't allowed (images, PDF, Office documents, CSV, text)." }, { status: 415 });
  }
  const id = await saveFile({ form_id: form.id, name, mime: file.type || "application/octet-stream", size: file.size, data: Buffer.from(await file.arrayBuffer()) });
  return NextResponse.json({ ok: true, answer: fileAnswer(id, name), name, size: file.size });
}
