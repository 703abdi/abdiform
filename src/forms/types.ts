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
  | "statement" // display only, no answer
  | "group" // several inputs on one screen (e.g. contact info); children live in `fields`
  | "legal" // consent checkbox (accept / don't accept)
  | "picture_choice" // choices with images
  | "ranking"; // drag/tap to order choices

export type Op =
  | "is"
  | "is_not"
  | "any_of"
  | "none_of"
  | "contains"
  | "gt"
  | "lt"
  | "answered"
  | "not_answered";

export interface Condition {
  field: string; // id of the question whose answer is tested
  op: Op;
  value?: string | string[] | number;
}

/** "If <conditions>, jump to <goto>". goto is a question id or "end:<endingId>". */
export interface Rule {
  id: string;
  match: "all" | "any";
  conditions: Condition[];
  goto: string;
}

export interface Ending {
  id: string;
  title: string;
  message: string;
  button_label?: string;
  button_url?: string;
  redirect_url?: string;
  calendly_url?: string; // embeds a Calendly booking calendar
  booked_title?: string; // shown after the applicant books through the Calendly embed
  booked_message?: string;
}

export const DEFAULT_ENDING = "default";

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
  /** group screens: the inputs shown together on this screen */
  fields?: Field[];
  /** picture_choice: choice label -> image URL */
  images?: Record<string, string>;
  /** quiz scoring: choice label -> points */
  points?: Record<string, number>;
  /** logic: first matching rule decides where to go after this question */
  rules?: Rule[];
  /** where to go when no rule matches (default: the next question) */
  otherwise?: string;
}

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;

export type FormStatus = "draft" | "published" | "closed";
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type ResponseSource = "web" | "typeform" | "csv";

export type FontKey = "system" | "inter" | "roboto" | "poppins" | "montserrat" | "lora" | "playfair" | "merriweather";

/** Mirrors Typeform's theme properties. */
export interface Design {
  question: string; // question + title text colour
  answer: string; // answers, inputs, accents
  button: string;
  button_text: string;
  background: string;
  font: FontKey;
  rounded: "none" | "small" | "large";
  font_size: "small" | "medium" | "large";
  field_align: "left" | "center";
  screen_align: "left" | "center";
  transparent_button: boolean;
  background_image?: string; // https URL, optional
}

export interface FormSettings {
  design?: Partial<Design>;
  show_progress_bar?: boolean; // default true
  show_question_numbers?: boolean; // default true
  show_key_hints?: boolean; // default true (A/B/C badges on choices)
  show_time_to_complete?: boolean; // default true (welcome screen)
  show_navigation?: boolean; // default true (up/down arrows)
  accent: string; // hex
  theme: "light" | "dark";
  welcome_enabled: boolean;
  welcome_title: string;
  welcome_description: string;
  start_label: string;
  thank_you_title: string;
  thank_you_message: string;
  redirect_url: string; // optional, after submit
  thank_you_button_label?: string;
  thank_you_button_url?: string;
  thank_you_calendly_url?: string;
  thank_you_booked_title?: string;
  thank_you_booked_message?: string;
  endings?: Ending[]; // extra thank-you screens reachable from logic rules
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
  duration_s?: number; // seconds from first view to submit
  device?: "mobile" | "tablet" | "desktop";
  partial?: boolean; // started but not finished
  ending?: string; // which ending screen the applicant reached
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
  group: "Contact / multi-field screen",
  legal: "Legal / consent",
  picture_choice: "Picture choice",
  ranking: "Ranking",
};

export const DEFAULT_SETTINGS: FormSettings = {
  design: {}, // empty = Typeform "Classic blue"
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
  return (
    t === "multiple_choice" ||
    t === "checkboxes" ||
    t === "dropdown" ||
    t === "picture_choice" ||
    t === "ranking"
  );
}
