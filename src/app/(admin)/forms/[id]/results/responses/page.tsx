import { notFound } from "next/navigation";
import { getForm, listResponses } from "@/forms/repo";
import { leadIdentity } from "@/forms/lib";
import { callStatuses } from "@/calendly/sync";
import { ResponsesView } from "@/components/forms/ResponsesView";

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lead?: string }>;
}) {
  const { id } = await params;
  const { lead } = await searchParams;
  const form = await getForm(id);
  if (!form) notFound();
  const responses = await listResponses(id);
  const calls = await callStatuses(
    responses.map((r) => ({ id: r.id, contact_id: r.contact_id, email: leadIdentity(form, r).email, booked: r.meta.booked })),
  );
  return <ResponsesView form={form} responses={responses} calls={calls} initialLead={lead} />;
}
