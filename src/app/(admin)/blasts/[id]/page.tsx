import { notFound } from "next/navigation";
import { getBlast, recipientLog } from "@/blasts/repo";
import { listContacts, listLists } from "@/contacts/repo";
import { listForms } from "@/forms/repo";
import { blastSender } from "@/blasts/send";
import { BlastEditor } from "@/components/blasts/BlastEditor";

export default async function BlastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blast = await getBlast(id);
  if (!blast) notFound();
  const [lists, contacts, forms, log] = await Promise.all([listLists(), listContacts(), listForms(), recipientLog(id)]);
  const tags = [...new Set(contacts.flatMap((c) => c.tags))].sort();
  const sender = blastSender();
  return (
    <BlastEditor
      blast={blast}
      lists={lists}
      tags={tags}
      forms={forms.map((f) => ({ id: f.id, title: f.title }))}
      log={log}
      sender={sender ? `${sender.name} <${sender.email}>` : null}
      subscribed={contacts.filter((c) => c.subscribed).length}
    />
  );
}
