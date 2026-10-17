// Live: recreate the Zapier Zaps as app automations (drafts until the Discord webhook links are added).
import { createAutomation, listAutomations } from "../src/automations/repo.ts";

const have = new Set((await listAutomations()).map((a) => a.name));
const step = (message: string) => ({ id: Math.random().toString(36).slice(2, 10), type: "discord" as const, url: "", message });

const CALL = `**🚨 NEW CALL BOOOOKED 🚨**
**Event:** {{call_event}}
**Invitee:** {{first_name}} {{last_name}}
**Email:** {{email}}
**Number:** {{phone}}
**Instagram:** {{call_answer_1}}
**Call Date:** {{call_date}}

TRIAGE ASAPPPPP @here`;
const PAY = `**💸 NEW PAYMENT SUCCEEDED 💸**
**Product:** {{payment_product}}
**Name:** {{first_name}} {{last_name}}
**Email:** {{email}}
**Amount:** {{payment_amount}} ({{payment_type}})

Ensure the lead is updated in CRM & correct setter/closer is attributed.

@here`;

const todo = [
  { name: "Booked Call -> Discord", trigger: { type: "call_booked" as const, event_name: "Tawakkul | Discovery Call" }, steps: [step(CALL)] },
  { name: "PIF -> Discord", trigger: { type: "payment_received" as const, payment_kind: "one_time" as const }, steps: [step(PAY)] },
  { name: "Split Pay -> Discord", trigger: { type: "payment_received" as const, payment_kind: "recurring" as const }, steps: [step(PAY)] },
];
for (const a of todo) {
  if (have.has(a.name)) { console.log("exists:", a.name); continue; }
  const r = await createAutomation(a);
  console.log("created (draft):", r.name, r.id);
}
process.exit(0);
