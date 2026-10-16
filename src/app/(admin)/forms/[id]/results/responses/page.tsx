import { notFound } from "next/navigation";
import { getForm, listResponses } from "@/forms/repo";
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
  return <ResponsesView form={form} responses={responses} initialLead={lead} />;
}
