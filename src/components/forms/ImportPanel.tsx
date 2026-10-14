"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { importCsvAction, importTypeformAction, type ImportSummary, type Result } from "@/forms/actions";

function Outcome({ r }: { r: Result<ImportSummary> | null }) {
  if (!r) return null;
  if (!r.ok) return <p role="alert" className="mt-3 text-sm text-red-600">{r.error}</p>;
  return (
    <div role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
      Imported <b>{r.data.inserted}</b> responses into &quot;{r.data.formTitle}&quot;
      {r.data.skipped > 0 && <> ({r.data.skipped} already there, skipped)</>}.{" "}
      <Link className="underline" href={`/forms/${r.data.formId}`}>Open the form</Link>.
      <p className="mt-1 text-xs text-emerald-700">The form is saved as a draft. Review it under Build &amp; share, then publish.</p>
    </div>
  );
}

export function ImportPanel({ forms }: { forms: { id: string; title: string }[] }) {
  const [token, setToken] = useState("");
  const [formRef, setFormRef] = useState("");
  const [eu, setEu] = useState(false);
  const [apiRes, setApiRes] = useState<Result<ImportSummary> | null>(null);
  const [csvRes, setCsvRes] = useState<Result<ImportSummary> | null>(null);
  const [apiPending, startApi] = useTransition();
  const [csvPending, startCsv] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Option 1: Import directly from Typeform (recommended)</CardTitle></CardHeader>
        <CardBody>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>In Typeform go to <b>Account &gt; Personal tokens</b> and generate a token with <code>forms:read</code> and <code>responses:read</code>.</li>
            <li>Paste it below with your form link (e.g. <code>https://yourname.typeform.com/to/AbC123</code>) or just the form ID.</li>
            <li>Your questions and every response are copied over. Re-running only adds new responses.</li>
          </ol>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApiRes(null);
              startApi(async () => {
                const r = await importTypeformAction({ token, formRef, eu });
                setApiRes(r);
                if (r.ok) setToken("");
              });
            }}
          >
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Personal access token</label>
              <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="tfp_..." required /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Form link or ID</label>
              <Input value={formRef} onChange={(e) => setFormRef(e.target.value)} placeholder="https://.../to/AbC123" required /></div>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={eu} onChange={(e) => setEu(e.target.checked)} /> My Typeform account is on the EU data center</label>
            <div className="sm:col-span-2"><Button type="submit" disabled={apiPending}>{apiPending ? "Importing..." : "Import from Typeform"}</Button>
              <span className="ml-3 text-xs text-slate-400">The token is used once and never saved.</span></div>
          </form>
          <Outcome r={apiRes} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Option 2: Upload a Typeform CSV export</CardTitle></CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-slate-600">In Typeform open <b>Results &gt; Responses &gt; Download all responses (CSV)</b>, then upload it here. Works even if the API route is blocked.</p>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCsvRes(null);
              const fd = new FormData(e.currentTarget);
              startCsv(async () => setCsvRes(await importCsvAction(fd)));
            }}
          >
            <div><label className="mb-1 block text-xs font-medium text-slate-600">CSV file</label>
              <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Import into</label>
              <Select name="target" defaultValue="new">
                <option value="new">A new form (created from the CSV columns)</option>
                {forms.map((f) => (<option key={f.id} value={f.id}>{f.title}</option>))}
              </Select></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-slate-600">New form name (optional)</label>
              <Input name="name" placeholder="Mentorship application" /></div>
            <div className="sm:col-span-2"><Button type="submit" disabled={csvPending}>{csvPending ? "Importing..." : "Import CSV"}</Button></div>
          </form>
          <Outcome r={csvRes} />
        </CardBody>
      </Card>
    </div>
  );
}
