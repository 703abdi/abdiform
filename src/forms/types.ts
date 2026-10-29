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
  | "ranking" // drag/tap to order choices
  | "matrix" // rows x columns, one answer per row
  | "file_upload"; // applicant attaches a file

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
  booked_redirect?: string; // after booking, send them here (e.g. the pre-call page)
  image?: string;
  image_layout?: "stack" | "split-right" | "split-left" | "wallpaper";
  tag?: string; // contact tag added when someone reaches this ending
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
  /** rating steps (3..10, default 5); opinion scale steps (5..11, default 11) */
  steps?: number;
  /** opinion scale: start at 1 instead of 0 */
  start_at_one?: boolean;
  /** opinion scale labels under the left / middle / right end */
  labels?: { left?: string; center?: string; right?: string };
  /** number: allowed range */
  min?: number;
  max?: number;
  /** text: maximum length */
  max_chars?: number;
  /** checkboxes: how many may be picked */
  min_selections?: number;
  max_selections?: number;
  /** choices are shown in a different random order to each respondent */
  randomize?: boolean;
  /** adds an exclusive "None of the above" option */
  none_of_the_above?: boolean;
  /** matrix: the row labels (the columns are `choices`) */
  rows?: string[];
  /** overrides the "OK" button label */
  button_text?: string;
  /** date question display order */
  date_format?: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY/MM/DD";
  /** picture shown with the question */
  image?: string;
  image_layout?: "stack" | "split-right" | "split-left" | "wallpaper";
  /** group screens: the inputs shown together on this screen */
  fields?: Field[];
  /** picture_choice: choice label -> image URL */
  images?: Record<string, string>;
  /** quiz scoring: choice label -> points */
  points?: Record<string, number>;
  /** logic: first matching rule decides where to go after this question */
  verify?: boolean; // email: confirm the address with a 6-digit code before continuing
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
  glow?: string; // optional colour for a soft corner glow on dark backgrounds
}

export interface FormSettings {
  design?: Partial<Design>;
  show_progress_bar?: boolean; // default true
  brand_name?: string; // shown at the top centre; clicking it starts the form over
  brand_logo?: string; // https image shown instead of / next to the name
  allow_another?: boolean; // "Submit another response" on the ending screen (default true)
  cookie_notice?: boolean; // small dismissible cookie notice on the public form (default true)
  show_question_numbers?: boolean; // default true
  show_key_hints?: boolean; // default true (A/B/C badges on choices)
  show_time_to_complete?: boolean; // default true (welcome screen)
  show_navigation?: boolean; // default true (up/down arrows)
  hidden_fields?: string[]; // URL parameters captured with each response (default utm_*)
  meta_title?: string; // link-preview title
  meta_description?: string;
  meta_image?: string; // https link-preview image
  allow_indexing?: boolean; // let search engines index the form (default false)
  password_hash?: string; // server-only; never sent to browsers
  has_password?: boolean; // what the admin UI sees instead of the hash
  access_password?: string; // transient: set by the builder to change the password
  autosave?: boolean; // remember progress in the respondent's browser (default true)
  close_at?: string; // ISO date; the form stops accepting responses after this
  max_responses?: number; // stops accepting responses after this many completed ones
  closed_message?: string; // shown when the form is closed
  accent: string; // hex
  theme: "light" | "dark";
  welcome_enabled: boolean;
  welcome_title: string;
  welcome_description: string;
  welcome_image?: string;
  welcome_image_layout?: "stack" | "split-right" | "split-left" | "wallpaper";
  start_label: string;
  thank_you_title: string;
  thank_you_message: string;
  redirect_url: string; // optional, after submit
  thank_you_button_label?: string;
  thank_you_button_url?: string;
  thank_you_calendly_url?: string;
  thank_you_image?: string;
  thank_you_image_layout?: "stack" | "split-right" | "split-left" | "wallpaper";
  thank_you_booked_title?: string;
  thank_you_booked_message?: string;
  thank_you_booked_redirect?: string;
  resource?: {
    // lead magnet: a button on the ending screen emails this to the person
    title: string;
    url: string; // https link to the PDF / video / doc
    button?: string;
    subject?: string;
    message?: string;
  };
  thank_you_tag?: string;
  meta_pixel_id?: string; // Meta (Facebook) Pixel: PageView on open, Lead on submit, Schedule on booking
  gtm_id?: string; // Google Tag Manager container (GTM-XXXX): form_view, form_start, form_submit, call_booked
  lead_score?: { hot: number; warm: number }; // answer points at or above `hot` = Hot lead, at or above `warm` = Warm, else Cold
  history?: { views?: number; starts?: number; submissions?: number; avg_seconds?: number }; // imported from Typeform
  old_slugs?: string[]; // earlier links of this form; they redirect to the current one
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
  workspace_id?: string | null;
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
  booked?: boolean; // booked through the Calendly embed on the ending
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
  contact_id?: string | null;
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
  matrix: "Matrix",
  file_upload: "File upload",
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

export const NONE_LABEL = "None of the above";

export function hasChoices(t: FieldType): boolean {
  return (
    t === "matrix" ||
    t === "multiple_choice" ||
    t === "checkboxes" ||
    t === "dropdown" ||
    t === "picture_choice" ||
    t === "ranking"
  );
}
