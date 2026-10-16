import { listForms } from "@/forms/repo";
import { listLists } from "@/contacts/repo";
import { allEndings, plainText } from "@/forms/lib";
import { NewAutomation } from "@/components/admin/NewAutomation";

export default async function NewAutomationPage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const { form } = await searchParams;
  const [forms, lists] = await Promise.all([listForms(), listLists()]);
  return (
    <NewAutomation
      forms={forms.map((f) => ({
        id: f.id,
        title: f.title,
        endings: allEndings(f.settings).map((e) => ({ id: e.id, title: plainText(e.title) || e.id, tag: e.tag ?? "" })),
      }))}
      lists={lists.filter((l) => l.kind === "static").map((l) => ({ id: l.id, name: l.name }))}
      formId={forms.some((f) => f.id === form) ? form! : forms[0]?.id ?? ""}
    />
  );
}
