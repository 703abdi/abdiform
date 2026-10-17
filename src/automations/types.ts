// Automations: "when X happens to a contact, run these steps".

import type { ContactFilter } from "@/contacts/types";

export type TriggerType = "form_submitted" | "list_added" | "tag_added" | "call_booked" | "payment_received";

export interface Trigger {
  type: TriggerType;
  form_id?: string; // form_submitted: a specific form (empty = any form)
  ending?: string; // form_submitted: only people who reached this ending
  list_id?: string; // list_added
  tag?: string; // tag_added
  event_name?: string; // call_booked: only this Calendly event type (empty = any)
  payment_kind?: "any" | "one_time" | "recurring"; // payment_received
  product?: string; // payment_received: product name contains (empty = any)
  filter?: ContactFilter; // extra audience condition checked when the trigger fires
}

export type Step =
  | { id: string; type: "send_email"; subject: string; body: string }
  | { id: string; type: "wait"; amount: number; unit: "minutes" | "hours" | "days" }
  | { id: string; type: "add_tag"; tag: string }
  | { id: string; type: "remove_tag"; tag: string }
  | { id: string; type: "add_to_list"; list_id: string }
  | { id: string; type: "remove_from_list"; list_id: string }
  | { id: string; type: "webhook"; url: string }
  | { id: string; type: "discord"; url: string; message: string };

export type StepType = Step["type"];

export type AutomationStatus = "draft" | "live" | "paused";

export interface Automation {
  id: string;
  name: string;
  status: AutomationStatus;
  trigger: Trigger;
  steps: Step[];
  created_at: string;
  updated_at: string;
  stats?: { total: number; waiting: number; done: number; failed: number };
}

export interface RunLogEntry {
  at: string;
  step: number;
  ok: boolean;
  message: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  contact_id: string | null;
  contact_email: string | null;
  trigger_key: string;
  step: number;
  status: "waiting" | "done" | "failed" | "skipped";
  next_run_at: string;
  log: RunLogEntry[];
  created_at: string;
  context?: Record<string, string>; // details of the event that started the run (call time, payment...)
}

export const STEP_LABELS: Record<StepType, string> = {
  send_email: "Send email",
  wait: "Wait",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  add_to_list: "Add to list",
  remove_from_list: "Remove from list",
  webhook: "Send webhook",
  discord: "Post to Discord",
};

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  form_submitted: "Form is submitted",
  list_added: "Contact is added to a list",
  tag_added: "Tag is added to a contact",
  call_booked: "A call is booked (Calendly)",
  payment_received: "A payment comes in (Whop)",
};

export function newStep(type: StepType): Step {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case "send_email":
      return { id, type, subject: "Thanks for applying, {{first_name}}", body: "Hi {{first_name}},\n\n" };
    case "wait":
      return { id, type, amount: 1, unit: "days" };
    case "add_tag":
    case "remove_tag":
      return { id, type, tag: "" };
    case "add_to_list":
    case "remove_from_list":
      return { id, type, list_id: "" };
    case "webhook":
      return { id, type, url: "" };
    case "discord":
      return { id, type, url: "", message: "**New:** {{first_name}} {{last_name}} ({{email}})" };
  }
}

export function waitMs(s: Extract<Step, { type: "wait" }>): number {
  const n = Math.max(0, Math.min(365 * 24 * 60, Number(s.amount) || 0));
  return n * (s.unit === "minutes" ? 60_000 : s.unit === "hours" ? 3_600_000 : 86_400_000);
}
