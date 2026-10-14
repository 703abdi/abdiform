// Shared types for the Forms / Lead Capture subsystem (/forms admin, /apply public).

export type FieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "url"
  | "multiple_choice" // pick one
  | "checkboxes" // pick many
  | "dropdown"
  | "yes_no"
  | "rating" // 1..max stars
  | "scale" // 0..10
  | "date"
  | "statement"; // display only, no answer

export interface Field {
  id: string;
  type: FieldType;
  title: string;
  description?: string;
  required: boolean;
  choices?: string[];
  allow_other?: boolean;
  /** rating steps (3..10), default 5 */
  steps?: number;
}

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;

export type FormStatus = "draft" | "published" | "closed";
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type ResponseSource = "web" | "typeform" | "csv";

export interface FormSettings {
  accent: string; // hex
  theme: "light" | "dark";
  welcome_enabled: boolean;
  welcome_title: string;
  welcome_description: string;
  start_label: string;
  thank_you_title: string;
  thank_you_message: string;
  redirect_url: string; // optional, after submit
  webhook_url: string; // optional, POSTed on each new submission
  notify_email: string; // optional, comma-separated; emailed on each new submission
  typeform_form_id?: string; // set when imported, lets re-imports dedupe
}

export interface Form {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: FormStatus;
  fields: Field[];
  settings: FormSettings;
  views: number;
  starts: number;
  created_at: string;
  updated_at: string;
}

export interface ResponseMeta {
  user_agent?: string;
  referrer?: string;
  utm?: Record<string, string>;
  score?: number; // quiz score (imported from Typeform)
}

export interface FormResponse {
  id: string;
  form_id: string;
  answers: Answers;
  submitted_at: string;
  source: ResponseSource;
  external_id: string | null;
  status: LeadStatus;
  notes: string;
  meta: ResponseMeta;
}

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone number",
  number: "Number",
  url: "Website",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  yes_no: "Yes / No",
  rating: "Rating",
  scale: "Opinion scale (0-10)",
  date: "Date",
  statement: "Statement",
};

export const DEFAULT_SETTINGS: FormSettings = {
  accent: "#2563eb",
  theme: "light",
  welcome_enabled: true,
  welcome_title: "",
  welcome_description: "",
  start_label: "Start",
  thank_you_title: "Thanks, we got your application.",
  thank_you_message: "We'll be in touch shortly.",
  redirect_url: "",
  webhook_url: "",
  notify_email: "",
};

export function hasChoices(t: FieldType): boolean {
  return t === "multiple_choice" || t === "checkboxes" || t === "dropdown";
}
