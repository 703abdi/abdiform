import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { listWorkspaces } from "@/workspace/repo";
import { FormHeader } from "@/components/admin/FormHeader";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  return { title: form ? `${form.title} · Tawakkul Forms` : "Form · Tawakkul Forms" };
}

export default async function FormLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [form, workspaces] = await Promise.all([getForm(id), listWorkspaces()]);
  if (!form) notFound();
  const ws = workspaces.find((w) => w.id === form.workspace_id) ?? workspaces[0];
  return (
    <>
      <FormHeader id={form.id} title={form.title} slug={form.slug} status={form.status} workspace={ws ? { id: ws.id, name: ws.name } : null} />
      {children}
    </>
  );
}
