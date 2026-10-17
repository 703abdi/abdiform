// Pure helpers shared by server + client (no I/O).

import type {
  AnswerValue,
  Design,
  Ending,
  Field,
  Form,
  FormResponse,
  FormSettings,
  FontKey,
} from "@/forms/types";
import { DEFAULT_ENDING, DEFAULT_SETTINGS } from "@/forms/types";

export function newId(prefix = "q"): string {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${r}`;
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "form";
}

export function withDefaults(s: Partial<FormSettings> | undefined): FormSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/** Questions that collect an answer (not statements, not the group container). */
export function isAnswerable(f: Field): boolean {
  return f.type !== "statement" && f.type !== "group";
}

/** Every individual input of a form: group screens are expanded into their children. */
export function flattenFields(fields: Field[]): Field[] {
  return fields.flatMap((f) => (f.type === "group" ? flattenFields(f.fields ?? []) : [f]));
}

/** The answerable inputs only. */
export function answerFields(fields: Field[]): Field[] {
  return flattenFields(fields).filter(isAnswerable);
}

export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Human-readable single-line rendering of an answer. */
export function formatAnswer(f: Field | undefined, v: AnswerValue | undefined): string {
  if (isEmptyAnswer(v)) return "";
  if (f?.type === "matrix" && Array.isArray(v)) return v.map((x) => String(x).replace("::", ": ")).join("; ");
  if (Array.isArray(v)) return v.join(", ");
  if (f?.type === "legal") return v === true ? "Accepted" : "Not accepted";
  if (f?.type === "file_upload" && typeof v === "string") return v.replace(/^file:[0-9a-f-]{36}:/i, "");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (f?.type === "rating" && typeof v === "number") return `${v} / ${f.steps ?? 5}`;
  if (f?.type === "scale" && typeof v === "number") return `${v}`;
  return String(v);
}

/** Pull the lead's identity out of whatever questions the form asks. */
export function leadIdentity(form: Pick<Form, "fields">, r: Pick<FormResponse, "answers">) {
  const get = (f?: Field) => (f ? formatAnswer(f, r.answers[f.id]) : "");
  const all = flattenFields(form.fields);
  const emailField = all.find((f) => f.type === "email");
  const phoneField = all.find((f) => f.type === "phone");
  const nameField =
    all.find((f) => f.type === "short_text" && /first.?name/i.test(f.title)) ??
    all.find((f) => f.type === "short_text" && /name/i.test(f.title)) ??
    all.find((f) => f.type === "short_text");
  return {
    name: get(nameField),
    email: get(emailField),
    phone: get(phoneField),
  };
}

export const STATUS_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "red"> = {
  new: "blue",
  contacted: "amber",
  qualified: "purple",
  won: "green",
  lost: "red",
};

export const isPartial = (r: Pick<FormResponse, "meta">): boolean => r.meta?.partial === true;

/** All ending screens of a form, default first. */
export function allEndings(settings: FormSettings): Ending[] {
  return [
    {
      id: DEFAULT_ENDING,
      title: settings.thank_you_title,
      message: settings.thank_you_message,
      redirect_url: settings.redirect_url,
      button_label: settings.thank_you_button_label,
      button_url: settings.thank_you_button_url,
      calendly_url: settings.thank_you_calendly_url,
      image: settings.thank_you_image,
      image_layout: settings.thank_you_image_layout,
      booked_title: settings.thank_you_booked_title,
      booked_message: settings.thank_you_booked_message,
      booked_redirect: settings.thank_you_booked_redirect,
      tag: settings.thank_you_tag,
    },
    ...(settings.endings ?? []),
  ];
}

export const FONTS: Record<FontKey, { label: string; css: string; google?: string }> = {
  system: { label: "System font", css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  inter: { label: "Inter", css: "'Inter', sans-serif", google: "Inter:wght@400;500;600;700" },
  roboto: { label: "Roboto", css: "'Roboto', sans-serif", google: "Roboto:wght@400;500;700" },
  poppins: { label: "Poppins", css: "'Poppins', sans-serif", google: "Poppins:wght@400;500;600;700" },
  montserrat: { label: "Montserrat", css: "'Montserrat', sans-serif", google: "Montserrat:wght@400;500;600;700" },
  lora: { label: "Lora (serif)", css: "'Lora', serif", google: "Lora:wght@400;500;600;700" },
  playfair: { label: "Playfair Display (serif)", css: "'Playfair Display', serif", google: "Playfair+Display:wght@400;500;600;700" },
  merriweather: { label: "Merriweather (serif)", css: "'Merriweather', serif", google: "Merriweather:wght@400;700" },
};

/** Typeform's default "Classic blue" theme. */
export const CLASSIC_BLUE: Design = {
  question: "#000000",
  answer: "#0445AF",
  button: "#0445AF",
  button_text: "#FFFFFF",
  background: "#FFFFFF",
  font: "system",
  rounded: "small",
  font_size: "medium",
  field_align: "left",
  screen_align: "center",
  transparent_button: false,
};

export const DESIGN_PRESETS: { name: string; design: Design }[] = [
  {
    name: "Tawakkul",
    design: { ...CLASSIC_BLUE, question: "#FFFFFF", answer: "#1ED6B4", button: "#1ED6B4", button_text: "#04120F", background: "#05080A", font: "montserrat", rounded: "large", glow: "#0B3B33" },
  },
  { name: "Classic blue", design: CLASSIC_BLUE },
  { name: "Midnight", design: { ...CLASSIC_BLUE, question: "#F8FAFC", answer: "#7DD3FC", button: "#38BDF8", button_text: "#082F49", background: "#0B1220" } },
  { name: "Paper", design: { ...CLASSIC_BLUE, question: "#3D3D3D", answer: "#3D3D3D", button: "#3D3D3D", button_text: "#FFFFFF", background: "#F4F0E8", font: "lora" } },
  { name: "Emerald", design: { ...CLASSIC_BLUE, question: "#052E1C", answer: "#0B6E4F", button: "#0B6E4F", button_text: "#FFFFFF", background: "#F1F8F4" } },
  { name: "Black & gold", design: { ...CLASSIC_BLUE, question: "#FFFFFF", answer: "#E5C158", button: "#E5C158", button_text: "#111111", background: "#111111", font: "montserrat" } },
  { name: "Rose", design: { ...CLASSIC_BLUE, question: "#4A1D2B", answer: "#BE185D", button: "#BE185D", button_text: "#FFFFFF", background: "#FFF1F5", rounded: "large" } },
];

/** Final design for a form. Older forms only had accent + light/dark, so fall back to those. */
export function resolveDesign(s: FormSettings): Design {
  const legacy: Partial<Design> = {};
  if (!s.design) {
    legacy.answer = s.accent;
    legacy.button = s.accent;
    if (s.theme === "dark") {
      legacy.background = "#0B1220";
      legacy.question = "#F1F5F9";
    }
  }
  return { ...CLASSIC_BLUE, ...legacy, ...(s.design ?? {}) };
}

/**
 * Deep copy of a form's questions with brand-new ids. Logic rules (jump targets,
 * conditions) are re-pointed to the new ids so the copy behaves exactly like the original.
 */
export function cloneFields(fields: Field[]): Field[] {
  const idMap = new Map<string, string>();
  const remap = (f: Field): Field => {
    const nid = newId();
    idMap.set(f.id, nid);
    return { ...f, id: nid, fields: f.fields?.map(remap) };
  };
  const fix = (t?: string) => (t && idMap.has(t) ? idMap.get(t)! : t);
  const fixText = (t: string) => t.replace(/\{\{field:([^}]+)\}\}/g, (m, id: string) => (idMap.has(id) ? `{{field:${idMap.get(id)}}}` : m));
  const relink = (f: Field): Field => ({
    ...f,
    title: fixText(f.title),
    description: f.description ? fixText(f.description) : f.description,
    otherwise: fix(f.otherwise),
    rules: f.rules?.map((r) => ({
      ...r,
      id: newId("r"),
      goto: fix(r.goto) ?? r.goto,
      conditions: r.conditions.map((c) => ({ ...c, field: fix(c.field) ?? c.field })),
    })),
    fields: f.fields?.map(relink),
  });
  return fields.map(remap).map(relink);
}

/** Strip Typeform-style markup so titles read cleanly in the admin UI, exports and emails. */
export function plainText(s: string): string {
  return s
    .replace(/\{\{field:[^}]+\}\}/g, "…")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*?)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])_([^_\s][^_]*?)_(?![A-Za-z0-9])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Inclusive numeric range of an opinion scale question. */
export function scaleRange(f: Pick<Field, "steps" | "start_at_one">): { lo: number; hi: number } {
  const lo = f.start_at_one ? 1 : 0;
  const steps = Math.min(11, Math.max(5, f.steps ?? 11));
  return { lo, hi: lo + steps - 1 };
}

/** True for a public https URL (blocks localhost, private ranges and bare hostnames). */
export function isPublicHttpsUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || !u.hostname.includes(".")) return false;
  return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname);
}
