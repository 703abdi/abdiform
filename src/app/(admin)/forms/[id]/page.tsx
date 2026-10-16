import { redirect } from "next/navigation";

// Old links (/forms/:id?tab=...&lead=...) land on the matching new page.
export default async function FormIndex({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; lead?: string }>;
}) {
  const { id } = await params;
  const { tab, lead } = await searchParams;
  if (tab === "build") redirect(`/forms/${id}/create`);
  if (tab === "summary") redirect(`/forms/${id}/results/summary`);
  if (lead || tab === "responses") redirect(`/forms/${id}/results/responses${lead ? `?lead=${encodeURIComponent(lead)}` : ""}`);
  redirect(`/forms/${id}/results`);
}
