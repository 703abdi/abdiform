// Email blasts: one email to a whole audience of contacts, sent through Brevo.

import type { ContactFilter } from "@/contacts/types";

export type BlastStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export interface BlastAudience {
  type: "all" | "list" | "filter";
  list_id?: string;
  filter?: ContactFilter;
}

export interface Blast {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  body: string; // **bold**, [link](url), [[Button label|https://url]], {{first_name}}...
  audience: BlastAudience;
  status: BlastStatus;
  scheduled_at: string | null;
  started_at: string | null;
  sent_at: string | null;
  error: string;
  created_at: string;
  updated_at: string;
  stats?: { total: number; sent: number; failed: number; queued: number };
}
