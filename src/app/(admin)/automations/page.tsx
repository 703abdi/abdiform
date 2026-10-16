import Link from "next/link";
import { after } from "next/server";
import { processDue } from "@/automations/engine";
import { listAutomations } from "@/automations/repo";
import { listLists } from "@/contacts/repo";
import { listForms } from "@/forms/repo";
import { describeTrigger } from "@/automations/describe";
import { tf } from "@/components/admin/styles";
import { AutomationToggle } from "@/components/admin/AutomationToggle";

export const metadata = { title: "Automations · Tawakkul Forms" };

export default async function AutomationsPage() {
  after(() => processDue(25).catch(() => {}));
  const [autos, lists, forms] = await Promise.all([listAutomations(), listLists(), listForms()]);
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Automations</h1>
          <p className="text-[14px] text-[#5e5e5e]">Follow up with contacts automatically: emails, tags, lists and webhooks.</p>
        </div>
        <Link href="/automations/new" className={`${tf.btn} ml-auto`}>+ Create automation</Link>
      </div>
      {autos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d4d4d4] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">No automations yet</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-[#5e5e5e]">
            Example: when someone finishes the application and qualifies, tag them, add them to a list and send a reminder to book the call.
          </p>
          <Link href="/automations/new" className={`${tf.btn} mt-4`}>Create your first automation</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#fafafa] text-left text-[13px] text-[#5e5e5e]">
                <th className="px-4 py-2.5 font-normal">Name</th>
                <th className="px-4 py-2.5 font-normal">Trigger</th>
                <th className="px-4 py-2.5 font-normal">Steps</th>
                <th className="px-4 py-2.5 font-normal">Contacts</th>
                <th className="px-4 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {autos.map((a) => (
                <tr key={a.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3"><Link href={`/automations/${a.id}`} className="font-medium hover:underline">{a.name}</Link></td>
                  <td className="px-4 py-3 text-[#5e5e5e]">{describeTrigger(a.trigger, forms, lists)}</td>
                  <td className="px-4 py-3 text-[#5e5e5e]">{a.steps.length}</td>
                  <td className="px-4 py-3 text-[#5e5e5e]">
                    {a.stats?.total ?? 0}
                    {(a.stats?.waiting ?? 0) > 0 && <span className="ml-1 text-[12px]">({a.stats!.waiting} waiting)</span>}
                    {(a.stats?.failed ?? 0) > 0 && <span className="ml-1 text-[12px] text-[#c2331d]">({a.stats!.failed} failed)</span>}
                  </td>
                  <td className="px-4 py-3"><AutomationToggle id={a.id} status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
