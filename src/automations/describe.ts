// Plain-English descriptions of automation triggers and steps.

import type { Step, Trigger } from "@/automations/types";
import { DEFAULT_ENDING } from "@/forms/types";

type Named = { id: string; title?: string; name?: string };

export function describeTrigger(t: Trigger, forms: Named[], lists: Named[]): string {
  if (t.type === "form_submitted") {
    const f = forms.find((x) => x.id === t.form_id);
    const base = f ? `${f.title ?? f.name} is submitted` : "Any form is submitted";
    return t.ending ? `${base} (ending: ${t.ending === DEFAULT_ENDING ? "default" : t.ending})` : base;
  }
  if (t.type === "list_added") return `Added to ${lists.find((l) => l.id === t.list_id)?.name ?? "a list"}`;
  if (t.type === "call_booked") return t.event_name ? `"${t.event_name}" is booked` : "A call is booked";
  if (t.type === "payment_received") {
    const kind = t.payment_kind === "recurring" ? "recurring " : t.payment_kind === "one_time" ? "one-time " : "";
    return `A ${kind}payment comes in${t.product ? ` for "${t.product}"` : ""}`;
  }
  return t.tag ? `Tagged "${t.tag}"` : "A tag is added";
}

export function describeStep(s: Step, lists: Named[]): string {
  switch (s.type) {
    case "send_email":
      return `Send email "${s.subject}"`;
    case "wait":
      return `Wait ${s.amount} ${s.unit}`;
    case "add_tag":
      return `Add tag "${s.tag}"`;
    case "remove_tag":
      return `Remove tag "${s.tag}"`;
    case "add_to_list":
      return `Add to ${lists.find((l) => l.id === s.list_id)?.name ?? "a list"}`;
    case "remove_from_list":
      return `Remove from ${lists.find((l) => l.id === s.list_id)?.name ?? "a list"}`;
    case "webhook":
      return `Send webhook to ${s.url.replace(/^https:\/\//, "").slice(0, 40)}`;
    case "discord":
      return "Post to Discord";
  }
}
