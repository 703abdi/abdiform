// Calendly webhook: bookings, cancellations and no-shows arrive the moment they happen.
// Signed with the key this app registered (Calendly-Webhook-Signature: t=...,v1=...).

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { announce, calendlySigningKey, retagAfterWebhook, saveInvitee, type CEvent, type CInvitee } from "@/calendly/sync";

export const dynamic = "force-dynamic";

function validSignature(header: string | null, body: string, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const want = crypto.createHmac("sha256", key).update(`${parts.t}.${body}`).digest("hex");
  return want.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(parts.v1));
}

export async function POST(request: Request) {
  const key = await calendlySigningKey();
  const body = await request.text();
  if (!key || !validSignature(request.headers.get("calendly-webhook-signature"), body, key)) {
    return new NextResponse(null, { status: 401 });
  }
  let msg: { event?: string; payload?: CInvitee & { scheduled_event?: CEvent; event?: string; invitee?: string } };
  try {
    msg = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const p = msg.payload;
  if (!p) return NextResponse.json({ ok: true });

  if (msg.event === "invitee.created" || msg.event === "invitee.canceled") {
    if (!p.scheduled_event || !p.email) return NextResponse.json({ ok: true });
    const saved = await saveInvitee({ ...p.scheduled_event, uri: p.scheduled_event.uri ?? p.event ?? "" }, p);
    await retagAfterWebhook(saved.contactId);
    if (msg.event === "invitee.created") await announce([saved]);
  } else if (msg.event === "invitee_no_show.created" || msg.event === "invitee_no_show.deleted") {
    // payload is the no-show record; it points at the invitee
    const { q } = await import("@/lib/db");
    const inviteeUri = (p as unknown as { invitee?: string }).invitee;
    if (inviteeUri) {
      const rows = await q(`update bookings set no_show = $2, updated_at = now() where invitee_uri = $1 returning contact_id`, [inviteeUri, msg.event === "invitee_no_show.created"]);
      if (rows[0]?.contact_id) await retagAfterWebhook(rows[0].contact_id as string);
    }
  }
  return NextResponse.json({ ok: true });
}
