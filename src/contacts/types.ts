// Contacts: one per email address, built automatically from form submissions.

export interface Contact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  properties: Record<string, string>; // answers from forms, keyed by question
  tags: string[];
  subscribed: boolean;
  source_form_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  list_ids: string[]; // static lists the contact belongs to
  response_count: number;
}

export type ListKind = "static" | "smart";

export interface ContactList {
  id: string;
  name: string;
  kind: ListKind;
  filter: ContactFilter; // smart lists: membership is whoever matches this
  created_at: string;
  member_count: number; // static lists only (smart lists are computed)
}

/* ------------------------------- filtering ------------------------------- */

export type FilterField =
  | "name"
  | "email"
  | "phone"
  | "tag"
  | "list"
  | "subscribed"
  | "source_form"
  | "created_at"
  | "last_activity_at"
  | "responses"
  | `property:${string}`;

export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "has"
  | "has_not"
  | "before"
  | "after"
  | "in_last_days"
  | "gt"
  | "lt";

export interface FilterRule {
  field: FilterField;
  op: FilterOp;
  value?: string;
}

export interface ContactFilter {
  match: "all" | "any";
  rules: FilterRule[];
}

export const EMPTY_FILTER: ContactFilter = { match: "all", rules: [] };
