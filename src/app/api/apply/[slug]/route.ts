// Public endpoint for the /apply/[slug] form.
//   POST ?event=view|start  -> analytics counters
//   POST                     -> submit an application
// Open to the internet by design, so: server-side validation, honeypot, body
// size cap and a small per-IP rate limit.

import { NextResponse } from "next/server";
import { addResponses, bumpCounter, getFormBySlug } from "@/forms/repo";
import { validateSubmission } from "@/forms/validate";
import { formatAnswer, leadIdentity } from "@/forms/lib";
import { sendLeadEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function limited(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const form = await getFormBySlug(slug);
  if (!form || form.status !== "published") {
    return NextResponse.json({ ok: false, error: "This form is not accepting responses." }, { status: 404 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const event = new URL(request.url).searchParams.get("event");

  if (event === "view" || event === "start") {
    if (!limited(`ev:${ip}`, 30, 60_000)) await bumpCounter(form.id, event === "view" ? "views" : "starts");
    return NextResponse.json({ ok: true });
  }

  if (limited(`sub:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }
  const text = await request.text();
  if (text.length > 100_000) {
    return NextResponse.json({ ok: false, error: "Submission too large." }, { status: 413 });
  }
  let body: { answers?: unknown; meta?: { referrer?: string; utm?: Record<string, string> }; hp?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (body.hp) return NextResponse.json({ ok: true, redirect: form.settings.redirect_url || null });

  const result = validateSubmission(form.fields, body.answers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 422 });
  }

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.meta?.utm ?? {})) {
    if (typeof v === "string" && /^[a-z_]{1,30}$/i.test(k)) utm[k] = v.slice(0, 200);
  }
  await addResponses(form.id, [
    {
      answers: result.answers,
      source: "web",
      meta: {
        user_agent: request.headers.get("user-agent")?.slice(0, 300),
        referrer: typeof body.meta?.referrer === "string" ? body.meta.referrer.slice(0, 300) : undefined,
        utm,
      },
    },
  ]);

  // Optional webhook (Zapier / Make / Discord relay). Fire-and-forget.
  if (form.settings.webhook_url) {
    const id = leadIdentity(form, { answers: result.answers });
    const payload = {
      form: { id: form.id, title: form.title, slug: form.slug },
      lead: id,
      submitted_at: new Date().toISOString(),
      answers: Object.fromEntries(
        form.fields
          .filter((f) => f.type !== "statement")
          .map((f) => [f.title, formatAnswer(f, result.answers[f.id])]),
      ),
    };
    try {
      await fetch(form.settings.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // never fail a submission because the webhook is down
    }
  }

  // Optional email alert. Never fails the submission.
  if (form.settings.notify_email) {
    const id = leadIdentity(form, { answers: result.answers });
    await sendLeadEmail({
      to: form.settings.notify_email.split(",").map((e) => e.trim()).filter(Boolean),
      formTitle: form.title,
      lead: id,
      lines: form.fields
        .filter((f) => f.type !== "statement")
        .map((f) => [f.title, formatAnswer(f, result.answers[f.id])] as [string, string]),
      dashboardUrl: `${new URL(request.url).origin}/forms/${form.id}`,
    });
  }

  return NextResponse.json({ ok: true, redirect: form.settings.redirect_url || null });
}
