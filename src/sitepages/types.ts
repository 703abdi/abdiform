// Pages: VSL / landing pages built from blocks (Gamma-style), edited in the admin or by Claude.
// Text fields support inline marks: **bold**, ==accent== (accent colour + underline),
// [[highlight]] (accent bar behind the words) and [label](https://link).

export type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "video"
  | "button"
  | "steps"
  | "image"
  | "calendly"
  | "form"
  | "testimonials"
  | "faq"
  | "countdown"
  | "checklist"
  | "videos"
  | "arrow"
  | "divider"
  | "spacer";

interface Base {
  id: string;
  align?: "left" | "center";
  width?: "narrow" | "normal" | "wide";
}

export type Block =
  | (Base & { type: "hero"; eyebrow?: string; title: string; subtitle?: string })
  | (Base & { type: "heading"; text: string; style?: "plain" | "highlight" | "accent"; size?: "sm" | "md" | "lg" })
  | (Base & { type: "text"; text: string; size?: "sm" | "md" | "lg" })
  | (Base & { type: "video"; url: string; caption?: string })
  | (Base & { type: "button"; label: string; url: string; sublabel?: string; style?: "solid" | "outline" })
  | (Base & { type: "steps"; items: { title: string; text?: string }[] })
  | (Base & { type: "image"; url: string; alt?: string; rounded?: boolean })
  | (Base & { type: "calendly"; url: string })
  | (Base & { type: "form"; slug: string; height?: number })
  | (Base & { type: "testimonials"; items: { quote: string; name: string; role?: string }[] })
  | (Base & { type: "faq"; items: { q: string; a: string }[] })
  | (Base & { type: "countdown"; until: string; label?: string; expired?: string })
  | (Base & { type: "checklist"; items: string[] })
  | (Base & { type: "videos"; items: { title: string; url: string }[] })
  | (Base & { type: "arrow"; text?: string })
  | (Base & { type: "divider" })
  | (Base & { type: "spacer"; size?: "sm" | "md" | "lg" });

export interface PageTheme {
  background: string;
  background2?: string; // second colour for a soft gradient glow
  text: string;
  muted: string;
  accent: string;
  accent_text: string; // text on accent (highlight bars)
  cta?: string; // button colour: kept unique on the page so the next step stands out
  cta_text?: string;
  card: string;
  font: "montserrat" | "inter" | "poppins" | "dm-sans" | "playfair";
  radius: "none" | "small" | "large";
  logo?: string; // https image
  logo_text?: string;
  sticky_label?: string; // optional button that stays on screen while scrolling
  sticky_url?: string;
}

export interface PageSeo {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
  watch_tag?: string; // tag given to known contacts who watch 75%+ of a video on this page
}

export type PageStatus = "draft" | "published";

export interface SitePage {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  blocks: Block[];
  theme: PageTheme;
  seo: PageSeo;
  created_at: string;
  updated_at: string;
  views?: number;
  visitors?: number;
  clicks?: number;
}

export const THEMES: Record<string, { name: string; theme: PageTheme }> = {
  tawakkul: {
    name: "Tawakkul (black + teal)",
    theme: {
      background: "#05080a",
      background2: "#0b3b33",
      text: "#ffffff",
      muted: "#a7b3b0",
      accent: "#1ed6b4",
      accent_text: "#04120f",
      cta: "#ffb020",
      cta_text: "#1a1000",
      card: "#0d1414",
      font: "montserrat",
      radius: "large",
      logo_text: "Tawakkul Trading",
    },
  },
  midnight: {
    name: "Midnight",
    theme: { background: "#020617", background2: "#1e1b4b", text: "#f8fafc", muted: "#94a3b8", accent: "#22c55e", accent_text: "#020617", cta: "#fbbf24", cta_text: "#1a1000", card: "#0e1223", font: "inter", radius: "small" },
  },
  clean: {
    name: "Clean light",
    theme: { background: "#ffffff", text: "#111827", muted: "#6b7280", accent: "#2563eb", accent_text: "#ffffff", cta: "#f97316", cta_text: "#1a0a00", card: "#f3f4f6", font: "inter", radius: "small" },
  },
  gold: {
    name: "Black + gold",
    theme: { background: "#0a0a0a", background2: "#2a1f05", text: "#fafafa", muted: "#a3a3a3", accent: "#f5c542", accent_text: "#1a1300", card: "#151515", font: "poppins", radius: "small" },
  },
};

export const DEFAULT_THEME = THEMES.tawakkul.theme;

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Headline (hero)",
  heading: "Heading",
  text: "Text",
  video: "Video (YouTube, Vimeo, Loom, Wistia, mp4)",
  button: "Button",
  steps: "Numbered steps",
  image: "Image",
  calendly: "Calendly booking",
  form: "Embedded form",
  testimonials: "Testimonials",
  faq: "FAQ",
  countdown: "Countdown timer",
  checklist: "Checklist",
  videos: "Video row (2 videos side by side)",
  arrow: "Down arrow",
  divider: "Divider",
  spacer: "Spacer",
};

const rid = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: BlockType): Block {
  const id = rid();
  switch (type) {
    case "hero":
      return { id, type, title: "Your headline ==with an accent==", subtitle: "A short line that explains the promise.", align: "center" };
    case "heading":
      return { id, type, text: "Step 1: [[Watch this video]]", style: "plain", size: "md", align: "center" };
    case "text":
      return { id, type, text: "Write something here. Use **bold**, ==accent== or [a link](https://example.com).", align: "center" };
    case "video":
      return { id, type, url: "https://www.youtube.com/watch?v=", width: "wide" };
    case "button":
      return { id, type, label: "Book your call", url: "https://", style: "solid", align: "center" };
    case "steps":
      return { id, type, items: [{ title: "First step", text: "What to do." }, { title: "Second step", text: "What to do next." }] };
    case "image":
      return { id, type, url: "https://", alt: "" };
    case "calendly":
      return { id, type, url: "https://calendly.com/abdiyassin/1on1", width: "wide" };
    case "form":
      return { id, type, slug: "tawakkul-1-1-app", height: 640, width: "wide" };
    case "testimonials":
      return { id, type, items: [{ quote: "This changed how I trade.", name: "Student name", role: "Member since 2025" }] };
    case "faq":
      return { id, type, items: [{ q: "A common question?", a: "A clear answer." }] };
    case "countdown":
      return { id, type, until: new Date(Date.now() + 3 * 86_400_000).toISOString(), label: "Offer ends in", expired: "This offer has ended." };
    case "checklist":
      return { id, type, items: ["First thing you get", "Second thing you get"] };
    case "videos":
      return { id, type, items: [{ title: "Video title", url: "" }, { title: "Video title", url: "" }], width: "wide" };
    case "arrow":
      return { id, type, text: "Check these out as well" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "md" };
  }
}
