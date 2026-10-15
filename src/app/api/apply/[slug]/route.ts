// Public endpoint for the /apply/[slug] form.
//   POST ?event=view|start   -> analytics counters
//   POST ?event=progress     -> save answers so far (an abandoned application is still a lead)
//   POST                     -> submit the finished application
// Open to the internet by design, so: server-side validation, honeypot, body
// size cap and small per-IP rate limits.

import { NextResponse } from "next/server";
import { addResponses, bumpCounter, closedReason, filesExist, getFormBySlug, saveWebResponse } from "@/forms/repo";
import { parseFileAnswer } from "@/forms/files";
import { validateSubmission } from "@/forms/validate";
import { allEndings, answerFields, formatAnswer, isPublicHttpsUrl, leadIdentity, plainText } from "@/forms/lib";
import { sendLeadEmail } from "@/lib/notify";
import { cookies } from "next/headers";
import { isUnlocked, unlockCookie } from "@/forms/access";
import { computeScore, hasQuiz } from "@/forms/logic";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

const event_ = (r: Request) => new URL(r.url).searchParams.get("event");
const RID = /^[A-Za-z0-9_-]{10,64}$/;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const form = await getFormBySlug(slug);
  if (!form || form.status !== "published") {
    return NextResponse.json({ ok: false, error: "This form is not accepting responses." }, { status: 404 });
  }
  if (event_(request) !== "view" && (await closedReason(form))) {
    return NextResponse.json({ ok: false, error: form.settings.closed_message || "This form is closed." }, { status: 410 });
  }
  if (event_(request) !== "view" && !isUnlocked(form, (await cookies()).get(unlockCookie(form.id))?.value)) {
    return NextResponse.json({ ok: false, error: "This form is password protected." }, { status: 401 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const event = new URL(request.url).searchParams.get("event");

  if (event === "view" || event === "start") {
    if (!limited(`ev:${ip}`, 30, 60_000)) await bumpCounter(form.id, event === "view" ? "views" : "starts");
    return NextResponse.json({ ok: true });
  }

  const text = await request.text();
  if (text.length > 100_000) {
    return NextResponse.json({ ok: false, error: "Submission too large." }, { status: 413 });
  }
  let body: {
    answers?: unknown;
    rid?: string;
    meta?: { referrer?: string; utm?: Record<string, string>; duration_s?: number };
    hp?: string;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const rid = typeof body.rid === "string" && RID.test(body.rid) ? body.rid : null;

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.meta?.utm ?? {})) {
    if (typeof v === "string" && /^[a-z_]{1,30}$/i.test(k)) utm[k] = v.slice(0, 200);
  }
  const ua = request.headers.get("user-agent") ?? "";
  const device: "mobile" | "tablet" | "desktop" = /ipad|tablet/i.test(ua)
    ? "tablet"
    : /mobi|iphone|android/i.test(ua)
      ? "mobile"
      : "desktop";
  const dur = Number(body.meta?.duration_s);
  const baseMeta = {
    device,
    ...(Number.isFinite(dur) && dur >= 0 && dur < 86_400 ? { duration_s: Math.round(dur) } : {}),
    user_agent: ua.slice(0, 300),
    referrer: typeof body.meta?.referrer === "string" ? body.meta.referrer.slice(0, 300) : undefined,
    utm,
  };

  // ---- progress save (partial lead)
  if (event === "progress") {
    if (!rid || body.hp || limited(`pg:${ip}`, 90, 60_000)) return NextResponse.json({ ok: true });
    const part = validateSubmission(form.fields, body.answers, { partial: true });
    if (part.ok && Object.keys(part.answers).length > 0) {
      await saveWebResponse(form.id, rid, { answers: part.answers, meta: baseMeta, partial: true });
    }
    return NextResponse.json({ ok: true });
  }

  // ---- final submit
  if (limited(`sub:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }
  const ending = allEndings(form.settings);
  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (body.hp) return NextResponse.json({ ok: true, ending: "default", redirect: null });

  const result = validateSubmission(form.fields, body.answers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 422 });
  }

  const fileIds = answerFields(form.fields)
    .filter((f) => f.type === "file_upload")
    .map((f) => parseFileAnswer(result.answers[f.id])?.id)
    .filter((x): x is string => !!x);
  if (!(await filesExist(form.id, fileIds))) {
    return NextResponse.json({ ok: false, error: "An uploaded file could not be found. Please upload it again." }, { status: 422 });
  }

  const meta = {
    ...baseMeta,
    ending: result.ending,
    ...(hasQuiz(form.fields) ? { score: computeScore(form.fields, result.answers) } : {}),
  };
  if (rid) await saveWebResponse(form.id, rid, { answers: result.answers, meta, partial: false });
  else await addResponses(form.id, [{ answers: result.answers, source: "web", meta }]);

  const end = ending.find((e) => e.id === result.ending) ?? ending[0];
  const identity = leadIdentity(form, { answers: result.answers });
  const lines = answerFields(form.fields)
    .map((f) => [plainText(f.title), formatAnswer(f, result.answers[f.id])] as [string, string]);

  // Optional webhook (Zapier / Make / Discord relay). Fire-and-forget.
  if (form.settings.webhook_url && isPublicHttpsUrl(form.settings.webhook_url)) {
    try {
      await fetch(form.settings.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          form: { id: form.id, title: form.title, slug: form.slug },
          lead: identity,
          ending: result.ending,
          submitted_at: new Date().toISOString(),
          answers: Object.fromEntries(lines),
        }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // never fail a submission because the webhook is down
    }
  }

  // Optional email alert. Never fails the submission.
  if (form.settings.notify_email) {
    await sendLeadEmail({
      to: form.settings.notify_email.split(",").map((e) => e.trim()).filter(Boolean),
      formTitle: form.title,
      lead: identity,
      lines,
      dashboardUrl: `${new URL(request.url).origin}/forms/${form.id}`,
    });
  }

  return NextResponse.json({ ok: true, ending: result.ending, redirect: end.redirect_url || null });
}
