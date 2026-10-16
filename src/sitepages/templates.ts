// Starting points for new pages.

import { THEMES, type Block, type PageTheme } from "@/sitepages/types";

let n = 0;
const id = (p: string) => `${p}${(n++).toString(36)}`;

export interface PageTemplate {
  key: string;
  name: string;
  description: string;
  build: () => { title: string; blocks: Block[]; theme?: PageTheme };
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: "precall",
    name: "Pre-call page",
    description: "\"Your call is not confirmed\" page: mandatory video, prep steps, confirm.",
    build: () => ({
      title: "Tawakkul pre-call",
      theme: THEMES.tawakkul.theme,
      blocks: [
        { id: id("b"), type: "hero", title: "Your Call ==Is Not Confirmed==", subtitle: "Make sure to do these 2 steps so you can confirm your call with us", align: "center" },
        { id: id("b"), type: "heading", text: "Step 1: Watch This Mandatory Video On How To Prepare For The Call", style: "highlight", size: "md", align: "center" },
        { id: id("b"), type: "video", url: "https://www.youtube.com/watch?v=", caption: "MANDATORY: watch before your call", width: "wide" },
        { id: id("b"), type: "heading", text: "==Prepare For Your Call By:==", style: "plain", size: "lg", align: "center" },
        {
          id: id("b"),
          type: "checklist",
          items: [
            "Watching the full video above",
            "Being somewhere quiet with a laptop or phone and good internet",
            "Having any decision makers (spouse, partner) on the call with you",
            "Writing down your trading goals and your biggest obstacle",
          ],
          width: "narrow",
          align: "left",
        },
        { id: id("b"), type: "heading", text: "Step 2: [[Confirm Your Call]]", style: "plain", size: "md", align: "center" },
        { id: id("b"), type: "text", text: "Reply **\"CONFIRMED\"** to the text and email you received after booking. Calls that are not confirmed are cancelled.", size: "md", align: "center" },
        { id: id("b"), type: "button", label: "I watched the video, confirm my call", url: "https://instagram.com/abdi.yassinn", sublabel: "Takes 10 seconds", style: "solid", align: "center" },
        { id: id("b"), type: "spacer", size: "md" },
        { id: id("b"), type: "faq", items: [
          { q: "What happens on the call?", a: "We look at where you are, where you want to be in 90 days, and whether the mentorship is the right fit." },
          { q: "Can I reschedule?", a: "Yes, use the link in your booking confirmation email at least 24 hours before." },
        ], width: "normal" },
      ],
    }),
  },
  {
    key: "vsl",
    name: "VSL sales page",
    description: "Headline, video, proof, offer button, FAQ.",
    build: () => ({
      title: "VSL page",
      theme: THEMES.tawakkul.theme,
      blocks: [
        { id: id("b"), type: "hero", eyebrow: "Free training", title: "How I Trade With ==Calm, Not Chaos==", subtitle: "Watch the short video below before it comes down.", align: "center" },
        { id: id("b"), type: "video", url: "https://www.youtube.com/watch?v=", width: "wide" },
        { id: id("b"), type: "button", label: "Apply for 1:1 mentorship", url: "/apply/tawakkul-1-1-app", sublabel: "Takes 2 minutes", style: "solid" },
        { id: id("b"), type: "heading", text: "What you get", size: "md" },
        { id: id("b"), type: "checklist", items: ["A proven, rules-based strategy", "Live trading sessions", "1:1 accountability"], width: "narrow", align: "left" },
        { id: id("b"), type: "testimonials", items: [
          { quote: "Finally consistent after two years of guessing.", name: "Student", role: "Mentorship member" },
          { quote: "The live sessions changed everything for me.", name: "Student", role: "Trading Room member" },
        ] },
        { id: id("b"), type: "button", label: "Apply now", url: "/apply/tawakkul-1-1-app", style: "solid" },
        { id: id("b"), type: "faq", items: [{ q: "Is this for beginners?", a: "Yes. We start from your level." }] },
      ],
    }),
  },
  {
    key: "booked",
    name: "Booking confirmed",
    description: "Thank-you page after someone books a call.",
    build: () => ({
      title: "Call booked",
      theme: THEMES.tawakkul.theme,
      blocks: [
        { id: id("b"), type: "hero", title: "You're ==Booked==", subtitle: "Check your email for the calendar invite.", align: "center" },
        { id: id("b"), type: "steps", items: [
          { title: "Add the call to your calendar", text: "The invite is in your inbox." },
          { title: "Watch the pre-call video", text: "It answers the most common questions." },
          { title: "Show up on time", text: "Somewhere quiet, with your goals written down." },
        ], width: "normal" },
      ],
    }),
  },
  {
    key: "blank",
    name: "Blank page",
    description: "Start from nothing.",
    build: () => ({ title: "Untitled page", theme: THEMES.tawakkul.theme, blocks: [{ id: id("b"), type: "hero", title: "Your headline ==here==", align: "center" }] }),
  },
];
