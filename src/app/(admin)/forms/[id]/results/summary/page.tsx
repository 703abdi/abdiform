import { notFound } from "next/navigation";
import { getForm, listResponses } from "@/forms/repo";
import { isPartial } from "@/forms/lib";
import { ResultsSummary } from "@/components/admin/ResultsSummary";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  const all = await listResponses(id);
  return <ResultsSummary form={form} responses={all.filter((r) => !isPartial(r))} all={all} />;
}
