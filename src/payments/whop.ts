// Whop payments: verified webhook -> payment saved on the contact -> "payment received" automations.
// Whop signs with the Standard Webhooks scheme (webhook-id / webhook-timestamp / webhook-signature).

import crypto from "node:crypto";
import { iso, isUuid, json, q } from "@/lib/db";
import { addTags, upsertContact } from "@/contacts/repo";
import { emit } from "@/automations/engine";

export const whopConfigured = () => !!process.env.WHOP_WEBHOOK_SECRET;

/** Standard Webhooks check. Tries the secret as given (Whop's ws_...) and as base64 after its prefix. */
export function verifyWhop(headers: Headers, body: string, secret: string): boolean {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const signed = `${id}.${ts}.${body}`;
  const keys: Buffer[] = [Buffer.from(secret, "utf8")];
  const tail = secret.includes("_") ? secret.slice(secret.indexOf("_") + 1) : secret;
  if (/^[A-Za-z0-9+/=]+$/.test(tail)) keys.push(Buffer.from(tail, "base64"));
  const given = sigHeader.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  for (const k of keys) {
    const want = crypto.createHmac("sha256", k).update(signed).digest("base64");
    if (given.some((g) => g.length === want.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(want)))) return true;
  }
  return false;
}

interface WhopPayment {
  id: string;
  total?: number | string;
  usd_total?: number | string;
  subtotal?: number | string;
  currency?: string;
  billing_reason?: string;
  created_at?: string;
  paid_at?: string;
  user?: { email?: string; name?: string; username?: string };
  product?: { id?: string; title?: string };
}

const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: (cur || "usd").toUpperCase() }).format(n);

export async function recordWhopPayment(p: WhopPayment): Promise<{ saved: boolean; contactId?: string }> {
  const email = p.user?.email?.trim().toLowerCase();
  if (!p.id || !email) return { saved: false };
  const amount = Number(p.total ?? p.usd_total ?? p.subtotal ?? 0) || 0;
  const recurring = /subscription|renew|cycle|recurring/i.test(p.billing_reason ?? "");
  const product = p.product?.title ?? "";
  const [first, ...rest] = (p.user?.name ?? "").split(/\s+/);
  const c = await upsertContact({ email, first_name: first ?? "", last_name: rest.join(" "), tags: [] });
  const rows = await q(
    `insert into payments (id, source, email, name, contact_id, product, product_id, amount, currency, recurring, billing_reason, paid_at, raw)
     values ($1, 'whop', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::jsonb)
     on conflict (id) do nothing returning id`,
    [p.id, email, p.user?.name ?? "", c.id, product, p.product?.id ?? "", amount, (p.currency ?? "usd").toLowerCase(), recurring, p.billing_reason ?? "", p.paid_at ?? p.created_at ?? new Date().toISOString(), json(p)],
  );
  if (!rows.length) return { saved: false, contactId: c.id }; // already handled (Whop retries)
  const tags = ["Customer", recurring ? "Split pay" : "Paid in full", ...(product ? [`Bought: ${product}`.slice(0, 60)] : [])];
  const added = await addTags([c.id], tags);
  await emit([
    {
      type: "payment_received",
      contactId: c.id,
      key: p.id,
      context: {
        payment_amount: money(amount, p.currency ?? "usd"),
        payment_product: product,
        payment_type: recurring ? "Recurring" : "One-time",
        payment_recurring: recurring ? "yes" : "no",
      },
    },
    ...added.map((a) => ({ type: "tag_added" as const, contactId: a.contactId, tag: a.tag })),
  ]);
  return { saved: true, contactId: c.id };
}

export async function contactPayments(contactId: string) {
  if (!isUuid(contactId)) return [];
  const rows = await q(`select * from payments where contact_id = $1 order by paid_at desc`, [contactId]);
  return rows.map((r) => ({ id: r.id as string, product: r.product as string, amount: Number(r.amount), currency: r.currency as string, recurring: !!r.recurring, paid_at: iso(r.paid_at) }));
}

export async function revenueStats() {
  const [r] = await q(
    `select
       coalesce(sum(amount) filter (where paid_at >= date_trunc('month', now())), 0)::float as month,
       coalesce(sum(amount) filter (where paid_at >= now() - interval '30 days'), 0)::float as last30,
       count(distinct contact_id) filter (where paid_at >= date_trunc('month', now()))::int as buyers
     from payments`,
  );
  return { month: Number(r?.month ?? 0), last30: Number(r?.last30 ?? 0), buyers: Number(r?.buyers ?? 0) };
}
