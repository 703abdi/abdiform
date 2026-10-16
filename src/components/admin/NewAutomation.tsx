"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAutomationAction } from "@/automations/actions";
import { newStep, type Step, type Trigger } from "@/automations/types";
import { tf } from "@/components/admin/styles";
import { cn } from "@/lib/cn";

type FormRef = { id: string; title: string; endings: { id: string; title: string; tag: string }[] };

interface Recipe {
  key: string;
  name: string;
  desc: string;
  build: (form: FormRef | undefined) => { name: string; trigger: Trigger; steps: Step[] };
}

const withTag = (s: Step, tag: string): Step => (s.type === "add_tag" ? { ...s, tag } : s);

const RECIPES: Recipe[] = [
  {
    key: "thanks",
    name: "Thank new applicants",
    desc: "Email everyone who submits the form, right away.",
    build: (f) => ({
      name: `Thank you email${f ? `: ${f.title}` : ""}`,
      trigger: { type: "form_submitted", form_id: f?.id },
      steps: [
        { ...newStep("send_email"), subject: "Thanks for applying, {{first_name}}", body: "Hi {{first_name}},\n\nThanks for applying. We read every application and will be in touch soon.\n" } as Step,
      ],
    }),
  },
  {
    key: "booking",
    name: "Remind qualified leads to book",
    desc: "Tag qualified applicants, wait a day, then nudge them to book their call.",
    build: (f) => {
      const qualified = f?.endings.find((e) => e.id === "default") ?? f?.endings[0];
      return {
        name: "Booking reminder",
        trigger: { type: "form_submitted", form_id: f?.id, ending: qualified?.id },
        steps: [
          withTag(newStep("add_tag"), qualified?.tag || "Qualified"),
          { ...newStep("wait"), amount: 1, unit: "days" } as Step,
          { ...newStep("send_email"), subject: "Did you grab a time, {{first_name}}?", body: "Hi {{first_name}},\n\nYou qualified for a 1:1 call. If you haven't booked yet, pick a time here: https://calendly.com/abdiyassin/1on1\n" } as Step,
        ],
      };
    },
  },
  {
    key: "nurture",
    name: "Nurture low-budget leads",
    desc: "People who reach a different ending go to a list and get a follow-up.",
    build: (f) => {
      const other = f?.endings.find((e) => e.id !== "default");
      return {
        name: "Low budget nurture",
        trigger: { type: "form_submitted", form_id: f?.id, ending: other?.id },
        steps: [
          withTag(newStep("add_tag"), other?.tag || "Low budget"),
          { ...newStep("wait"), amount: 2, unit: "days" } as Step,
          { ...newStep("send_email"), subject: "A good next step for you, {{first_name}}", body: "Hi {{first_name}},\n\nThanks again for applying. Here's where to start: https://whop.com/tawakkul-trading/tawakkul-trading-incubator/\n" } as Step,
        ],
      };
    },
  },
  {
    key: "blank",
    name: "Start from scratch",
    desc: "Pick your own trigger and steps.",
    build: (f) => ({ name: "Untitled automation", trigger: { type: "form_submitted", form_id: f?.id }, steps: [] }),
  },
];

export function NewAutomation({ forms, formId }: { forms: FormRef[]; lists: { id: string; name: string }[]; formId: string }) {
  const router = useRouter();
  const [form, setForm] = useState(formId);
  const [recipe, setRecipe] = useState("thanks");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-8">
      <h1 className="text-[22px] font-semibold">Create automation</h1>
      <p className="mb-6 text-[14px] text-[#5e5e5e]">Start from a recipe; you can change every step next.</p>
      {forms.length > 0 && (
        <div className="mb-5">
          <label className={tf.label} htmlFor="auto-form">Form</label>
          <select id="auto-form" className={cn(tf.select, "w-full")} value={form} onChange={(e) => setForm(e.target.value)}>
            {forms.map((f) => (<option key={f.id} value={f.id}>{f.title}</option>))}
          </select>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recipe">
        {RECIPES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={recipe === r.key}
            onClick={() => setRecipe(r.key)}
            className={cn("rounded-lg border px-4 py-3 text-left", recipe === r.key ? "border-[#262627] bg-[#fafafa] ring-1 ring-[#262627]" : "border-[#e3e3e3] hover:border-[#bdbdbd]")}
          >
            <span className="block text-[14px] font-medium">{r.name}</span>
            <span className="block text-[13px] text-[#5e5e5e]">{r.desc}</span>
          </button>
        ))}
      </div>
      {err && <p className="mt-4 text-[13px] text-[#c2331d]">{err}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={tf.btnOutline} onClick={() => router.push("/automations")}>Cancel</button>
        <button
          type="button"
          className={tf.btn}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createAutomationAction(RECIPES.find((x) => x.key === recipe)!.build(forms.find((f) => f.id === form)));
              if (r.ok) router.push(`/automations/${r.data}`);
              else setErr(r.error);
            })
          }
        >
          {pending ? "Creating..." : "Continue"}
        </button>
      </div>
    </main>
  );
}
