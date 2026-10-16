import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { allEndings, flattenFields, plainText } from "@/forms/lib";
import { isEnd } from "@/forms/logic";
import { listAutomations } from "@/automations/repo";
import { TRIGGER_LABELS } from "@/automations/types";
import type { Condition, Field } from "@/forms/types";
import { tf } from "@/components/admin/styles";

const OPS: Record<Condition["op"], string> = {
  is: "is",
  is_not: "is not",
  any_of: "is any of",
  none_of: "is none of",
  contains: "contains",
  gt: "is greater than",
  lt: "is less than",
  answered: "is answered",
  not_answered: "is not answered",
};

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  const autos = (await listAutomations()).filter((a) => a.trigger.type === "form_submitted" && (!a.trigger.form_id || a.trigger.form_id === id));
  const endings = allEndings(form.settings);
  const all = flattenFields(form.fields);
  const qNum = new Map(form.fields.map((f, i) => [f.id, i + 1]));
  const name = (fid: string) => {
    const f = all.find((x) => x.id === fid);
    return f ? plainText(f.title) : fid === "__score" ? "Score" : "a deleted question";
  };
  const target = (t: string) => {
    if (isEnd(t)) {
      const e = endings.find((x) => `end:${x.id}` === t);
      return `Ending: ${plainText(e?.title || "") || (e?.id === "default" ? "Default ending" : "Ending")}`;
    }
    const n = qNum.get(t);
    return n ? `${n}. ${name(t)}` : "a deleted question";
  };
  const val = (v: Condition["value"]) => (Array.isArray(v) ? v.join(", ") : v === undefined ? "" : String(v));
  const withLogic = form.fields.filter((f: Field) => (f.rules ?? []).length > 0 || f.otherwise);

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-8 px-4 py-6 sm:px-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-semibold">Logic</h1>
            <p className="text-[14px] text-[#5e5e5e]">Branching rules that decide which question or ending each person sees next.</p>
          </div>
          <Link href={`/forms/${id}/create`} className={tf.btnOutline}>Edit logic in Content</Link>
        </div>
        {withLogic.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d4d4d4] px-5 py-8 text-center text-[14px] text-[#5e5e5e]">
            No logic yet: everyone answers every question in order and sees the default ending.
          </p>
        ) : (
          <ol className="space-y-3">
            {withLogic.map((f) => (
              <li key={f.id} className="rounded-lg border border-[#e3e3e3] p-4">
                <p className="mb-2 text-[14px] font-medium">
                  <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-[#f0f0f0] px-1.5 text-[12px] text-[#5e5e5e]">{qNum.get(f.id)}</span>
                  {plainText(f.title)}
                </p>
                <ul className="space-y-1.5 text-[14px]">
                  {(f.rules ?? []).map((r) => (
                    <li key={r.id} className="rounded-md bg-[#fafafa] px-3 py-2">
                      <span className="font-medium">If </span>
                      {r.conditions.map((c, i) => (
                        <span key={i}>
                          {i > 0 && <span className="font-medium"> {r.match === "any" ? "or" : "and"} </span>}
                          <span className="text-[#5e5e5e]">{name(c.field)}</span> {OPS[c.op]} {c.op !== "answered" && c.op !== "not_answered" && <b>{val(c.value)}</b>}
                        </span>
                      ))}
                      <span className="font-medium"> → go to </span>
                      <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-[#e3e3e3]">{target(r.goto)}</span>
                    </li>
                  ))}
                  {f.otherwise && (
                    <li className="rounded-md bg-[#fafafa] px-3 py-2">
                      <span className="font-medium">All other cases → go to </span>
                      <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-[#e3e3e3]">{target(f.otherwise)}</span>
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[18px] font-semibold">Endings</h2>
        <p className="mb-3 text-[14px] text-[#5e5e5e]">Each ending can tag the contact, so you can sort and automate by outcome.</p>
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-[#ececec] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-4 py-2.5 font-normal">Ending</th>
                <th className="px-4 py-2.5 font-normal">Shows</th>
                <th className="px-4 py-2.5 font-normal">Contact tag</th>
              </tr>
            </thead>
            <tbody>
              {endings.map((e) => (
                <tr key={e.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-4 py-3 font-medium">{plainText(e.title) || "Untitled ending"}{e.id === "default" && <span className="ml-2 text-[12px] font-normal text-[#6b6b6b]">default</span>}</td>
                  <td className="px-4 py-3 text-[#5e5e5e]">{e.calendly_url ? "Calendly booking" : e.redirect_url ? "Redirect" : e.button_url ? `Button: ${e.button_label || "link"}` : "Message"}</td>
                  <td className="px-4 py-3">{e.tag ? <span className="rounded-full bg-[#ececec] px-2 py-0.5 text-[12px]">{e.tag}</span> : <span className="text-[#767676]">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold">Automations</h2>
            <p className="text-[14px] text-[#5e5e5e]">What happens after someone submits this form.</p>
          </div>
          <Link href={`/automations/new?form=${id}`} className={tf.btn}>+ New automation</Link>
        </div>
        {autos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d4d4d4] px-5 py-8 text-center text-[14px] text-[#5e5e5e]">No automations run on this form yet.</p>
        ) : (
          <ul className="divide-y divide-[#f0f0f0] rounded-lg border border-[#e3e3e3]">
            {autos.map((a) => (
              <li key={a.id}>
                <Link href={`/automations/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#fafafa]">
                  <span>
                    <span className="block font-medium">{a.name}</span>
                    <span className="text-[13px] text-[#5e5e5e]">{TRIGGER_LABELS[a.trigger.type]} · {a.steps.length} steps</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] ${a.status === "live" ? "bg-[#e3f5e9] text-[#1f7a43]" : "bg-[#f0f0f0] text-[#5e5e5e]"}`}>{a.status === "live" ? "Live" : a.status === "paused" ? "Paused" : "Draft"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
