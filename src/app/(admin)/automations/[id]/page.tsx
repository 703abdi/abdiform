import { notFound } from "next/navigation";
import { getAutomation, listRuns } from "@/automations/repo";
import { listContacts, listLists } from "@/contacts/repo";
import { listForms } from "@/forms/repo";
import { allEndings, plainText } from "@/forms/lib";
import { AutomationEditor } from "@/components/admin/AutomationEditor";

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getAutomation(id);
  if (!a) notFound();
  const [forms, lists, runs, contacts] = await Promise.all([listForms(), listLists(), listRuns(id), listContacts()]);
  const tags = [...new Set(contacts.flatMap((c) => c.tags))].sort();
  return (
    <AutomationEditor
      automation={a}
      forms={forms.map((f) => ({
        id: f.id,
        title: f.title,
        endings: allEndings(f.settings).map((e) => ({ id: e.id, title: plainText(e.title) || e.id, tag: e.tag ?? "" })),
      }))}
      lists={lists.filter((l) => l.kind === "static").map((l) => ({ id: l.id, name: l.name, kind: l.kind, filter: l.filter, created_at: l.created_at, member_count: l.member_count }))}
      tags={tags}
      runs={runs}
      emailReady={!!process.env.BREVO_API_KEY && !!process.env.NOTIFY_FROM_EMAIL}
    />
  );
}
