import { notFound } from "next/navigation";
import { getPage, pageClicksByBlock } from "@/sitepages/repo";
import { watchFunnel } from "@/sitepages/watch";
import { listForms } from "@/forms/repo";
import { PageEditor } from "@/components/sitepages/PageEditor";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();
  const [forms, clicks, watch] = await Promise.all([listForms(), pageClicksByBlock(id), watchFunnel(id)]);
  return <PageEditor page={page} forms={forms.map((f) => ({ slug: f.slug, title: f.title }))} clicks={clicks} watch={watch} />;
}
