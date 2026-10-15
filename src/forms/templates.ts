// Starter templates for new forms (like Typeform's template gallery).

import { newId } from "@/forms/lib";
import { endTarget, SCORE } from "@/forms/logic";
import type { Field, FormSettings } from "@/forms/types";

export interface Template {
  key: string;
  name: string;
  description: string;
  build: () => { title: string; fields: Field[]; settings: Partial<FormSettings> };
}

const contact = (): Field => ({
  id: newId(),
  type: "group",
  title: "So we can reach out, what's your:",
  required: false,
  fields: [
    { id: newId(), type: "short_text", title: "First name", required: true },
    { id: newId(), type: "short_text", title: "Last name", required: true },
    { id: newId(), type: "phone", title: "Phone number", required: true },
    { id: newId(), type: "email", title: "Email", required: true },
  ],
});

export const TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank form",
    description: "Name, email and phone to start from.",
    build: () => ({
      title: "Untitled form",
      fields: [
        { id: newId(), type: "short_text", title: "What's your full name?", required: true },
        { id: newId(), type: "email", title: "What's your email address?", required: true },
        { id: newId(), type: "phone", title: "What's your phone number?", required: false },
      ],
      settings: {},
    }),
  },
  {
    key: "lead",
    name: "Lead capture",
    description: "Contact details, what they need, and how they found you.",
    build: () => ({
      title: "Get in touch",
      fields: [
        contact(),
        {
          id: newId(),
          type: "multiple_choice",
          title: "What do you need help with?",
          required: true,
          choices: ["Getting started", "Improving my results", "Something else"],
          allow_other: true,
        },
        {
          id: newId(),
          type: "multiple_choice",
          title: "How did you hear about us?",
          required: false,
          choices: ["Instagram", "YouTube", "A friend", "Google"],
          allow_other: true,
        },
      ],
      settings: {
        welcome_title: "Let's talk",
        welcome_description: "Answer a few quick questions and we'll get back to you.",
        thank_you_title: "Thanks, we got your details.",
        thank_you_message: "We'll be in touch shortly.",
      },
    }),
  },
  {
    key: "application",
    name: "Application with booking",
    description: "Qualifies by budget: serious applicants book a call, others see a different message.",
    build: () => {
      const budget: Field = {
        id: newId(),
        type: "multiple_choice",
        title: "How much can you invest?",
        required: true,
        choices: ["Under $500", "$500-$1k", "$1k-$5k", "$5k+"],
      };
      budget.rules = [
        {
          id: newId("r"),
          match: "any",
          goto: endTarget("lowbudget"),
          conditions: [{ field: budget.id, op: "any_of", value: ["Under $500", "$500-$1k"] }],
        },
      ];
      return {
        title: "Apply",
        fields: [
          { id: newId(), type: "multiple_choice", title: "Are you ready to commit?", required: true, choices: ["Yes, I'm ready", "Not right now"] },
          contact(),
          { id: newId(), type: "long_text", title: "What would success look like for you in 90 days?", required: true },
          budget,
        ],
        settings: {
          welcome_enabled: false,
          thank_you_title: "Book your call",
          thank_you_message: "Pick a time that works for you.",
          thank_you_calendly_url: "",
          endings: [
            {
              id: "lowbudget",
              title: "Thanks for applying",
              message: "We don't have a fit for you right now, but here is somewhere to start.",
            },
          ],
        },
      };
    },
  },
  {
    key: "nps",
    name: "NPS survey",
    description: "0-10 score and a follow-up.",
    build: () => ({
      title: "Quick feedback",
      fields: [
        { id: newId(), type: "scale", title: "How likely are you to recommend us to a friend?", required: true },
        { id: newId(), type: "long_text", title: "What's the main reason for your score?", required: false },
      ],
      settings: { thank_you_title: "Thank you for the feedback!", thank_you_message: "" },
    }),
  },
  {
    key: "quiz",
    name: "Scored quiz",
    description: "Points per answer, different ending depending on the score.",
    build: () => {
      const q = (title: string, choices: string[], points: number[]): Field => ({
        id: newId(),
        type: "multiple_choice",
        title,
        required: true,
        choices,
        points: Object.fromEntries(choices.map((c, i) => [c, points[i]])),
      });
      const q3 = q("Do you use a trading plan?", ["Always", "Sometimes", "Never"], [3, 1, 0]);
      q3.rules = [
        { id: newId("r"), match: "all", goto: endTarget("high"), conditions: [{ field: SCORE, op: "gt", value: 5 }] },
      ];
      return {
        title: "How ready are you?",
        fields: [
          q("How do you handle a losing trade?", ["Stick to the plan", "Take a break", "Revenge trade"], [3, 1, 0]),
          q("How often do you review your trades?", ["Every week", "Sometimes", "Never"], [3, 1, 0]),
          q3,
          { id: newId(), type: "email", title: "Where should we send your result?", required: true },
        ],
        settings: {
          thank_you_title: "You're getting there",
          thank_you_message: "Here are some next steps to build consistency.",
          endings: [{ id: "high", title: "You're ready", message: "Your habits are strong. Let's talk about the next step." }],
        },
      };
    },
  },
];

export const templateByKey = (key: string): Template => TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
