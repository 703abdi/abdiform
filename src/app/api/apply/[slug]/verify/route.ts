// Public: email verification for the applicant form.
//   POST { action: "send", email }        -> emails a 6-digit code
//   POST { action: "check", email, code } -> { token } when the code is right

import { NextResponse } from "next/server";
import { closedReason, getFormBySlug, rateLimited } from "@/forms/repo";
import { checkCode, sendCode, verificationActive } from "@/forms/verify";

export const dynamic = "force-dynamic";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const form = await getFormBySlug(slug);
  if (!form || form.status !== "published" || (await closedReason(form))) {
    return NextResponse.json({ ok: false, error: "This form is not accepting responses." }, { status: 404 });
  }
  // email can't be sent from this server: let the applicant carry on
  if (!verificationActive(form)) return NextResponse.json({ ok: true, skipped: true });

  let body: { action?: string; email?: string; code?: string };
  try {
    body = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email first." }, { status: 422 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (body.action === "send") {
    if ((await rateLimited("vs-ip", ip, 10, 600)) || (await rateLimited("vs-em", `${form.id}:${email}`, 5, 3600))) {
      return NextResponse.json({ ok: false, error: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
    }
    const r = await sendCode(form, email);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }
  if (body.action === "check") {
    if (await rateLimited("vc-ip", ip, 30, 600)) {
      return NextResponse.json({ ok: false, error: "Too many tries. Wait a few minutes." }, { status: 429 });
    }
    const r = await checkCode(form.id, email, String(body.code ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
}
