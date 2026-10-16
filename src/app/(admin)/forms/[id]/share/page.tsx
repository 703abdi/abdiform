import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { SharePanel } from "@/components/admin/SharePanel";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  return <SharePanel id={form.id} slug={form.slug} status={form.status} title={form.title} />;
}
