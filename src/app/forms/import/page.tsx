import { ImportPanel } from "@/components/forms/ImportPanel";
import { listForms } from "@/forms/repo";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const forms = await listForms();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import from Typeform</h1>
        <p className="text-sm text-slate-500">Bring your existing form and past applicants over.</p>
      </div>
      <ImportPanel forms={forms.map((f) => ({ id: f.id, title: f.title }))} />
    </div>
  );
}
