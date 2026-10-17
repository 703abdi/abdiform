// Public endpoint for the /apply/[slug] form.
//   POST ?event=view|start   -> analytics counters
//   POST ?event=progress     -> save answers so far (an abandoned application is still a lead)
//   POST                     -> submit the finished application
// Open to the internet by design, so: server-side validation, honeypot, body
// size cap and small per-IP rate limits.

import { NextResponse, after } from "next/server";
import { bumpCounter, closedReason, filesExist, getFormBySlug, rateLimited, saveWebResponse } from "@/forms/repo";
import { syncResponse } from "@/contacts/sync";
import { markBooked } from "@/forms/pg-repo";
import { emit, processDue } from "@/automations/engine";
import { deviceFromUA, recordScreen } from "@/forms/events";
import { tokenValid, verificationActive, verifiedEmailField } from "@/forms/verify";
import { parseFileAnswer } from "@/forms/files";
import { validateSubmission } from "@/forms/validate";
import { allEndings, answerFields, formatAnswer, isPublicHttpsUrl, leadIdentity, plainText } from "@/forms/lib";
import { defaultAlertTo, sendLeadEmail } from "@/lib/notify";
import { cookies } from "next/headers";
import { isUnlocked, unlockCookie } from "@/forms/access";
import { computeScore, hasQuiz } from "@/forms/logic";

export const dynamic = "force-dynamic";

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

  // Calendly booking finished on the ending screen: mark the response and tag the contact "Booked"
  if (event === "booked") {
    const rid = new URL(request.url).searchParams.get("rid") ?? "";
    if (!RID.test(rid) || (await rateLimited("bk", ip, 10, 60))) return NextResponse.json({ ok: true });
    const r = await markBooked(form.id, rid);
    if (r) {
      // re-sync the contact: the "booked" flag on the response adds the Booked tag
      const synced = await syncResponse(form, r.id);
      if (synced?.addedTags.length)
        after(() => emit(synced.addedTags.map((tag) => ({ type: "tag_added" as const, contactId: synced.contactId, tag }))).then(() => undefined).catch(() => undefined));
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "view" || event === "start" || event === "screen") {
    if (await rateLimited("ev", ip, 150, 60)) return NextResponse.json({ ok: true });
    const params = new URL(request.url).searchParams;
    const evRid = params.get("rid") ?? "";
    const device = deviceFromUA(request.headers.get("user-agent") ?? "");
    const screen = event === "screen" ? (params.get("s") ?? "") : `_${event}`;
    let fresh = true;
    if (RID.test(evRid)) fresh = await recordScreen(form.id, evRid, screen, device);
    if (event !== "screen" && fresh) await bumpCounter(form.id, event === "view" ? "views" : "starts");
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
    verification?: string;
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
  const device = deviceFromUA(ua);
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
    if (!rid || body.hp || (await rateLimited("pg", ip, 90, 60))) return NextResponse.json({ ok: true });
    const part = validateSubmission(form.fields, body.answers, { partial: true });
    if (part.ok && Object.keys(part.answers).length > 0) {
      const id = await saveWebResponse(form.id, rid, { answers: part.answers, meta: baseMeta, partial: true });
      if (id) after(() => syncResponse(form, id).catch((e) => console.error("contact sync failed", e)));
    }
    return NextResponse.json({ ok: true });
  }

  // ---- final submit
  if (await rateLimited("sub", ip, 8, 60)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }
  const ending = allEndings(form.settings);
  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (body.hp) return NextResponse.json({ ok: true, ending: "default", redirect: null });

  const result = validateSubmission(form.fields, body.answers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 422 });
  }

  // email verification: the submitted email must be the one confirmed with the code
  const vField = verifiedEmailField(form);
  if (vField && verificationActive(form)) {
    const email = String(result.answers[vField.id] ?? "");
    if (!email || !(await tokenValid(form.id, email, body.verification))) {
      return NextResponse.json(
        { ok: false, errors: { [vField.id]: "Please confirm your email with the code we sent you." }, verify: vField.id },
        { status: 422 },
      );
    }
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
  const responseId = await saveWebResponse(form.id, rid ?? crypto.randomUUID(), { answers: result.answers, meta, partial: false });
  if (responseId) {
    after(async () => {
      try {
        const synced = await syncResponse(form, responseId);
        if (!synced) return;
        await emit([
          { type: "form_submitted", contactId: synced.contactId, formId: form.id, ending: result.ending, responseId },
          ...synced.addedTags.map((tag) => ({ type: "tag_added" as const, contactId: synced.contactId, tag })),
        ]);
      } catch (e) {
        console.error("contact sync / automations failed", e);
      }
      // nudge any automation runs whose wait is over (the daily cron is the backstop)
      await processDue(10).catch(() => {});
    });
  }

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
  const alertTo = form.settings.notify_email || defaultAlertTo();
  if (alertTo) {
    await sendLeadEmail({
      to: alertTo.split(",").map((e) => e.trim()).filter(Boolean),
      formTitle: form.title,
      lead: identity,
      lines,
      dashboardUrl: `${new URL(request.url).origin}/forms/${form.id}`,
    });
  }

  return NextResponse.json({ ok: true, ending: result.ending, redirect: end.redirect_url || null });
}
