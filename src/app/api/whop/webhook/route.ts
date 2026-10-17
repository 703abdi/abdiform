// Whop webhook: payment.succeeded -> payment on the contact + "payment received" automations.

import { NextResponse } from "next/server";
import { recordWhopPayment, verifyWhop } from "@/payments/whop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const body = await request.text();
  if (!secret || !verifyWhop(request.headers, body, secret)) return new NextResponse(null, { status: 401 });
  let msg: { type?: string; action?: string; data?: Parameters<typeof recordWhopPayment>[0] };
  try {
    msg = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const type = msg.type ?? msg.action;
  if (type === "payment.succeeded" && msg.data) await recordWhopPayment(msg.data);
  return NextResponse.json({ ok: true });
}
