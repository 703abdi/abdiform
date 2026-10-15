// Admin-only JSON backup of every form definition (and, with ?responses=1, every response).
// Password hashes are never included.

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listForms, listResponses } from "@/forms/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await isAdmin())) return new NextResponse(null, { status: 404 });
  const withResponses = new URL(request.url).searchParams.get("responses") === "1";
  const forms = (await listForms()).map((f) => {
    const { password_hash, access_password, ...settings } = f.settings;
    void password_hash;
    void access_password;
    return { ...f, settings };
  });
  const body = {
    exported_at: new Date().toISOString(),
    app: "tawakkul-forms",
    forms,
    ...(withResponses ? { responses: await listResponses() } : {}),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="tawakkul-forms-backup-${new Date().toISOString().slice(0, 10)}${withResponses ? "-with-responses" : ""}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
