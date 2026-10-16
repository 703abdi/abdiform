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
    name: "VSL page",
    description: "Main video, 2 more videos, apply button, testimonials, who it's for, final apply.",
    build: () => {
      const APPLY = "/apply/tawakkul-1-1-app";
      return {
        title: "Tawakkul VSL",
        theme: { ...THEMES.tawakkul.theme, sticky_label: "Apply now", sticky_url: APPLY },
        blocks: [
          { id: id("v"), type: "hero", eyebrow: "For traders who are done guessing", title: "Trade With A ==Proven System==, Not Your Emotions", subtitle: "Watch this short video first. It shows exactly how we trade and who this is for.", align: "center" },
          { id: id("v"), type: "video", url: "", caption: "Watch the full video before you apply", width: "wide" },
          { id: id("v"), type: "arrow", text: "Check these out as well" },
          { id: id("v"), type: "videos", items: [{ title: "How the strategy works", url: "" }, { title: "Inside the Trading Room", url: "" }], width: "wide" },
          { id: id("v"), type: "button", label: "Yes, I Want To Apply", url: APPLY, sublabel: "Takes 2 minutes · Every application is reviewed personally", style: "solid", align: "center" },
          { id: id("v"), type: "spacer", size: "md" },
          { id: id("v"), type: "heading", text: "Real Students. ==Real Results.==", style: "plain", size: "lg", align: "center" },
          { id: id("v"), type: "videos", items: [{ title: "Student story", url: "" }, { title: "Student story", url: "" }], width: "wide" },
          { id: id("v"), type: "testimonials", items: [{ quote: "", name: "", role: "" }, { quote: "", name: "", role: "" }, { quote: "", name: "", role: "" }], width: "wide" },
          { id: id("v"), type: "heading", text: "[[This is for you if...]]", style: "plain", size: "md", align: "center" },
          {
            id: id("v"),
            type: "checklist",
            items: [
              "You've tried trading but can't stay consistent",
              "You want a clear, rules-based strategy instead of tips and signals",
              "You can set aside time each week to actually learn and practise",
              "You're ready to invest in yourself and be coached",
            ],
            width: "narrow",
            align: "left",
          },
          { id: id("v"), type: "text", text: "**Not for you** if you're looking for a get-rich-quick shortcut.", size: "md", align: "center" },
          { id: id("v"), type: "button", label: "Apply For 1:1 Mentorship", url: APPLY, sublabel: "No pressure. If it's not a fit, we'll point you to the right next step.", style: "solid", align: "center" },
          { id: id("v"), type: "spacer", size: "sm" },
          {
            id: id("v"),
            type: "faq",
            items: [
              { q: "Do I need experience?", a: "No. We start from where you are, beginner or experienced." },
              { q: "What happens after I apply?", a: "We review your answers. If it looks like a fit you'll book a short call with me to map out your plan." },
              { q: "How much time does it take?", a: "Plan for a few focused hours each week: lessons, live sessions and practice." },
            ],
            width: "normal",
          },
        ],
      };
    },
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
